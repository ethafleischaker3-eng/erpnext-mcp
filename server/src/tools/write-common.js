'use strict';
/*
 * F04+F02 写 tool 公共层（W06/W07：挂接 E02 幂等/确认/批次 + E01 确认）
 * ============================================================
 * 供 19 个写 tool（#6–#12 主数据、#13–#22 销售/采购、#23/#24 调拨）复用，不新增通用执行面（D01 §7.6）。
 * 复用 E02 lib/：createIdempotencyStore / identity / rollbackPathFor / makeError。
 *
 * 关键挂接：
 *  - 幂等 store 进程级单例；create 组/指纹合并类 300s、confirm 组 60s（不反向放宽）。
 *  - 写前确认（人确认档）经 elicitation.requireConfirmation。
 *  - 写入能力门控（币种/价格表 fail-closed + 客户端 elicitation，PRD 决议 1/2）。
 *  - 批次变更记录（对象/动作/前后态/回滚路径）；会话级归属（identity）。
 */

const { createIdempotencyStore } = require('../../lib/idempotency');
const { makeError } = require('../../lib/errors');
const { rollbackPathFor } = require('../../lib/batch-ledger');
const { requireConfirmation, needsConfirmation } = require('../elicitation');

// 进程级幂等 store 单例（跨 tools/call 共享；内存不落库，会话结束消失）。
const idempotency = createIdempotencyStore();

// 语义化批次变更记录：对象/标识/动作/前后态/回滚路径。
function buildChange(entry) {
  const before = entry.beforeState !== undefined ? entry.beforeState : null;
  const after = entry.afterState !== undefined ? entry.afterState : null;
  return {
    objectType: entry.objectType,
    objectName: entry.objectName,
    action: entry.action,
    beforeState: before,
    afterState: after,
    rollbackPath: entry.rollbackPath !== undefined ? entry.rollbackPath : rollbackPathFor(after),
  };
}

// 写前确认编排（人确认档）。返回 { ok:false, error } 或 { ok:true }。
async function confirmIfNeeded(ctx, toolName, args) {
  if (!needsConfirmation(toolName)) return { ok: true };
  return requireConfirmation(ctx, toolName, args);
}

/*
 * 写入能力统一门控（E01 confirmation-failclosed §2：币种/价格表 fail-closed + PRD 决议 1 客户端不支持）。
 * 写 tool 在执行写前调用，返回 { ok:true } | { ok:false, error:permission_denied }。
 * 只读 tool 不调用本门控。
 */
function writeGate(ctx) {
  const wc = ctx && ctx.writeEligible;
  if (wc && wc.ok === false) {
    return { ok: false, error: makeError('permission_denied', wc.reason || '写入能力未就绪：已 fail-closed', { retryable: false }) };
  }
  // 客户端未声明 elicitation → 全量写 fail-closed（含全自动档 #13/#16/#19/#21/#23）。
  if (ctx && ctx.clientSupportsElicitation !== true) {
    return { ok: false, error: makeError('permission_denied', '客户端未声明 elicitation 能力：写操作已 fail-closed（零写入）', { retryable: false }) };
  }
  return { ok: true };
}

// 会话级归属 callerId（identity）。批次归属到会话粒度（B00 §18.3 / B05 §3）。
function callerId(ctx) {
  const caller = ctx && ctx.identity ? ctx.identity.resolveCaller(ctx.transportContext || {}, ctx.adminResolver) : { callerId: null };
  return caller.callerId;
}

module.exports = {
  idempotency,
  buildChange,
  confirmIfNeeded,
  writeGate,
  callerId,
};
