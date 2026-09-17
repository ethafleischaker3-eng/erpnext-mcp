'use strict';
/*
 * F02 #16 erpnext_purchase_order_create（W04/W06/W07）
 * 忠实 D02 §5.1：创建采购订单草稿（全自动免确认，仅限 L3）。目标 Purchase Order ▲；create 组 300s；不带 modified。
 * 不接受显式 rate（单价由冻结采购价格表 Standard Buying 解析，消除 B03 F7 孤儿 Item Price 副作用）。
 * 前置断言（server 侧）：供应商启用；行内物料存在且启用；items 非空、数量非负（B03 F6）；schedule_date 提供（B03 F8）。
 * 写：POST /api/resource/Purchase Order（company/currency/buying_price_list 由 server 配置注入）。
 * 回读：采购订单草稿（编号 + 供应商 + 行项目 + 草稿态）。回滚：草稿 → 删除（B03 §4）。
 */

const allowlist = require('../allowlist');
const { LOCKED_BUSINESS } = require('../config');
const { makeError } = require('../../lib/errors');
const { idempotency, callerId, buildChange, writeGate } = require('./write-common');

const DOCTYPE = 'Purchase Order';

const definition = {
  name: 'erpnext_purchase_order_create',
  description:
    '创建一张采购订单草稿（无业务效果，不生效）。' +
    '消歧：本 tool 只产草稿；要生效必须走 erpnext_purchase_order_confirm。' +
    '窄接口边界：只写 Purchase Order 草稿及嵌套行项目；不隐式创建/修改供应商、物料或价格主数据；不接受显式 rate（单价由 Standard Buying 价格表解析）。',
  inputSchema: {
    type: 'object',
    properties: {
      supplier: { type: 'string', description: '供应商（操作允许清单 Supplier，语义标识供应商名，必填）。' },
      schedule_date: { type: 'string', description: '要求日期（Reqd by Date，PO 特有必填，YYYY-MM-DD）。' },
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
    },
    required: ['supplier', 'schedule_date', 'items'],
  },
  annotations: {
    title: '创建采购订单草稿',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const supplier = args.supplier;
  const scheduleDate = args.schedule_date;
  const items = args.items;
  const locked = (ctx && ctx.config && ctx.config.locked) || LOCKED_BUSINESS;

  // schema 校验。
  if (typeof supplier !== 'string' || supplier.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'supplier 必填：请提供供应商（语义标识供应商名）', { retryable: true }) };
  }
  if (typeof scheduleDate !== 'string' || scheduleDate.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'schedule_date 必填：请提供要求日期（Reqd by Date，B03 F8）', { retryable: true }) };
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
      return { ok: false, error: makeError('invalid_argument', '不接受显式 rate：单价由 Standard Buying 价格表解析（如需自定义单价请先 erpnext_item_price_set）', { retryable: true }) };
    }
  }

  // 可写字段白名单。
  const writable = new Set(allowlist.WRITABLE_FIELDS.purchase_order_create);
  for (const k of Object.keys(args)) {
    if (k === 'supplier' || k === 'schedule_date' || k === 'items') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.purchase_order_create.join('/'), { retryable: true }) };
    }
  }

  // 幂等指纹（进指纹 = 实际生效的公司、币种、价格表 + 交易对手 + 要求日期 + 行项目）。
  const businessParams = {
    t: 'purchase_order_create',
    company: locked.company,
    currency: locked.currency,
    price_list: locked.buyingPriceList,
    supplier: supplier,
    schedule_date: scheduleDate,
    items: items,
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言 ①：供应商存在且启用。
  const sup = await ctx.backend.get('Supplier', supplier);
  if (!sup.ok) return sup;
  if (!sup.data) {
    return { ok: false, error: makeError('precondition_failed', '供应商「' + supplier + '」不存在：请指定存在的供应商', { retryable: false }) };
  }
  if (sup.data.disabled === 1 || sup.data.disabled === true) {
    return { ok: false, error: makeError('precondition_failed', '供应商「' + supplier + '」已禁用：请先启用', { retryable: false }) };
  }

  // 前置断言 ②：行内物料存在且启用。
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

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;

  // 后端写（POST Purchase Order；company/currency/buying_price_list 锁单注入，不接受显式 rate）。
  const doc = {
    supplier: supplier,
    schedule_date: scheduleDate,
    company: locked.company,
    currency: locked.currency,
    buying_price_list: locked.buyingPriceList,
    items: items.map(function (it) {
      const row = { item_code: it.item_code, qty: it.qty };
      if (it.warehouse !== undefined && it.warehouse !== null && it.warehouse !== '') row.warehouse = it.warehouse;
      return row;
    }),
  };

  const created = await ctx.backend.create(DOCTYPE, doc);
  if (!created.ok) return created;

  // 写后回读终态。
  const newName = (created.data && created.data.name);
  const rb = await ctx.backend.get(DOCTYPE, newName);
  if (!rb.ok) return rb;

  const result = {
    name: rb.data.name,
    supplier: rb.data.supplier,
    status: rb.data.docstatus === 0 ? 'Draft' : (rb.data.docstatus === 1 ? 'Submitted' : 'Cancelled'),
    items: items.map(function (it) { return { item_code: it.item_code, qty: it.qty }; }),
  };

  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_purchase_order_create' });
    ctx.batchLedger.recordChange(bId, buildChange({ objectType: DOCTYPE, objectName: result.name, action: 'create', afterState: 'draft' }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

module.exports = { definition, handler };
