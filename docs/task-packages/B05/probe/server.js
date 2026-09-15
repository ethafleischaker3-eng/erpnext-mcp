#!/usr/bin/env node
/*
 * B05 隔离重试/关联探针（MCP server，stdio / newline-delimited JSON-RPC）
 * ============================================================
 * 性质：能力调研用最小探针，NOT 正式业务 tool，NOT 业务 tool 验收依据。
 * 用途：实测所连接客户端、MCP SDK 与传输方式对 tools/call 的自动重试与请求关联行为。
 * 边界：不接入 ERPNext、不连接任何数据库、不发起任何外部网络调用。
 * 副作用：仅写/清本地合成标记 state/marker.json 与事件日志 state/events.log。
 *
 * 契约（task.md §9.1）：
 *   tool 名：probe_retry_write
 *   语义：收到调用 -> 按注入故障模式执行 -> 记录到达
 *   故障注入：读取 state/fault-mode.txt（normal|error|slow|crash），一shot 型（error/crash 执行后重置 normal）
 *   annotation：只读=否、破坏性=是、幂等性=否（如实）、是否与外部世界交互=否
 *   观测：每次 tools/call 到达先落盘（时间戳、JSON-RPC id、payload 规范化指纹、pid/连接纪元、故障模式）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STATE_DIR = path.join(__dirname, 'state');
const EVENTS = path.join(STATE_DIR, 'events.log');
const FAULT = path.join(STATE_DIR, 'fault-mode.txt');
const MARKER = path.join(STATE_DIR, 'marker.json');

const SERVER_INFO = { name: 'b05-probe', version: '1.0.0' };
const SERVER_CAPABILITIES = { tools: { listChanged: false } };

// 握手阶段捕获的客户端事实（W01/W02 证据来源）
let clientProtocolVersion = null;
let clientInfo = null;
let clientCapabilities = null;

// 每次进程启动即一个新的「连接纪元」：stdio 下会话 = 进程对，进程重启即断线重连。
const pid = process.pid;
const connEpoch = Date.now();

fs.mkdirSync(STATE_DIR, { recursive: true });

function ts() { return new Date().toISOString(); }

function log(obj) {
  const line = JSON.stringify(Object.assign({ ts: ts() }, obj));
  try { fs.appendFileSync(EVENTS, line + '\n'); } catch (e) { /* best effort */ }
  process.stderr.write(line + '\n');
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function respond(id, result) { send({ jsonrpc: '2.0', id, result }); }
function respondError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }
function respondToolOk(id, message) { respond(id, { content: [{ type: 'text', text: message }], isError: false }); }
function respondToolError(id, message) { respond(id, { content: [{ type: 'text', text: message }], isError: true }); }

function readFaultMode() {
  try { return fs.readFileSync(FAULT, 'utf8').trim() || 'normal'; }
  catch (e) { return 'normal'; }
}
function writeFaultMode(mode) { fs.writeFileSync(FAULT, mode); }

function writeMarker(args) {
  fs.writeFileSync(MARKER, JSON.stringify({ written_at: ts(), args }, null, 2));
}

// 规范化指纹：对 arguments 稳定排序后 JSON 序列化。
// 仅依据业务参数计算，JSON-RPC id / 连接身份 / agent 自报 request_id 等均不参与（对应 task.md W09 原则）。
function fingerprint(args) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = stable(v[k]);
      return o;
    }
    return v;
  };
  return JSON.stringify(stable(args || {}));
}

function handleInitialize(id, params) {
  params = params || {};
  clientProtocolVersion = params.protocolVersion || null;
  clientInfo = params.clientInfo || null;
  clientCapabilities = params.capabilities || {};
  log({ event: 'initialize', protocolVersion: clientProtocolVersion, clientInfo, clientCapabilities, pid, connEpoch });
  respond(id, {
    protocolVersion: clientProtocolVersion,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions: 'B05 retry/correlation probe. "probe_retry_write" is a probe ONLY (not a business tool). Its only side effect is a local synthetic marker under probe/state/.',
  });
}

