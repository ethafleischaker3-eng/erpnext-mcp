'use strict';
/*
 * E02 事后校验框架（W06）
 * ============================================================
 * 落地规范 §9.5、PRD §5.3、D01 §6.2 的两层拆分：
 *   返回值形状：返回结构是否符合声明的契约 —— 协议已覆盖。
 *   写入是否落库：数据是否真的变成期望终态 —— 未覆盖，这才是事后校验。
 * 硬约束：返回值符合 schema 不代表写入成功。
 *
 * 本框架提供写后回读编排（回读 → 断言期望终态 → 不一致则报错 + 记批次 + 标记待回滚）；
 * 具体逐 tool 的回读字段与期望终态由 D02 契约与 F 包落地。
 */

const { makeError } = require('./errors');

// 确定性结构相等比较（对象键序无关、数组顺序敏感），用于回读结果与期望终态比对。
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!deepEqual(a[aKeys[i]], b[bKeys[i]])) return false;
  }
  return true;
}

/*
 * 写后回读校验。actual = 回读到的终态，expected = 期望终态。
 * 一致 → { ok:true }；不一致 → { ok:false, error: postcondition_failed, markRollback:true }。
 * 调用方（F 包接入）须在 markRollback=true 时记入批次台账并标记待回滚。
 */
function checkReadBack(actual, expected) {
  if (deepEqual(actual, expected)) return { ok: true };
  return {
    ok: false,
    markRollback: true,
    error: makeError('postcondition_failed', '写后回读终态与期望不一致，已标记待回滚', {
      retryable: false,
      details: { expected, actual },
    }),
  };
}

// 两层拆分标记（与 precondition.js 对称），供文档与复核引用。
const LAYERS = Object.freeze({
  RETURN_SHAPE: 'return_shape', // 协议已覆盖
  WRITE_BACK: 'write_back',     // 未覆盖，本框架所指的事后校验
});

module.exports = { checkReadBack, deepEqual, LAYERS };
