#!/usr/bin/env node
'use strict';
/*
 * ERPNext MCP server（F01 通用查询能力 6 读 tool + F04 库存与主数据维护 10 写/只出 plan tool，共 16 tool）
 * ============================================================
 * stdio / newline-delimited JSON-RPC（MCP 2025-11-25），Node 内置模块、零外部依赖。
 * 骨架：入口 + 注册表只增不改（F02 将在 F04 通过后串行追加 #13–#22）。
 * 后端调用：统一经 mcp-service + MCP Business Caller（token 经环境变量注入，凭据不落代码）。
 * 只读：6 读 tool（#1–#5、#26）。写：8 人确认档 tool（#6–#12、#24）经 server 侧 elicitation 确认方可写入，
 *   #23 全自动（仅 L3）、#25 只出 plan（无写入）；客户端未声明 elicitation 时写操作全量 fail-closed。
 * 失败路径不静默成功；错误以统一形状返回（D01 §4）。
 */

const readline = require('readline');
const path = require('path');

const { createBackendClient } = require('./src/backend');
const { loadConfig, assertWriteEligible } = require('./src/config');
const registry = require('./src/registry');
const errors = require('./lib/errors');
const identity = require('./lib/identity');
const { createBatchLedger } = require('./lib/batch-ledger');

const SERVER_INFO = { name: 'erpnext-mcp-server', version: '1.0.0' };
const SERVER_CAPABILITIES = { tools: { listChanged: false }, elicitation: {} };

const pid = process.pid;
const connEpoch = Date.now();

// 优雅退出：跟踪在途 tools/call，stdin 关闭后待其完成再退出，避免截断异步后端响应。
let pending = 0;
let closing = false;
function maybeExit() { if (closing && pending === 0) process.exit(0); }

// 会话级身份 + 批次台账（进程内、内存不落库；E02 §5.5/B00 身份结论）。
const sessionIdentity = identity.createSessionIdentityProvider();
const batchLedger = createBatchLedger();

// 运行时配置：后端 Base URL / token 从环境变量读取（凭据不进入本文件）。
const config = loadConfig(process.env);
const backend = createBackendClient(config);

// 客户端 elicitation 能力标记（initialize 握手解析；未声明 → 写 tool 全量 fail-closed）。
let clientSupportsElicitation = false;
let writeEligible = { ok: false, reason: '写入能力未初始化（等待运行时币种/价格表检查）' };

// server 侧确认发送器：在处理 tools/call 期间，向客户端发起 elicitation/create（async 等待应答）。
// 依赖 index.js 的「等待客户端响应」机制（process-issued 确认；此处以 Promise 占位，由传输层回填）。
let pendingElicitations = new Map(); // requestId -> resolve
function sendElicitation(params) {
  return new Promise(function (resolve) {
    const requestId = 'el-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    pendingElicitations.set(requestId, resolve);
    // 发起 elicitation/create 请求（MCP 2025-11-25）。
    send({ jsonrpc: '2.0', id: requestId, method: 'elicitation/create', params: params });
  });
}

// 供各 tool handler 使用的依赖注入上下文。
const ctx = {
  errors: errors,
  backend: backend,
  config: config,
  identity: sessionIdentity,
  batchLedger: batchLedger,
  transportContext: {}, // 传输/连接上下文（预留 adminResolver 输入）
  adminResolver: null,
  get clientSupportsElicitation() { return clientSupportsElicitation; },
  get writeEligible() { return writeEligible; },
  sendElicitation: sendElicitation,
};

/*
 * 写入能力运行时前置（E01 confirmation-failclosed §2.1 / PRD 决议 2）：
 * 后端查询 Company gjg.default_currency 与 Price List selling=1 且 enabled=1 的数量。
 * 币种空或售卖价目表数量 ≠ 1 → writeEligible 置 fail-closed（写 tool 拒绝写入，只读 tool 不受影响）。
 * 后端不可达时写能力不可确定性成立 → 仍 fail-closed（不静默授权）。
 */
let writeEligibilityInitializing = false;
async function initWriteEligibility() {
  if (writeEligibilityInitializing) return;
  writeEligibilityInitializing = true;
  try {
    const currency = await backend.get('Company', config.locked.company);
    const pl = await backend.getCount('Price List', [['selling', '=', 1], ['enabled', '=', 1]]);
    const ccy = (currency.ok && currency.data && currency.data.default_currency)
      ? currency.data.default_currency
      : '';
    const sellingCount = pl.ok ? pl.count : -1;
    const e = assertWriteEligible(ccy, sellingCount);
    writeEligible = e.ok ? { ok: true } : { ok: false, reason: e.reason };
    log({ event: 'write_eligibility', ok: writeEligible.ok, reason: writeEligible.reason || null, sellingCount: sellingCount });
  } catch (err) {
    writeEligible = { ok: false, reason: '写入能力判定异常：fail-closed（' + String(err && err.message).slice(0, 200) + '）' };
    log({ event: 'write_eligibility_error', message: String(err && err.message).slice(0, 200) });
  }
  writeEligibilityInitializing = false;
}

