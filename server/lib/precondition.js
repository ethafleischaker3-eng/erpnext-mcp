'use strict';
/*
 * E02 前置断言框架（W05）
 * ============================================================
 * 落地规范 §9.4、PRD §5.2、D01 §6.1 的两层拆分：
 *   schema 层：参数格式是否合法 —— 协议已覆盖（server 校验参数并以业务错误返回），
 *              不计入本框架的「前置断言」。
 *   业务状态层：当前状态是否允许此操作 —— 未覆盖，这才是前置断言。
 * 硬约束：完成 schema 校验不构成满足前置断言要求。
 *
 * 本框架只提供业务状态断言的挂钩与失败返回口径；具体逐 tool 断言由 D02 契约与 F 包落地。
 */

const { makeError } = require('./errors');

/*
 * 依次执行业务状态断言（每条为同步函数：assertion(ctx) => { ok:true } | { ok:false, message, retryable?, details? }）。
 * 首个失败即返回 precondition_failed 错误（含当前状态 + 建议动作）；全部通过返回 { ok:true }。
 */
function assertPreconditions(assertions, ctx) {
  ctx = ctx || {};
  for (const assertion of assertions) {
    const r = assertion(ctx);
    if (r && r.ok === false) {
      return {
        ok: false,
        error: makeError('precondition_failed', r.message || '业务前置断言未满足', {
          retryable: r.retryable,
          details: r.details,
        }),
      };
    }
  }
  return { ok: true };
}

// 前置断言（业务状态层）与 schema 校验（协议已覆盖）的显式区分标记，供文档与复核引用。
const LAYERS = Object.freeze({
  SCHEMA: 'schema',      // 协议已覆盖，不计入前置断言
  BUSINESS_STATE: 'business_state', // 未覆盖，本框架所指的前置断言
});

module.exports = { assertPreconditions, LAYERS };
