#!/usr/bin/env node
/*
 * A01 隔离确认能力探针（MCP server，stdio / newline-delimited JSON-RPC）
 * ============================================================
 * 性质：能力核查用最小探针，NOT 正式业务 tool，NOT 业务 tool 验收依据。
 * 用途：实测所连接客户端是否支持 server 侧发起的确认（MCP elicitation）。
 * 边界：不接入 ERPNext、不连接任何数据库、不发起任何外部网络调用。
 * 副作用：仅在本地合成标记目录 state/ 写入/清除标记文件，不含真实业务数据或凭据。
 *
 * 契约（task.md §9.1）：
 *   tool 名：probe_confirm_write
 *   语义：收到调用 -> server 发起确认 -> 用户应答后才决定是否发生本地副作用
 *   annotation：只读=否、破坏性=是、幂等性=否（如实）、是否与外部世界交互=否
 *   确认应答路径：
 *     确认(accept)       -> 写本地合成标记并返回成功
 *     拒绝/取消(decline) -> 返回可自纠错误且不写标记（fail-closed）
 *     客户端不支持       -> 返回可自纠错误且不写标记（fail-closed）
 *   敏感凭据场景：server 对敏感凭据只走 URL 模式，绝不走 form 模式（占位/合成值）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const STATE_DIR = path.join(__dirname, 'state');
const MARKER = path.join(STATE_DIR, 'marker.json');
const EVENTS = path.join(STATE_DIR, 'events.log');

const SERVER_INFO = { name: 'a01-probe', version: '1.0.0' };
const SERVER_CAPABILITIES = {
  elicitation: {},
  tools: { listChanged: false },
  logging: {},
};

const ELICITATION_TIMEOUT_MS = 30000;

// ---- 握手阶段捕获的客户端事实（W01/W02 证据来源）----
let clientProtocolVersion = null;
let clientCapabilities = null;
let clientInfo = null;
let clientSupportsElicitation = false;

// server->client 未决请求（elicitation）关联表
const pending = new Map();
let serverRequestSeq = 0;

fs.mkdirSync(STATE_DIR, { recursive: true });

function ts() { return new Date().toISOString(); }

function log(obj) {
  const line = JSON.stringify(Object.assign({ ts: ts() }, obj));
  try { fs.appendFileSync(EVENTS, line + '\n'); } catch (e) { /* best effort */ }
  process.stderr.write(line + '\n');
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// 工具级「可自纠错误」：用 result.isError=true 表达（MCP 标准业务错误形态），
// 让客户端/agent 能读到原因并自纠，而非仅一个不透明错误码。
function respondToolError(id, message) {
  respond(id, { content: [{ type: 'text', text: message }], isError: true });
}

function respondToolOk(id, message) {
  respond(id, { content: [{ type: 'text', text: message }], isError: false });
}

function nextServerRequestId() {
  serverRequestSeq += 1;
  return serverRequestSeq + 100000; // 与客户端 id 区间错开
}

function writeMarker(fields) {
  fs.writeFileSync(MARKER, JSON.stringify(Object.assign({ written_at: ts() }, fields), null, 2));
}

function clearMarker() {
  try { fs.unlinkSync(MARKER); } catch (e) { /* 不存在即已清理 */ }
}

// W05：确认消息必须含 tool 名 + 完整参数 + 拟执行动作，不得只给名称/摘要。
function buildConfirmationMessage(args, scenario) {
  const lines = [];
  lines.push('Confirm a simulated human-confirmed write by tool "probe_confirm_write".');
  lines.push('');
  lines.push('Full call parameters:');
  lines.push('  target_object_id = ' + JSON.stringify(args.target_object_id));
  lines.push('  payload          = ' + JSON.stringify(args.payload));
  lines.push('  scenario         = ' + JSON.stringify(scenario));
  lines.push('');
  lines.push('Intended action: write a LOCAL synthetic marker file only (probe side effect under');
  lines.push('probe/state/). This probe does NOT touch ERPNext, any database, or the network.');
  lines.push('');
  lines.push('Approve to perform the synthetic write, or decline to leave zero side effects.');
  return lines.join('\n');
}

