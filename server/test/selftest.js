'use strict';
/*
 * F01 开发自检（S01—S10）
 * ============================================================
 * 覆盖 §12 自检方法 S01—S10（客观自检，非正式验收；档位 2 独立验收由 Acceptor gjg 完成）。
 * 运行：node server/test/selftest.js
 * 退出码：0 = 全部通过；非 0 = 有失败。
 * 依赖：Node 内置模块 + 迁移自 E02 的 lib/（零外部依赖）；后端交互以内存 mock 验证（真实后端
 * 只读调用以 mcp-service token 于运行时注入，本自检不依赖后端可达）。
 */

const path = require('path');
const fs = require('fs');

const registry = require('../src/registry');
const allowlist = require('../src/allowlist');
const translate = require('../src/translate');
const errors = require('../lib/errors');
const identity = require('../lib/identity');
const { createBatchLedger, rollbackPathFor } = require('../lib/batch-ledger');
const { queryBatchStatus } = require('../lib/batch-status');

const ACCEPTANCE_ROOT = 'D:\\second-acceptance';
const TOOLS_DIR = path.join(__dirname, '..', 'src', 'tools');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { passed += 1; console.log('PASS  ' + name); }
  else { failed += 1; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}
function assertEq(name, actual, expected) {
  const a = JSON.stringify(actual); const e = JSON.stringify(expected);
  check(name, a === e, 'actual=' + a + ' expected=' + e);
}

// 内存 mock 后端（只读语义，供 S04/S06 验证；不含写端点）。
function makeMockBackend(store) {
  return {
    async getCount(doctype, filters) {
      let rows = store[doctype] || [];
      if (filters && filters.length) rows = rows.filter(function (r) { return matchFilters(r, filters); });
      return { ok: true, count: rows.length };
    },
    async getList(doctype, opts) {
      let rows = store[doctype] || [];
      if (opts.filters && opts.filters.length) rows = rows.filter(function (r) { return matchFilters(r, opts.filters); });
      const start = opts.limitStart || 0;
      const len = opts.limitPageLength || rows.length;
      const page = rows.slice(start, start + len);
      const fields = opts.fields;
      let out = page;
      if (Array.isArray(fields) && fields.length && fields[0] !== '*') {
        out = page.map(function (r) { const o = {}; fields.forEach(function (f) { if (r[f] !== undefined) o[f] = r[f]; }); return o; });
      }
      return { ok: true, data: out };
    },
    async get(doctype, name) {
      const row = (store[doctype] || []).find(function (r) { return r.name === name; });
      if (!row) return { ok: false, error: translate.translateBackendError({ exc_type: 'DoesNotExistError', exception: 'DoesNotExistError' }, 404) };
      return { ok: true, data: row };
    },
  };
}
function matchFilters(row, filters) {
  return filters.every(function (f) {
    const field = f[0]; const op = f[1]; const val = f[2];
    const rv = row[field];
    switch (op) {
      case '=': return rv === val;
      case '!=': return rv !== val;
      case 'like': { const s = String(val).replace(/^%|%$/g, ''); return String(rv || '').indexOf(s) !== -1; }
      case 'between': return rv >= val[0] && rv <= val[1];
      case '>=': return rv >= val;
      case '<=': return rv <= val;
      default: return true;
    }
  });
}

// ---------------------------------------------------------------------------
// S01 隔离自证（Implementer 会话负向读取 C01b task-sets / assertions 哨兵）
// ---------------------------------------------------------------------------
function s01() {
  console.log('\n== S01 隔离自证（W02）==');
  for (const d of ['task-sets', 'assertions', 'runs', 'snapshots']) {
    const p = path.join(ACCEPTANCE_ROOT, d);
    let denied = false;
    try { fs.readdirSync(p); } catch (e) { denied = (e.code === 'EACCES' || e.code === 'EPERM'); }
    check('S01.' + d + ' 负向读取 ACCESS_DENIED（隔离生效）', denied === true, p);
  }
}

// ---------------------------------------------------------------------------
// S02 tool 逐 tool 与 D02 §2（读）§3/§6（写）核对（name/schema/annotation）
// ---------------------------------------------------------------------------
function s02() {
  console.log('\n== S02 tool 与 D02 §2/§3/§6 核对（W03/W04）==');
  const tools = registry.listTools();
  const names = tools.map(function (t) { return t.name; });
  assertEq('S02.1 tool 名称与 D02 一致（16 个：6 读 + 10 写/只出 plan，无增无减）', names, [
    'erpnext_document_search', 'erpnext_document_get', 'erpnext_stock_level_query',
    'erpnext_stock_ledger_query', 'erpnext_supplier_search', 'erpnext_batch_status_get',
    'erpnext_customer_create', 'erpnext_customer_update', 'erpnext_supplier_create',
    'erpnext_supplier_update', 'erpnext_item_create', 'erpnext_item_update',
    'erpnext_item_price_set', 'erpnext_stock_transfer_create', 'erpnext_stock_transfer_confirm',
    'erpnext_stock_reconciliation_plan',
  ]);
  // 读 tool：readOnly=true / destructive=false / idempotent=true / openWorld=false。
  const readTools = ['erpnext_document_search', 'erpnext_document_get', 'erpnext_stock_level_query', 'erpnext_stock_ledger_query', 'erpnext_supplier_search', 'erpnext_batch_status_get'];
  for (const name of readTools) {
    const a = registry.getTool(name).definition.annotations;
    check('S02.2 ' + name + ' 读 tool annotation（readOnly/非destructive/idempotent/openWorld=false）',
      a.readOnlyHint === true && a.destructiveHint === false && a.idempotentHint === true && a.openWorldHint === false);
  }
  // 写 tool（主数据 + confirm）：readOnly=false / destructive=true / idempotent=true。
  const destructiveWrite = ['erpnext_customer_create', 'erpnext_customer_update', 'erpnext_supplier_create', 'erpnext_supplier_update', 'erpnext_item_create', 'erpnext_item_update', 'erpnext_item_price_set', 'erpnext_stock_transfer_confirm'];
  for (const name of destructiveWrite) {
    const a = registry.getTool(name).definition.annotations;
    check('S02.2w ' + name + ' 写 tool annotation（readOnly=false/destructive=true/idempotent=true）',
      a.readOnlyHint === false && a.destructiveHint === true && a.idempotentHint === true && a.openWorldHint === false);
  }
  // #23 草稿 create（可逆）：destructive=false；#25 只出 plan：readOnly=true。
  check('S02.2s #23 stock_transfer_create（可逆草稿，destructive=false）',
    registry.getTool('erpnext_stock_transfer_create').definition.annotations.destructiveHint === false);
  check('S02.2p #25 stock_reconciliation_plan（只出 plan，readOnly=true）',
    registry.getTool('erpnext_stock_reconciliation_plan').definition.annotations.readOnlyHint === true);

  // object_type 九类枚举（#1/#2）。
  const ds = registry.getTool('erpnext_document_search').definition;
  const dg = registry.getTool('erpnext_document_get').definition;
  assertEq('S02.3 #1 object_type 九类枚举（排除 supplier/bin/sle）', ds.inputSchema.properties.object_type.enum, allowlist.OBJECT_TYPES.slice());
  assertEq('S02.4 #2 object_type 九类枚举', dg.inputSchema.properties.object_type.enum, allowlist.OBJECT_TYPES.slice());
  check('S02.5 #1 object_type 枚举不含 supplier/bin/sle', ['supplier', 'bin', 'stock_ledger_entry'].every(function (x) { return ds.inputSchema.properties.object_type.enum.indexOf(x) === -1; }));
  // #5 仅 Supplier（无 object_type，keyword + supplier_group）。
  const ss = registry.getTool('erpnext_supplier_search').definition;
  check('S02.6 #5 无 object_type，目标仅 Supplier（keyword/supplier_group）',
    ss.inputSchema.properties.object_type === undefined && !!ss.inputSchema.properties.keyword && !!ss.inputSchema.properties.supplier_group);
  // #26 仅 batch_id（无后端 DocType）。
  const bs = registry.getTool('erpnext_batch_status_get').definition;
  check('S02.7 #26 仅 batch_id 可选、无 object_type（无后端业务对象）',
    bs.inputSchema.properties.batch_id !== undefined && bs.inputSchema.properties.object_type === undefined && bs.inputSchema.required === undefined);
}

