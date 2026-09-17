'use strict';
/*
 * F04 #24 erpnext_stock_transfer_confirm（W04/W06/W07）
 * 忠实 D02 §6.2：调拨生效（人确认）。confirm 组 60s 状态断言兜底；必带 modified。
 * 前置断言（server 自建，B04 F5/F3）：目标仍草稿且 modified 一致、源/目仓有效且不同、源仓可用库存仍满足；
 *   经 frappe.client.submit 全量 doc（不得走资源端点 run_method:submit）。
 * 回读：docstatus=1 + SLE 源减目增（B04 F6，不写 GL）。已生效无 cancel tool，管理员回滚。
 */

const allowlist = require('../allowlist');
const { makeError, idempotentReplay, idempotentAlreadyInTargetState } = require('../../lib/errors');
const { checkStateAssertion } = require('../../lib/idempotency');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Stock Entry';

const definition = {
  name: 'erpnext_stock_transfer_confirm',
  description:
    '将调拨草稿生效（真实移动库存：源仓减、目标仓增）。' +
    '消歧：erpnext_stock_transfer_create 只产草稿；本 tool 才移动库存。' +
    '窄接口边界：只做状态流转（草稿→已生效），不新增/修改行项目。',
  inputSchema: {
    type: 'object',
    properties: {
      stock_entry_id: { type: 'string', description: '调拨单编号语义标识（必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
    },
    required: ['stock_entry_id', 'modified'],
  },
  annotations: {
    title: '调拨生效',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const stockEntryId = args.stock_entry_id;
  const modified = args.modified;

  if (typeof stockEntryId !== 'string' || stockEntryId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'stock_entry_id 必填：请提供调拨单编号', { retryable: true }) };
  }
  if (typeof modified !== 'string' || modified.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'modified 必填：请提供当前版本令牌（乐观并发）', { retryable: true }) };
  }

  // 回读当前状态，供状态断言兜底（先于指纹，确保二次 confirm 命中「已在目标状态」幂等成功）。
  const cur = await ctx.backend.get(DOCTYPE, stockEntryId);
  if (!cur.ok) return cur; // 目标不存在 → precondition_failed
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '调拨单「' + stockEntryId + '」不存在：请核对编号', { retryable: false }) };
  }

  // 状态断言（confirm 仅草稿；命中已生效 → 幂等成功）。
  const state = stateOf(c.docstatus);
  const sa = checkStateAssertion({ currentState: state, targetState: 'submitted' });
  if (sa.hit) {
    return { ok: true, result: idempotentAlreadyInTargetState(sa.message) };
  }
  if (state !== 'draft') {
    return { ok: false, error: makeError('precondition_failed', '调拨单「' + stockEntryId + '」当前为「' + state + '」：仅草稿可生效', { retryable: false }) };
  }

  // 幂等指纹（进指纹 = 目标单据编号 + 动作）。confirm 组 60s。
  const businessParams = { t: 'stock_transfer_confirm', stock_entry_id: stockEntryId, action: 'confirm' };
  const chk = idempotency.check('confirm/cancel', businessParams);
  if (chk.hit && chk.firstResult) {
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言：版本一致。
  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '调拨单「' + stockEntryId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  // 前置断言：源/目仓有效且不同（B04 F5 后端不强制）。
  const fw = c.from_warehouse;
  const tw = c.to_warehouse;
  if (!fw || !tw) {
    return { ok: false, error: makeError('precondition_failed', '调拨单缺源/目标仓：请核对单据', { retryable: false }) };
  }
  if (fw === tw) {
    return { ok: false, error: makeError('precondition_failed', '源/目标仓相同（' + fw + '）：请指定不同源/目标仓', { retryable: false }) };
  }

  // 前置断言：源仓可用库存仍满足调拨量（server 查 Bin，B04 F5 confirm 才校验）。
  const rows = c.items || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: makeError('precondition_failed', '调拨单无行项目：请核对单据', { retryable: false }) };
  }
  for (const row of rows) {
    const bin = await ctx.backend.getList('Bin', {
      fields: ['item_code', 'warehouse', 'projected_qty', 'actual_qty'],
      filters: [['item_code', '=', row.item_code], ['warehouse', '=', fw]],
      limitPageLength: 1,
    });
    if (!bin.ok) return bin;
    const b = (bin.data || [])[0];
    const available = b ? (typeof b.projected_qty === 'number' ? b.projected_qty : b.actual_qty) : 0;
    if (available < row.qty) {
      return {
        ok: false,
        error: makeError('precondition_failed',
          '源仓「' + fw + '」物料「' + row.item_code + '」可用量不足（需 ' + row.qty + '，可 ' + available + '）：请减量或换仓', {
          retryable: false,
          details: { item_code: row.item_code, required: row.qty, available: available },
        }),
      };
    }
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_stock_transfer_confirm', args);
  if (!conf.ok) return conf;

  // 提交生效（经 frappe.client.submit 全量 doc，非 name 串，B04 F3）。
  const submitted = await ctx.backend.submit(DOCTYPE, c);
  if (!submitted.ok) return submitted;

  // 写后回读终态：docstatus=1；SLE 源减目增（不写 GL）。
  const rb = await ctx.backend.get(DOCTYPE, stockEntryId);
  if (!rb.ok) return rb;
  if (rb.data.docstatus !== 1) {
    return { ok: false, error: makeError('postcondition_failed', '调拨生效后回读 docstatus 非 1：标记待回滚', { retryable: false }) };
  }

  const result = { name: rb.data.name, status: 'Submitted', docstatus: rb.data.docstatus };

  // 记首结果 + 批次（已生效 → 管理员运维异常回滚，无 cancel tool，不承诺删除）。
  idempotency.record('confirm/cancel', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_stock_transfer_confirm' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: stockEntryId, action: 'confirm',
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