function ts() { return new Date().toISOString(); }
function log(obj) {
  // 仅写入 stderr 事件日志，不含凭据值/完整认证头/业务数据（D01 §4.1 透出边界）。
  process.stderr.write(JSON.stringify(Object.assign({ ts: ts() }, obj)) + '\n');
}
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function respond(id, result) { send({ jsonrpc: '2.0', id: id, result: result }); }
function respondError(id, code, message) { send({ jsonrpc: '2.0', id: id, error: { code: code, message: message } }); }

function handleInitialize(id, params) {
  params = params || {};
  // 解析客户端 elicitation 能力（E01 confirmation-failclosed §1.2 第 7 项：协议版本动态适配）。
  const caps = params.capabilities || {};
  clientSupportsElicitation = !!(caps.elicitation !== undefined);
  log({ event: 'initialize', protocolVersion: params.protocolVersion, pid: pid, connEpoch: connEpoch, sessionId: sessionIdentity.sessionId, elicitation: clientSupportsElicitation });
  respond(id, {
    protocolVersion: params.protocolVersion,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions: 'ERPNext MCP server（F01 只读 6 tool + F04 写 10 tool = 16 tool）。写 tool 有人确认档（8）需经 server 侧 elicitation 确认方可写入；客户端未声明 elicitation 能力时写操作 fail-closed（零写入）。',
  });
}

function handleToolsList(id) {
  respond(id, { tools: registry.listTools() });
}

async function handleToolsCall(id, params) {
  params = params || {};
  const name = params.name;
  const args = params.arguments || {};
  log({ event: 'tools_call', id: id, name: name });
  pending += 1;

  const tool = registry.getTool(name);
  if (!tool) {
    respond(id, {
      content: [{ type: 'text', text: JSON.stringify(errors.makeError('invalid_argument', '未知 tool「' + name + '」：当前提供 16 个 tool（6 读 + 10 写/只出 plan）', { retryable: false })) }],
      isError: true,
    });
    pending -= 1; maybeExit();
    return;
  }

  try {
    const r = await tool.handler(ctx, args);
    if (r && r.ok === true) {
      respond(id, { content: [{ type: 'text', text: JSON.stringify(r.result) }], isError: false });
    } else {
      const err = (r && r.error) || errors.makeError('backend_unavailable', '后端不可达：请稍后重试', { retryable: false });
      respond(id, { content: [{ type: 'text', text: JSON.stringify(err) }], isError: true });
    }
  } catch (e) {
    // 兜底：任何未捕获异常均以统一错误形状返回，不裸抛堆栈（D01 §4）。
    log({ event: 'handler_error', name: name, message: String(e && e.message).slice(0, 300) });
    respond(id, {
      content: [{ type: 'text', text: JSON.stringify(errors.makeError('backend_unavailable', '处理请求时发生内部错误：请稍后重试', { retryable: false })) }],
      isError: true,
    });
  }
  pending -= 1; maybeExit();
}

function handleMessage(msg) {
  if (msg === null || typeof msg !== 'object') return;
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': return handleInitialize(id, params);
    case 'notifications/initialized': log({ event: 'rx_notification', method: method }); initWriteEligibility(); return;
    case 'ping': return respond(id, {});
    case 'tools/list': return handleToolsList(id);
    case 'tools/call': return handleToolsCall(id, params);
    case 'notifications/cancelled': log({ event: 'rx_notification', method: method }); return;
    default:
      // elicitation/create 的应答（server 发起确认后客户端回传 result.action）。
      if (pendingElicitations.has(id) && params && params.result) {
        const resolve = pendingElicitations.get(id);
        pendingElicitations.delete(id);
        const action = params.result.action || 'cancel';
        resolve({ action: action });
        return;
      }
      log({ event: 'rx_unknown', method: method }); return respondError(id, -32601, 'Method not found: ' + method);
  }
}

function main() {
  log({ event: 'server_start', serverInfo: SERVER_INFO, pid: pid, connEpoch: connEpoch, sessionId: sessionIdentity.sessionId, hasAuth: config.hasAuth });
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', function (line) {
    const t = line.trim();
    if (!t) return;
    let msg;
    try { msg = JSON.parse(t); } catch (e) {
      log({ event: 'parse_error', line: t.slice(0, 500) });
      return respondError(null, -32700, 'Parse error');
    }
    handleMessage(msg);
  });
  rl.on('close', function () { log({ event: 'server_exit', pid: pid, connEpoch: connEpoch, pending: pending }); closing = true; maybeExit(); });
}

if (require.main === module) {
  main();
}

module.exports = { handleMessage, ctx, SERVER_INFO };