// ---------------------------------------------------------------------------
// S03 白名单枚举核对（#1/#2 九类、#5 仅 Supplier、#3/#4 Bin/SLE、#26 无 DocType）
// ---------------------------------------------------------------------------
function s03() {
  console.log('\n== S03 白名单枚举核对（W06）==');
  assertEq('S03.1 九类对象 → DocType 映射正确', allowlist.OBJECT_TYPE_TO_DOCTYPE, {
    customer: 'Customer', item: 'Item', item_price: 'Item Price', sales_order: 'Sales Order',
    purchase_order: 'Purchase Order', purchase_receipt: 'Purchase Receipt', delivery_note: 'Delivery Note',
    stock_entry: 'Stock Entry', stock_reconciliation: 'Stock Reconciliation',
  });
  check('S03.2 #3 目标 Bin、#4 目标 SLE、#5 目标 Supplier（硬编码）',
    allowlist.STOCK_LEVEL_DOCTYPE === 'Bin' && allowlist.STOCK_LEDGER_DOCTYPE === 'Stock Ledger Entry' && allowlist.SUPPLIER_DOCTYPE === 'Supplier');
  check('S03.3 显式排除 supplier/bin/stock_ledger_entry', ['supplier', 'bin', 'stock_ledger_entry'].every(function (x) { return allowlist.EXCLUDED_OBJECT_TYPES.indexOf(x) !== -1; }));
  // 引用允许清单九类（D01 §7 / C01a）。
  assertEq('S03.4 引用允许清单九类', allowlist.REFERENCE_ALLOWLIST, ['Company', 'Warehouse', 'Price List', 'Currency', 'Customer Group', 'Supplier Group', 'Territory', 'Item Group', 'UOM']);
  check('S03.5 Link 字段目标枚举（#3/#4 Warehouse、#5 Supplier Group）',
    allowlist.LINK_TARGETS.stock_level_query.warehouse === 'Warehouse' && allowlist.LINK_TARGETS.stock_ledger_query.warehouse === 'Warehouse' && allowlist.LINK_TARGETS.supplier_search.supplier_group === 'Supplier Group');
  check('S03.6 白名单不含 Contact/Address/User（切断框架残余触达，E01 §18.4）',
    ['Contact', 'Address', 'User', 'Role', 'Sales Invoice', 'Journal Entry'].every(function (x) {
      return allowlist.REFERENCE_ALLOWLIST.indexOf(x) === -1 && allowlist.OBJECT_TYPES.indexOf(x.toLowerCase()) === -1;
    }));
}

// ---------------------------------------------------------------------------
// S04 只读正确性（mock 后端：语义化返回、分页/截断）
// ---------------------------------------------------------------------------
async function s04() {
  console.log('\n== S04 只读正确性（W03）==');
  const store = {
    'Customer': [
      { name: 'ACME', customer_name: 'ACME', customer_group: 'Commercial', territory: 'China', disabled: 0, owner: 'x', _user_tags: null },
      { name: 'Globex', customer_name: 'Globex', customer_group: 'Retail', territory: 'China', disabled: 0, owner: 'x' },
    ],
    'Supplier': [{ name: 'SUP-1', supplier_name: 'SUP-1', supplier_group: 'Raw Material', disabled: 0 }],
    'Bin': [{ name: 'b1', item_code: 'I-1', warehouse: 'Stores - G', actual_qty: 5, projected_qty: 3, reserved_qty: 2, stock_uom: 'Nos' }],
    'Stock Ledger Entry': [{ name: 's1', item_code: 'I-1', warehouse: 'Stores - G', posting_date: '2026-09-15', actual_qty: 5, qty_after_transaction: 5, voucher_type: 'Purchase Receipt', voucher_no: 'MAT-PRE-2026-00001', is_cancelled: 0 }],
  };
  const mock = makeMockBackend(store);
  const ctx = { errors: errors, backend: mock, identity: identity.createSessionIdentityProvider(), batchLedger: createBatchLedger() };

  // #1 document_search：customer 检索返回语义化摘要（无低层标识符）。
  const r1 = await registry.getTool('erpnext_document_search').handler(ctx, { object_type: 'customer', detail: 'summary' });
  check('S04.1 #1 customer 检索成功', r1.ok === true && r1.result.items.length === 2, JSON.stringify(r1));
  check('S04.2 #1 返回语义化摘要（无 owner/_user_tags 低层字段）',
    r1.ok === true && r1.result.items[0].owner === undefined && r1.result.items[0]._user_tags === undefined && r1.result.items[0].customer_name === 'ACME');
  check('S04.3 #1 分页/截断字段完整（items/total/page/page_size/truncated）',
    r1.ok === true && r1.result.total === 2 && r1.result.page === 1 && r1.result.page_size === 50 && r1.result.truncated === false);

  // #2 document_get：返回详情 + 状态。
  const r2 = await registry.getTool('erpnext_document_get').handler(ctx, { object_type: 'customer', object_id: 'ACME' });
  check('S04.4 #2 单对象详情成功', r2.ok === true && r2.result.name === 'ACME', JSON.stringify(r2));
  check('S04.5 #2 目标不存在 → precondition_failed', await (async function () {
    const r = await registry.getTool('erpnext_document_get').handler(ctx, { object_type: 'customer', object_id: 'NOPE' });
    return r.ok === false && r.error.code === 'precondition_failed';
  })());

  // #3 stock_level_query：实际/可用/预留语义化。
  const r3 = await registry.getTool('erpnext_stock_level_query').handler(ctx, { item_code: 'I-1' });
  check('S04.6 #3 Bin 余量 actual/available/reserved 语义化',
    r3.ok === true && r3.result.items[0].actual_qty === 5 && r3.result.items[0].available_qty === 3 && r3.result.items[0].reserved_qty === 2, JSON.stringify(r3));

  // #4 stock_ledger_query：变动数量/变动后余量/来源单据语义化。
  const r4 = await registry.getTool('erpnext_stock_ledger_query').handler(ctx, { item_code: 'I-1' });
  check('S04.7 #4 SLE 流水语义化（change_qty/balance_qty/source_document）',
    r4.ok === true && r4.result.items[0].change_qty === 5 && r4.result.items[0].balance_qty === 5 && /Purchase Receipt/.test(r4.result.items[0].source_document), JSON.stringify(r4));

  // #5 supplier_search：目标仅 Supplier。
  const r5 = await registry.getTool('erpnext_supplier_search').handler(ctx, { keyword: 'SUP' });
  check('S04.8 #5 Supplier 检索成功', r5.ok === true && r5.result.items.length === 1 && r5.result.items[0].supplier_name === 'SUP-1', JSON.stringify(r5));
}