function handleInitialize(id, params) {
  params = params || {};
  clientProtocolVersion = params.protocolVersion || null;
  clientCapabilities = params.capabilities || {};
  clientInfo = params.clientInfo || null;
  clientSupportsElicitation = !!(clientCapabilities && clientCapabilities.elicitation);
  log({
    event: 'initialize',
    protocolVersion: clientProtocolVersion,
    clientInfo,
    clientCapabilities,
    clientSupportsElicitation,
  });
  respond(id, {
    protocolVersion: clientProtocolVersion, // 接受客户端版本（不硬编码固定版本号）
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions:
      'A01 capability probe. "probe_confirm_write" is a probe ONLY (not a business tool). ' +
      'Its only side effect is a local synthetic marker under probe/state/.',
  });
}

function handleToolsList(id) {
  respond(id, {
    tools: [
      {
        name: 'probe_confirm_write',
        description:
          'CAPABILITY PROBE — NOT a business tool. Simulates a human-confirmed (server-side ' +
          'elicitation) write to verify whether this client presents server-initiated confirmation ' +
          'to the user. Its only side effect is a local synthetic marker file. ' +
          'Set scenario="sensitive_credential" to probe the sensitive-credential URL-mode path ' +
          '(the server must use URL mode, never form mode, for secrets).',
        inputSchema: {
          type: 'object',
          properties: {
            target_object_id: {
              type: 'string',
              description: 'Synthetic target object id (no real business data).',
            },
            payload: {
              type: 'string',
              description: 'Synthetic payload (no real business data, no real credentials).',
            },
            scenario: {
              type: 'string',
              enum: ['write', 'sensitive_credential'],
              description:
                'write = normal human-confirmed write (form mode); ' +
                'sensitive_credential = secret handling path (server MUST use URL mode).',
              default: 'write',
            },
          },
          required: ['target_object_id', 'payload'],
        },
        annotations: {
          title: 'Probe confirm write (capability probe)',
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
  if (name !== 'probe_confirm_write') {
    return respondToolError(id, 'Unknown tool "' + name + '". Only "probe_confirm_write" is available (capability probe).');
  }
  log({ event: 'tools_call', name, arguments: args, clientSupportsElicitation });

  const scenario = args.scenario || 'write';
  const message = buildConfirmationMessage(args, scenario);

  // W08：敏感凭据只走 URL 模式，绝不走 form 模式。
  if (scenario === 'sensitive_credential') {
    const urlMessage =
      message +
      '\n\n[SENSITIVE CREDENTIAL] The server must NOT collect secrets via a form. ' +
      'Open the following synthetic URL to complete the redirect flow: ' +
      'https://probe.example.invalid/confirm?token=<synthetic-placeholder>';
    log({ event: 'sensitive_credential', mode: 'url' });
    return requestElicitation(id, urlMessage, 'url', { type: 'object', properties: {} }, scenario);
  }

  // W07：客户端未声明 elicitation 能力 -> fail-closed，绝不降级为直接执行。
  if (!clientSupportsElicitation) {
    log({ event: 'fail_closed_unsupported', reason: 'client did not advertise elicitation capability' });
    return respondToolError(id,
      'Server-side confirmation (MCP elicitation) is NOT supported by this client, so the write ' +
      'was NOT performed (fail-closed). No side effects occurred. Next step: use a client that ' +
      'supports elicitation, or return a plan instead of executing the write.');
  }

  const requestedSchema = {
    type: 'object',
    properties: {
      approved: { type: 'boolean', description: 'true = approve the write; false = decline' },
    },
    required: ['approved'],
  };
  return requestElicitation(id, message, 'form', requestedSchema, scenario);
}

function requestElicitation(callId, message, mode, requestedSchema, scenario) {
  const reqId = nextServerRequestId();
  const params = { message, requestedSchema, mode };
  pending.set(reqId, (resp) => handleElicitationResponse(callId, resp, scenario, mode));
  log({ event: 'elicitation_send', reqId, mode, message, requestedSchema, scenario });
  send({ jsonrpc: '2.0', id: reqId, method: 'elicitation/create', params });

  const timer = setTimeout(() => {
    if (pending.has(reqId)) {
      pending.delete(reqId);
      log({ event: 'elicitation_timeout', reqId });
      respondToolError(callId, 'No confirmation response received from the client within timeout. Write NOT performed (fail-closed).');
    }
  }, ELICITATION_TIMEOUT_MS);
  // 让关联函数可在完成后清除定时器（resp 处理时也会从 pending 删除）
  pending.set(reqId + ':timer', timer);
}

function handleElicitationResponse(callId, resp, scenario, mode) {
  const reqId = resp.id;
  const timer = pending.get(reqId + ':timer');
  if (timer) { clearTimeout(timer); pending.delete(reqId + ':timer'); }
  pending.delete(reqId);
  log({ event: 'elicitation_response', reqId, result: resp.result, error: resp.error, scenario, mode });

  if (resp.error) {
    log({ event: 'fail_closed_client_error', error: resp.error });
    return respondToolError(callId,
      'Confirmation was rejected or errored by the client. Write NOT performed (fail-closed). No side effects occurred.');
  }
  const result = resp.result || {};
  const action = result.action;
  // 只有 accept 才授权写入；decline/cancel 一律 fail-closed。
  if (action === 'decline' || action === 'cancel') {
    log({ event: 'fail_closed_non_approve', action });
    return respondToolError(callId,
      'Confirmation was not approved (action=' + action + '). Write NOT performed (fail-closed). No side effects occurred.');
  }
  if (action === 'accept') {
    writeMarker({
      target_object_id: result.target_object_id, // 仅为自测透传，实际以调用参数为准
      note: 'synthetic probe marker (accepted write)',
    });
    log({ event: 'marker_written_approved' });
    return respondToolOk(callId,
      'Confirmed. Local synthetic marker written under probe/state/ (probe only; no ERPNext, no database).');
  }
  // 未知/意外结果：保守 fail-closed。
  log({ event: 'fail_closed_unknown_action', result });
  return respondToolError(callId,
    'Unexpected confirmation result from client. Write NOT performed (fail-closed). No side effects occurred.');
}

function handleMessage(msg) {
  if (msg === null || typeof msg !== 'object') return;
  const { id, method, params, result, error } = msg;

  // 客户端对 server->client 请求的响应（含 id 且无 method）
  if (method === undefined && id !== undefined && (result !== undefined || error !== undefined)) {
    const handler = pending.get(id);
    if (handler) {
      handler({ id, result, error });
    } else {
      log({ event: 'unsolicited_response', id, result, error });
    }
    return;
  }

  switch (method) {
    case 'initialize': return handleInitialize(id, params);
    case 'notifications/initialized': return; // 无响应
    case 'ping': return respond(id, {});
    case 'tools/list': return handleToolsList(id);
    case 'tools/call': return handleToolsCall(id, params);
    case 'notifications/cancelled':
      log({ event: 'cancelled_notification', params });
      return; // 取消由超时兜底 fail-closed
    default:
      return respondError(id, -32601, 'Method not found: ' + method);
  }
}

function main() {
  log({ event: 'server_start', serverInfo: SERVER_INFO, pid: process.pid });
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
  rl.on('close', () => { log({ event: 'server_exit' }); process.exit(0); });
}

if (require.main === module) {
  main();
}

module.exports = { handleMessage, clearMarker, writeMarker, buildConfirmationMessage, MARKER, STATE_DIR };
