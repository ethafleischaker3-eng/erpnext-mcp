'use strict';
/*
 * ERPNext MCP server 后端 REST 客户端（经 mcp-service + MCP Business Caller）
 * ============================================================
 * F01 读：GET /api/resource/{Doctype} 与 /api/method/frappe.client.get_count。
 * F04 写（增量只增不改既有读端点）：POST /api/resource/{doctype}、PUT /api/resource/{doctype}/{name}、
 *   POST /api/method/frappe.client.submit（#24 confirm 全量 doc）、
 *   GET /api/method/...get_items（#25 读现状）。
 * F02 写（增量只增不改既有端点）：POST /api/method/frappe.client.save（#15/#18 cancel docstatus=2+modified）、
 *   POST /api/method/...make_delivery_note（#21 发货草稿 mapper）、
 *   POST /api/method/...make_purchase_receipt（#19 收货草稿 mapper）。
 * 认证经 token <api_key>:<api_secret>（凭据由 config 注入，不落代码）。
 * 失败路径：非 2xx 或网络错误均结构化返回（translate.js 转译），不静默成功；写操作后端不可达不自动重试。
 *
 * 接口（供 tools 注入；测试以 mock 实现替换）：
 *   getList(doctype, opts) -> { ok:true, data } | { ok:false, error }
 *   get(doctype, name) -> { ok:true, data } | { ok:false, error }
 *   getCount(doctype, filters) -> { ok:true, count } | { ok:false, error }
 *   create(doctype, doc) -> { ok:true, data } | { ok:false, error }
 *   update(doctype, name, doc) -> { ok:true, data } | { ok:false, error }
 *   submit(doctype, doc) -> { ok:true, data } | { ok:false, error }
 *   save(doctype, doc) -> { ok:true, data } | { ok:false, error }
 *   makeDeliveryNote(sourceName) -> { ok:true, data } | { ok:false, error }
 *   makePurchaseReceipt(sourceName) -> { ok:true, data } | { ok:false, error }
 *   getItems(opts) -> { ok:true, data } | { ok:false, error }
 */

const http = require('http');
const { translateBackendError, backendUnavailable } = require('./translate');

