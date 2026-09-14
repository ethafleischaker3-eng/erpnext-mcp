#!/usr/bin/env node
/*
 * A01 探针自测（fake-client 驱动）
 * ============================================================
 * 作用：以进程内模拟客户端，实测 server.js 的契约与 fail-closed 逻辑。
 * 覆盖：decline fail-closed、accept 写标记、sensitive_credential 走 URL 模式、
 *       不支持 elicitation 的客户端 fail-closed（不降级执行）。
 * 说明：这是探针自身的契约自测，不等同于真实客户端（Claude Code）能力核查——
 *       真实客户端核查由 handshake 日志 + 实际连接证据承担（见 evidence/）。
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const SERVER = path.join(__dirname, 'server.js');
const MARKER = path.join(__dirname, 'state', 'marker.json');

function clearMarker() { try { fs.unlinkSync(MARKER); } catch (e) { /* absent */ } }

let server;
let seq = 0;
const incoming = [];
const waiters = [];

function broadcast() {
  for (let i = waiters.length - 1; i >= 0; i--) {
    const w = waiters[i];
    const idx = incoming.findIndex((m) => w.pred(m));
    if (idx >= 0) {
      const m = incoming[idx];
      incoming.splice(idx, 1);
      waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(m);
    }
  }
}

function waitFor(pred, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for: ' + label)), timeoutMs);
    waiters.push({ pred, resolve, timer });
    broadcast();
  });
}

function rpc(method, params, id) {
  const mid = id === undefined ? ++seq : id;
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method, params }) + '\n');
  return mid;
}

function notify(method, params) {
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

function respondTo(id, result) {
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function spawnServer() {
  server = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: server.stdout });
  rl.on('line', (line) => {
    let m;
    try { m = JSON.parse(line); } catch (e) { return; }
    incoming.push(m);
    broadcast();
  });
  server.on('exit', () => { /* handled by endServer */ });
}

function endServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    const s = server;
    server = null;
    if (s.exitCode !== null || s.killed) return resolve();
    s.once('exit', () => resolve());
    try { s.stdin.end(); } catch (e) { /* ignore */ }
    s.kill();
    setTimeout(() => resolve(), 1500);
  });
}

const results = [];
function check(name, cond) {
  results.push({ name, pass: !!cond });
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name);
}

async function testCapableClient() {
  const id = rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: { elicitation: {}, tools: {} },
    clientInfo: { name: 'a01-selftest-capable', version: '1.0.0' },
  });
  const init = await waitFor((m) => m.id === id, 10000, 'initialize(capable)');
  check('server advertises elicitation capability', !!(init.result && init.result.capabilities && init.result.capabilities.elicitation));

  notify('notifications/initialized', {});

  const t1 = rpc('tools/list', {});
  const tl = await waitFor((m) => m.id === t1, 10000, 'tools/list');
  const tool = tl.result && tl.result.tools && tl.result.tools.find((t) => t.name === 'probe_confirm_write');
  check('tools/list exposes probe_confirm_write', !!tool);
  check('annotation: readOnly=false, destructive=true, idempotent=false, openWorld=false',
    tool && tool.annotations && tool.annotations.readOnlyHint === false &&
    tool.annotations.destructiveHint === true && tool.annotations.idempotentHint === false &&
    tool.annotations.openWorldHint === false);

  // --- decline -> fail-closed, no marker ---
  clearMarker();
  const d1 = rpc('tools/call', { name: 'probe_confirm_write', arguments: { target_object_id: 'OBJ-TEST-001', payload: 'payload-xyz', scenario: 'write' } });
  let elic = await waitFor((m) => m.method === 'elicitation/create' && m.id !== undefined, 10000, 'elicitation(decline)');
  check('normal write -> elicitation mode = form', elic.params && elic.params.mode === 'form');
  check('elicitation message shows tool name + full params + intended action',
    /probe_confirm_write/.test(elic.params.message) &&
    /target_object_id/.test(elic.params.message) && /payload-xyz/.test(elic.params.message) &&
    /write a LOCAL synthetic marker/i.test(elic.params.message));
  respondTo(elic.id, { action: 'decline' });
  const dr = await waitFor((m) => m.id === d1 && (m.result || m.error), 10000, 'tools/call(decline) result');
  check('decline -> result.isError=true (fail-closed)', dr.result && dr.result.isError === true);
  check('decline -> marker NOT written', !fs.existsSync(MARKER));

  // --- accept -> marker written ---
  clearMarker();
  const a1 = rpc('tools/call', { name: 'probe_confirm_write', arguments: { target_object_id: 'OBJ-TEST-002', payload: 'payload-abc', scenario: 'write' } });
  elic = await waitFor((m) => m.method === 'elicitation/create' && m.id !== undefined, 10000, 'elicitation(accept)');
  respondTo(elic.id, { action: 'accept' });
  const ar = await waitFor((m) => m.id === a1 && (m.result || m.error), 10000, 'tools/call(accept) result');
  check('accept -> result.isError=false (success)', ar.result && ar.result.isError !== true);
  check('accept -> marker written', fs.existsSync(MARKER));

  // --- sensitive credential -> URL mode ---
  clearMarker();
  const s1 = rpc('tools/call', { name: 'probe_confirm_write', arguments: { target_object_id: 'OBJ-TEST-003', payload: 'synthetic-secret-placeholder', scenario: 'sensitive_credential' } });
  elic = await waitFor((m) => m.method === 'elicitation/create' && m.id !== undefined, 10000, 'elicitation(sensitive)');
  check('sensitive_credential -> mode = url (never form)', elic.params && elic.params.mode === 'url');
  respondTo(elic.id, { action: 'decline' });
  await waitFor((m) => m.id === s1 && (m.result || m.error), 10000, 'tools/call(sensitive) result');
  check('sensitive_credential -> marker NOT written', !fs.existsSync(MARKER));
}

async function testUnsupportedClient() {
  incoming.length = 0;
  const id = rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: { tools: {} }, // 无 elicitation 能力
    clientInfo: { name: 'a01-selftest-unsupported', version: '1.0.0' },
  });
  await waitFor((m) => m.id === id, 10000, 'initialize(unsupported)');
  notify('notifications/initialized', {});

  clearMarker();
  const c1 = rpc('tools/call', { name: 'probe_confirm_write', arguments: { target_object_id: 'OBJ-TEST-004', payload: 'payload-unsupported', scenario: 'write' } });
  const res = await waitFor((m) => m.id === c1 && (m.result || m.error), 10000, 'tools/call(unsupported) result');
  check('unsupported client -> result.isError=true (fail-closed, no silent execute)', res.result && res.result.isError === true);
  check('unsupported client -> marker NOT written', !fs.existsSync(MARKER));
  // 若 server 发出过 elicitation，则 tools/call 不会直接返回（会等待应答）；
  // 上述 fail-closed 结果直接到达，即证明未发送 elicitation。
}

async function main() {
  spawnServer();
  await testCapableClient();
  await endServer();

  spawnServer();
  await testUnsupportedClient();
  await endServer();

  const failed = results.filter((r) => !r.pass).length;
  console.log('\nSELFTEST ' + (failed === 0 ? 'PASSED' : 'FAILED') + '  (' + results.length + ' checks, ' + failed + ' failed)');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('SELFTEST ERROR: ' + e.message); process.exit(2); });
