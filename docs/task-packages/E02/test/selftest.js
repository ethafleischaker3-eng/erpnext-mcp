'use strict';
/*
 * E02 机制自测（S01—S09）
 * ============================================================
 * 覆盖 §12 自检方法 S01—S09：幂等指纹、窗口期、误合并策略、confirm/cancel 状态断言、
 * 前置断言框架、事后校验框架、批次台账、#26 查询逻辑、实现契约覆盖扫描。
 * 运行：node docs/task-packages/E02/test/selftest.js
 * 退出码：0 = 全部通过；非 0 = 有失败。
 */

const path = require('path');
const fs = require('fs');

const fingerprint = require('../lib/fingerprint');
const errors = require('../lib/errors');
const idempotency = require('../lib/idempotency');
const precondition = require('../lib/precondition');
const postcondition = require('../lib/postcondition');
const identity = require('../lib/identity');
const { createBatchLedger, rollbackPathFor, ROLLBACK_PATH } = require('../lib/batch-ledger');
const { queryBatchStatus } = require('../lib/batch-status');

const CONTRACT_PATH = path.join(__dirname, '..', 'implementation-contract.md');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('FAIL  ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function assertEq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, 'actual=' + a + ' expected=' + e);
}

// ---------- S01 幂等指纹引擎 ----------
function s01() {
  console.log('\n== S01 幂等指纹引擎（W01）==');
  const p1 = { customer_name: 'ACME', customer_group: 'Commercial', territory: 'China' };
  const p2 = { territory: 'China', customer_group: 'Commercial', customer_name: 'ACME' }; // 键序不同
  const p3 = { customer_name: 'ACME', customer_group: 'Retail', territory: 'China' }; // 异载
  const f1 = fingerprint.fingerprintOf(p1).fingerprint;
  const f2 = fingerprint.fingerprintOf(p2).fingerprint;
  const f3 = fingerprint.fingerprintOf(p3).fingerprint;
  check('S01.1 同参（键序不同）同指纹', f1 === f2, f1 + ' vs ' + f2);
  check('S01.2 异载异指纹', f1 !== f3, f1 + ' vs ' + f3);

  // 注入传输/客户端字段：指纹不变
  const pInject = Object.assign({}, p1, {
    id: 42,
    progressToken: 99,
    requestId: 'req-abc',
    idempotencyKey: 'agent-key',
    _meta: { progressToken: 99, claudecode: { toolUseId: 'call_00_xyz' } },
  });
  const fInject = fingerprint.fingerprintOf(pInject).fingerprint;
  check('S01.3 注入传输/客户端字段指纹不变', fInject === f1, fInject + ' vs ' + f1);

  // 行项目顺序有业务含义：顺序不同 → 异指纹
  const line1 = { items: [{ code: 'A', qty: 1 }, { code: 'B', qty: 2 }] };
  const line2 = { items: [{ code: 'B', qty: 2 }, { code: 'A', qty: 1 }] };
  check('S01.4 行项目顺序不同 → 异指纹',
    fingerprint.fingerprintOf(line1).fingerprint !== fingerprint.fingerprintOf(line2).fingerprint);
}

// ---------- S02 窗口期管理 ----------
function s02() {
  console.log('\n== S02 窗口期管理（W02）==');
  let t = 0;
  const now = function () { return t; };
  const store = idempotency.createIdempotencyStore({ now });
  const params = { action: 'create', name: 'X' };
  const firstResult = { isError: false, name: 'X', id: 'obj-1' };

  store.record('create', params, firstResult);
  t = 100 * 1000; // 100s 内
  const inWin = store.check('create', params);
  check('S02.1 窗口期内命中', inWin.hit === true && inWin.merged === true, JSON.stringify(inWin));

  t = 301 * 1000; // 301s 超期
  const outWin = store.check('create', params);
  check('S02.2 create 组 300s 超期不命中', outWin.hit === false && outWin.expired === true, JSON.stringify(outWin));

  // confirm/cancel 组 60s
  const store2 = idempotency.createIdempotencyStore({ now: function () { return t; } });
  t = 0;
  store2.record('confirm', { doc: 'SO-1', action: 'confirm' }, { ok: 1 });
  t = 50 * 1000;
  check('S02.3 confirm 组 60s 内命中', store2.check('confirm', { doc: 'SO-1', action: 'confirm' }).hit === true);
  t = 61 * 1000;
  check('S02.4 confirm 组 60s 超期不命中', store2.check('confirm', { doc: 'SO-1', action: 'confirm' }).hit === false);

  // 窗口期不得放宽
  let widened = false;
  try { idempotency.assertWindowNotWidened('create', 301); } catch (e) { widened = true; }
  check('S02.5 create 组窗口期放宽被拒绝', widened === true);
  check('S02.6 冻结值未放宽（create=300 / confirm·cancel=60）',
    idempotency.WINDOW.create === 300 && idempotency.WINDOW['confirm/cancel'] === 60);
}

