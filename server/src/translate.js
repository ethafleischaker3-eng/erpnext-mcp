'use strict';
/*
 * F01 错误转译（W07：挂接 E02 lib/errors 统一错误形状）
 * ============================================================
 * 忠实 D01 §4 公共错误模型 + D02 §2 逐 tool 错误转译表。
 * 后端原生异常/HTTP 状态 → 稳定语义化 code（面向 agent 可判读）+
 * 可自纠 message + retryable + 可选 details；不裸抛堆栈、不裸抛后端原生异常名。
 * 失败路径不静默成功（D01 §4.4）。
 */

const { makeError } = require('../lib/errors');

// 后端原生异常类型（exc_type）→ 语义化错误码（B01–B04 §6 已封存事实来源）。
const NATIVE_EXC_CODE = {
  PermissionError: 'permission_denied',        // 403 越权
  DoesNotExistError: 'precondition_failed',    // 404 目标不存在
  LinkValidationError: 'precondition_failed',  // 417 引用不存在
  ValidationError: 'precondition_failed',      // 417 业务校验失败
  MandatoryError: 'invalid_argument',          // 417 必填缺失
  TimestampMismatchError: 'concurrency_conflict', // 417 版本陈旧
  DuplicateEntryError: 'duplicate_name',       // 409 重名
  DocstatusTransitionError: 'precondition_failed', // 417 状态迁移非法
  LinkExistsError: 'precondition_failed',      // 417 下游依赖存在
  InvalidQtyError: 'invalid_argument',         // 417 数量非法
  NonNegativeError: 'invalid_argument',        // 417 数量为负
  OverAllowanceError: 'precondition_failed',   // 417 超发/超收
  NegativeStockError: 'precondition_failed',   // 417 库存不足
  CannotChangeConstantError: 'invalid_argument', // 417 改常量字段
};

// HTTP 状态兜底（无 exc_type 时）。
const HTTP_CODE = {
  403: 'permission_denied',
  404: 'precondition_failed',
  417: 'precondition_failed',
  409: 'duplicate_name',
};

// 各语义化 code 的自纠建议（message 必须传达「下一步该怎么做」，D01 §4.2）。
const HINTS = {
  invalid_argument: '请核对参数：指出缺失/非法参数及合法取值后重试',
  precondition_failed: '请核对前置条件：返回当前状态后改用满足条件的参数',
  duplicate_name: '目标名称已存在：新建请改用对应 update tool，或改用不同名称',
  concurrency_conflict: '目标已被并发修改：请重新读取最新版本（modified）后重试',
  permission_denied: '当前调用方无所需对象读写权限：仅可操作允许清单内对象，引用对象只读不可增删改',
  backend_unavailable: '后端不可达：请稍后重试（本 tool 只读，不自动重试写操作）',
  result_set_overflow: '结果集过大：请追加过滤条件、缩小日期区间或翻页以收敛结果',
  batch_not_found: '未找到该批次：请核对批次标识，或省略 batch_id 列出归属自身会话的批次',
};

// 后端原生异常 → 更具体的自纠 message（D02 §2 各块错误转译表自纠建议）。
const NATIVE_HINTS = {
  DoesNotExistError: '目标不存在：请核对语义标识，或先用 erpnext_document_search 定位',
  LinkValidationError: '引用对象不存在：请指定存在的引用对象（仓库/分组/计量单位等）',
  PermissionError: '越权：当前调用方无该对象读写权限，仅可操作允许清单内对象',
  TimestampMismatchError: '目标已被并发修改：请重新读取最新版本（modified）后重试',
  DuplicateEntryError: '目标名称已存在：新建请改用对应 update tool',
};

// 构造统一错误（挂接 E02 lib/errors.makeError，补齐可自纠 message + retryable）。
function translate(code, opts) {
  opts = opts || {};
  const message = opts.message || HINTS[code] || code;
  return makeError(code, message, {
    retryable: opts.retryable === undefined ? (code === 'invalid_argument' || code === 'result_set_overflow' || code === 'concurrency_conflict') : opts.retryable,
    details: opts.details,
  });
}

/*
 * 后端错误响应 → 统一错误对象。
 * body：后端返回体（含 exc_type / exception / _server_messages，可空）；httpStatus：HTTP 状态码。
 * 返回 { error }（isError=true 的统一形状），调用方据此以失败响应返回，不静默成功。
 */
function translateBackendError(body, httpStatus) {
  const excType = (body && body.exc_type) || '';
  const code = (excType && NATIVE_EXC_CODE[excType]) || (httpStatus && HTTP_CODE[httpStatus]) || 'backend_unavailable';
  const nativeNote = (excType || httpStatus) ? (excType + (httpStatus ? '/' + httpStatus : '')) : 'unknown';
  const hint = (excType && NATIVE_HINTS[excType]) || HINTS[code];
  return translate(code, {
    message: hint,
    details: (body && body.exception) ? { backend: nativeNote, exception: String(body.exception).slice(0, 200) } : { backend: nativeNote },
  });
}

// 后端不可达（网络错误）→ backend_unavailable（写操作不自动重试；本 server 全读）。
function backendUnavailable() {
  return translate('backend_unavailable', { retryable: false });
}

module.exports = {
  NATIVE_EXC_CODE,
  HTTP_CODE,
  HINTS,
  translate,
  translateBackendError,
  backendUnavailable,
};