function createBackendClient(config) {
  const baseUrl = (config && config.baseUrl) || 'http://localhost:8080';
  const apiKey = (config && config.apiKey) || '';
  const apiSecret = (config && config.apiSecret) || '';
  const authHeader = apiKey ? 'token ' + apiKey + ':' + apiSecret : '';

  // 低层 HTTP 请求（GET/POST/PUT）；返回 Promise<{ ok, status, body }>。
  function request(pathWithQuery, method, body) {
    method = (method || 'GET').toUpperCase();
    return new Promise(function (resolve) {
      const url = baseUrl.replace(/\/$/, '') + pathWithQuery;
      const headers = {};
      if (authHeader) headers.Authorization = authHeader;
      let payload = null;
      if (method === 'POST' || method === 'PUT') {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body === undefined ? {} : body);
        headers['Content-Length'] = Buffer.byteLength(payload, 'utf8');
      }
      const req = http.request(url, { method: method, headers: headers, timeout: 15000 }, function (res) {
        let buf = '';
        res.on('data', function (c) { buf += c; });
        res.on('end', function () {
          let out;
          try { out = buf ? JSON.parse(buf) : null; } catch (e) { out = null; }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: out });
        });
      });
      req.on('timeout', function () { req.destroy(); resolve({ ok: false, status: 0, body: null, unreachable: true }); });
      req.on('error', function () { resolve({ ok: false, status: 0, body: null, unreachable: true }); });
      if (payload) req.write(payload);
      req.end();
    });
  }

  function qs(obj) {
    const parts = [];
    for (const k of Object.keys(obj)) {
      if (obj[k] === undefined || obj[k] === null) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(typeof obj[k] === 'string' ? obj[k] : JSON.stringify(obj[k])));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  // 列表查询（Frappe /api/resource/{doctype}）。
  async function getList(doctype, opts) {
    opts = opts || {};
    const query = {
      fields: opts.fields,
      filters: opts.filters,
      limit_page_length: opts.limitPageLength,
      limit_start: opts.limitStart,
      order_by: opts.orderBy,
    };
    const r = await request('/api/resource/' + encodeURIComponent(doctype) + qs(query));
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    return { ok: true, data: (r.body && r.body.data) || [] };
  }

  // 单条读取（Frappe /api/resource/{doctype}/{name}）。
  async function get(doctype, name) {
    const r = await request('/api/resource/' + encodeURIComponent(doctype) + '/' + encodeURIComponent(name));
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    return { ok: true, data: (r.body && r.body.data) || null };
  }

  // 计数（Frappe frappe.client.get_count，只读）。
  async function getCount(doctype, filters) {
    const r = await request('/api/method/frappe.client.get_count' + qs({ doctype: doctype, filters: filters }));
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    const count = (r.body && (r.body.message || r.body.data));
    return { ok: true, count: typeof count === 'number' ? count : parseInt(count, 10) || 0 };
  }

  // 创建（POST /api/resource/{doctype}；body 为全量字段对象，含 name 不设、由后端生成）。
  async function create(doctype, doc) {
    const r = await request('/api/resource/' + encodeURIComponent(doctype), 'POST', doc);
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    return { ok: true, data: (r.body && r.body.data) || null };
  }

  // 更新（PUT /api/resource/{doctype}/{name}；doc 含 modified 乐观令牌时后端 check_if_latest 校验）。
  async function update(doctype, name, doc) {
    const r = await request('/api/resource/' + encodeURIComponent(doctype) + '/' + encodeURIComponent(name), 'PUT', doc);
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    return { ok: true, data: (r.body && r.body.data) || null };
  }

  // 提交生效（POST /api/method/frappe.client.submit；全量 doc，非 name 串，B04 F3）。
  async function submit(doctype, doc) {
    const r = await request('/api/method/frappe.client.submit', 'POST', { doc: doc });
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    // submit 返回 {"message": <doc>}。
    const data = (r.body && r.body.message !== undefined) ? r.body.message : (r.body && r.body.data);
    return { ok: true, data: data || null };
  }

  // 取消（POST /api/method/frappe.client.save；doc 携带 docstatus=2 + modified 施加版本保护，B02 F3/B03 F3）。
  // 标准 cancel 端点（run_method:cancel / frappe.client.cancel）不接受 modified，仅此 save 等价路径可施加版本断言（D02 §0 第 5 条）。
  async function save(doctype, doc) {
    const r = await request('/api/method/frappe.client.save', 'POST', { doc: doc });
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    const data = (r.body && r.body.message !== undefined) ? r.body.message : (r.body && r.body.data);
    return { ok: true, data: data || null };
  }

  // 按来源销售订单生成发货草稿（POST /api/method/...make_delivery_note；B02 §1/§2.2）。
  async function makeDeliveryNote(sourceName) {
    const r = await request('/api/method/erpnext.selling.doctype.sales_order.sales_order.make_delivery_note', 'POST', { source_name: sourceName });
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    const data = (r.body && r.body.message !== undefined) ? r.body.message : (r.body && r.body.data);
    return { ok: true, data: data || null };
  }

  // 按来源采购订单生成收货草稿（POST /api/method/...make_purchase_receipt；B03 §1/§2.2）。
  async function makePurchaseReceipt(sourceName) {
    const r = await request('/api/method/erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt', 'POST', { source_name: sourceName });
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    const data = (r.body && r.body.message !== undefined) ? r.body.message : (r.body && r.body.data);
    return { ok: true, data: data || null };
  }

  // 盘点读现状（GET /api/method/...get_items；B04 F11，as-of-time 读 current_qty/valuation_rate）。
  // 注意：get_items(warehouse, posting_date, posting_time, company, item_code=None) 的 posting_date/posting_time 为
  //   无默认值的位置参数（仅 item_code 可选），省略会被 Python 拒绝（TypeError）。故 getItems 仅在调用方已提供
  //   postingDate+postingTime 时使用；缺省时调用方应改走 Bin/SLE 读现状（见 stock-reconciliation-plan.js）。
  async function getItems(opts) {
    opts = opts || {};
    const query = {
      warehouse: opts.warehouse,
      posting_date: opts.postingDate,
      posting_time: opts.postingTime,
      company: opts.company,
      item_code: opts.itemCode,
    };
    const r = await request('/api/method/erpnext.stock.doctype.stock_reconciliation.stock_reconciliation.get_items' + qs(query));
    if (r.unreachable) return { ok: false, error: backendUnavailable() };
    if (!r.ok) return { ok: false, error: translateBackendError(r.body, r.status) };
    const data = (r.body && r.body.message !== undefined) ? r.body.message : (r.body && r.body.data);
    return { ok: true, data: data || [] };
  }

  return { getList, get, getCount, create, update, submit, save, makeDeliveryNote, makePurchaseReceipt, getItems };
}

module.exports = { createBackendClient };
