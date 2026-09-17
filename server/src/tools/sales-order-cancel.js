'use strict';
/*
 * F02 #15 erpnext_sales_order_cancel（W03/W06/W07）
 * 忠实 D02 §4.3：取消已生效销售订单（人确认）。cancel 组 60s 状态断言兜底；必带 modified。
 * 版本保护经 frappe.client.save（docstatus=2+modified）等价路径（标准 cancel 端点不接受 modified，B02 F3）。
 * 前置断言：目标已生效且 modified 一致；无未取消下游 DN（后端 LinkExistsError 与取消同事务强制）。
 * 写：frappe.client.save(docstatus=2+modified)。回读 docstatus=2。回滚：已取消 → 终态不可回滚（本 tool 即业务取消入口）。
 */

const { makeError, idempotentReplay, idempotentAlreadyInTargetState } = require('../../lib/errors');
const { checkStateAssertion } = require('../../lib/idempotency');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Sales Order';

const definition = {
  name: 'erpnext_sales_order_cancel',
  description:
    '取消一张已生效销售订单（作废，冲减预留/库存）。' +
    '消歧：只取消「已生效」单据；草稿应删除而非取消。' +
    '窄接口边界：只做状态流转（已生效→已取消），不新增行项目。',
  inputSchema: {
    type: 'object',
    properties: {
      sales_order_id: { type: 'string', description: '销售订单编号语义标识（必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
    },
    required: ['sales_order_id', 'modified'],
  },
  annotations: {
    title: '取消销售订单',
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

  const cur = await ctx.backend.get(DOCTYPE, salesOrderId);
  if (!cur.ok) return cur;
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '销售订单「' + salesOrderId + '」不存在：请核对编号', { retryable: false }) };
  }

  // 状态断言（cancel 仅已生效；命中已取消 → 幂等成功）。
  const state = stateOf(c.docstatus);
  const sa = checkStateAssertion({ currentState: state, targetState: 'cancelled' });
  if (sa.hit) {
    return { ok: true, result: idempotentAlreadyInTargetState(sa.message) };
  }
  if (state !== 'submitted') {
    return { ok: false, error: makeError('precondition_failed', '销售订单「' + salesOrderId + '」当前为「' + state + '」：仅已生效可取消（草稿请删除）', { retryable: false }) };
  }

  const businessParams = { t: 'sales_order_cancel', sales_order_id: salesOrderId, action: 'cancel' };
  const chk = idempotency.check('confirm/cancel', businessParams);
  if (chk.hit && chk.firstResult) {
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言：版本一致（经 frappe.client.save 施加，B02 F3）。
  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '销售订单「' + salesOrderId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_sales_order_cancel', args);
  if (!conf.ok) return conf;

  // 取消（frappe.client.save 全量 doc + docstatus=2 + modified，等价路径施加版本保护，B02 F3）。
  const cancelDoc = Object.assign({}, c, { docstatus: 2 });
  const cancelled = await ctx.backend.save(DOCTYPE, cancelDoc);
  if (!cancelled.ok) return cancelled;

  // 写后回读终态：docstatus=2。
  const rb = await ctx.backend.get(DOCTYPE, salesOrderId);
  if (!rb.ok) return rb;
  if (rb.data.docstatus !== 2) {
    return { ok: false, error: makeError('postcondition_failed', '销售订单取消后回读 docstatus 非 2：标记待回滚', { retryable: false }) };
  }

  const result = { name: rb.data.name, status: 'Cancelled', docstatus: rb.data.docstatus };

  idempotency.record('confirm/cancel', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_sales_order_cancel' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: salesOrderId, action: 'cancel',
      beforeState: 'submitted', afterState: 'cancelled',
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