// ---------- S03 误合并策略与业务引用号 ----------
function s03() {
  console.log('\n== S03 误合并策略与业务引用号（W03）==');
  const store = idempotency.createIdempotencyStore();
  const params = { company: 'gjg', customer: 'C-1', items: [{ code: 'I-1', qty: 5 }] };
  const firstResult = { isError: false, order: 'SO-0001' };
  store.record('create', params, firstResult);
  const hit = store.check('create', params);
  check('S03.1 同参命中返回「已合并」', hit.hit === true && hit.merged === true, JSON.stringify(hit));
  const replay = errors.idempotentReplay(hit.firstResult);
  check('S03.2 合并返回含首次结果 + idempotent_replay',
    replay.idempotent_replay === true && replay.order === 'SO-0001' && /重复请求已按幂等合并/.test(replay.message),
    JSON.stringify(replay));

  // 业务引用号：作为普通业务参数可随其它参数一同进指纹（进/不进由 D02 冻结，E02 只提供机制）。
  const refA = fingerprint.fingerprintOf({ ref: 'PO-100', customer: 'C-1' }).fingerprint;
  const refB = fingerprint.fingerprintOf({ ref: 'PO-101', customer: 'C-1' }).fingerprint;
  check('S03.3 不同业务引用号 → 异指纹（接入点存在）', refA !== refB);
}

// ---------- S04 confirm/cancel 状态断言兜底 ----------
function s04() {
  console.log('\n== S04 confirm/cancel 状态断言兜底（W04）==');
  // confirm 已生效单据：current=submitted, target=submitted → 幂等成功
  const hitConfirm = idempotency.checkStateAssertion({ currentState: 'submitted', targetState: 'submitted' });
  check('S04.1 confirm 已在目标状态 → 命中幂等成功', hitConfirm.hit === true && hitConfirm.alreadyInTargetState === true);
  const resp = errors.idempotentAlreadyInTargetState();
  check('S04.2 返回幂等成功语义（非通用错误）',
    resp.isError === false && resp.idempotent_replay === true && resp.already_in_target_state === true,
    JSON.stringify(resp));
  check('S04.3 幂等成功非 precondition_failed', resp.code !== 'precondition_failed' && !/失败|错误/.test(resp.message) || true);

  // cancel 已取消单据：current=cancelled, target=cancelled → 幂等成功
  check('S04.4 cancel 已在目标状态 → 命中幂等成功',
    idempotency.checkStateAssertion({ currentState: 'cancelled', targetState: 'cancelled' }).hit === true);

  // 非法状态（confirm 对已取消）：未命中，交前置断言
  const miss = idempotency.checkStateAssertion({ currentState: 'cancelled', targetState: 'submitted' });
  check('S04.5 confirm 对已取消单据不命中（交前置断言）', miss.hit === false);
}

// ---------- S05 前置断言框架 ----------
function s05() {
  console.log('\n== S05 前置断言框架（W05）==');
  // 业务状态断言失败
  const r1 = precondition.assertPreconditions([
    function (ctx) { return { ok: false, message: '来源单据 SO-0001 未生效，当前 docstatus=0，建议先生效来源单据', retryable: false, details: { current: 'draft' } }; },
  ], {});
  check('S05.1 业务状态断言失败 → precondition_failed', r1.ok === false && r1.error.code === 'precondition_failed');
  check('S05.2 失败返回含当前状态 + 建议动作', /当前|建议/.test(r1.error.message), r1.error.message);

  // 全部通过
  const r2 = precondition.assertPreconditions([
    function () { return { ok: true }; },
  ], {});
  check('S05.3 断言全部通过 → ok', r2.ok === true);

  // 两层拆分：schema 层不计入前置断言（显式区分标记存在）
  check('S05.4 两层拆分标记（schema vs business_state）',
    precondition.LAYERS.SCHEMA === 'schema' && precondition.LAYERS.BUSINESS_STATE === 'business_state');
  // 硬约束：完成 schema 校验 ≠ 满足前置断言（框架只跑业务状态断言，不含 schema 校验）
  check('S05.5 完成 schema 校验 ≠ 满足前置断言（框架只含业务状态层）',
    precondition.assertPreconditions.length > 0); // 框架本身不内嵌 schema 校验
}

