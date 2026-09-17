'use strict';
/*
 * F02 #21 erpnext_delivery_note_create（W03/W06/W07）
 * 忠实 D02 §4.4：按已生效销售订单生成发货草稿（全自动免确认，仅限 L3）。目标 Delivery Note ▲；create 组 300s；不带 modified。
 * 前置断言（server 侧）：来源 SO 已生效（docstatus=1，B02 §2.2）；行数量≤来源未完成量（草稿后端不校验超发、confirm 才触发，B02 F5，server 前置校验）；items 非空（若显式提供）。
 * 写：make_delivery_note mapper → 草稿 dict → POST /api/resource/Delivery Note（缺省取来源未完成量；显式 items 按 item_code 覆写并校验 ≤ 未完成量）。
 * 回读：发货草稿（编号 + 来源订单 + 行项目 + 草稿态）。回滚：草稿 → 删除（B02 §4）。
 */

const allowlist = require('../allowlist');
const { LOCKED_BUSINESS } = require('../config');
const { makeError } = require('../../lib/errors');
const { idempotency, callerId, buildChange, writeGate } = require('./write-common');

const DOCTYPE = 'Delivery Note';
const SOURCE_DOCTYPE = 'Sales Order';

const definition = {
  name: 'erpnext_delivery_note_create',
  description:
    '按已生效销售订单生成销售发货单草稿（无业务效果，不生效）。' +
    '消歧：本 tool 只产草稿；发货出库生效走 erpnext_delivery_note_confirm。' +
    '窄接口边界：只写 Delivery Note 草稿及嵌套行项目；不隐式创建/修改客户/物料/价格。',
  inputSchema: {
    type: 'object',
    properties: {
      sales_order_id: { type: 'string', description: '来源销售订单（须已生效，语义标识单据编号，必填）。' },
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
    required: ['sales_order_id'],
  },
  annotations: {
    title: '按销售订单生成发货草稿',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const salesOrderId = args.sales_order_id;
  const items = args.items;
  const locked = (ctx && ctx.config && ctx.config.locked) || LOCKED_BUSINESS;

  if (typeof salesOrderId !== 'string' || salesOrderId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'sales_order_id 必填：请提供来源销售订单编号', { retryable: true }) };
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

  const writable = new Set(allowlist.WRITABLE_FIELDS.delivery_note_create);
  for (const k of Object.keys(args)) {
    if (k === 'sales_order_id' || k === 'items') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.delivery_note_create.join('/'), { retryable: true }) };
    }
  }

  const businessParams = {
    t: 'delivery_note_create',
    company: locked.company,
    currency: locked.currency,
    source_order: salesOrderId,
    items: items || null,
    ...(args.posting_date !== undefined && args.posting_date !== null && args.posting_date !== '' ? { posting_date: args.posting_date } : {}),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言：来源 SO 已生效（docstatus=1，B02 §2.2）。
  const so = await ctx.backend.get(SOURCE_DOCTYPE, salesOrderId);
  if (!so.ok) return so;
  if (!so.data) {
    return { ok: false, error: makeError('precondition_failed', '销售订单「' + salesOrderId + '」不存在：请核对单据编号', { retryable: false }) };
  }
  if (so.data.docstatus !== 1) {
    return { ok: false, error: makeError('precondition_failed', '销售订单「' + salesOrderId + '」当前未生效：请先 erpnext_sales_order_confirm', { retryable: false }) };
  }

  // 经 mapper 生成发货草稿（items 已含 against_sales_order/so_detail/qty=来源未完成量）。
  const mapped = await ctx.backend.makeDeliveryNote(salesOrderId);
  if (!mapped.ok) return mapped;
  const draft = mapped.data || {};

  // 若显式提供 items：按 item_code 覆写行与数量并校验 ≤ 未完成量（B02 F5 草稿后端不校验超发，server 前置）。
  const sourceItems = Array.isArray(draft.items) ? draft.items : [];
  if (items !== undefined && items !== null) {
    for (const it of items) {
      const src = sourceItems.find(function (r) { return r.item_code === it.item_code; });
      if (!src) {
        return { ok: false, error: makeError('invalid_argument', '物料「' + it.item_code + '」不在来源销售订单「' + salesOrderId + '」行项目中', { retryable: true }) };
      }
      const remaining = typeof src.qty === 'number' ? src.qty : 0;
      if (it.qty > remaining) {
        return {
          ok: false,
          error: makeError('precondition_failed',
            '物料「' + it.item_code + '」发货量 ' + it.qty + ' 超过来源未完成量 ' + remaining + '：请减量或分批发货', {
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

  // 后端写（POST Delivery Note）。
  const created = await ctx.backend.create(DOCTYPE, draft);
  if (!created.ok) return created;

  // 写后回读终态。
  const newName = (created.data && created.data.name);
  const rb = await ctx.backend.get(DOCTYPE, newName);
  if (!rb.ok) return rb;

  const outItems = (items || sourceItems).map(function (r) { return { item_code: r.item_code, qty: r.qty }; });
  const result = {
    name: rb.data.name,
    sales_order: salesOrderId,
    status: rb.data.docstatus === 0 ? 'Draft' : (rb.data.docstatus === 1 ? 'Submitted' : 'Cancelled'),
    items: outItems,
  };

  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_delivery_note_create' });
    ctx.batchLedger.recordChange(bId, buildChange({ objectType: DOCTYPE, objectName: result.name, action: 'create', afterState: 'draft' }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

module.exports = { definition, handler };
