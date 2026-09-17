'use strict';
/*
 * F02 #17 erpnext_purchase_order_confirm（W04/W06/W07）
 * 忠实 D02 §5.2：生效采购订单（人确认）。confirm 组 60s 状态断言兜底；必带 modified。
 * 前置断言：目标仍草稿且 modified 一致；关键状态仍有效；版本断言与提交同事务。
 * 写：frappe.client.submit 全量 doc（B03 F2）。回读 docstatus=1。回滚：已生效 → 后端原生取消（经 purchase_order_cancel）。
 */

const { makeError, idempotentReplay, idempotentAlreadyInTargetState } = require('../../lib/errors');
const { checkStateAssertion } = require('../../lib/idempotency');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Purchase Order';

const definition = {
  name: 'erpnext_purchase_order_confirm',
  description:
    '将采购订单草稿生效。' +
    '消歧：erpnext_purchase_order_create 只产草稿；本 tool 才生效。' +
    '窄接口边界：只做状态流转（草稿→已生效），不新增/修改行项目。',
  inputSchema: {
    type: 'object',
    properties: {
      purchase_order_id: { type: 'string', description: '采购订单编号语义标识（必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
    },
    required: ['purchase_order_id', 'modified'],
  },
  annotations: {
    title: '生效采购订单',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const purchaseOrderId = args.purchase_order_id;
  const modified = args.modified;

  if (typeof purchaseOrderId !== 'string' || purchaseOrderId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'purchase_order_id 必填：请提供采购订单编号', { retryable: true }) };
  }
  if (typeof modified !== 'string' || modified.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'modified 必填：请提供当前版本令牌（乐观并发）', { retryable: true }) };
  }

  const cur = await ctx.backend.get(DOCTYPE, purchaseOrderId);
  if (!cur.ok) return cur;
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '采购订单「' + purchaseOrderId + '」不存在：请核对编号', { retryable: false }) };
  }

  const state = stateOf(c.docstatus);
  const sa = checkStateAssertion({ currentState: state, targetState: 'submitted' });
  if (sa.hit) {
    return { ok: true, result: idempotentAlreadyInTargetState(sa.message) };
  }
  if (state !== 'draft') {
    return { ok: false, error: makeError('precondition_failed', '采购订单「' + purchaseOrderId + '」当前为「' + state + '」：仅草稿可生效', { retryable: false }) };
  }

  const businessParams = { t: 'purchase_order_confirm', purchase_order_id: purchaseOrderId, action: 'confirm' };
  const chk = idempotency.check('confirm/cancel', businessParams);
  if (chk.hit && chk.firstResult) {
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '采购订单「' + purchaseOrderId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_purchase_order_confirm', args);
  if (!conf.ok) return conf;

  const submitted = await ctx.backend.submit(DOCTYPE, c);
  if (!submitted.ok) return submitted;

  const rb = await ctx.backend.get(DOCTYPE, purchaseOrderId);
  if (!rb.ok) return rb;
  if (rb.data.docstatus !== 1) {
    return { ok: false, error: makeError('postcondition_failed', '采购订单生效后回读 docstatus 非 1：标记待回滚', { retryable: false }) };
  }

  const result = { name: rb.data.name, status: 'Submitted', docstatus: rb.data.docstatus };

  idempotency.record('confirm/cancel', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_purchase_order_confirm' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: purchaseOrderId, action: 'confirm',
      beforeState: 'draft', afterState: 'submitted',
    }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

function stateOf(docstatus) {
  if (docstatus === 1) return 'submitted';
  if (docstatus === 2) return 'cancelled';
  return 'draft';
}

module.exports = { definition, handler };
