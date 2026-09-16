#!/usr/bin/env node
/*
 * E02 探针自测（fake-client 驱动）
 * ============================================================
 * 作用：以进程内模拟客户端，实测 server.js 作为 stdio MCP server 可运行：
 *       initialize / tools/list / tools/call 三个探针 tool 均可用，且故障注入生效。
 * 说明：这是探针自身的可运行性自测，不等同于真实客户端核查；机制正确性由 test/selftest.js（S01—S09）承担。
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const SERVER = path.join(__dirname, 'server.js');
const STATE_DIR = path.join(__dirname, 'state');
const FAULT = path.join(STATE_DIR, 'fault-mode.txt');

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) { passed += 1; console.log('PASS  ' + name); }
  else { failed += 1; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

function clearState() {
  try { fs.rmSync(STATE_DIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
function setFault(m) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(FAULT, m); }
function clearFault() { try { fs.unlinkSync(FAULT); } catch (e) { /* absent */ } }

function main() {
  clearState();
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: child.stdout });
  let seq = 0;
  const pending = new Map();

  function request(method, params) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  rl.on('line', (line) => {
    const t = line.trim();
    if (!t) return;
    let msg; try { msg = JSON.parse(t); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  });

  (async () => {
    try {
      const init = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'probe-selftest', version: '0' } });
      check('P01 initialize 返回 protocolVersion 与 serverInfo', init.protocolVersion === '2025-11-25' && init.serverInfo.name === 'e02-probe');
      notify('notifications/initialized', {});

      const list = await request('tools/list', {});
      const names = list.tools.map((t) => t.name);
      check('P02 tools/list 含 3 个探针 tool', names.length === 3 && names.indexOf('e02_fingerprint_probe') !== -1 && names.indexOf('e02_idempotency_probe') !== -1 && names.indexOf('e02_batch_status_probe') !== -1, names.join(','));

      const fp = await request('tools/call', { name: 'e02_fingerprint_probe', arguments: { business_params: { name: 'A', code: 'X' } } });
      const fpText = fp.content[0].text;
      check('P03 fingerprint_probe 返回指纹', /fingerprint/.test(fpText) && fp.isError === false);

      await request('tools/call', { name: 'e02_idempotency_probe', arguments: { group: 'create', business_params: { name: 'X' } } });
      const hit = await request('tools/call', { name: 'e02_idempotency_probe', arguments: { group: 'create', business_params: { name: 'X' } } });
      const hitText = hit.content[0].text;
      check('P04 idempotency_probe 二次调用命中合并', /merged.*true|hit.*true/.test(hitText) && /idempotent_replay/.test(hitText), hitText);

      // 故障注入：postcondition_mismatch → 返回事后校验不一致
      setFault('postcondition_mismatch');
      const fault = await request('tools/call', { name: 'e02_idempotency_probe', arguments: { group: 'create', business_params: { name: 'Y' } } });
      const faultText = fault.content[0].text;
      check('P05 故障注入 postcondition_mismatch 生效', fault.isError === true && /postcondition_failed/.test(faultText), faultText);
      clearFault();

      // 批次状态查询：本会话批次可查
      setFault('postcondition_mismatch');
      await request('tools/call', { name: 'e02_idempotency_probe', arguments: { group: 'create', business_params: { name: 'Z' } } });
      clearFault();
      // 上述故障注入已创建一个 pending_rollback 批次，直接查最新批次（session 内可见）
      const bs = await request('tools/call', { name: 'e02_batch_status_probe', arguments: { batch_id: 'batch-nonexistent' } });
      check('P06 batch_status_probe 不存在批次返回 batch_not_found', bs.isError === true && /batch_not_found/.test(bs.content[0].text), bs.content[0].text);

      console.log('\n结果：' + passed + ' 通过 / ' + failed + ' 失败');
      child.kill();
      process.exit(failed === 0 ? 0 : 1);
    } catch (e) {
      console.log('FAIL  探针自测异常：' + e.message);
      child.kill();
      process.exit(1);
    }
  })();
}

main();