function handleToolsList(id) {
  respond(id, {
    tools: [
      {
        name: 'probe_retry_write',
        description:
          'RETRY/CORRELATION PROBE — NOT a business tool. Simulates a write to observe whether this client retries tools/call on timeout/disconnect/error. Its only side effect is a local synthetic marker file. The actual fault (normal/error/slow/crash) is injected server-side, not chosen by you.',
        inputSchema: {
          type: 'object',
          properties: {
            target_object_id: { type: 'string', description: 'Synthetic target object id (no real business data).' },
            payload: { type: 'string', description: 'Synthetic payload (no real business data, no real credentials).' },
            delay_ms: { type: 'number', description: 'Optional slow-fault delay override in ms (probe only).' },
          },
          required: ['target_object_id', 'payload'],
        },
        annotations: {
          title: 'Probe retry write (retry/correlation probe)',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
    ],
  });
}

function handleToolsCall(id, params) {
  params = params || {};
  const name = params.name;
  const args = params.arguments || {};
  const mode = readFaultMode();
  log({
    event: 'tools_call', id, name, arguments: args,
    params_meta: (params._meta !== undefined ? params._meta : null),
    params_progressToken: (params._meta && params._meta.progressToken !== undefined ? params._meta.progressToken : null),
    fingerprint: fingerprint(args), pid, connEpoch, mode,
  });

  if (name !== 'probe_retry_write') {
    return respondToolError(id, 'Unknown tool "' + name + '". Only "probe_retry_write" is available (retry/correlation probe).');
  }

  if (mode === 'crash') {
    writeFaultMode('normal'); // 一 shot：崩溃前重置，便于观察重连后是否重试成功
    log({ event: 'fault_crash', id, pid, connEpoch });
    process.exit(1); // 模拟断线：进程崩溃，stdio 关闭
  }

  if (mode === 'slow') {
    const delayMs = parseInt(args.delay_ms || '70000', 10);
    log({ event: 'fault_slow', id, delayMs, pid, connEpoch });
    setTimeout(() => {
      writeMarker(args);
      log({ event: 'marker_written', id, pid, connEpoch });
      respondToolOk(id, 'Slow response completed after ' + delayMs + 'ms (probe only).');
    }, delayMs);
    return;
  }

  if (mode === 'error') {
    writeFaultMode('normal'); // 一 shot
    log({ event: 'fault_error', id, pid, connEpoch });
    return respondToolError(id, 'Probe business error (isError=true). Corrective action: retry with a valid payload.');
  }

  writeMarker(args);
  log({ event: 'marker_written', id, pid, connEpoch });
  return respondToolOk(id, 'Probe write succeeded (local synthetic marker only; no ERPNext, no database).');
}

function handleMessage(msg) {
  if (msg === null || typeof msg !== 'object') return;
  const { id, method, params, _meta } = msg;
  if (_meta !== undefined) log({ event: 'rx_top_meta', method, id, _meta, pid, connEpoch });

  switch (method) {
    case 'initialize': return handleInitialize(id, params);
    case 'notifications/initialized': log({ event: 'rx_notification', method }); return;
    case 'ping': log({ event: 'rx_notification', method }); return respond(id, {});
    case 'tools/list': return handleToolsList(id);
    case 'tools/call': return handleToolsCall(id, params);
    case 'notifications/cancelled':
      // 客户端取消/超时的证据：SDK 在超时/中止时会发 notifications/cancelled(requestId, reason)
      log({ event: 'rx_notification', method, params, pid, connEpoch });
      return;
    default:
      log({ event: 'rx_unknown', method, id, pid, connEpoch });
      return respondError(id, -32601, 'Method not found: ' + method);
  }
}

function main() {
  log({ event: 'server_start', serverInfo: SERVER_INFO, pid, connEpoch });
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const t = line.trim();
    if (!t) return;
    let msg;
    try { msg = JSON.parse(t); } catch (e) {
      log({ event: 'parse_error', line: t.slice(0, 500) });
      return respondError(null, -32700, 'Parse error');
    }
    handleMessage(msg);
  });
  rl.on('close', () => { log({ event: 'server_exit', pid, connEpoch }); process.exit(0); });
}

if (require.main === module) {
  main();
}

module.exports = { handleMessage, fingerprint, readFaultMode, writeFaultMode, writeMarker, MARKER, STATE_DIR, EVENTS, FAULT };
