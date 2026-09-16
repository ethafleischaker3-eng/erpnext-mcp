#!/usr/bin/env node
/*
 * E02 隔离探针（MCP server，stdio / newline-delimited JSON-RPC）
 * ============================================================
 * 性质：机制底座的可运行探针，NOT 正式业务 tool，NOT 业务 tool 验收依据。
 * 用途：证明幂等/前置断言/事后校验/批次台账机制可作为一个 stdio MCP server 进程运行，
 *       并支持注入合成状态/故障（见 state/fault-mode.txt）。
 * 边界：不接入 ERPNext、不连接任何数据库、不发起任何外部网络调用；不含凭据。
 * 副作用：仅写/清本地合成状态 state/marker.json 与事件日志 state/events.log。
 *
 * 探针 tool（非业务 tool）：e02_fingerprint_probe / e02_idempotency_probe / e02_batch_status_probe
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const fingerprint = require('../lib/fingerprint');
const idempotency = require('../lib/idempotency');
const { createBatchLedger } = require('../lib/batch-ledger');
const { queryBatchStatus } = require('../lib/batch-status');
const identity = require('../lib/identity');

const STATE_DIR = path.join(__dirname, 'state');
const EVENTS = path.join(STATE_DIR, 'events.log');
const FAULT = path.join(STATE_DIR, 'fault-mode.txt');
const MARKER = path.join(STATE_DIR, 'marker.json');

const SERVER_INFO = { name: 'e02-probe', version: '1.0.0' };
const SERVER_CAPABILITIES = { tools: { listChanged: false } };

const pid = process.pid;
const connEpoch = Date.now();
const sessionId = identity.createSessionIdentityProvider().sessionId;

fs.mkdirSync(STATE_DIR, { recursive: true });

// 进程内机制实例（会话级）：幂等存储 + 批次台账。sessionId 为会话级身份（B00 §18.3 + B05 §3）。
const idemStore = idempotency.createIdempotencyStore();
const ledger = createBatchLedger();

function ts() { return new Date().toISOString(); }

function log(obj) {
  const line = JSON.stringify(Object.assign({ ts: ts() }, obj));
  try { fs.appendFileSync(EVENTS, line + '\n'); } catch (e) { /* best effort */ }
  process.stderr.write(line + '\n');
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function respond(id, result) { send({ jsonrpc: '2.0', id, result }); }
function respondError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }
function respondToolOk(id, text) { respond(id, { content: [{ type: 'text', text: text }], isError: false }); }
function respondToolError(id, text) { respond(id, { content: [{ type: 'text', text: text }], isError: true }); }

function readFaultMode() {
  try { return fs.readFileSync(FAULT, 'utf8').trim() || 'normal'; }
  catch (e) { return 'normal'; }
}
function writeFaultMode(mode) { fs.writeFileSync(FAULT, mode); }

function handleInitialize(id, params) {
  params = params || {};
  log({ event: 'initialize', protocolVersion: params.protocolVersion, pid, connEpoch, sessionId });
  respond(id, {
    protocolVersion: params.protocolVersion,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions: 'E02 mechanism probe. Probe tools (e02_*) exercise the idempotency/precondition/postcondition/batch-ledger mechanisms; they are NOT business tools and have no ERPNext/database effect.',
  });
}

function handleToolsList(id) {
  respond(id, {
    tools: [
      {
        name: 'e02_fingerprint_probe',
        description: 'MECHANISM PROBE (not a business tool). Computes the server-side idempotency fingerprint of arbitrary business parameters (transport/client fields excluded).',
        inputSchema: { type: 'object', properties: { business_params: { type: 'object', description: 'Arbitrary synthetic business parameters.' } }, required: ['business_params'] },
        annotations: { title: 'Fingerprint probe', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      {
        name: 'e02_idempotency_probe',
        description: 'MECHANISM PROBE (not a business tool). Records or checks an idempotency window for a create/confirm/cancel group, returning merged-hit or miss.',
        inputSchema: { type: 'object', properties: { group: { type: 'string', description: 'create | confirm | cancel' }, business_params: { type: 'object' } }, required: ['group', 'business_params'] },
        annotations: { title: 'Idempotency probe', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      {
        name: 'e02_batch_status_probe',
        description: 'MECHANISM PROBE (not a business tool). Queries the batch ledger status for a batch id owned by this session (read-only; no rollback).',
        inputSchema: { type: 'object', properties: { batch_id: { type: 'string' } }, required: ['batch_id'] },
        annotations: { title: 'Batch status probe', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
    ],
  });
}

function handleToolsCall(id, params) {
  params = params || {};
  const name = params.name;
  const args = params.arguments || {};
  const mode = readFaultMode();
  log({ event: 'tools_call', id, name, arguments: args, mode, pid, connEpoch, sessionId });

  if (name === 'e02_fingerprint_probe') {
    const r = fingerprint.fingerprintOf(args.business_params || {});
    return respondToolOk(id, JSON.stringify({ fingerprint: r.fingerprint, canonical: r.canonical }));
  }

  if (name === 'e02_idempotency_probe') {
    const group = args.group || 'create';
    const check = idemStore.check(group, args.business_params || {});
    if (check.hit) {
      return respondToolOk(id, JSON.stringify({ hit: true, merged: true, idempotent_replay: true, message: '重复请求已按幂等合并' }));
    }
    // 故障注入：postcondition_mismatch → 记录后返回事后校验不一致（合成状态，非真实后端）。
    if (mode === 'postcondition_mismatch') {
      const bId = ledger.createBatch({ callerId: sessionId, toolName: 'e02_idempotency_probe' });
      ledger.recordChange(bId, { objectType: 'ProbeObject', objectName: 'probe-' + Date.now(), action: 'write', beforeState: 'draft', afterState: 'submitted' });
      ledger.markRollbackPending(bId, 'postcondition_failed');
      writeFaultMode('normal'); // 一 shot
      return respondToolError(id, JSON.stringify({ isError: true, code: 'postcondition_failed', message: '写后回读终态与期望不一致，已标记待回滚', retryable: false }));
    }
    idemStore.record(group, args.business_params || {}, { first: true });
    return respondToolOk(id, JSON.stringify({ hit: false, recorded: true }));
  }

  if (name === 'e02_batch_status_probe') {
    const caller = { callerId: sessionId, isAdmin: false };
    const r = queryBatchStatus(ledger, caller, args.batch_id);
    if (r.ok) return respondToolOk(id, JSON.stringify(r.result));
    return respondToolError(id, JSON.stringify(r.error));
  }

  return respondToolError(id, 'Unknown tool "' + name + '". Only e02_fingerprint_probe / e02_idempotency_probe / e02_batch_status_probe are available.');
}

function handleMessage(msg) {
  if (msg === null || typeof msg !== 'object') return;
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': return handleInitialize(id, params);
    case 'notifications/initialized': log({ event: 'rx_notification', method }); return;
    case 'ping': log({ event: 'rx_notification', method }); return respond(id, {});
    case 'tools/list': return handleToolsList(id);
    case 'tools/call': return handleToolsCall(id, params);
    case 'notifications/cancelled': log({ event: 'rx_notification', method, params, pid, connEpoch }); return;
    default: log({ event: 'rx_unknown', method, id, pid, connEpoch }); return respondError(id, -32601, 'Method not found: ' + method);
  }
}

function main() {
  log({ event: 'server_start', serverInfo: SERVER_INFO, pid, connEpoch, sessionId });
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

module.exports = { handleMessage, readFaultMode, writeFaultMode, STATE_DIR, EVENTS, FAULT, MARKER };
