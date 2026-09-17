'use strict';
/*
 * F02 #19 erpnext_purchase_receipt_create（W04/W06/W07）
 * 忠实 D02 §5.4：按已生效采购订单生成收货草稿（全自动免确认，仅限 L3）。目标 Purchase Receipt ▲；create 组 300s；不带 modified。
 * 前置断言（server 侧）：来源 PO 已生效（docstatus=1，B03 §2.2）；行数量≤来源未完成量（草稿后端不校验超收、confirm 才触发，B03 F5，server 前置校验）；items 非空（若显式提供）。
 * 写：make_purchase_receipt mapper → 草稿 dict → POST /api/resource/Purchase Receipt（缺省取来源未完成量；显式 items 按 item_code 覆写并校验 ≤ 未完成量）。
 * 回读：收货草稿（编号 + 来源订单 + 行项目 + 草稿态）。回滚：草稿 → 删除；不承诺删除已生效/已取消收货单（B03 F9）。
 */

const allowlist = require('../allowlist');
const { LOCKED_BUSINESS } = require('../config');
const { makeError } = require('../../lib/errors');
const { idempotency, callerId, buildChange, writeGate } = require('./write-common');

const DOCTYPE = 'Purchase Receipt';
const SOURCE_DOCTYPE = 'Purchase Order';

const definition = {
  name: 'erpnext_purchase_receipt_create',
  description:
    '按已生效采购订单生成采购收货单草稿（无业务效果，不生效）。' +
    '消歧：本 tool 只产草稿；收货入库生效走 erpnext_purchase_receipt_confirm。' +
    '窄接口边界：只写 Purchase Receipt 草稿及嵌套行项目；不隐式创建/修改供应商/物料/价格。',
  inputSchema: {
    type: 'object',
    properties: {
      purchase_order_id: { type: 'string', description: '来源采购订单（须已生效，语义标识单据编号，必填）。' },
      items: {
        type: 'array',
        description: '行项目数组（可选，可指定行与数量；缺省取来源未完成量；每行 item_code、qty、warehouse）。',
        items: {
          type: 'object',
          properties: {
            item_code: { type: 'string', description: '物料编码（必填）。' },
            qty: { type: 'number', description: '数量（必填，>0，≤来源未完成量）。' },
            warehouse: { type: 'string', description: '仓库（可选）。' },
          },
          required: ['item_code', 'qty'],
        },
      },
      posting_date: { type: 'string', description: '过账日期（可选，YYYY-MM-DD）。' },
    },
    required: ['purchase_order_id'],
  },
  annotations: {
    title: '按采购订单生成收货草稿',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const purchaseOrderId = args.purchase_order_id;
  const items = args.items;
  const locked = (ctx && ctx.config && ctx.config.locked) || LOCKED_BUSINESS;

  // schema 校验。
  if (typeof purchaseOrderId !== 'string' || purchaseOrderId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'purchase_order_id 必填：请提供来源采购订单编号', { retryable: true }) };
  }
  if (items !== undefined && items !== null) {
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, error: makeError('invalid_argument', 'items 若显式提供必须非空', { retryable: true }) };
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (typeof it.item_code !== 'string' || it.item_code.trim() === '') {
        return { ok: false, error: makeError('invalid_argument', 'items[' + i + '].item_code 必填', { retryable: true }) };
      }
      if (typeof it.qty !== 'number' || !(it.qty > 0)) {
        return { ok: false, error: makeError('invalid_argument', 'items[' + i + '].qty 必须 >0（当前 ' + it.qty + '）', { retryable: true }) };
      }
    }
  }

  // 可写字段白名单。
  const writable = new Set(allowlist.WRITABLE_FIELDS.purchase_receipt_create);
  for (const k of Object.keys(args)) {
    if (k === 'purchase_order_id' || k === 'items') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.purchase_receipt_create.join('/'), { retryable: true }) };
    }
  }

  // 幂等指纹（进指纹 = 实际生效的公司、币种 + 来源单据及来源行 + 要求日期 + 行项目）。
  const businessParams = {
    t: 'purchase_receipt_create',
    company: locked.company,
    currency: locked.currency,
    source_order: purchaseOrderId,
    items: items || null,
    ...(args.posting_date !== undefined && args.posting_date !== null && args.posting_date !== '' ? { posting_date: args.posting_date } : {}),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言：来源 PO 已生效（docstatus=1，B03 §2.2）。
  const po = await ctx.backend.get(SOURCE_DOCTYPE, purchaseOrderId);
  if (!po.ok) return po;
  if (!po.data) {
    return { ok: false, error: makeError('precondition_failed', '采购订单「' + purchaseOrderId + '」不存在：请核对单据编号', { retryable: false }) };
  }
  if (po.data.docstatus !== 1) {
    return { ok: false, error: makeError('precondition_failed', '采购订单「' + purchaseOrderId + '」当前未生效：请先 erpnext_purchase_order_confirm', { retryable: false }) };
  }

  // 经 mapper 生成收货草稿（items 已含 purchase_order/purchase_order_item/qty=来源未完成量）。
  const mapped = await ctx.backend.makePurchaseReceipt(purchaseOrderId);
  if (!mapped.ok) return mapped;
  const draft = mapped.data || {};

  // 若显式提供 items：按 item_code 覆写行与数量并校验 ≤ 未完成量（B03 F5 草稿后端不校验超收，server 前置）。
  const sourceItems = Array.isArray(draft.items) ? draft.items : [];
  if (items !== undefined && items !== null) {
    for (const it of items) {
      const src = sourceItems.find(function (r) { return r.item_code === it.item_code; });
      if (!src) {
        return { ok: false, error: makeError('invalid_argument', '物料「' + it.item_code + '」不在来源采购订单「' + purchaseOrderId + '」行项目中', { retryable: true }) };
      }
      const remaining = typeof src.qty === 'number' ? src.qty : 0;
      if (it.qty > remaining) {
        return {
          ok: false,
          error: makeError('precondition_failed',
            '物料「' + it.item_code + '」收货量 ' + it.qty + ' 超过来源未完成量 ' + remaining + '：请减量或分批收货', {
            retryable: true,
            details: { item_code: it.item_code, requested: it.qty, remaining: remaining },
          }),
        };
      }
      src.qty = it.qty;
      if (it.warehouse !== undefined && it.warehouse !== null && it.warehouse !== '') src.warehouse = it.warehouse;
    }
    draft.items = sourceItems;
  }

  if (args.posting_date !== undefined && args.posting_date !== null && args.posting_date !== '') draft.posting_date = args.posting_date;

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;

  // 后端写（POST Purchase Receipt）。
  const created = await ctx.backend.create(DOCTYPE, draft);
  if (!created.ok) return created;

  // 写后回读终态。
  const newName = (created.data && created.data.name);
  const rb = await ctx.backend.get(DOCTYPE, newName);
  if (!rb.ok) return rb;

  const outItems = (items || sourceItems).map(function (r) { return { item_code: r.item_code, qty: r.qty }; });
  const result = {
    name: rb.data.name,
    purchase_order: purchaseOrderId,
    status: rb.data.docstatus === 0 ? 'Draft' : (rb.data.docstatus === 1 ? 'Submitted' : 'Cancelled'),
    items: outItems,
  };

  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_purchase_receipt_create' });
    ctx.batchLedger.recordChange(bId, buildChange({ objectType: DOCTYPE, objectName: result.name, action: 'create', afterState: 'draft' }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

module.exports = { definition, handler };