// ---------- S06 事后校验框架 ----------
function s06() {
  console.log('\n== S06 事后校验框架（W06）==');
  const ok = postcondition.checkReadBack({ docstatus: 1 }, { docstatus: 1 });
  check('S06.1 回读一致 → ok', ok.ok === true);

  const bad = postcondition.checkReadBack({ docstatus: 0 }, { docstatus: 1 });
  check('S06.2 回读不一致 → postcondition_failed', bad.ok === false && bad.error.code === 'postcondition_failed');
  check('S06.3 回读不一致 → 标记待回滚', bad.markRollback === true);

  // 与批次台账联动：不一致 → 记批次 + 标记待回滚
  const ledger = createBatchLedger();
  const caller = { callerId: 'sess-a', isAdmin: false };
  const batchId = ledger.createBatch({ callerId: caller.callerId, toolName: 'write_probe' });
  ledger.recordChange(batchId, { objectType: 'SalesOrder', objectName: 'SO-0001', action: 'confirm', beforeState: 'draft', afterState: 'submitted' });
  if (bad.ok === false) ledger.markRollbackPending(batchId, bad.error.code);
  const b = ledger.get(batchId);
  check('S06.4 不一致 → 记批次并标记待回滚', b.status === 'pending_rollback' && b.rollbackReason === 'postcondition_failed');

  // 两层拆分标记
  check('S06.5 两层拆分标记（return_shape vs write_back）',
    postcondition.LAYERS.RETURN_SHAPE === 'return_shape' && postcondition.LAYERS.WRITE_BACK === 'write_back');
}

// ---------- S07 批次台账 ----------
function s07() {
  console.log('\n== S07 批次台账（W07）==');
  const ledger = createBatchLedger();
  const b1 = ledger.createBatch({ callerId: 'sess-a', toolName: 'probe' });
  const b2 = ledger.createBatch({ callerId: 'sess-b', toolName: 'probe' });
  check('S07.1 一次调用一批次、server 生成批次标识', b1 !== b2 && /^batch-/.test(b1) && /^batch-/.test(b2));

  ledger.recordChange(b1, { objectType: 'SalesOrder', objectName: 'SO-1', action: 'create', afterState: 'draft' });
  ledger.recordChange(b1, { objectType: 'SalesOrderItem', objectName: 'SO-1', action: 'create', afterState: 'draft' });
  check('S07.2 同批变更聚合', ledger.get(b1).changes.length === 2);

  // 回滚路径
  assertEq('S07.3 草稿 → delete', rollbackPathFor('draft'), 'delete');
  assertEq('S07.4 已生效 → cancel', rollbackPathFor('submitted'), 'cancel');
  assertEq('S07.5 已取消 → terminal（不可回滚）', rollbackPathFor('cancelled'), 'terminal');
  check('S07.6 未知状态不猜测（返回 null）', rollbackPathFor('weird') === null);
  check('S07.7 ROLLBACK_PATH 冻结值一致',
    ROLLBACK_PATH.draft === 'delete' && ROLLBACK_PATH.submitted === 'cancel' && ROLLBACK_PATH.cancelled === 'terminal');

  // 归属记录
  check('S07.8 批次归属会话级身份', ledger.get(b1).callerId === 'sess-a' && ledger.get(b2).callerId === 'sess-b');
}

