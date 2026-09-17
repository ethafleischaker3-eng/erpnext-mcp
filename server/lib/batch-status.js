'use strict';
/*
 * E02 #26 erpnext_batch_status_get 查询逻辑（W08）
 * ============================================================
 * 落地 PRD §3.3 #26、§5.4、D01 §6.4 的只读可见性边界：
 *   - 普通调用方仅能查询归属于自身可信调用方身份（会话级）的批次，不可查他人、不可主动回滚。
 *   - 管理员（后端 Role/DocPerm 判定，见 identity.js）可查全量。
 *   - 返回内容：涉及对象、状态、回滚结果。
 * 契约边界：本包只冻结查询语义与实现；name/schema/annotation 由 D02 冻结（E02 §9.1 第 6 项）。
 * 边界：只读，无任何回滚动作；不接后端、不读库。
 */

const { makeError } = require('./errors');

/*
 * 查询批次状态。caller = { callerId, isAdmin }（identity.resolveCaller 产物）。
 * 返回 { ok:true, result } | { ok:false, error }。
 * 只读：不产生任何变更、不提供回滚入口。
 */
function queryBatchStatus(batchLedger, caller, batchId) {
  const batch = batchLedger.get(batchId);
  if (!batch) {
    return { ok: false, error: makeError('batch_not_found', '未找到批次 ' + batchId, { retryable: false }) };
  }
  // 普通调用方：仅归属自身会话的批次可见；他人批次 → permission_denied（不泄露他人批次详情）。
  if (!caller.isAdmin && batch.callerId !== caller.callerId) {
    return { ok: false, error: makeError('permission_denied', '无权查询其他调用方的批次', { retryable: false }) };
  }
  const changes = batch.changes.map(function (c) {
    return {
      objectType: c.objectType,
      objectName: c.objectName,
      action: c.action,
      beforeState: c.beforeState,
      afterState: c.afterState,
      rollbackPath: c.rollbackPath,
      at: c.at,
    };
  });
  const result = {
    batchId: batch.batchId,
    status: batch.status,
    createdAt: batch.createdAt,
    toolName: batch.toolName,
    changes: changes,
    rollbackEntries: batch.rollbackEntries.map(function (c) {
      return { objectType: c.objectType, objectName: c.objectName, rollbackPath: c.rollbackPath, at: c.at };
    }),
    dependencies: batch.dependencies.slice(),
  };
  if (batch.rollbackReason !== undefined) result.rollbackReason = batch.rollbackReason;
  return { ok: true, result: result };
}

module.exports = { queryBatchStatus };
