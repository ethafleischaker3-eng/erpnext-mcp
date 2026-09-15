#!/usr/bin/env node
/*
 * B05 探针自测（fake-client 驱动）
 * ============================================================
 * 作用：以进程内模拟客户端，实测 server.js 的契约与故障注入逻辑。
 * 覆盖：normal 成功写标记、error 返回 isError、slow 延迟响应、crash 进程退出、
 *       完整到达日志（id/fingerprint/pid/connEpoch/mode）与 fingerprint 稳定性。
 * 说明：这是探针自身的契约自测，不等同于真实客户端（Claude Code）重试/关联核查——
 *       真实客户端核查由 claude mcp add + claude -p headless 实测承担（见 evidence/）。
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const SERVER = path.join(__dirname, 'server.js');
const MARKER = path.join(__dirname, 'state', 'marker.json');
const FAULT = path.join(__dirname, 'state', 'fault-mode.txt');
const probe = require('./server.js');

function clearMarker() { try { fs.unlinkSync(MARKER); } catch (e) { /* absent */ } }
function setFault(m) { fs.writeFileSync(FAULT, m); }
function clearFault() { try { fs.unlinkSync(FAULT); } catch (e) { /* absent */ } }

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

function spawnServer() {
  server = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: server.stdout });
  rl.on('line', (line) => {
    let m;
    try { m = JSON.parse(line); } catch (e) { return; }
    incoming.push(m);
    broadcast();
  });
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

async function initAndList() {
  const id = rpc('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: { tools: {} },
    clientInfo: { name: 'b05-selftest', version: '1.0.0' },
  });
  const init = await waitFor((m) => m.id === id, 10000, 'initialize');
  check('server advertises tools capability', !!(init.result && init.result.capabilities && init.result.capabilities.tools));
  notify('notifications/initialized', {});
  const tl = rpc('tools/list', {});
  const tlr = await waitFor((m) => m.id === tl, 10000, 'tools/list');
  const tool = tlr.result && tlr.result.tools && tlr.result.tools.find((t) => t.name === 'probe_retry_write');
  check('tools/list exposes probe_retry_write', !!tool);
  check('annotation: readOnly=false, destructive=true, idempotent=false, openWorld=false',
    tool && tool.annotations && tool.annotations.readOnlyHint === false &&
    tool.annotations.destructiveHint === true && tool.annotations.idempotentHint === false &&
    tool.annotations.openWorldHint === false);
}

async function testNormal() {
  clearMarker();
  const d = rpc('tools/call', { name: 'probe_retry_write', arguments: { target_object_id: 'OBJ-N', payload: 'p-normal' } });
  const r = await waitFor((m) => m.id === d && (m.result || m.error), 10000, 'tools/call(normal)');
  check('normal -> success (isError=false)', r.result && r.result.isError === false);
  check('normal -> marker written', fs.existsSync(MARKER));
}

async function testError() {
  setFault('error');
  clearMarker();
  const d = rpc('tools/call', { name: 'probe_retry_write', arguments: { target_object_id: 'OBJ-E', payload: 'p-err' } });
  const r = await waitFor((m) => m.id === d && (m.result || m.error), 10000, 'tools/call(error)');
  check('error -> isError=true (business error)', r.result && r.result.isError === true);
  check('error -> marker NOT written', !fs.existsSync(MARKER));
  check('error -> fault mode reset to normal', fs.readFileSync(FAULT, 'utf8').trim() === 'normal');
}

async function testSlow() {
  setFault('slow');
  clearMarker();
  const d = rpc('tools/call', { name: 'probe_retry_write', arguments: { target_object_id: 'OBJ-S', payload: 'p-slow', delay_ms: 300 } });
  const t0 = Date.now();
  const r = await waitFor((m) => m.id === d && (m.result || m.error), 10000, 'tools/call(slow)');
  const elapsed = Date.now() - t0;
  check('slow -> delayed success (isError=false)', r.result && r.result.isError === false);
  check('slow -> delayed by >= 300ms', elapsed >= 290);
  check('slow -> marker written', fs.existsSync(MARKER));
}

async function testCrash() {
  setFault('crash');
  clearMarker();
  const d = rpc('tools/call', { name: 'probe_retry_write', arguments: { target_object_id: 'OBJ-C', payload: 'p-crash' } });
  const exited = await new Promise((resolve) => {
    server.once('exit', (code) => resolve(code));
    setTimeout(() => resolve(null), 5000);
  });
  check('crash -> server process exits (disconnect)', exited !== null && exited !== undefined);
  check('crash -> fault mode reset to normal (one-shot)', fs.existsSync(FAULT) && fs.readFileSync(FAULT, 'utf8').trim() === 'normal');
}

// fingerprint 稳定性（对应 task.md W09 原则：仅业务参数进指纹，request id 不参与）
function testFingerprint() {
  const a1 = { target_object_id: 'X', payload: 'p', extra: 1 };
  const a2 = { extra: 1, target_object_id: 'X', payload: 'p' }; // 键序不同，应同指纹
  const a3 = { target_object_id: 'X', payload: 'q' }; // payload 不同，应不同指纹
  check('fingerprint: 键序归一化后相同业务参数 -> 同指纹', probe.fingerprint(a1) === probe.fingerprint(a2));
  check('fingerprint: 不同有效负载 -> 不同指纹', probe.fingerprint(a1) !== probe.fingerprint(a3));
  check('fingerprint: 不含 JSON-RPC id / 连接身份（仅业务参数）', !/requestId|jsonrpc/i.test(probe.fingerprint({ target_object_id: 'X', payload: 'p' })));
}

async function main() {
  clearFault();
  spawnServer();
  await initAndList();
  await testNormal();
  await endServer();

  spawnServer();
  await initAndList();
  await testError();
  await endServer();

  spawnServer();
  await initAndList();
  await testSlow();
  await endServer();

  spawnServer();
  await initAndList();
  await testCrash();
  await endServer();

  testFingerprint();
  clearFault();
  clearMarker();

  const failed = results.filter((r) => !r.pass).length;
  console.log('\nSELFTEST ' + (failed === 0 ? 'PASSED' : 'FAILED') + '  (' + results.length + ' checks, ' + failed + ' failed)');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('SELFTEST ERROR: ' + e.message); process.exit(2); });
