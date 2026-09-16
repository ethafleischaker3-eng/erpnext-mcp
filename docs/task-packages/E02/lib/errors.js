'use strict';
/*
 * E02 公共错误模型参考实现（D01 common-contract §4）
 * ============================================================
 * 每个错误响应含：isError（恒 true）、code（稳定语义化错误码）、message（可自纠改进方向）、
 * retryable（是否可安全重试）、details（可选结构化上下文）。不裸抛堆栈、不裸抛后端原生异常名。
 * 幂等命中不是错误，是成功语义（D01 §4.3）：isError=false + idempotent_replay=true。
 */

function makeError(code, message, opts) {
  opts = opts || {};
  const err = {
    isError: true,
    code: code,
    message: message,
    retryable: opts.retryable === true,
  };
  if (opts.details !== undefined && opts.details !== null) {
    err.details = opts.details;
  }
  return err;
}

// create 组指纹命中：返回首次结果 + 「重复请求已按幂等合并」（D01 §4.3）。
function idempotentReplay(firstResult, message) {
  const out = {
    isError: false,
    idempotent_replay: true,
  };
  if (firstResult && typeof firstResult === 'object') {
    for (const k of Object.keys(firstResult)) out[k] = firstResult[k];
  }
  out.message = message || '重复请求已按幂等合并';
  return out;
}

// confirm/cancel 组状态断言命中：幂等成功（「已在目标状态」），非通用错误。
// 注：具体返回结构由 D02 冻结（B05 §18.4 第 2 条、D01 §4.3），此处为可验收语义的参考形状。
function idempotentAlreadyInTargetState(message) {
  return {
    isError: false,
    idempotent_replay: true,
    already_in_target_state: true,
    message: message || '目标单据已在目标状态，本次视为重复请求已合并',
  };
}

module.exports = { makeError, idempotentReplay, idempotentAlreadyInTargetState };