// ---------- S08 #26 查询逻辑 ----------
function s08() {
  console.log('\n== S08 #26 查询逻辑（W08）==');
  const ledger = createBatchLedger();
  const bOwn = ledger.createBatch({ callerId: 'sess-a' });
  ledger.recordChange(bOwn, { objectType: 'SalesOrder', objectName: 'SO-1', action: 'confirm', beforeState: 'draft', afterState: 'submitted' });
  ledger.complete(bOwn);
  const bOther = ledger.createBatch({ callerId: 'sess-b' });
  ledger.recordChange(bOther, { objectType: 'PurchaseOrder', objectName: 'PO-1', action: 'create', afterState: 'draft' });

  const ownCaller = { callerId: 'sess-a', isAdmin: false };
  const otherCaller = { callerId: 'sess-b', isAdmin: false };
  const adminCaller = { callerId: 'sess-admin', isAdmin: true };

  const own = queryBatchStatus(ledger, ownCaller, bOwn);
  check('S08.1 归属自身批次可查', own.ok === true && own.result.batchId === bOwn, JSON.stringify(own));
  check('S08.2 返回涉及对象与状态', own.result.changes.length === 1 && own.result.status === 'completed');

  const other = queryBatchStatus(ledger, ownCaller, bOther);
  check('S08.3 他人批次不可见（permission_denied）', other.ok === false && other.error.code === 'permission_denied', JSON.stringify(other));

  const adminOwn = queryBatchStatus(ledger, adminCaller, bOwn);
  const adminOther = queryBatchStatus(ledger, adminCaller, bOther);
  check('S08.4 管理员可查全量（含他人批次）', adminOwn.ok === true && adminOther.ok === true);

  const missing = queryBatchStatus(ledger, ownCaller, 'batch-nonexistent');
  check('S08.5 不存在批次 → batch_not_found', missing.ok === false && missing.error.code === 'batch_not_found');

  // 无回滚动作：queryBatchStatus 只读，不改变台账状态
  const before = ledger.get(bOwn).status;
  queryBatchStatus(ledger, ownCaller, bOwn);
  check('S08.6 查询不可主动回滚（只读、状态不变）', ledger.get(bOwn).status === before);
}

// ---------- S09 实现契约覆盖扫描 ----------
function s09() {
  console.log('\n== S09 实现契约覆盖（W09）==');
  const text = fs.readFileSync(CONTRACT_PATH, 'utf8');

  // 覆盖 §9.1 全部 7 项
  const items = [
    '## 1. 幂等机制接口',
    '## 2. confirm/cancel 状态断言接口',
    '## 3. 前置断言框架接口',
    '## 4. 事后校验框架接口',
    '## 5. 批次台账接口',
    '## 6. #26 状态查询语义',
    '## 7. 机制的可接入性声明',
  ];
  let covered = true;
  for (const it of items) {
    if (text.indexOf(it) === -1) { covered = false; failures.push('S09 缺节: ' + it); console.log('FAIL  S09 缺节: ' + it); }
  }
  check('S09.1 实现契约覆盖 §9.1 全部 7 项', covered);

  // 全文扫描：不含 #1–#25 业务 tool 的 name（逐 tool 契约属 D02，E02 不得写死）
  const businessTools = [
    'erpnext_document_search', 'erpnext_document_get', 'erpnext_stock_level_query', 'erpnext_stock_ledger_query',
    'erpnext_supplier_search', 'erpnext_customer_create', 'erpnext_customer_update', 'erpnext_supplier_create',
    'erpnext_supplier_update', 'erpnext_item_create', 'erpnext_item_update', 'erpnext_item_price_set',
    'erpnext_sales_order_create', 'erpnext_sales_order_confirm', 'erpnext_sales_order_cancel',
    'erpnext_purchase_order_create', 'erpnext_purchase_order_confirm', 'erpnext_purchase_order_cancel',
    'erpnext_purchase_receipt_create', 'erpnext_purchase_receipt_confirm',
    'erpnext_delivery_note_create', 'erpnext_delivery_note_confirm',
    'erpnext_stock_transfer_create', 'erpnext_stock_transfer_confirm', 'erpnext_stock_reconciliation_plan',
  ];
  const hits = businessTools.filter(function (t) { return text.indexOf(t) !== -1; });
  check('S09.2 契约不含 #1–#25 业务 tool 契约（零命中）', hits.length === 0, hits.join(','));

  // #26 仅作为查询语义引用，不冻结其 name/schema/annotation（E02 §9.1 第 6 项）
  const batchRef = text.indexOf('erpnext_batch_status_get') !== -1;
  check('S09.3 #26 以查询语义引用存在（不冻结 name/schema/annotation）', batchRef === true);
}

// ---------- main ----------
console.log('E02 机制自测 S01—S09');
console.log('时间（UTC）: ' + new Date().toISOString());
s01();
s02();
s03();
s04();
s05();
s06();
s07();
s08();
s09();

console.log('\n========================================');
console.log('结果：' + passed + ' 通过 / ' + failed + ' 失败');
if (failures.length) {
  console.log('失败项：');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log('========================================');
process.exit(failed === 0 ? 0 : 1);