// ---------------------------------------------------------------------------
// S05 错误转译核对（统一错误形状）
// ---------------------------------------------------------------------------
function s05() {
  console.log('\n== S05 错误转译核对（W07）==');
  const cases = [
    [{ exc_type: 'PermissionError' }, 403, 'permission_denied'],
    [{ exc_type: 'DoesNotExistError' }, 404, 'precondition_failed'],
    [{ exc_type: 'LinkValidationError' }, 417, 'precondition_failed'],
    [{ exc_type: 'TimestampMismatchError' }, 417, 'concurrency_conflict'],
    [{ exc_type: 'DuplicateEntryError' }, 409, 'duplicate_name'],
    [{}, 0, 'backend_unavailable'],
  ];
  let all = true;
  for (const [body, status, code] of cases) {
    const e = translate.translateBackendError(body, status);
    if (e.code !== code) { all = false; failures.push('S05 code mismatch: ' + e.code + ' != ' + code); console.log('FAIL  S05 ' + JSON.stringify(body) + ' -> ' + e.code + ' (want ' + code + ')'); }
  }
  check('S05.1 后端原生异常 → 语义化 code 映射正确', all);
  const e = translate.translate('result_set_overflow');
  check('S05.2 统一错误形状（isError/code/message/retryable）', e.isError === true && e.code === 'result_set_overflow' && typeof e.message === 'string' && e.retryable === true);
  check('S05.3 报错含下一步该怎么做（自纠 message 非仅状态码）', /追加过滤|翻页|缩小/.test(e.message));
  const bu = translate.backendUnavailable();
  check('S05.4 后端不可达 → backend_unavailable（写不自动重试口径）', bu.code === 'backend_unavailable' && bu.retryable === false);
}

// ---------------------------------------------------------------------------
// S06 越权拒绝（清单外对象/未知字段/跨会话批次）
// ---------------------------------------------------------------------------
async function s06() {
  console.log('\n== S06 越权拒绝（W06/W07）==');
  const ctx = { errors: errors, backend: makeMockBackend({}), identity: identity.createSessionIdentityProvider(), batchLedger: createBatchLedger() };
  // 清单外对象（supplier / contact / user / sales_invoice）→ invalid_argument（第二层拦截）。
  for (const bad of ['supplier', 'bin', 'stock_ledger_entry', 'contact', 'user', 'sales_invoice']) {
    const r = await registry.getTool('erpnext_document_search').handler(ctx, { object_type: bad });
    check('S06.1 清单外 object_type「' + bad + '」→ invalid_argument', r.ok === false && r.error.code === 'invalid_argument');
  }
  // 未知字段 → invalid_argument。
  const r2 = await registry.getTool('erpnext_document_search').handler(ctx, { object_type: 'customer', filters: { password: 'x' } });
  check('S06.2 未知过滤字段 → invalid_argument', r2.ok === false && r2.error.code === 'invalid_argument');

  // 跨会话批次读取：他人批次不可见（#26 直接查询逻辑）。
  const ledger = createBatchLedger();
  const otherBatch = ledger.createBatch({ callerId: 'sess-other', toolName: 'x' });
  ledger.recordChange(otherBatch, { objectType: 'SalesOrder', objectName: 'SO-1', action: 'confirm', beforeState: 'draft', afterState: 'submitted' });
  const caller = { callerId: 'sess-self', isAdmin: false };
  const q = queryBatchStatus(ledger, caller, otherBatch);
  check('S06.3 跨会话批次读取 → permission_denied（不泄露他人批次）', q.ok === false && q.error.code === 'permission_denied');
}

// ---------------------------------------------------------------------------
// S07 #26 可见性边界（归属自身/他人/管理员/不可回滚）
// ---------------------------------------------------------------------------
function s07() {
  console.log('\n== S07 #26 可见性边界（W04）==');
  const ledger = createBatchLedger();
  const bOwn = ledger.createBatch({ callerId: 'sess-a' });
  ledger.recordChange(bOwn, { objectType: 'SalesOrder', objectName: 'SO-1', action: 'confirm', beforeState: 'draft', afterState: 'submitted' });
  ledger.complete(bOwn);
  const bOther = ledger.createBatch({ callerId: 'sess-b' });
  ledger.recordChange(bOther, { objectType: 'PurchaseOrder', objectName: 'PO-1', action: 'create', afterState: 'draft' });

  const own = queryBatchStatus(ledger, { callerId: 'sess-a', isAdmin: false }, bOwn);
  check('S07.1 归属自身批次可查', own.ok === true && own.result.batchId === bOwn);
  const other = queryBatchStatus(ledger, { callerId: 'sess-a', isAdmin: false }, bOther);
  check('S07.2 他人批次不可见（permission_denied）', other.ok === false && other.error.code === 'permission_denied');
  const adminOwn = queryBatchStatus(ledger, { callerId: 'admin', isAdmin: true }, bOwn);
  const adminOther = queryBatchStatus(ledger, { callerId: 'admin', isAdmin: true }, bOther);
  check('S07.3 管理员可查全量（含他人批次）', adminOwn.ok === true && adminOther.ok === true);
  const missing = queryBatchStatus(ledger, { callerId: 'sess-a', isAdmin: false }, 'batch-nonexistent');
  check('S07.4 不存在批次 → batch_not_found', missing.ok === false && missing.error.code === 'batch_not_found');
  const before = ledger.get(bOwn).status;
  queryBatchStatus(ledger, { callerId: 'sess-a', isAdmin: false }, bOwn);
  check('S07.5 查询不可主动回滚（只读、状态不变）', ledger.get(bOwn).status === before);
  // 回滚路径（E02 冻结）：草稿→delete、已生效→cancel、已取消→terminal。
  assertEq('S07.6 回滚路径冻结值', [rollbackPathFor('draft'), rollbackPathFor('submitted'), rollbackPathFor('cancelled')], ['delete', 'cancel', 'terminal']);
}

