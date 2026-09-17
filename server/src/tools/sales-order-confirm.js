'use strict';
/*
 * F02 #14 erpnext_sales_order_confirm（W03/W06/W07）
 * 忠实 D02 §4.2：生效销售订单（人确认）。confirm 组 60s 状态断言兜底；必带 modified。
 * 前置断言：目标仍草稿且 modified 一致；交易对手/物料/日期/价格等关键状态仍有效（后端 submit 强制）；版本断言与提交同事务。
 * 写：frappe.client.submit 全量 doc（B02 F2）。回读 docstatus=1。回滚：已生效 → 后端原生取消（经 sales_order_cancel）。
 */

const { makeError, idempotentReplay, idempotentAlreadyInTargetState } = require('../../lib/errors');
const { checkStateAssertion } = require('../../lib/idempotency');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Sales Order';

const definition = {
  name: 'erpnext_sales_order_confirm',
  description:
    '将销售订单草稿生效（触发真实业务效果）。' +
    '消歧：erpnext_sales_order_create 只产草稿；本 tool 才使单据进入已生效。' +
    '窄接口边界：只做状态流转（草稿→已生效），不新增/修改行项目。',
  inputSchema: {
    type: 'object',
    properties: {
      sales_order_id: { type: 'string', description: '销售订单编号语义标识（必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
    },
    required: ['sales_order_id', 'modified'],
  },
  annotations: {
    title: '生效销售订单',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const salesOrderId = args.sales_order_id;
  const modified = args.modified;

  if (typeof salesOrderId !== 'string' || salesOrderId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'sales_order_id 必填：请提供销售订单编号', { retryable: true }) };
  }
  if (typeof modified !== 'string' || modified.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'modified 必填：请提供当前版本令牌（乐观并发）', { retryable: true }) };
  }

  // 回读当前状态，供状态断言兜底（先于指纹，确保二次 confirm 命中「已在目标状态」幂等成功）。
  const cur = await ctx.backend.get(DOCTYPE, salesOrderId);
  if (!cur.ok) return cur;
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '销售订单「' + salesOrderId + '」不存在：请核对编号', { retryable: false }) };
  }

  // 状态断言（confirm 仅草稿；命中已生效 → 幂等成功）。
  const state = stateOf(c.docstatus);
  const sa = checkStateAssertion({ currentState: state, targetState: 'submitted' });
  if (sa.hit) {
    return { ok: true, result: idempotentAlreadyInTargetState(sa.message) };
  }
  if (state !== 'draft') {
    return { ok: false, error: makeError('precondition_failed', '销售订单「' + salesOrderId + '」当前为「' + state + '」：仅草稿可生效', { retryable: false }) };
  }

  // 幂等指纹（进指纹 = 目标单据编号 + 动作）。confirm 组 60s。
  const businessParams = { t: 'sales_order_confirm', sales_order_id: salesOrderId, action: 'confirm' };
  const chk = idempotency.check('confirm/cancel', businessParams);
  if (chk.hit && chk.firstResult) {
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言：版本一致（B02 F2 乐观并发令牌）。
  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '销售订单「' + salesOrderId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_sales_order_confirm', args);
  if (!conf.ok) return conf;

  // 提交生效（经 frappe.client.submit 全量 doc，非 name 串，B02 F2）。
  const submitted = await ctx.backend.submit(DOCTYPE, c);
  if (!submitted.ok) return submitted;

  // 写后回读终态：docstatus=1。
  const rb = await ctx.backend.get(DOCTYPE, salesOrderId);
  if (!rb.ok) return rb;
  if (rb.data.docstatus !== 1) {
    return { ok: false, error: makeError('postcondition_failed', '销售订单生效后回读 docstatus 非 1：标记待回滚', { retryable: false }) };
  }

  const result = { name: rb.data.name, status: 'Submitted', docstatus: rb.data.docstatus };

  idempotency.record('confirm/cancel', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_sales_order_confirm' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: salesOrderId, action: 'confirm',
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
