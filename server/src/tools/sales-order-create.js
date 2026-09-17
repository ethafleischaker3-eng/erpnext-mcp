'use strict';
/*
 * F02 #13 erpnext_sales_order_create（W03/W06/W07）
 * 忠实 D02 §4.1：创建销售订单草稿（全自动免确认，仅限 L3）。目标 Sales Order ▲；create 组 300s；不带 modified。
 * 不接受显式 rate（单价由冻结销售价格表 Standard Selling 解析，消除 B02 F7 孤儿 Item Price 副作用）。
 * 前置断言（server 侧）：客户启用；行内物料存在且启用；items 非空（B02 F6 后端空 items TypeError 500 未优雅，server 前置拦截）。
 * 写：POST /api/resource/Sales Order（company/currency/selling_price_list 由 server 配置注入）。
 * 回读：销售订单草稿（单据编号 + 客户 + 行项目 + 草稿态）。回滚：草稿 → 删除（B02 §4）。
 */

const allowlist = require('../allowlist');
const { LOCKED_BUSINESS } = require('../config');
const { makeError } = require('../../lib/errors');
const { idempotency, callerId, buildChange, writeGate } = require('./write-common');

const DOCTYPE = 'Sales Order';

const definition = {
  name: 'erpnext_sales_order_create',
  description:
    '创建一张销售订单草稿（无业务效果，不生效）。' +
    '消歧：本 tool 只产草稿；要生效必须走 erpnext_sales_order_confirm。' +
    '窄接口边界：只写 Sales Order 草稿及嵌套行项目；不隐式创建/修改客户、物料或价格主数据；不接受显式 rate（单价由 Standard Selling 价格表解析）。',
  inputSchema: {
    type: 'object',
    properties: {
      customer: { type: 'string', description: '客户（操作允许清单 Customer，语义标识客户名，必填）。' },
      items: {
        type: 'array',
        description: '行项目数组（每行 item_code 必填、qty 必填 >0、warehouse 可选）。',
        items: {
          type: 'object',
          properties: {
            item_code: { type: 'string', description: '物料编码（必填）。' },
            qty: { type: 'number', description: '数量（必填，>0）。' },
            warehouse: { type: 'string', description: '仓库（引用允许清单 Warehouse，可选，缺省默认仓）。' },
          },
          required: ['item_code', 'qty'],
        },
      },
      transaction_date: { type: 'string', description: '交易日期（可选，YYYY-MM-DD）。' },
      delivery_date: { type: 'string', description: '交付日期（可选，YYYY-MM-DD）。' },
    },
    required: ['customer', 'items'],
  },
  annotations: {
    title: '创建销售订单草稿',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const customer = args.customer;
  const items = args.items;
  const locked = (ctx && ctx.config && ctx.config.locked) || LOCKED_BUSINESS;

  // schema 校验（不计入业务前置断言）。
  if (typeof customer !== 'string' || customer.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'customer 必填：请提供客户（语义标识客户名）', { retryable: true }) };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: makeError('invalid_argument', 'items 必填且非空：请提供行项目数组', { retryable: true }) };
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (typeof it.item_code !== 'string' || it.item_code.trim() === '') {
      return { ok: false, error: makeError('invalid_argument', 'items[' + i + '].item_code 必填', { retryable: true }) };
    }
    if (typeof it.qty !== 'number' || !(it.qty > 0)) {
      return { ok: false, error: makeError('invalid_argument', 'items[' + i + '].qty 必须 >0（当前 ' + it.qty + '）', { retryable: true }) };
    }
    if (it.rate !== undefined) {
      return { ok: false, error: makeError('invalid_argument', '不接受显式 rate：单价由 Standard Selling 价格表解析（如需自定义单价请先 erpnext_item_price_set）', { retryable: true }) };
    }
  }

  // 可写字段白名单（第二层拦截）：不接受任意字段名/不可改字段/显式 rate。
  const writable = new Set(allowlist.WRITABLE_FIELDS.sales_order_create);
  for (const k of Object.keys(args)) {
    if (k === 'customer' || k === 'items') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.sales_order_create.join('/'), { retryable: true }) };
    }
  }

  // 幂等指纹（进指纹 = 实际生效的公司、币种、价格表 + 交易对手 + 要求日期 + 行项目，保持行项目原顺序）。
  const businessParams = {
    t: 'sales_order_create',
    company: locked.company,
    currency: locked.currency,
    price_list: locked.sellingPriceList,
    customer: customer,
    items: items,
    ...pick(args, ['transaction_date', 'delivery_date']),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言 ①：客户存在且启用。
  const cust = await ctx.backend.get('Customer', customer);
  if (!cust.ok) return cust;
  if (!cust.data) {
    return { ok: false, error: makeError('precondition_failed', '客户「' + customer + '」不存在：请指定存在的客户', { retryable: false }) };
  }
  if (cust.data.disabled === 1 || cust.data.disabled === true) {
    return { ok: false, error: makeError('precondition_failed', '客户「' + customer + '」已禁用：请先启用', { retryable: false }) };
  }

  // 前置断言 ②：行内物料存在且启用（B02 F6 空 items 已前置拦截；此处拦截无效 item_code）。
  for (const it of items) {
    const itm = await ctx.backend.get('Item', it.item_code);
    if (!itm.ok) return itm;
    if (!itm.data) {
      return { ok: false, error: makeError('precondition_failed', '物料「' + it.item_code + '」不存在：请指定存在的物料', { retryable: false }) };
    }
    if (itm.data.disabled === 1 || itm.data.disabled === true) {
      return { ok: false, error: makeError('precondition_failed', '物料「' + it.item_code + '」已禁用：请先启用', { retryable: false }) };
    }
  }

  // 全自动档：仅 L3 免确认；写入能力门控（币种/价格表 fail-closed + 客户端 elicitation，PRD 决议 1/2）。
  const gate = writeGate(ctx);
  if (!gate.ok) return gate;

  // 后端写（POST Sales Order；company/currency/price_list 锁单注入，不接受显式 rate）。
  const doc = {
    customer: customer,
    company: locked.company,
    currency: locked.currency,
    selling_price_list: locked.sellingPriceList,
    items: items.map(function (it) {
      const row = { item_code: it.item_code, qty: it.qty };
      if (it.warehouse !== undefined && it.warehouse !== null && it.warehouse !== '') row.warehouse = it.warehouse;
      return row;
    }),
  };
  if (args.transaction_date !== undefined && args.transaction_date !== null && args.transaction_date !== '') doc.transaction_date = args.transaction_date;
  if (args.delivery_date !== undefined && args.delivery_date !== null && args.delivery_date !== '') doc.delivery_date = args.delivery_date;

  const created = await ctx.backend.create(DOCTYPE, doc);
  if (!created.ok) return created;

  // 写后回读终态（单据编号 + 客户 + 行项目 + 草稿态）。
  const newName = (created.data && created.data.name);
  const rb = await ctx.backend.get(DOCTYPE, newName);
  if (!rb.ok) return rb;

  const result = {
    name: rb.data.name,
    customer: rb.data.customer,
    status: rb.data.docstatus === 0 ? 'Draft' : (rb.data.docstatus === 1 ? 'Submitted' : 'Cancelled'),
    items: items.map(function (it) { return { item_code: it.item_code, qty: it.qty }; }),
  };

  // 记首结果 + 批次（同批 = 销售订单草稿；回滚草稿 → 删除）。
  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_sales_order_create' });
    ctx.batchLedger.recordChange(bId, buildChange({ objectType: DOCTYPE, objectName: result.name, action: 'create', afterState: 'draft' }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k]; }
  return out;
}

module.exports = { definition, handler };
