'use strict';
/*
 * E02 幂等机制（W02 窗口期管理 / W03 误合并策略 / W04 confirm·cancel 状态断言兜底）
 * ============================================================
 * 落地 B05 §18.3 第 3/5 条、B05 idempotency-research §4/§6/§7.2、PRD §5.1、规范 §9.3。
 * 窗口期为冻结值，实现不得放宽（缩短须走变更控制）。
 */

const { fingerprintOf } = require('./fingerprint');

// B05 §18.3 第 3 条冻结值（不得放宽）。单位：秒。
const WINDOW = Object.freeze({
  create: 300,          // create 组（主数据 create；单据/收货/发货/调拨草稿 create）
  'confirm/cancel': 60, // confirm/cancel 组（生效与取消）
});

// 组名归一化：create | confirm/cancel。
function normalizeGroup(group) {
  if (group === 'confirm' || group === 'cancel' || group === 'confirm/cancel') {
    return 'confirm/cancel';
  }
  if (group === 'create') return 'create';
  throw new Error('unknown idempotency group: ' + group);
}

// 断言窗口期未被放宽：请求值不得超过冻结值（缩短合法，放宽拒绝）。
function assertWindowNotWidened(group, seconds) {
  const g = normalizeGroup(group);
  const frozen = WINDOW[g];
  if (typeof seconds !== 'number' || !(seconds >= 0) || seconds > frozen) {
    throw new Error('窗口期不得放宽：' + g + ' 组冻结值 ' + frozen + 's，请求 ' + seconds + 's');
  }
  return seconds;
}

/*
 * 内存幂等存储（可注入时钟以便测试窗口期边界，无需真实等待）。
 * 结构：Map<fingerprint, { firstResult, firstAtMs, windowSeconds, group }>
 */
function createIdempotencyStore(opts) {
  opts = opts || {};
  const now = opts.now || Date.now;
  const records = new Map();

  function check(group, businessParams) {
    const g = normalizeGroup(group);
    const { fingerprint } = fingerprintOf(businessParams);
    const rec = records.get(fingerprint);
    if (!rec) return { hit: false, fingerprint };
    const elapsedSec = (now() - rec.firstAtMs) / 1000;
    if (elapsedSec <= rec.windowSeconds) {
      // 窗口期内命中：返回首次结果 + 「重复请求已按幂等合并」（W02/W03）。
      return { hit: true, fingerprint, firstResult: rec.firstResult, merged: true, elapsedSec };
    }
    // 超期不命中：清理旧记录，允许作为新请求重新执行（W02）。
    records.delete(fingerprint);
    return { hit: false, fingerprint, expired: true, elapsedSec };
  }

  function record(group, businessParams, firstResult, opts2) {
    opts2 = opts2 || {};
    const g = normalizeGroup(group);
    const { fingerprint } = fingerprintOf(businessParams);
    const windowSeconds = (opts2.windowSeconds === undefined)
      ? WINDOW[g]
      : assertWindowNotWidened(g, opts2.windowSeconds);
    records.set(fingerprint, {
      firstResult,
      firstAtMs: now(),
      windowSeconds,
      group: g,
    });
    return fingerprint;
  }

  return { check, record, _size: function () { return records.size; } };
}

/*
 * confirm/cancel 组状态断言兜底（W04）。
 * 语义（B05 §18.3 第 5 条、§7.2）：状态断言命中 =「已在目标状态」= 幂等成功，
 * 而非通用前置断言错误。判断条件：currentState === targetState。
 *  - confirm：合法前态 draft，目标态 submitted；current=submitted → 命中幂等成功。
 *  - cancel ：合法前态 submitted，目标态 cancelled；current=cancelled → 命中幂等成功。
 * 若 current 为其它非法状态（如 confirm 对 cancelled），返回未命中，交由前置断言框架报 precondition_failed。
 */
function checkStateAssertion(meta) {
  const current = meta && meta.currentState;
  const target = meta && meta.targetState;
  if (current === undefined || target === undefined) {
    throw new Error('checkStateAssertion 需要 currentState 与 targetState');
  }
  if (current === target) {
    return {
      hit: true,
      idempotent: true,
      alreadyInTargetState: true,
      message: '目标单据已在目标状态，本次视为重复请求已合并',
    };
  }
  return { hit: false };
}

module.exports = {
  WINDOW,
  normalizeGroup,
  assertWindowNotWidened,
  createIdempotencyStore,
  checkStateAssertion,
};
