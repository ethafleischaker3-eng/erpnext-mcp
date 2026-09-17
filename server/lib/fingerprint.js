'use strict';
/*
 * E02 幂等指纹引擎（W01）
 * ============================================================
 * 落地 B05 §18.3 第 2/4 条与规范 §9.3：指纹 MUST 由 server 依业务参数规范化
 * （稳定排序 + 归一化）计算，agent 完全不感知；传输/客户端字段一律不进指纹；
 * 同参同指纹、异载异指纹。
 *
 * 边界：本模块不接入 ERPNext、不读库、不依赖任何外部服务；仅做确定性字符串运算。
 * 传输/客户端字段清单为 JSON-RPC/MCP 请求层字段（出现在请求/params 顶层），
 * 从业务参数顶层剥离，不递归改写业务参数内部字段（行项目等业务字段是否进指纹由 D02 冻结）。
 */

const crypto = require('crypto');

// 传输/客户端字段（规范 §9.3；B05 §18.3 第 2 条）。这些字段不得参与指纹、不得成为可信覆盖值。
// `_meta`/`claudecode` 为容器，承载 progressToken 与 claudecode/toolUseId，整体剥离。
const TRANSPORT_FIELDS = new Set([
  'id', 'jsonrpc', 'method',
  'requestId', 'request_id',
  'progressToken', 'progress_token',
  'toolUseId', 'tool_use_id', 'tooluseid',
  'claudecode', 'claude_code',
  'idempotencyKey', 'idempotency_key', 'idempotency_key_override',
  'sessionId', 'session_id',
  'resumptionToken', 'resumption_token',
  '_meta', 'meta',
]);

// 归一化：确定性序列化。对象键稳定排序；数组保持原顺序（行项目顺序有业务含义，不可排序）。
// 数字/布尔/字符串走 JSON 语义，去 -0、去 NaN/Infinity（JSON.stringify 已处理）。
function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(function (k) {
    return JSON.stringify(k) + ':' + canonicalize(value[k]);
  }).join(',') + '}';
}

// 顶层剥离传输/客户端字段（不递归改写业务参数内部）。
function stripTransportFields(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }
  const out = {};
  for (const k of Object.keys(params)) {
    if (TRANSPORT_FIELDS.has(k)) continue;
    out[k] = params[k];
  }
  return out;
}

// 计算业务参数指纹。返回 { fingerprint, canonical }（canonical 供复核与调试）。
function fingerprintOf(businessParams) {
  const stripped = stripTransportFields(businessParams);
  const canonical = canonicalize(stripped);
  const fingerprint = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { fingerprint, canonical };
}

module.exports = { fingerprintOf, canonicalize, stripTransportFields, TRANSPORT_FIELDS };
