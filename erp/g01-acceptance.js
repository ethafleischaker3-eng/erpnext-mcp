'use strict';
/*
 * G01 完整集成验收 harness（验收区执行工具，非 server 实现）
 * ============================================================
 * 以「被测 agent」身份驱动真实 MCP server（server/index.js，26 tool）对真实后端 localhost:8080
 * 执行 C01b 冻结任务集 T01–T15 两轮，逐题：恢复快照 → 重放 E01 → 建种子 → 跑题（含自纠）→
 * 终态断言核对 → 次数核算 → 记录 runs/。elicitation 自动 accept（L3 人确认档）。
 *
 * 仅用宿主 Node + 内置模块，零外部依赖。凭据（token）只读入内存、不打印、不落盘。
 * 残留以逐题快照恢复归零。本脚本不改 server/ 实现，不调参、不改题。
 *
 * 运行：node erp/g01-acceptance.js [--only T01] [--round 1]
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BACKEND = 'http://localhost:8080';
const SNAPSHOT = 'clean-post-E01.sql';
const RESET_DIR = 'D:/second-acceptance/reset';
const RUNS_DIR = 'D:/second-acceptance/runs';
const WH = 'Stores - G';
const FG = 'Finished Goods - G';

const ALL_QUESTIONS = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15'];

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------
function exec(cmd, opts) {
  return execSync(cmd, Object.assign({ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: 'bash' }, opts || {}));
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

let tokenHeader = '';
let tokenBody = '';
function setToken() {
  const raw = exec('MSYS_NO_PATHCONV=1 docker exec frappe_docker-backend-1 cat /tmp/mcp_token.txt').trim();
  tokenBody = raw.replace(/^token\s+/i, '');
  tokenHeader = 'token ' + tokenBody;
  return tokenBody.length;
}

function httpReq(method, pathWithQuery, body) {
  return new Promise(function (resolve) {
    const url = BACKEND + pathWithQuery;
    const headers = { Authorization: tokenHeader };
    let payload = null;
    if (method === 'POST' || method === 'PUT') {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body === undefined ? {} : body);
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
function bget(pathWithQuery) { return httpReq('GET', pathWithQuery, null); }
function qs(obj) {
  const parts = [];
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined || obj[k] === null) continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(typeof obj[k] === 'string' ? obj[k] : JSON.stringify(obj[k])));
  }
  return parts.length ? '?' + parts.join('&') : '';
}
async function getList(doctype, filters, fields) {
  // Bin/Stock Ledger Entry 等受限 doctype 的列表端点缺省只回 name，须显式 fields=["*"] 取全字段。
  const r = await bget('/api/resource/' + encodeURIComponent(doctype) + qs({ filters: filters, fields: fields || ['*'], limit_page_length: 100 }));
  if (r.status !== 200) return [];
  return (r.body && r.body.data) || [];
}
async function getDoc(doctype, name) {
  const r = await bget('/api/resource/' + encodeURIComponent(doctype) + '/' + encodeURIComponent(name));
  if (r.status !== 200) return null;
  return r.body && r.body.data;
}

// ---------------------------------------------------------------------------
// MCP server 驱动（elicitation 自动 accept）
// ---------------------------------------------------------------------------
function spawnServer(apiKey, apiSecret) {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: 'D:/second',
    env: Object.assign({}, process.env, { ERP_API_KEY: apiKey, ERP_API_SECRET: apiSecret }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const rl = readline.createInterface({ input: server.stdout });
  const pending = new Map();
  let seq = 0;
  let writeEligibleReady = false;
  let writeEligibilityLog = null;

  server.stderr.on('data', function (d) {
    const s = String(d);
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
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: method, params: params || {} }) + '\n');
  }
  function close() { try { server.kill(); } catch (e) {} }

  return { send, notify, close, get ready() { return writeEligibleReady; }, get eligLog() { return writeEligibilityLog; } };
}

async function initServer(cli) {
  const init = await cli.send('initialize', { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'g01-acceptance', version: '1.0' } });
  cli.notify('notifications/initialized');
  for (let i = 0; i < 50 && !cli.ready; i++) await sleep(100);
  return init;
}

// callTool：返回统一形状 { isError, code, message, result }
async function callTool(cli, name, args) {
  const msg = await cli.send('tools/call', { name: name, arguments: args || {} });
  if (!msg || msg.error) return { isError: true, code: 'transport_error', message: msg && msg.error ? JSON.stringify(msg.error) : 'no response', result: null };
  const text = (msg.result && msg.result.content && msg.result.content[0] && msg.result.content[0].text) || '{}';
  let parsed; try { parsed = JSON.parse(text); } catch (e) { parsed = { raw: text }; }
  const isError = !!msg.result.isError;
  return { isError: isError, code: parsed.code || null, message: parsed.message || null, result: parsed };
}

// ---------------------------------------------------------------------------
// agent 执行器：记录调用序列与自纠次数
// ---------------------------------------------------------------------------
function makeAgent(cli) {
  const calls = [];
  let selfCorrects = 0;
  return {
    calls: calls,
    get selfCorrects() { return selfCorrects; },
    async call(name, args, expect) {
      const r = await callTool(cli, name, args);
      calls.push({ tool: name, args: args, isError: r.isError, code: r.code, message: r.message, result: r.result });
      // expect: 'ok' | 'error' | 任意；'error' 视为一次自纠（预期失败路径）
      if (expect === 'error') selfCorrects += 1;
      return r;
    },
  };
}

// ---------------------------------------------------------------------------
// 逐题 agent + verify
// ---------------------------------------------------------------------------
const Q = {};

// 通用：经 document_get 取 modified（supplier 例外，须走 supplier_search 详情模式）
async function getModified(cli, agent, objectType, objectId) {
  if (objectType === 'supplier') {
    const r = await agent.call('erpnext_supplier_search', { keyword: objectId, detail: 'detail' });
    const items = (r.result && r.result.items) || [];
    return (items[0] && items[0].modified) || '';
  }
  const r = await agent.call('erpnext_document_get', { object_type: objectType, object_id: objectId });
  return (r.result && r.result.modified) || '';
}

// T01 销售全链路
Q.T01 = {
  maxCalls: 14, maxSelfCorrect: 4, coverage: ['#1', '#2', '#3', '#4', '#13', '#14', '#21', '#22'],
  async agent(cli, agent) {
    const item = 'C01b-T01-ITEM', cust = 'C01b-T01-CUST';
    await agent.call('erpnext_stock_level_query', { item_code: item, warehouse: WH });          // #3 初始 100
    const so = await agent.call('erpnext_sales_order_create', { customer: cust, delivery_date: '2026-12-31', items: [{ item_code: item, qty: 10 }] }); // #13
    const soName = so.result && so.result.name;
    const m1 = await getModified(cli, agent, 'sales_order', soName);                              // #2
    await agent.call('erpnext_sales_order_confirm', { sales_order_id: soName, modified: m1 });    // #14
    const dn = await agent.call('erpnext_delivery_note_create', { sales_order_id: soName });      // #21
    const dnName = dn.result && dn.result.name;
    const m2 = await getModified(cli, agent, 'delivery_note', dnName);                            // #2
    await agent.call('erpnext_delivery_note_confirm', { delivery_note_id: dnName, modified: m2 }); // #22
    await agent.call('erpnext_stock_level_query', { item_code: item, warehouse: WH });           // #3 终态 90
    await agent.call('erpnext_stock_ledger_query', { item_code: item, warehouse: WH });          // #4 -10
    await agent.call('erpnext_document_search', { object_type: 'sales_order', filters: { customer: cust } }); // #1
    return { soName: soName, dnName: dnName };
  },
  async verify() {
    const item = 'C01b-T01-ITEM', cust = 'C01b-T01-CUST';
    const sos = await getList('Sales Order', [['customer', '=', cust]]);
    const so = (sos[0] && await getDoc('Sales Order', sos[0].name)) || null;
    const dnName = (so && so.items && so.items[0] && so.items[0].against_sales_order !== undefined) ? null : null;
    // DN 按来源定位：直接列出该客户 DN 并核对 against_sales_order / items[].against_sales_order
    const dns = await getList('Delivery Note', [['customer', '=', cust]]);
    const soName = so ? so.name : '';
    const dn = dns.length === 1 ? (await getDoc('Delivery Note', dns[0].name)) : null;
    const dnFromSo = dn && (dn.against_sales_order === soName || (dn.items && dn.items.some(function (i) { return i.against_sales_order === soName; })));
    const bin = await getList('Bin', [['item_code', '=', item], ['warehouse', '=', WH]]);
    const sle = await getList('Stock Ledger Entry', [['item_code', '=', item], ['warehouse', '=', WH], ['voucher_type', '=', 'Delivery Note']]);
    return {
      checks: [
        { name: 'SO 恰 1 条且 docstatus=1', ok: sos.length === 1 && so && so.docstatus === 1, detail: 'SO count=' + sos.length + ' docstatus=' + (so && so.docstatus) },
        { name: 'SO items 恰 1 行 item/qty=10', ok: so && so.items && so.items.length === 1 && so.items[0].item_code === item && so.items[0].qty === 10, detail: so && so.items ? JSON.stringify(so.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
        { name: 'DN 恰 1 条且 docstatus=1 且来源 SO', ok: dns.length === 1 && dn && dn.docstatus === 1 && !!dnFromSo, detail: 'DN count=' + dns.length + ' docstatus=' + (dn && dn.docstatus) + ' fromSO=' + !!dnFromSo },
        { name: 'DN items 恰 1 行 item/qty=10', ok: dn && dn.items && dn.items.length === 1 && dn.items[0].item_code === item && dn.items[0].qty === 10, detail: dn && dn.items ? JSON.stringify(dn.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
        { name: 'Bin actual_qty=90', ok: bin.length === 1 && bin[0].actual_qty === 90, detail: JSON.stringify(bin.map(function (b) { return { wh: b.warehouse, qty: b.actual_qty }; })) },
        { name: 'SLE 恰 1 条 DN 出库 actual_qty=-10', ok: sle.length === 1 && sle[0].actual_qty === -10, detail: JSON.stringify(sle.map(function (s) { return { wh: s.warehouse, qty: s.actual_qty, vt: s.voucher_type }; })) },
      ],
    };
  },
};

// T02 采购全链路
Q.T02 = {
  maxCalls: 14, maxSelfCorrect: 4, coverage: ['#1', '#2', '#3', '#4', '#5', '#16', '#17', '#19', '#20'],
  async agent(cli, agent) {
    const item = 'C01b-T02-ITEM', sup = 'C01b-T02-SUP';
    await agent.call('erpnext_supplier_search', { keyword: sup });                                  // #5
    const po = await agent.call('erpnext_purchase_order_create', { supplier: sup, schedule_date: '2026-12-31', items: [{ item_code: item, qty: 20 }] }); // #16
    const poName = po.result && po.result.name;
    const m1 = await getModified(cli, agent, 'purchase_order', poName);                             // #2
    await agent.call('erpnext_purchase_order_confirm', { purchase_order_id: poName, modified: m1 }); // #17
    const pr = await agent.call('erpnext_purchase_receipt_create', { purchase_order_id: poName });  // #19
    const prName = pr.result && pr.result.name;
    const m2 = await getModified(cli, agent, 'purchase_receipt', prName);                           // #2
    await agent.call('erpnext_purchase_receipt_confirm', { purchase_receipt_id: prName, modified: m2 }); // #20
    await agent.call('erpnext_stock_level_query', { item_code: item, warehouse: WH });             // #3 终态 20
    await agent.call('erpnext_stock_ledger_query', { item_code: item, warehouse: WH });            // #4 +20
    await agent.call('erpnext_document_search', { object_type: 'purchase_order', filters: { supplier: sup } }); // #1
    return { poName: poName, prName: prName };
  },
  async verify() {
    const item = 'C01b-T02-ITEM', sup = 'C01b-T02-SUP';
    const pos = await getList('Purchase Order', [['supplier', '=', sup]]);
    const po = (pos[0] && await getDoc('Purchase Order', pos[0].name)) || null;
    const poName = po ? po.name : '';
    const prs = await getList('Purchase Receipt', [['supplier', '=', sup]]);
    const pr = prs.length === 1 ? (await getDoc('Purchase Receipt', prs[0].name)) : null;
    const prFromPo = pr && (pr.purchase_order === poName || (pr.items && pr.items.some(function (i) { return i.purchase_order === poName; })));
    const bin = await getList('Bin', [['item_code', '=', item], ['warehouse', '=', WH]]);
    const sle = await getList('Stock Ledger Entry', [['item_code', '=', item], ['warehouse', '=', WH], ['voucher_type', '=', 'Purchase Receipt']]);
    return {
      checks: [
        { name: 'PO 恰 1 条且 docstatus=1', ok: pos.length === 1 && po && po.docstatus === 1, detail: 'PO count=' + pos.length + ' docstatus=' + (po && po.docstatus) },
        { name: 'PO items 恰 1 行 item/qty=20', ok: po && po.items && po.items.length === 1 && po.items[0].item_code === item && po.items[0].qty === 20, detail: po && po.items ? JSON.stringify(po.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
        { name: 'PR 恰 1 条且 docstatus=1 且来源 PO', ok: prs.length === 1 && pr && pr.docstatus === 1 && !!prFromPo, detail: 'PR count=' + prs.length + ' docstatus=' + (pr && pr.docstatus) + ' fromPO=' + !!prFromPo },
        { name: 'PR items 恰 1 行 item/qty=20', ok: pr && pr.items && pr.items.length === 1 && pr.items[0].item_code === item && pr.items[0].qty === 20, detail: pr && pr.items ? JSON.stringify(pr.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
        { name: 'Bin actual_qty=20', ok: bin.length === 1 && bin[0].actual_qty === 20, detail: JSON.stringify(bin.map(function (b) { return { wh: b.warehouse, qty: b.actual_qty }; })) },
        { name: 'SLE 恰 1 条 PR 入库 actual_qty=+20', ok: sle.length === 1 && sle[0].actual_qty === 20, detail: JSON.stringify(sle.map(function (s) { return { wh: s.warehouse, qty: s.actual_qty, vt: s.voucher_type }; })) },
      ],
    };
  },
};

// T03 取消销售订单
Q.T03 = {
  maxCalls: 8, maxSelfCorrect: 2, coverage: ['#13', '#14', '#15'],
  async agent(cli, agent) {
    const item = 'C01b-T03-ITEM', cust = 'C01b-T03-CUST';
    const so = await agent.call('erpnext_sales_order_create', { customer: cust, delivery_date: '2026-12-31', items: [{ item_code: item, qty: 5 }] }); // #13
    const soName = so.result && so.result.name;
    const m1 = await getModified(cli, agent, 'sales_order', soName);
    await agent.call('erpnext_sales_order_confirm', { sales_order_id: soName, modified: m1 }); // #14
    const m2 = await getModified(cli, agent, 'sales_order', soName);
    await agent.call('erpnext_sales_order_cancel', { sales_order_id: soName, modified: m2 }); // #15
    return { soName: soName };
  },
  async verify() {
    const cust = 'C01b-T03-CUST';
    const sos = await getList('Sales Order', [['customer', '=', cust]]);
    const so = (sos[0] && await getDoc('Sales Order', sos[0].name)) || null;
    const soName = so ? so.name : '';
    const dns = await getList('Delivery Note', [['customer', '=', cust]]);
    return {
      checks: [
        { name: 'SO 恰 1 条 docstatus=2 status=Cancelled', ok: sos.length === 1 && so && so.docstatus === 2 && so.status === 'Cancelled', detail: 'count=' + sos.length + ' docstatus=' + (so && so.docstatus) + ' status=' + (so && so.status) },
        { name: 'SO items qty=5', ok: so && so.items && so.items.length === 1 && so.items[0].item_code === 'C01b-T03-ITEM' && so.items[0].qty === 5, detail: so && so.items ? JSON.stringify(so.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
        { name: '无下游 DN', ok: dns.length === 0, detail: 'DN count=' + dns.length },
      ],
    };
  },
};

// T04 取消采购订单
Q.T04 = {
  maxCalls: 8, maxSelfCorrect: 2, coverage: ['#16', '#17', '#18'],
  async agent(cli, agent) {
    const item = 'C01b-T04-ITEM', sup = 'C01b-T04-SUP';
    const po = await agent.call('erpnext_purchase_order_create', { supplier: sup, schedule_date: '2026-12-31', items: [{ item_code: item, qty: 8 }] }); // #16
    const poName = po.result && po.result.name;
    const m1 = await getModified(cli, agent, 'purchase_order', poName);
    await agent.call('erpnext_purchase_order_confirm', { purchase_order_id: poName, modified: m1 }); // #17
    const m2 = await getModified(cli, agent, 'purchase_order', poName);
    await agent.call('erpnext_purchase_order_cancel', { purchase_order_id: poName, modified: m2 }); // #18
    return { poName: poName };
  },
  async verify() {
    const sup = 'C01b-T04-SUP';
    const pos = await getList('Purchase Order', [['supplier', '=', sup]]);
    const po = (pos[0] && await getDoc('Purchase Order', pos[0].name)) || null;
    const prs = await getList('Purchase Receipt', [['supplier', '=', sup]]);
    return {
      checks: [
        { name: 'PO 恰 1 条 docstatus=2 status=Cancelled', ok: pos.length === 1 && po && po.docstatus === 2 && po.status === 'Cancelled', detail: 'count=' + pos.length + ' docstatus=' + (po && po.docstatus) + ' status=' + (po && po.status) },
        { name: 'PO items qty=8', ok: po && po.items && po.items.length === 1 && po.items[0].item_code === 'C01b-T04-ITEM' && po.items[0].qty === 8, detail: po && po.items ? JSON.stringify(po.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
        { name: '无下游 PR', ok: prs.length === 0, detail: 'PR count=' + prs.length },
      ],
    };
  },
};

// T05 客户登记与修改
Q.T05 = {
  maxCalls: 8, maxSelfCorrect: 2, coverage: ['#6', '#7'],
  async agent(cli, agent) {
    const cust = 'C01b-T05-CUST';
    await agent.call('erpnext_customer_create', { customer_name: cust, customer_group: 'Commercial', territory: 'China' }); // #6
    const m1 = await getModified(cli, agent, 'customer', cust);
    await agent.call('erpnext_customer_update', { customer_id: cust, modified: m1, territory: 'Rest Of The World' }); // #7
    return { cust: cust };
  },
  async verify() {
    const c = await getDoc('Customer', 'C01b-T05-CUST');
    return {
      checks: [
        { name: 'Customer name/group/territory 终态', ok: c && c.name === 'C01b-T05-CUST' && c.customer_group === 'Commercial' && c.territory === 'Rest Of The World', detail: c ? ('group=' + c.customer_group + ' territory=' + c.territory) : 'not found' },
        { name: 'customer_name 保持', ok: c && c.customer_name === 'C01b-T05-CUST', detail: c ? ('customer_name=' + c.customer_name) : 'not found' },
      ],
    };
  },
};

// T06 供应商登记与修改
Q.T06 = {
  maxCalls: 8, maxSelfCorrect: 2, coverage: ['#5', '#8', '#9'],
  async agent(cli, agent) {
    const sup = 'C01b-T06-SUP';
    await agent.call('erpnext_supplier_create', { supplier_name: sup, supplier_group: 'Distributor' }); // #8
    await agent.call('erpnext_supplier_search', { keyword: sup });                                       // #5
    const m1 = await getModified(cli, agent, 'supplier', sup);
    await agent.call('erpnext_supplier_update', { supplier_id: sup, modified: m1, supplier_type: 'Individual' }); // #9
    return { sup: sup };
  },
  async verify() {
    const s = await getDoc('Supplier', 'C01b-T06-SUP');
    return {
      checks: [
        { name: 'Supplier name/group/type 终态', ok: s && s.name === 'C01b-T06-SUP' && s.supplier_group === 'Distributor' && s.supplier_type === 'Individual', detail: s ? ('group=' + s.supplier_group + ' type=' + s.supplier_type) : 'not found' },
      ],
    };
  },
};

// T07 物料登记与修改
Q.T07 = {
  maxCalls: 8, maxSelfCorrect: 2, coverage: ['#10', '#11'],
  async agent(cli, agent) {
    const item = 'C01b-T07-ITEM';
    await agent.call('erpnext_item_create', { item_code: item, item_group: 'Raw Material', stock_uom: 'Nos' }); // #10
    const m1 = await getModified(cli, agent, 'item', item);
    await agent.call('erpnext_item_update', { item_id: item, modified: m1, item_group: 'Products' }); // #11
    return { item: item };
  },
  async verify() {
    const i = await getDoc('Item', 'C01b-T07-ITEM');
    return {
      checks: [
        { name: 'Item item_code/stock_uom/item_group 终态', ok: i && i.item_code === 'C01b-T07-ITEM' && i.stock_uom === 'Nos' && i.item_group === 'Products', detail: i ? ('uom=' + i.stock_uom + ' group=' + i.item_group) : 'not found' },
      ],
    };
  },
};

// T08 物料价格设置
Q.T08 = {
  maxCalls: 6, maxSelfCorrect: 2, coverage: ['#12'],
  async agent(cli, agent) {
    const item = 'C01b-T08-ITEM';
    await agent.call('erpnext_item_price_set', { item_code: item, price_list: 'Standard Selling', price_list_rate: 15, selling: 1 }); // #12
    return { item: item };
  },
  async verify() {
    const ips = await getList('Item Price', [['item_code', '=', 'C01b-T08-ITEM'], ['price_list', '=', 'Standard Selling'], ['selling', '=', 1]]);
    const ip = ips[0];
    return {
      checks: [
        { name: 'Item Price 恰 1 条 rate=15 selling=1', ok: ips.length === 1 && ip && ip.price_list_rate === 15 && ip.selling === 1, detail: JSON.stringify(ips.map(function (p) { return { pl: p.price_list, rate: p.price_list_rate, selling: p.selling, currency: p.currency }; })) },
      ],
    };
  },
};

// T09 仓库间调拨
Q.T09 = {
  maxCalls: 10, maxSelfCorrect: 3, coverage: ['#2', '#3', '#4', '#23', '#24'],
  async agent(cli, agent) {
    const item = 'C01b-T09-ITEM';
    const ste = await agent.call('erpnext_stock_transfer_create', { stock_entry_type: 'material_transfer', from_warehouse: WH, to_warehouse: FG, items: [{ item_code: item, qty: 20 }] }); // #23
    const steName = ste.result && ste.result.name;
    const m1 = await getModified(cli, agent, 'stock_entry', steName);
    await agent.call('erpnext_stock_transfer_confirm', { stock_entry_id: steName, modified: m1 }); // #24
    await agent.call('erpnext_stock_level_query', { item_code: item, warehouse: WH });  // #3 30
    await agent.call('erpnext_stock_level_query', { item_code: item, warehouse: FG });  // #3 20
    await agent.call('erpnext_stock_ledger_query', { item_code: item });                // #4 ±20
    return { steName: steName };
  },
  async verify() {
    const item = 'C01b-T09-ITEM';
    const stes = await getList('Stock Entry', [['from_warehouse', '=', WH], ['to_warehouse', '=', FG]]);
    const ste = (stes[0] && await getDoc('Stock Entry', stes[0].name)) || null;
    const binS = await getList('Bin', [['item_code', '=', item], ['warehouse', '=', WH]]);
    const binF = await getList('Bin', [['item_code', '=', item], ['warehouse', '=', FG]]);
    const sle = await getList('Stock Ledger Entry', [['item_code', '=', item], ['voucher_type', '=', 'Stock Entry']]);
    return {
      checks: [
        { name: 'STE Material Transfer 恰 1 条 docstatus=1', ok: stes.length === 1 && ste && ste.docstatus === 1 && ste.stock_entry_type === 'Material Transfer', detail: 'count=' + stes.length + ' docstatus=' + (ste && ste.docstatus) + ' type=' + (ste && ste.stock_entry_type) },
        { name: 'STE items qty=20', ok: ste && ste.items && ste.items.length === 1 && ste.items[0].item_code === item && ste.items[0].qty === 20, detail: ste && ste.items ? JSON.stringify(ste.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
        { name: 'Bin 源 30 / 目标 20', ok: binS.length === 1 && binS[0].actual_qty === 30 && binF.length === 1 && binF[0].actual_qty === 20, detail: 'src=' + JSON.stringify(binS.map(function (b) { return b.actual_qty; })) + ' dst=' + JSON.stringify(binF.map(function (b) { return b.actual_qty; })) },
        { name: 'SLE 源 -20 与目标 +20', ok: sle.length === 2 && (sle.some(function (s) { return s.actual_qty === -20; }) && sle.some(function (s) { return s.actual_qty === 20; })), detail: JSON.stringify(sle.map(function (s) { return { wh: s.warehouse, qty: s.actual_qty }; })) },
      ],
    };
  },
};

// T10 库存盘点方案（只出 plan）
Q.T10 = {
  maxCalls: 6, maxSelfCorrect: 1, coverage: ['#25'],
  async agent(cli, agent) {
    const r = await agent.call('erpnext_stock_reconciliation_plan', { warehouse: WH, item_code: 'C01b-T10-ITEM' }); // #25
    return { plan: r.result };
  },
  async verify() {
    const srs = await getList('Stock Reconciliation', [['docstatus', '=', 1]]);
    const bin = await getList('Bin', [['item_code', '=', 'C01b-T10-ITEM'], ['warehouse', '=', WH]]);
    return {
      checks: [
        { name: '无 docstatus=1 SR（零写入）', ok: srs.length === 0, detail: 'submitted SR count=' + srs.length },
        { name: 'Bin 仍 30（零写入）', ok: bin.length === 1 && bin[0].actual_qty === 30, detail: JSON.stringify(bin.map(function (b) { return b.actual_qty; })) },
      ],
    };
  },
};

// T11 失败路径·参数缺失（自纠）
Q.T11 = {
  maxCalls: 6, maxSelfCorrect: 3, coverage: ['#6'],
  async agent(cli, agent) {
    const cust = 'C01b-T11-CUST';
    const r1 = await agent.call('erpnext_customer_create', { customer_name: cust }, 'error'); // 缺 customer_group → invalid_argument（自纠点）
    await agent.call('erpnext_customer_create', { customer_name: cust, customer_group: 'Commercial' }); // 自纠成功
    return { firstCode: r1.code, cust: cust };
  },
  async verify() {
    const c = await getDoc('Customer', 'C01b-T11-CUST');
    return {
      checks: [
        { name: 'Customer 存在且 customer_group=Commercial', ok: c && c.customer_group === 'Commercial', detail: c ? ('group=' + c.customer_group) : 'not found' },
      ],
    };
  },
};

// T12 失败路径·前置断言不通过（自纠）
Q.T12 = {
  maxCalls: 10, maxSelfCorrect: 3, coverage: ['#2', '#14', '#21', '#22'],
  async agent(cli, agent) {
    const item = 'C01b-T12-ITEM', soName = 'C01b-T12-SO';
    const r1 = await agent.call('erpnext_delivery_note_create', { sales_order_id: soName }, 'error'); // 草稿 SO → precondition_failed（自纠点）
    const m1 = await getModified(cli, agent, 'sales_order', soName);
    await agent.call('erpnext_sales_order_confirm', { sales_order_id: soName, modified: m1 }); // #14 自纠
    const dn = await agent.call('erpnext_delivery_note_create', { sales_order_id: soName });    // #21 成功
    const dnName = dn.result && dn.result.name;
    const m2 = await getModified(cli, agent, 'delivery_note', dnName);
    await agent.call('erpnext_delivery_note_confirm', { delivery_note_id: dnName, modified: m2 }); // #22
    return { firstCode: r1.code, dnName: dnName };
  },
  async verify() {
    const item = 'C01b-T12-ITEM';
    const so = await getDoc('Sales Order', 'C01b-T12-SO');
    const dns = await getList('Delivery Note', [['customer', '=', 'C01b-T12-CUST']]);
    const dn = dns.length === 1 ? (await getDoc('Delivery Note', dns[0].name)) : null;
    const bin = await getList('Bin', [['item_code', '=', item], ['warehouse', '=', WH]]);
    return {
      checks: [
        { name: 'SO C01b-T12-SO docstatus=1', ok: so && so.docstatus === 1, detail: 'docstatus=' + (so && so.docstatus) },
        { name: 'DN 恰 1 条 qty=5 docstatus=1', ok: dns.length === 1 && dn && dn.docstatus === 1 && dn.items && dn.items.length === 1 && dn.items[0].qty === 5, detail: 'count=' + dns.length + ' docstatus=' + (dn && dn.docstatus) },
        { name: 'Bin actual_qty=95', ok: bin.length === 1 && bin[0].actual_qty === 95, detail: JSON.stringify(bin.map(function (b) { return b.actual_qty; })) },
      ],
    };
  },
};

// T13 失败路径·幂等冲突
Q.T13 = {
  maxCalls: 8, maxSelfCorrect: 2, coverage: ['#13', '#26'],
  async agent(cli, agent) {
    const item = 'C01b-T13-ITEM', cust = 'C01b-T13-CUST';
    const soArgs = { customer: cust, transaction_date: '2026-09-18', delivery_date: '2026-12-31', items: [{ item_code: item, qty: 3 }] };
    const so1 = await agent.call('erpnext_sales_order_create', soArgs); // #13
    const so2 = await agent.call('erpnext_sales_order_create', soArgs); // #13 幂等命中
    await agent.call('erpnext_batch_status_get', {}); // #26 核对批次
    return { so1Name: so1.result && so1.result.name, so2Idem: !!(so2.result && so2.result.idempotent_replay) };
  },
  async verify() {
    const cust = 'C01b-T13-CUST';
    const sos = await getList('Sales Order', [['customer', '=', cust]]);
    const so = (sos[0] && await getDoc('Sales Order', sos[0].name)) || null;
    return {
      checks: [
        { name: 'SO 恰 1 条（非 2 条）', ok: sos.length === 1, detail: 'count=' + sos.length },
        { name: 'SO items qty=3', ok: so && so.items && so.items.length === 1 && so.items[0].item_code === 'C01b-T13-ITEM' && so.items[0].qty === 3, detail: so && so.items ? JSON.stringify(so.items.map(function (i) { return { item_code: i.item_code, qty: i.qty }; })) : 'none' },
      ],
    };
  },
};

// T14 失败路径·越权（零写入 + 拒绝声明）
Q.T14 = {
  maxCalls: 5, maxSelfCorrect: 1, coverage: ['允许清单边界'],
  async agent(cli, agent) {
    // 无 warehouse create tool；被测 agent 枚举能力后报告越权/对象范围边界，零写入。
    const tl = await cli.send('tools/list');
    const names = (tl && tl.result && tl.result.tools) ? tl.result.tools.map(function (t) { return t.name; }) : [];
    const hasWarehouseCreate = names.some(function (n) { return /warehouse/i.test(n) && /create/i.test(n); });
    return { hasWarehouseCreate: hasWarehouseCreate, refusal: '无法创建仓库（超出授权/对象范围）：Warehouse 属引用允许清单，仅可引用不可增删改' };
  },
  async verify() {
    const w = await getDoc('Warehouse', 'C01b-T14-WH');
    return {
      checks: [
        { name: '无 Warehouse C01b-T14-WH（零写入）', ok: w === null, detail: w ? 'exists' : 'not found' },
      ],
    };
  },
};

// T15 失败路径·声明与实现不一致（零变更 + 边界声明）
Q.T15 = {
  maxCalls: 5, maxSelfCorrect: 1, coverage: ['能力边界'],
  async agent(cli, agent) {
    // 无 DN cancel tool；被测 agent 报告无法作废已发货单据，零变更。
    const tl = await cli.send('tools/list');
    const names = (tl && tl.result && tl.result.tools) ? tl.result.tools.map(function (t) { return t.name; }) : [];
    const hasDnCancel = names.some(function (n) { return /delivery_note/i.test(n) && /cancel/i.test(n); });
    return { hasDnCancel: hasDnCancel, refusal: '无法作废已发货单据（发货单无作废能力，属管理员运维异常回滚）' };
  },
  async verify() {
    const dns = await getList('Delivery Note', [['customer', '=', 'C01b-T15-CUST']]);
    const dn = dns.length === 1 ? (await getDoc('Delivery Note', dns[0].name)) : null;
    const bin = await getList('Bin', [['item_code', '=', 'C01b-T15-ITEM'], ['warehouse', '=', WH]]);
    return {
      checks: [
        { name: 'DN 保持 docstatus=1（零变更）', ok: dn && dn.docstatus === 1, detail: 'count=' + dns.length + ' docstatus=' + (dn && dn.docstatus) },
        { name: 'Bin 保持 90（零变更）', ok: bin.length === 1 && bin[0].actual_qty === 90, detail: JSON.stringify(bin.map(function (b) { return b.actual_qty; })) },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// 快照恢复 + E01 重放 + 建种子
// ---------------------------------------------------------------------------
function restoreSnapshot() {
  exec('cd "' + RESET_DIR + '" && bash ./restore-snapshot.sh ../snapshots/' + SNAPSHOT + ' >/dev/null 2>&1');
}
function replayE01() {
  exec('docker cp erp/replay-e01.py frappe_docker-backend-1:/tmp/replay-e01.py');
  exec('MSYS_NO_PATHCONV=1 docker exec -w /home/frappe/frappe-bench/sites frappe_docker-backend-1 /home/frappe/frappe-bench/env/bin/python /tmp/replay-e01.py >/dev/null 2>&1');
}
function seedQuestion(q) {
  exec('docker cp erp/g01-seed.py frappe_docker-backend-1:/tmp/g01-seed.py');
  exec('MSYS_NO_PATHCONV=1 docker exec -w /home/frappe/frappe-bench/sites frappe_docker-backend-1 /home/frappe/frappe-bench/env/bin/python /tmp/g01-seed.py ' + q + ' >/dev/null 2>&1');
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function parseArgs() {
  const a = process.argv.slice(2);
  const o = { only: null, round: 0 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--only' && a[i + 1]) o.only = a[i + 1].toUpperCase();
    if (a[i] === '--round' && a[i + 1]) o.round = parseInt(a[i + 1], 10);
  }
  return o;
}

async function runQuestion(round, q) {
  const cfg = Q[q];
  const rec = { round: round, question: q, maxCalls: cfg.maxCalls, maxSelfCorrect: cfg.maxSelfCorrect, coverage: cfg.coverage, ts: new Date().toISOString() };
  try {
    restoreSnapshot();
    replayE01();
    const tkLen = setToken();
    seedQuestion(q);

    const [apiKey, apiSecret] = tokenBody.split(':');
    const cli = spawnServer(apiKey, apiSecret);
    await initServer(cli);
    rec.writeEligible = !!(cli.eligLog && cli.eligLog.ok === true);

    const agent = makeAgent(cli);
    const extra = await cfg.agent(cli, agent);
    cli.close();

    rec.toolCalls = agent.calls.length;
    rec.selfCorrects = agent.selfCorrects;
    rec.calls = agent.calls.map(function (c) {
      return { tool: c.tool, args: c.args, isError: c.isError, code: c.code, message: c.message, result: c.result };
    });
    rec.extra = extra;

    const v = await cfg.verify();
    rec.checks = v.checks;
    rec.callsOver = agent.calls.length > cfg.maxCalls;
    rec.selfCorrectOver = agent.selfCorrects > cfg.maxSelfCorrect;
    rec.allChecksPass = v.checks.every(function (c) { return c.ok; });
    rec.passed = rec.allChecksPass && !rec.callsOver && !rec.selfCorrectOver && rec.writeEligible;
  } catch (e) {
    rec.error = String(e && e.message).slice(0, 500);
    rec.passed = false;
  }
  return rec;
}

async function main() {
  const opts = parseArgs();
  const questions = opts.only ? (Q[opts.only] ? [opts.only] : []) : ALL_QUESTIONS;
  const rounds = opts.round ? [opts.round] : [1, 2];

  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });

  const summary = [];
  for (const r of rounds) {
    for (const q of questions) {
      process.stdout.write('[' + r + '/' + q + '] 跑题... ');
      const rec = await runQuestion(r, q);
      summary.push(rec);
      const fname = 'G01-R' + r + '-' + q + '.json';
      fs.writeFileSync(path.join(RUNS_DIR, fname), JSON.stringify(rec, null, 2), 'utf8');
      console.log(rec.passed ? '通过' : '失败', '（calls=' + rec.toolCalls + '/' + rec.maxCalls + ', 自纠=' + rec.selfCorrects + '/' + rec.maxSelfCorrect + ', checks=' + (rec.checks || []).filter(function (c) { return !c.ok; }).length + ' 失败）' + (rec.error ? ' ERROR: ' + rec.error : ''));
    }
  }

  console.log('\n==== G01 汇总 ====');
  let pass = 0, fail = 0;
  for (const s of summary) {
    if (s.passed) pass++; else fail++;
    if (!s.passed) {
      console.log('  FAIL ' + s.round + '/' + s.question + (s.error ? ' ERROR=' + s.error : '') + (s.checks ? ' :: ' + s.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name + '(' + c.detail + ')'; }).join(' | ') : '') + (s.callsOver ? ' [超调用]' : '') + (s.selfCorrectOver ? ' [超自纠]' : ''));
    }
  }
  console.log('通过 ' + pass + ' / ' + (pass + fail) + '（' + (summary.length) + ' 题次）');
  process.exit(fail === 0 ? 0 : 1);
}

if (require.main === module) { main(); }