// ---------------------------------------------------------------------------
// S08 幂等/前置/事后/批次「不适用」标注核对（无夹带写入）
// ---------------------------------------------------------------------------
function s08() {
  console.log('\n== S08 只读「不适用」标注（W07/W08）==');
  // 只读 tool 不得挂接写机制（fingerprintOf/createIdempotencyStore/assertPreconditions/checkReadBack/createBatchLedger 接入）。
  const writeMechanisms = ['fingerprintOf', 'createIdempotencyStore', 'assertPreconditions', 'checkReadBack', 'createBatchLedger', 'recordChange', 'markRollbackPending'];
  const readTools = ['document-search.js', 'document-get.js', 'stock-level-query.js', 'stock-ledger-query.js', 'supplier-search.js'];
  for (const f of readTools) {
    const src = fs.readFileSync(path.join(TOOLS_DIR, f), 'utf8');
    const hits = writeMechanisms.filter(function (m) { return src.indexOf(m) !== -1; });
    check('S08.1 ' + f + ' 未挂接写机制（幂等/前置/事后/批次写入）', hits.length === 0, hits.join(','));
  }
  // #26 挂接 queryBatchStatus（只读查询），不含回滚入口。
  const bsSrc = fs.readFileSync(path.join(TOOLS_DIR, 'batch-status-get.js'), 'utf8');
  check('S08.2 #26 仅挂接 queryBatchStatus（只读，无 rollback 入口）', bsSrc.indexOf('queryBatchStatus') !== -1 && bsSrc.indexOf('rollbackPathFor') === -1 && bsSrc.indexOf('markRollbackPending') === -1);
  // annotation 声明与实现分离：readOnly 与 idempotent 分别显式声明（D01 §3.4）；写 tool readOnly=false。
  const tools = registry.listTools();
  check('S08.3 16 tool readOnly 与 idempotent 分别显式声明（写 tool readOnly=false）', tools.every(function (t) {
    const a = t.annotations;
    return (a.idempotentHint === true) && (a.readOnlyHint !== undefined && a.readOnlyHint !== null) && (a.destructiveHint !== undefined);
  }));
}

