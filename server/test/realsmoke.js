'use strict';
/*
 * F02 真实后端写冒烟（realsmoke，Implementer 补做，档位 3 后端终态/接口实测）
 * ============================================================
 * 目的：以 mcp-service token 驱动真实 MCP server（server/index.js）对真实后端 localhost:8080 执行
 *   销售/采购写链路，验证 #13/#14/#15/#16/#19/#21 与后端的关键集成点（此前仅内存 mock）：
 *   ① naming_series（SAL-ORD-/PUR-ORD-/MAT-DN-/MAT-PRE- 连续编号）；
 *   ② frappe.client.submit 返回形状（#14/#17）；
 *   ③ frappe.client.save(docstatus=2+modified) 取消终态（#15，status 是否置 Cancelled）；
 *   ④ make_delivery_note/make_purchase_receipt mapper 返回形状与子表字段（#19/#21）。
 * 前提：后端容器可写、mcp-service token 在容器 /tmp/mcp_token.txt（已含 token 前缀）。
 * 凭据：token 仅读入内存，不打印、不落盘；输出脱敏。
 * 残留：本脚本只做写入、不物理删除（mcp-service 无 delete DocPerm）；残留以快照恢复归零（见 erp/README.md 方式 B）。
 * 运行：node server/test/realsmoke.js
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const readline = require('readline');

const BACKEND = 'http://localhost:8080';
const PREFIX = 'F02RT-';
const results = [];

function log(msg) { console.log(msg); }
function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
}

// ---------- 直接后端 HTTP（脱敏，仅用于前置主数据与读核实） ----------
function httpReq(method, pathWithQuery, body, token) {
  return new Promise(function (resolve) {
    const url = BACKEND + pathWithQuery;
    const headers = { Authorization: token };
    let payload = null;
    if (method === 'POST' || method === 'PUT') {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body || {});
      headers['Content-Length'] = Buffer.byteLength(payload, 'utf8');
    }
    const req = http.request(url, { method: method, headers: headers, timeout: 20000 }, function (res) {
      let buf = '';
      res.on('data', function (c) { buf += c; });
      res.on('end', function () {
        let out = null; try { out = buf ? JSON.parse(buf) : null; } catch (e) { out = null; }
        resolve({ status: res.statusCode, body: out });
      });
    });
    req.on('timeout', function () { req.destroy(); resolve({ status: 0, body: null }); });
    req.on('error', function () { resolve({ status: 0, body: null }); });
    if (payload) req.write(payload);
    req.end();
  });
}
function get(token, pathWithQuery) { return httpReq('GET', pathWithQuery, null, token); }
function post(token, pathWithQuery, body) { return httpReq('POST', pathWithQuery, body, token); }

// ---------- MCP server 驱动（elicitation 自动 accept） ----------
function spawnServer(tokenBody) {
  const [apiKey, apiSecret] = tokenBody.split(':');
  const server = spawn(process.execPath, ['server/index.js'], {
    env: Object.assign({}, process.env, { ERP_API_KEY: apiKey, ERP_API_SECRET: apiSecret }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const rl = readline.createInterface({ input: server.stdout });
  const pending = new Map(); // id -> resolve
  let seq = 0;
  let writeEligibleReady = false;
  let writeEligibilityLog = null;

  server.stderr.on('data', function (d) {
    const s = String(d);
    // 不打印凭据/敏感；仅探测 write_eligibility 完成。
    for (const line of s.split('\n')) {
      if (line.indexOf('write_eligibility') !== -1) {
        writeEligibleReady = true;
        try { writeEligibilityLog = JSON.parse(line); } catch (e) {}
      }
    }
  });

  rl.on('line', function (line) {
    let msg; try { msg = JSON.parse(line); } catch (e) { return; }
    if (msg && msg.method === 'elicitation/create' && msg.id) {
      // 自动 accept（本冒烟以 L3 客户端支持确认的前提）。
      server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { action: 'accept' } }) + '\n');
      return;
    }
    if (msg && msg.id !== undefined && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  });

  function send(method, params) {
    return new Promise(function (resolve) {
      seq += 1;
      const id = 'm-' + seq;
      pending.set(id, resolve);
      server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params || {} }) + '\n');
    });
  }

  function notify(method, params) {
    // 通知（无 id、无响应）。
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: method, params: params || {} }) + '\n');
  }

  function close() { try { server.kill(); } catch (e) {} }

  return { send, notify, close, get writeEligibleReady() { return writeEligibleReady; }, get writeEligibilityLog() { return writeEligibilityLog; } };
}

async function main() {
  // 0. token（仅内存，不打印）。
  let tokenRaw;
  try { tokenRaw = execSync('docker exec frappe_docker-backend-1 cat /tmp/mcp_token.txt', { encoding: 'utf8' }).trim(); }
  catch (e) { console.log('FAIL 无法读取 token：' + String(e.message).slice(0, 200)); process.exit(1); }
  const tokenBody = tokenRaw.replace(/^token\s+/i, '');
  const tokenHeader = 'token ' + tokenBody;
  log('token 长度：' + tokenBody.length + '（值脱敏）');

  // 1. 发现引用主数据（叶子 Customer Group / Item Group / Warehouse / UOM）。
  const cg = await get(tokenHeader, '/api/resource/Customer%20Group?limit_page_length=50&fields=["name","is_group"]');
  const leafCG = ((cg.body && cg.body.data) || []).find(function (r) { return r.is_group === 0 || r.is_group === undefined; });
  const cgName = leafCG ? leafCG.name : 'All Customer Groups';
  const ig = await get(tokenHeader, '/api/resource/Item%20Group?limit_page_length=50&fields=["name","is_group"]');
  const leafIG = ((ig.body && ig.body.data) || []).find(function (r) { return r.is_group === 0 || r.is_group === undefined; });
  const igName = leafIG ? leafIG.name : 'All Item Groups';
  const wh = await get(tokenHeader, '/api/resource/Warehouse?limit_page_length=50&fields=["name","is_group"]');
  const leafWH = ((wh.body && wh.body.data) || []).find(function (r) { return r.is_group === 0; });
  const whName = leafWH ? leafWH.name : 'Stores - G';
  const uom = await get(tokenHeader, '/api/resource/UOM?limit_page_length=5&fields=["name"]');
  const uomName = ((uom.body && uom.body.data) || [])[0] ? ((uom.body.data)[0].name) : 'Nos';
  log('引用数据：CustomerGroup=' + cgName + ' ItemGroup=' + igName + ' Warehouse=' + whName + ' UOM=' + uomName);

  // 2. 前置主数据（Customer/Supplier/Item，幂等：已存在则复用；直接后端 POST，命名带 F02RT- 前缀）。
  const custName = PREFIX + 'CUST';
  const suppName = PREFIX + 'SUPP';
  const itemCode = PREFIX + 'ITEM';
  const exC = await get(tokenHeader, '/api/resource/Customer/' + encodeURIComponent(custName));
  const c1 = exC.status === 200 ? { status: 200 } : await post(tokenHeader, '/api/resource/Customer', { customer_name: custName, customer_group: cgName, customer_type: 'Company' });
  const exS = await get(tokenHeader, '/api/resource/Supplier/' + encodeURIComponent(suppName));
  const s1 = exS.status === 200 ? { status: 200 } : await post(tokenHeader, '/api/resource/Supplier', { supplier_name: suppName, supplier_group: 'All Supplier Groups' });
  const exI = await get(tokenHeader, '/api/resource/Item/' + encodeURIComponent(itemCode));
  const i1 = exI.status === 200 ? { status: 200 } : await post(tokenHeader, '/api/resource/Item', { item_code: itemCode, item_name: itemCode, item_group: igName, stock_uom: uomName, is_stock_item: 1 });
  rec('前置主数据 Customer/Supplier/Item 就绪', (c1.status >= 200 && c1.status < 300) && (s1.status >= 200 && s1.status < 300) && (i1.status >= 200 && i1.status < 300),
    'cust=' + c1.status + ' supp=' + s1.status + ' item=' + i1.status);

  // 3. 启动 server + 初始化 + tools/list。
  const cli = spawnServer(tokenBody);
  const init = await cli.send('initialize', { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'realsmoke', version: '1.0' } });
  rec('server initialize 返回 elicitation 能力', !!(init && init.result && init.result.capabilities && init.result.capabilities.elicitation));
  cli.notify('notifications/initialized');
  // 等待 write_eligibility 完成（stderr 探测）。
  for (let i = 0; i < 50 && !cli.writeEligibleReady; i++) { await sleep(100); }
  rec('写入能力判定完成（币种/价格表 fail-closed 通过）', cli.writeEligibleReady === true && cli.writeEligibilityLog && cli.writeEligibilityLog.ok === true, cli.writeEligibilityLog ? (cli.writeEligibilityLog.ok + ' reason=' + (cli.writeEligibilityLog.reason || 'null')) : '未完成');
  const tl = await cli.send('tools/list');
  const toolNames = (tl && tl.result && tl.result.tools) ? tl.result.tools.map(function (t) { return t.name; }) : [];
  rec('tools/list 返回 26 tool', toolNames.length === 26, 'count=' + toolNames.length);

  // 4. #13 sales_order_create（全自动）。
  const so1 = await callTool(cli, 'erpnext_sales_order_create', { customer: custName, delivery_date: '2026-12-31', items: [{ item_code: itemCode, qty: 2, warehouse: whName }] });
  const so1Name = (so1 && so1.result && so1.result.name) || '';
  rec('#13 sales_order_create 草稿', so1 && so1.isError === false && /^SAL-ORD-\d{4}-\d+$/.test(so1Name), errDetail(so1, 'name=' + so1Name + ' status=' + (so1 && so1.result && so1.result.status)));

  // 5. #14 sales_order_confirm（人确认，elicitation auto-accept）。
  const so1Doc = await get(tokenHeader, '/api/resource/Sales%20Order/' + encodeURIComponent(so1Name));
  const so1Modified = (so1Doc.body && so1Doc.body.data && so1Doc.body.data.modified) || '';
  const cf1 = await callTool(cli, 'erpnext_sales_order_confirm', { sales_order_id: so1Name, modified: so1Modified });
  rec('#14 sales_order_confirm 生效（docstatus=1）', cf1 && cf1.isError === false && cf1.result && cf1.result.status === 'Submitted', JSON.stringify(cf1 && cf1.result));

  // 6. #15 sales_order_cancel（人确认，经 frappe.client.save docstatus=2）。
  const so1Sub = await get(tokenHeader, '/api/resource/Sales%20Order/' + encodeURIComponent(so1Name));
  const so1SubModified = (so1Sub.body && so1Sub.body.data && so1Sub.body.data.modified) || '';
  const cx1 = await callTool(cli, 'erpnext_sales_order_cancel', { sales_order_id: so1Name, modified: so1SubModified });
  const so1After = await get(tokenHeader, '/api/resource/Sales%20Order/' + encodeURIComponent(so1Name));
  const so1AfterDoc = (so1After.body && so1After.body.data) || {};
  rec('#15 sales_order_cancel 取消终态（docstatus=2、status=Cancelled）', cx1 && cx1.isError === false && so1AfterDoc.docstatus === 2 && so1AfterDoc.status === 'Cancelled',
    'status=' + so1AfterDoc.status + ' docstatus=' + so1AfterDoc.docstatus);

  // 7. #16 purchase_order_create（全自动，schedule_date 必填）。
  const po1 = await callTool(cli, 'erpnext_purchase_order_create', { supplier: suppName, schedule_date: '2026-12-31', items: [{ item_code: itemCode, qty: 3, warehouse: whName }] });
  const po1Name = (po1 && po1.result && po1.result.name) || '';
  rec('#16 purchase_order_create 草稿（schedule_date 必填）', po1 && po1.isError === false && /^PUR-ORD-\d{4}-\d+$/.test(po1Name), 'name=' + po1Name);

  // 8. #21 delivery_note_create（mapper，需来源 SO 已生效）。
  const so2 = await callTool(cli, 'erpnext_sales_order_create', { customer: custName, delivery_date: '2026-12-31', items: [{ item_code: itemCode, qty: 3, warehouse: whName }] });
  const so2Name = (so2 && so2.result && so2.result.name) || '';
  const so2Doc = await get(tokenHeader, '/api/resource/Sales%20Order/' + encodeURIComponent(so2Name));
  const so2Modified = (so2Doc.body && so2Doc.body.data && so2Doc.body.data.modified) || '';
  await callTool(cli, 'erpnext_sales_order_confirm', { sales_order_id: so2Name, modified: so2Modified });
  const dn1 = await callTool(cli, 'erpnext_delivery_note_create', { sales_order_id: so2Name });
  const dn1Name = (dn1 && dn1.result && dn1.result.name) || '';
  rec('#21 delivery_note_create 发货草稿（mapper）', dn1 && dn1.isError === false && dn1.result && /^MAT-DN-\d{4}-\d+$/.test(dn1.result.name || ''),
    'name=' + (dn1 && dn1.result && dn1.result.name) + ' items=' + (dn1 && dn1.result && dn1.result.items && dn1.result.items.length));

  // 9. #19 purchase_receipt_create（mapper，需来源 PO 已生效）。
  const po1Doc = await get(tokenHeader, '/api/resource/Purchase%20Order/' + encodeURIComponent(po1Name));
  const po1Modified = (po1Doc.body && po1Doc.body.data && po1Doc.body.data.modified) || '';
  await callTool(cli, 'erpnext_purchase_order_confirm', { purchase_order_id: po1Name, modified: po1Modified });
  const pr1 = await callTool(cli, 'erpnext_purchase_receipt_create', { purchase_order_id: po1Name });
  const pr1Name = (pr1 && pr1.result && pr1.result.name) || '';
  rec('#19 purchase_receipt_create 收货草稿（mapper）', pr1 && pr1.isError === false && pr1.result && /^MAT-PRE-\d{4}-\d+$/.test(pr1.result.name || ''),
    'name=' + (pr1 && pr1.result && pr1.result.name));

  // 10. #20 purchase_receipt_confirm（人确认，真实入库 +3，产生 GL/SLE，B03 F9）。
  const pr1Doc = await get(tokenHeader, '/api/resource/Purchase%20Receipt/' + encodeURIComponent(pr1Name));
  const pr1Modified = (pr1Doc.body && pr1Doc.body.data && pr1Doc.body.data.modified) || '';
  const prCf = await callTool(cli, 'erpnext_purchase_receipt_confirm', { purchase_receipt_id: pr1Name, modified: pr1Modified });
  const pr1After = await get(tokenHeader, '/api/resource/Purchase%20Receipt/' + encodeURIComponent(pr1Name));
  const pr1AfterDoc = (pr1After.body && pr1After.body.data) || {};
  rec('#20 purchase_receipt_confirm 入库生效（docstatus=1）', prCf && prCf.isError === false && pr1AfterDoc.docstatus === 1,
    'status=' + pr1AfterDoc.status + ' docstatus=' + pr1AfterDoc.docstatus);

  // 11. #22 delivery_note_confirm（人确认，真实出库 -3，需库存充足）。
  const dn1Doc = await get(tokenHeader, '/api/resource/Delivery%20Note/' + encodeURIComponent(dn1Name));
  const dn1Modified = (dn1Doc.body && dn1Doc.body.data && dn1Doc.body.data.modified) || '';
  const dnCf = await callTool(cli, 'erpnext_delivery_note_confirm', { delivery_note_id: dn1Name, modified: dn1Modified });
  const dn1After = await get(tokenHeader, '/api/resource/Delivery%20Note/' + encodeURIComponent(dn1Name));
  const dn1AfterDoc = (dn1After.body && dn1After.body.data) || {};
  rec('#22 delivery_note_confirm 出库生效（docstatus=1）', dnCf && dnCf.isError === false && dn1AfterDoc.docstatus === 1,
    'status=' + dn1AfterDoc.status + ' docstatus=' + dn1AfterDoc.docstatus);

  // 12. #18 purchase_order_cancel 正向（po2 无下游，经 frappe.client.save docstatus=2）。
  const po2 = await callTool(cli, 'erpnext_purchase_order_create', { supplier: suppName, schedule_date: '2026-12-31', items: [{ item_code: itemCode, qty: 1, warehouse: whName }] });
  const po2Name = (po2 && po2.result && po2.result.name) || '';
  const po2Doc = await get(tokenHeader, '/api/resource/Purchase%20Order/' + encodeURIComponent(po2Name));
  const po2Modified = (po2Doc.body && po2Doc.body.data && po2Doc.body.data.modified) || '';
  await callTool(cli, 'erpnext_purchase_order_confirm', { purchase_order_id: po2Name, modified: po2Modified });
  const po2Sub = await get(tokenHeader, '/api/resource/Purchase%20Order/' + encodeURIComponent(po2Name));
  const po2SubModified = (po2Sub.body && po2Sub.body.data && po2Sub.body.data.modified) || '';
  const poCx = await callTool(cli, 'erpnext_purchase_order_cancel', { purchase_order_id: po2Name, modified: po2SubModified });
  const po2After = await get(tokenHeader, '/api/resource/Purchase%20Order/' + encodeURIComponent(po2Name));
  const po2AfterDoc = (po2After.body && po2After.body.data) || {};
  rec('#18 purchase_order_cancel 正向（docstatus=2、status=Cancelled）', poCx && poCx.isError === false && po2AfterDoc.docstatus === 2 && po2AfterDoc.status === 'Cancelled',
    'status=' + po2AfterDoc.status + ' docstatus=' + po2AfterDoc.docstatus);

  cli.close();

  // 汇总。
  const failed = results.filter(function (r) { return !r.ok; });
  log('\n========================================');
  log('真实后端写冒烟结果：' + (results.length - failed.length) + ' 通过 / ' + failed.length + ' 失败');
  if (failed.length) { failed.forEach(function (f) { log('  - ' + f.name + ' :: ' + f.detail); }); }
  log('========================================');
  process.exit(failed.length === 0 ? 0 : 1);
}

function callTool(cli, name, args) {
  return cli.send('tools/call', { name: name, arguments: args }).then(function (msg) {
    if (!msg || msg.error) return { isError: true, error: msg && msg.error, _detail: msg && msg.error ? JSON.stringify(msg.error) : '' };
    const text = (msg.result && msg.result.content && msg.result.content[0] && msg.result.content[0].text) || '{}';
    let parsed; try { parsed = JSON.parse(text); } catch (e) { parsed = { raw: text }; }
    const isError = !!msg.result.isError;
    return { isError: isError, result: parsed, _detail: isError ? ('code=' + parsed.code + ' message=' + parsed.message) : '' };
  });
}

function errDetail(r, fallback) {
  return (r && r._detail) ? r._detail : fallback;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

if (require.main === module) { main(); }
