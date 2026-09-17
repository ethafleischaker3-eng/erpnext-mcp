'use strict';
/*
 * E02 批次台账（W07）
 * ============================================================
 * 落地 PRD §5.4、D01 §6.4、规范 §9.6 的公共口径：
 *   - 一次 tools/call 一个批次，server 生成批次标识；单次调用产生的全部变更同批。
 *   - 台账由 server 独立留存（本模块为内存参考实现，持久化适配器为接入钩子），不依赖后端。
 *   - 回滚路径：草稿 → 删除；已生效 → 后端原生取消；已取消 → 终态不可回滚，如实标注。
 *   - 批次归属：会话级身份（见 identity.js；B00 §18.3 + B05 §3）。
 * 边界：本模块不接后端、不读库；回滚动作本身由 F 包/管理员运维执行，本模块只记录路径与状态。
 */

const crypto = require('crypto');

// 回滚路径（PRD §5.4 / D01 §6.4）：draft→delete；submitted→cancel；cancelled→terminal（不可回滚）。
const ROLLBACK_PATH = Object.freeze({
  draft: 'delete',
  submitted: 'cancel',
  cancelled: 'terminal',
});

// 依对象状态确定回滚路径；未知状态不猜测，返回 null（调用方须升级，不得推测）。
function rollbackPathFor(state) {
  return Object.prototype.hasOwnProperty.call(ROLLBACK_PATH, state) ? ROLLBACK_PATH[state] : null;
}

function createBatchLedger(opts) {
  opts = opts || {};
  const now = opts.now || Date.now;
  const batches = new Map(); // batchId -> batch
  let seq = 0;

  function newBatchId() {
    seq += 1;
    return 'batch-' + now().toString(36) + '-' + seq.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
  }

  function createBatch(meta) {
    meta = meta || {};
    const batchId = newBatchId();
    const batch = {
      batchId: batchId,
      callerId: meta.callerId || meta.sessionId || null, // 归属：会话级身份
      createdAt: now(),
      toolName: meta.toolName || null,
      status: 'open',            // open | completed | pending_rollback | rolled_back | terminal
      changes: [],               // 同批变更
      rollbackEntries: [],       // 回滚路径记录
      dependencies: [],          // 批次间依赖（跨批次倒序回滚，二期；PRD §5.4）
      rollbackReason: undefined,
    };
    batches.set(batchId, batch);
    return batchId;
  }

  function requireBatch(batchId) {
    const b = batches.get(batchId);
    if (!b) throw new Error('unknown batch: ' + batchId);
    return b;
  }

  // 记录一次同批变更；回滚路径缺省由 afterState 推导。
  function recordChange(batchId, change) {
    const b = requireBatch(batchId);
    const entry = {
      objectType: change.objectType || null,
      objectName: change.objectName || null,
      action: change.action || null,
      beforeState: change.beforeState !== undefined ? change.beforeState : null,
      afterState: change.afterState !== undefined ? change.afterState : null,
      rollbackPath: change.rollbackPath !== undefined ? change.rollbackPath : rollbackPathFor(change.afterState),
      at: now(),
    };
    b.changes.push(entry);
    if (entry.rollbackPath !== null && entry.rollbackPath !== undefined) {
      b.rollbackEntries.push(entry);
    }
    return entry;
  }

  // 事后校验不一致时调用：标记待回滚。
  function markRollbackPending(batchId, reason) {
    const b = requireBatch(batchId);
    b.status = 'pending_rollback';
    b.rollbackReason = reason || 'postcondition_failed';
    return b;
  }

  // 正常完成（仅 open → completed）。
  function complete(batchId) {
    const b = requireBatch(batchId);
    if (b.status === 'open') b.status = 'completed';
    return b;
  }

  // 记录批次间依赖（跨批次倒序回滚，二期）。
  function addDependency(batchId, upstreamBatchId) {
    const b = requireBatch(batchId);
    b.dependencies.push(upstreamBatchId);
    return b;
  }

  function get(batchId) { return batches.get(batchId) || null; }
  function listAll() { return Array.from(batches.values()); }

  return {
    createBatch,
    recordChange,
    markRollbackPending,
    complete,
    addDependency,
    get,
    listAll,
    _size: function () { return batches.size; },
  };
}

module.exports = { createBatchLedger, rollbackPathFor, ROLLBACK_PATH };