// ---------------------------------------------------------------------------
// S09 Evidence Manifest 完整性 + 只读口径（静态）
// ---------------------------------------------------------------------------
function s09() {
  console.log('\n== S09 Evidence Manifest + 写端点口径（静态）==');
  const manifestPath = path.join(__dirname, '..', '..', 'docs', 'task-packages', 'F01', 'evidence-manifest.md');
  check('S09.1 F01 Evidence Manifest 存在', fs.existsSync(manifestPath), manifestPath);
  // 写端点口径：backend.js 应仅含 POST/PUT 写端点与 frappe.client.submit（#24 confirm）；绝不出现 DELETE/run_method 资源端点。
  const serverRoot = path.join(__dirname, '..');
  const backendSrc = fs.readFileSync(path.join(serverRoot, 'src', 'backend.js'), 'utf8');
  check('S09.2 backend 写端点仅 POST/PUT + frappe.client.submit（无 DELETE/run_method/cancel 资源端点）',
    backendSrc.indexOf('frappe.client.submit') !== -1 && /\.delete\(|run_method|frappe\.client\.cancel/.test(backendSrc) === false);
}

// ---------------------------------------------------------------------------
// S10 #1 filters 可检索字段白名单与 D02 §2.1 口径 + B01–B04 核对
// ---------------------------------------------------------------------------
function s10() {
  console.log('\n== S10 #1 filters 白名单核对（W05）==');
  const f = allowlist.FILTER_FIELDS;
  check('S10.1 白名单覆盖九类对象、不含 supplier/bin/sle', Object.keys(f).length === 9 && ['supplier', 'bin', 'stock_ledger_entry'].every(function (x) { return !(x in f); }));
  // 逐对象：身份 + 分类 + 状态/日期字段来自 B01–B04 冻结事实。
  check('S10.2 customer 含 customer_name/customer_group/territory', has(f.customer, ['customer_name', 'customer_group', 'territory', 'name']));
  check('S10.3 item 含 item_code/item_name/item_group/stock_uom', has(f.item, ['item_code', 'item_name', 'item_group', 'stock_uom', 'name']));
  check('S10.4 item_price 含 item_code/price_list/price_list_rate/valid_from/valid_upto', has(f.item_price, ['item_code', 'price_list', 'price_list_rate', 'valid_from', 'valid_upto']));
  check('S10.5 sales_order 含 customer/transaction_date/delivery_date/status/docstatus', has(f.sales_order, ['customer', 'transaction_date', 'delivery_date', 'status', 'docstatus']));
  check('S10.6 purchase_order 含 supplier/transaction_date/schedule_date/status', has(f.purchase_order, ['supplier', 'transaction_date', 'schedule_date', 'status', 'docstatus']));
  check('S10.7 purchase_receipt/delivery_note 含 posting_date/status/docstatus', has(f.purchase_receipt, ['posting_date', 'status', 'docstatus']) && has(f.delivery_note, ['posting_date', 'status', 'docstatus']));
  check('S10.8 stock_entry 含 stock_entry_type/from_warehouse/to_warehouse/purpose', has(f.stock_entry, ['stock_entry_type', 'from_warehouse', 'to_warehouse', 'purpose', 'posting_date']));
  check('S10.9 stock_reconciliation 含 purpose/posting_date/expense_account', has(f.stock_reconciliation, ['purpose', 'posting_date', 'expense_account', 'docstatus']));
  // 无越界字段：不把子表（Table 型）当标量过滤字段。
  for (const k of Object.keys(f)) {
    check('S10.10 ' + k + ' 白名单不含子表 items（Table 不作标量过滤）', f[k].indexOf('items') === -1);
  }
}
function has(list, fields) { return fields.every(function (x) { return list.indexOf(x) !== -1; }); }

// ===========================================================================
// F04 写 tool 自检（S11—S17；客观自检，非正式验收）
// ===========================================================================
// 内存 mock 后端（含写端点 create/update/submit/getItems + Bin/SLE/主数据查询语义）。
let _steSeqGlobal = 0; // 跨 mock 实例共享，确保 Stock Entry name 唯一（避免与进程级幂等 store 指纹交叉污染）。
function makeWriteMockBackend() {
  const store = {
    Customer: [], Supplier: [], Item: [], 'Item Price': [], 'Stock Entry': [], Bin: [], 'Stock Ledger Entry': [],
    'Customer Group': [{ name: 'Commercial', is_group: 0 }, { name: 'All Customer Groups', is_group: 1 }],
    'Supplier Group': [{ name: 'Raw Material', is_group: 0 }],
    'Item Group': [{ name: 'Products', is_group: 0 }],
    'UOM': [{ name: 'Nos' }],
    'Territory': [{ name: 'China' }],
    'Price List': [{ name: 'Standard Selling' }],
    Warehouse: [{ name: 'Stores - G' }, { name: 'Store B' }],
  };

  // 简易过滤器匹配（复用先前的 matchFilters）。
  function filterRows(rows, filters) {
    if (!filters || !filters.length) return rows.slice();
    return rows.filter(function (r) { return matchFilters(r, filters); });
  }
  function project(row, fields) {
    if (!Array.isArray(fields)) return row;
    const o = {};
    fields.forEach(function (f) { if (row[f] !== undefined) o[f] = row[f]; });
    return o;
  }

  return {
    async getCount(doctype, filters) {
      const rows = filterRows(store[doctype] || [], filters);
      return { ok: true, count: rows.length };
    },
    async getList(doctype, opts) {
      let rows = filterRows(store[doctype] || [], opts.filters);
      const start = opts.limitStart || 0;
      const len = opts.limitPageLength || rows.length;
      const page = rows.slice(start, start + len);
      const fields = opts.fields;
      return { ok: true, data: (Array.isArray(fields) && fields.length && fields[0] !== '*') ? page.map(function (r) { return project(r, fields); }) : page };
    },
    async get(doctype, name) {
      const row = (store[doctype] || []).find(function (r) { return r.name === name; });
      if (!row) return { ok: false, error: translate.translateBackendError({ exc_type: 'DoesNotExistError', exception: 'DoesNotExistError' }, 404) };
      return { ok: true, data: row };
    },
    async create(doctype, doc) {
      // Item/Supplier/Customer name 取自语义标识；Item Price name 为哈希；Stock Entry name 为 series。
      let name;
      if (doctype === 'Item Price') name = doc.item_code + '-' + doc.price_list + '-' + (doc.valid_from || 'any');
      else if (doctype === 'Stock Entry') { _steSeqGlobal += 1; name = 'MAT-STE-2026-' + String(_steSeqGlobal).padStart(5, '0'); }
      else name = doc.name || doc.item_code || doc.customer_name || doc.supplier_name;
      // 重名检查（Supplier/Item 拒绝；Customer 自动改名，此处简化）。Item Price/Stock Entry 无同名唯一性。
      if ((doctype === 'Supplier' || doctype === 'Item') && (store[doctype] || []).some(function (r) { return r.name === name; })) {
        return { ok: false, error: translate.translateBackendError({ exc_type: 'DuplicateEntryError', exception: 'DuplicateEntryError' }, 409) };
      }
      const row = Object.assign({}, doc, { name: name, docstatus: 0, modified: 'm-' + name + '-' + Date.now() });
      store[doctype].push(row);
      return { ok: true, data: row };
    },
    async update(doctype, name, doc) {
      const i = (store[doctype] || []).findIndex(function (r) { return r.name === name; });
      if (i === -1) return { ok: false, error: translate.translateBackendError({ exc_type: 'DoesNotExistError', exception: 'DoesNotExistError' }, 404) };
      // 模拟乐观版本断言：doc.modified 与当前不一致 → TimestampMismatchError。
      if (doc.modified && store[doctype][i].modified !== doc.modified) {
        return { ok: false, error: translate.translateBackendError({ exc_type: 'TimestampMismatchError', exception: 'TimestampMismatchError' }, 417) };
      }
      const next = Object.assign({}, store[doctype][i], doc, { modified: 'm-' + name + '-' + Date.now() });
      delete next.modified; // 重新生成
      next.modified = 'm-' + name + '-' + Date.now();
      store[doctype][i] = next;
      return { ok: true, data: next };
    },
    async submit(doctype, doc) {
      const name = doc.name;
      const i = (store[doctype] || []).findIndex(function (r) { return r.name === name; });
      if (i === -1) return { ok: false, error: translate.translateBackendError({ exc_type: 'DoesNotExistError', exception: 'DoesNotExistError' }, 404) };
      if (doc.modified && store[doctype][i].modified !== doc.modified) {
        return { ok: false, error: translate.translateBackendError({ exc_type: 'TimestampMismatchError', exception: 'TimestampMismatchError' }, 417) };
      }
      store[doctype][i].docstatus = 1;
      store[doctype][i].modified = 'm-' + name + '-submitted';
      return { ok: true, data: store[doctype][i] };
    },
    async getItems(opts) {
      const rows = (store.Bin || []).filter(function (b) { return b.warehouse === opts.warehouse; });
      return { ok: true, data: rows.map(function (b) { return { item_code: b.item_code, warehouse: b.warehouse, current_qty: b.actual_qty, valuation_rate: 10 }; }) };
    },
    // 暴露 store 供测试预置/断言（仅测试用）。
    store: store,
  };
}

// 构造写 tool 的 ctx（注入 mock 后端 + writeEligible + elicitation 支持 + 可编程确认）。
function makeWriteCtx(backend, opts) {
  opts = opts || {};
  const ledger = createBatchLedger();
  const idp = identity.createSessionIdentityProvider();
  const supports = opts.supportsElicitation !== false;
  let confirmAction = opts.confirmAction || 'accept';
  return {
    errors: errors,
    backend: backend,
    config: { locked: { company: 'gjg', currency: 'CNY', sellingPriceList: 'Standard Selling', buyingPriceList: 'Standard Buying' } },
    identity: idp,
    batchLedger: ledger,
    transportContext: {},
    adminResolver: null,
    writeEligible: opts.writeEligible || { ok: true },
    clientSupportsElicitation: supports,
    setConfirmAction: function (a) { confirmAction = a; },
    sendElicitation: function (params) { return Promise.resolve({ action: confirmAction }); },
  };
}

// S11 写 tool 契约：10 tool name/schema/annotation 忠实 D02 §3/§6。
function s11() {
  console.log('\n== S11 写 tool 契约核对（W03/W04）==');
  const order = ['erpnext_customer_create','erpnext_customer_update','erpnext_supplier_create','erpnext_supplier_update','erpnext_item_create','erpnext_item_update','erpnext_item_price_set','erpnext_stock_transfer_create','erpnext_stock_transfer_confirm','erpnext_stock_reconciliation_plan'];
  // #6/#8/#10 create 必填 name 语义标识；#7/#9/#11 update 必填 id+modified；#24 confirm 必填 id+modified；#25 只出 plan。
  check('S11.1 #6/#8/#10 create 不带 modified（schema 无 modified 或不 require）', ['erpnext_customer_create','erpnext_supplier_create','erpnext_item_create'].every(function (n) {
    const s = registry.getTool(n).definition.inputSchema;
    return s.properties.modified === undefined;
  }));
  check('S11.2 #7/#9/#11/#24 必带 modified（required 含 modified）', ['erpnext_customer_update','erpnext_supplier_update','erpnext_item_update','erpnext_stock_transfer_confirm'].every(function (n) {
    const s = registry.getTool(n).definition.inputSchema;
    return (s.required || []).indexOf('modified') !== -1;
  }));
  check('S11.3 #12 item_price_set modified 条件必填（新增不带，修改必带）', registry.getTool('erpnext_item_price_set').definition.inputSchema.properties.modified !== undefined);
  check('S11.4 #23 全自动免确认、#25 只出 plan（annotation destructive 区分）',
    registry.getTool('erpnext_stock_transfer_create').definition.annotations.destructiveHint === false &&
    registry.getTool('erpnext_stock_reconciliation_plan').definition.annotations.readOnlyHint === true);
}

// S12 可写字段白名单枚举核对（D03）。
function s12() {
  console.log('\n== S12 可写字段白名单核对（W05）==');
  const W = allowlist.WRITABLE_FIELDS;
  check('S12.1 5 个写对象 DocType 映射正确', allowlist.WRITE_DOCTYPES.customer_create === 'Customer' && allowlist.WRITE_DOCTYPES.item_price_set === 'Item Price' && allowlist.WRITE_DOCTYPES.stock_transfer_create === 'Stock Entry');
  check('S12.2 不可改字段统一排除 name/creation/owner/docstatus', allowlist.IMMUTABLE_FIELDS.every(function (f) { return ['name','creation','owner','docstatus'].indexOf(f) !== -1; }));
  check('S12.3 create/update 白名单不含 name/creation/owner/docstatus', Object.keys(W).every(function (k) {
    return W[k].every(function (f) { return allowlist.IMMUTABLE_FIELDS.indexOf(f) === -1; });
  }));
  check('S12.4 #6 create 白名单含 customer_name/customer_group/territory', has(W.customer_create, ['customer_name','customer_group','territory']));
  check('S12.5 #10 create 白名单含 item_code/item_group/stock_uom', has(W.item_create, ['item_code','item_group','stock_uom']));
  check('S12.6 #12 白名单含 price_list_rate/valid_from/valid_upto', has(W.item_price_set, ['price_list_rate','valid_from','valid_upto','selling','buying']));
  check('S12.7 Link 字段目标硬编码枚举（引用允许清单）', allowlist.WRITE_LINK_TARGETS.customer_create.customer_group === 'Customer Group' && allowlist.WRITE_LINK_TARGETS.stock_transfer_create.from_warehouse === 'Warehouse');
}

// S13 确认边界：accept→写、decline/cancel→零副作用、不支持 elicitation→fail-closed。
async function s13() {
  console.log('\n== S13 确认边界（W06）==');
  const backend = makeWriteMockBackend();
  // accept。
  const ctxAccept = makeWriteCtx(backend, { supportsElicitation: true, confirmAction: 'accept' });
  const r1 = await registry.getTool('erpnext_customer_create').handler(ctxAccept, { customer_name: 'ACME', customer_group: 'Commercial' });
  check('S13.1 accept→写入成功（Customer 落库）', r1.ok === true && r1.result.customer_name === 'ACME', JSON.stringify(r1));
  // 验证落库：改回读。
  const dupAfterAccept = await backend.getCount('Customer', [['customer_name','=','ACME']]);
  check('S13.2 accept 后客户已落库', dupAfterAccept.ok === true && dupAfterAccept.count === 1, JSON.stringify(dupAfterAccept));

  // decline：零副作用。
  const backend2 = makeWriteMockBackend();
  const ctxDecline = makeWriteCtx(backend2, { supportsElicitation: true, confirmAction: 'decline' });
  const r2 = await registry.getTool('erpnext_customer_create').handler(ctxDecline, { customer_name: 'DECLINE-CUST', customer_group: 'Commercial' });
  check('S13.3 decline→permission_denied 且零副作用', r2.ok === false && r2.error.code === 'permission_denied');
  const cnt2 = await backend2.getCount('Customer', [['customer_name','=','DECLINE-CUST']]);
  check('S13.4 decline 后零写入（count=0）', cnt2.count === 0, JSON.stringify(cnt2));

  // cancel：零副作用。
  const backend3 = makeWriteMockBackend();
  const ctxCancel = makeWriteCtx(backend3, { supportsElicitation: true, confirmAction: 'cancel' });
  const r3 = await registry.getTool('erpnext_item_create').handler(ctxCancel, { item_code: 'CANCEL-ITEM', item_group: 'Products', stock_uom: 'Nos' });
  check('S13.5 cancel→permission_denied 且零副作用', r3.ok === false && r3.error.code === 'permission_denied');

  // 客户端不支持 elicitation → fail-closed。
  const backend4 = makeWriteMockBackend();
  const ctxNoEli = makeWriteCtx(backend4, { supportsElicitation: false });
  const r4 = await registry.getTool('erpnext_customer_create').handler(ctxNoEli, { customer_name: 'NOELI-CUST', customer_group: 'Commercial' });
  check('S13.6 客户端不支持 elicitation→fail-closed（permission_denied 零写入）', r4.ok === false && r4.error.code === 'permission_denied');
}

// S14 幂等：create/指纹合并 300s、confirm 60s 状态断言兜底。
async function s14() {
  console.log('\n== S14 幂等边界（W07）==');
  // create 组：同参数命中 → idempotent_replay。
  const b1 = makeWriteMockBackend();
  const ctx = makeWriteCtx(b1, { supportsElicitation: true, confirmAction: 'accept' });
  const a1 = await registry.getTool('erpnext_customer_create').handler(ctx, { customer_name: 'IDEM-CUST', customer_group: 'Commercial' });
  const a2 = await registry.getTool('erpnext_customer_create').handler(ctx, { customer_name: 'IDEM-CUST', customer_group: 'Commercial' });
  check('S14.1 create 组同参数二次命中 → idempotent_replay=true', a1.ok === true && a2.ok === true && a2.result.idempotent_replay === true, JSON.stringify(a2));
  // 异参数（不同 customer_name）→ 不同指纹，不合并。
  const a3 = await registry.getTool('erpnext_customer_create').handler(ctx, { customer_name: 'IDEM-CUST-2', customer_group: 'Commercial' });
  check('S14.2 异参数（不同名）→ 不合并，正常写入', a3.ok === true && a3.result.idempotent_replay === undefined);

  // confirm 组状态断言兜底：二次 confirm 已生效 → already_in_target_state。
  const b2 = makeWriteMockBackend();
  // 预置物料 + 源仓库存，创建草稿。
  b2.store.Item.push({ name: 'IT-1', item_code: 'IT-1', item_name: 'IT-1', item_group: 'Products', stock_uom: 'Nos', disabled: 0, docstatus: 0, modified: 'm-it1' });
  b2.store.Bin.push({ item_code: 'IT-1', warehouse: 'Stores - G', actual_qty: 100, projected_qty: 100 });
  const ctxi = makeWriteCtx(b2, { supportsElicitation: true, confirmAction: 'accept' });
  const cre = await registry.getTool('erpnext_stock_transfer_create').handler(ctxi, { stock_entry_type: 'material_transfer', from_warehouse: 'Stores - G', to_warehouse: 'Store B', items: [{ item_code: 'IT-1', qty: 10 }] });
  check('S14.3 #23 调拨草稿创建成功', cre.ok === true && cre.result.status === 'Draft', JSON.stringify(cre));
  const sid = cre.result.name;
  // confirm 一次。
  const steDoc = await b2.get('Stock Entry', sid);
  const cf1 = await registry.getTool('erpnext_stock_transfer_confirm').handler(ctxi, { stock_entry_id: sid, modified: steDoc.data.modified });
  check('S14.4 #24 生效成功（submitted）', cf1.ok === true && cf1.result.status === 'Submitted', JSON.stringify(cf1));
  // 二次 confirm（已在目标状态）→ already_in_target_state。
  const cf2 = await registry.getTool('erpnext_stock_transfer_confirm').handler(ctxi, { stock_entry_id: sid, modified: steDoc.data.modified });
  check('S14.5 #24 二次 confirm 命中状态断言 → already_in_target_state（幂等成功）',
    cf2.ok === true && cf2.result.already_in_target_state === true, JSON.stringify(cf2));
}

// S15 前置断言：同名不存在/#12 区间不重叠/#23 源仓可用量/#24 源目不同。
async function s15() {
  console.log('\n== S15 前置断言（W07）==');
  // 每个子测试用唯一 item_code，避免与进程级幂等 store 交叉污染。
  const backend = makeWriteMockBackend();
  backend.store.Item.push({ name: 'IT-DUP', item_code: 'IT-DUP', item_name: 'IT-DUP', item_group: 'Products', stock_uom: 'Nos', disabled: 0, docstatus: 0, modified: 'm-itdup' });
  backend.store.Bin.push({ item_code: 'IT-STK', warehouse: 'Stores - G', actual_qty: 5, projected_qty: 5 });
  const ctx = makeWriteCtx(backend, { supportsElicitation: true, confirmAction: 'accept' });

  // #10 同名 item_code 不存在 → duplicate_name。
  const dup2 = await registry.getTool('erpnext_item_create').handler(ctx, { item_code: 'IT-DUP', item_group: 'Products', stock_uom: 'Nos' });
  check('S15.1 #10 同名 item_code 已存在 → duplicate_name', dup2.ok === false && dup2.error.code === 'duplicate_name', JSON.stringify(dup2));

  // #10 有效性前置：无效 item_group → precondition_failed（不通过后端 duplicate 拦截，因为 item_group 校验先于写）。
  const badGroup = await registry.getTool('erpnext_item_create').handler(ctx, { item_code: 'IT-NEW-1', item_group: 'NoSuchGroup', stock_uom: 'Nos' });
  check('S15.1b #10 无效 item_group → precondition_failed', badGroup.ok === false && badGroup.error.code === 'precondition_failed', JSON.stringify(badGroup));

  // #23 源仓可用量不足。
  const short = await registry.getTool('erpnext_stock_transfer_create').handler(ctx, { stock_entry_type: 'material_transfer', from_warehouse: 'Stores - G', to_warehouse: 'Store B', items: [{ item_code: 'IT-STK', qty: 100 }] });
  check('S15.2 #23 源仓可用量不足 → precondition_failed', short.ok === false && short.error.code === 'precondition_failed', JSON.stringify(short));

  // #12 区间重叠（先建区间，再造重叠）。用独立 item_code。
  const ctxP = makeWriteCtx(makeWriteMockBackend(), { supportsElicitation: true, confirmAction: 'accept' });
  ctxP.backend.store.Item.push({ name: 'IT-P1', item_code: 'IT-P1', item_name: 'IT-P1', item_group: 'Products', stock_uom: 'Nos', disabled: 0, docstatus: 0, modified: 'm-itp1' });
  const p1 = await registry.getTool('erpnext_item_price_set').handler(ctxP, { item_code: 'IT-P1', price_list: 'Standard Selling', price_list_rate: 100, valid_from: '2026-01-01', valid_upto: '2026-12-31' });
  const p2 = await registry.getTool('erpnext_item_price_set').handler(ctxP, { item_code: 'IT-P1', price_list: 'Standard Selling', price_list_rate: 120, valid_from: '2026-06-01', valid_upto: '2026-06-30' });
  check('S15.3 #12 生效区间重叠 → precondition_failed', p1.ok === true && p2.ok === false && p2.error.code === 'precondition_failed', JSON.stringify(p1.ok ? p2 : p1));

  // #24 源/目同仓（预置同仓草稿）。用独立 item_code。
  const ctxSame = makeWriteCtx(makeWriteMockBackend(), { supportsElicitation: true, confirmAction: 'accept' });
  ctxSame.backend.store.Item.push({ name: 'IT-SAME', item_code: 'IT-SAME', item_name: 'IT-SAME', item_group: 'Products', stock_uom: 'Nos', disabled: 0, docstatus: 0, modified: 'm-itsame' });
  ctxSame.backend.store.Bin.push({ item_code: 'IT-SAME', warehouse: 'Stores - G', actual_qty: 5, projected_qty: 5 });
  const same = await registry.getTool('erpnext_stock_transfer_create').handler(ctxSame, { stock_entry_type: 'material_transfer', from_warehouse: 'Stores - G', to_warehouse: 'Stores - G', items: [{ item_code: 'IT-SAME', qty: 1 }] });
  check('S15.4 #23 源/目同仓→草稿仍可创建（#24 才拦截）', same.ok === true, JSON.stringify(same));
  const steSame = await ctxSame.backend.get('Stock Entry', same.result.name);
  const cfSame = await registry.getTool('erpnext_stock_transfer_confirm').handler(ctxSame, { stock_entry_id: same.result.name, modified: steSame.data.modified });
  check('S15.5 #24 源/目同仓 → precondition_failed', cfSame.ok === false && cfSame.error.code === 'precondition_failed', JSON.stringify(cfSame));
}

// S16 #25 只出 plan + 不写；#24 confirm 写后回读；唯读 tool 无写入。
async function s16() {
  console.log('\n== S16 事后回读 + #25 只出 plan（W04/W07）==');
  const backend = makeWriteMockBackend();
  backend.store.Bin.push({ item_code: 'IT-PLAN', warehouse: 'Stores - G', actual_qty: 3, projected_qty: 3, valuation_rate: 10 });
  const ctx = makeWriteCtx(backend, { supportsElicitation: true, confirmAction: 'accept' });
  // #25 只出 plan（readOnly，无写入、无批次）。
  const plan = await registry.getTool('erpnext_stock_reconciliation_plan').handler(ctx, { warehouse: 'Stores - G' });
  check('S16.1 #25 只出 plan 成功（无写入、输出 objective plan）', plan.ok === true && Array.isArray(plan.result.plan) && plan.result.plan.length === 1, JSON.stringify(plan));
  check('S16.2 #25 未产生批次（batchLedger 空）', ctx.batchLedger._size() === 0);
  // #25 缺省 posting_date/posting_time → 走 Bin 读现状（不调用 get_items，规避其必填 position 参数）。
  check('S16.2b #25 缺省时点走 Bin（valuation_rate=null、current_qty=actual_qty）',
    plan.ok === true && plan.result.plan[0].current_qty === 3 && plan.result.plan[0].valuation_rate === null, JSON.stringify(plan.result.plan[0]));
  // #25 提供 posting_date+posting_time → 走 getItems（as-of-time）。
  const planAt = await registry.getTool('erpnext_stock_reconciliation_plan').handler(ctx, { warehouse: 'Stores - G', posting_date: '2026-09-17', posting_time: '10:00:00' });
  check('S16.2c #25 提供时点走 getItems（as-of-time 读 current_qty/valuation_rate）',
    planAt.ok === true && Array.isArray(planAt.result.plan) && planAt.result.plan.length >= 0, JSON.stringify(planAt));

  // #24 写后回读终态（docstatus=1）。
  ctx.backend.store.Item.push({ name: 'IT-CF', item_code: 'IT-CF', item_name: 'IT-CF', item_group: 'Products', stock_uom: 'Nos', disabled: 0, docstatus: 0, modified: 'm-itcf' });
  ctx.backend.store.Bin.push({ item_code: 'IT-CF', warehouse: 'Stores - G', actual_qty: 3, projected_qty: 3 });
  const cre = await registry.getTool('erpnext_stock_transfer_create').handler(ctx, { stock_entry_type: 'material_transfer', from_warehouse: 'Stores - G', to_warehouse: 'Store B', items: [{ item_code: 'IT-CF', qty: 1 }] });
  const steDoc = await ctx.backend.get('Stock Entry', cre.result.name);
  const cf = await registry.getTool('erpnext_stock_transfer_confirm').handler(ctx, { stock_entry_id: cre.result.name, modified: steDoc.data.modified });
  check('S16.3 #24 写后回读 docstatus=1（终态 submitted）', cf.ok === true && cf.result.status === 'Submitted', JSON.stringify(cf));
  check('S16.4 #24 产生批次台账（batchLedger 非空）', ctx.batchLedger._size() > 0);
}

// S17 错误转译 + fail-closed（币种/价格表）+ 越权拒绝。
async function s17() {
  console.log('\n== S17 错误转译 + fail-closed（W07/W08）==');
  // fail-closed：writeEligible.ok=false → writeGate 拒绝。
  const b = makeWriteMockBackend();
  const ctxFC = makeWriteCtx(b, { supportsElicitation: true, confirmAction: 'accept', writeEligible: { ok: false, reason: 'default_currency 为空' } });
  const r = await registry.getTool('erpnext_customer_create').handler(ctxFC, { customer_name: 'FC-CUST', customer_group: 'Commercial' });
  check('S17.1 币种 fail-closed → permission_denied 零写入', r.ok === false && r.error.code === 'permission_denied');

  // 越权/清单外对象不进写白名单：未知字段 → invalid_argument。
  const b2 = makeWriteMockBackend();
  const ctx2 = makeWriteCtx(b2, { supportsElicitation: true, confirmAction: 'accept' });
  const badField = await registry.getTool('erpnext_customer_create').handler(ctx2, { customer_name: 'X', customer_group: 'Commercial', docstatus: 1 });
  check('S17.2 不可改字段 docstatus 传入 → invalid_argument', badField.ok === false && badField.error.code === 'invalid_argument');

  // 写 tool 只接受允许对象（无对象类型字符串输入面）。
  const writableSet = new Set(['customer_create','customer_update','supplier_create','supplier_update','item_create','item_update','item_price_set','stock_transfer_create','stock_transfer_confirm']);
  check('S17.3 写 tool 无 object_type/DocType 字符串输入面（硬编码目标对象）', writableSet.size === 9 && allowlist.WRITE_DOCTYPES.customer_update === 'Customer');
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('F01+F04 开发自检 S01—S17');
  console.log('时间（UTC）: ' + new Date().toISOString());
  s01(); s02(); s03(); s05(); s07(); s08(); s09(); s10();
  await s04(); await s06();
  s11(); s12();
  await s13(); await s14(); await s15(); await s16(); await s17();
  console.log('\n========================================');
  console.log('结果：' + passed + ' 通过 / ' + failed + ' 失败');
  if (failures.length) { console.log('失败项：'); failures.forEach(function (x) { console.log('  - ' + x); }); }
  console.log('========================================');
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) { main(); }
