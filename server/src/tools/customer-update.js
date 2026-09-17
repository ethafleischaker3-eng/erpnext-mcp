'use strict';
/*
 * F04 #7 erpnext_customer_update（W03/W06/W07）
 * ============================================================
 * 忠实 D02 §3.2：修改既有客户可改字段（人确认）。指纹合并类 300s；必带 modified。
 * 前置断言：目标存在且启用；预期 modified 一致（版本断言与写入同后端事务）；分类字段有效、不可改字段受限。
 * 写：PUT /api/resource/Customer/{name}（含 modified 乐观令牌）；写后回读变更后关键字段。
 * 回滚：前镜像 + 当前版本仍=写后版本才恢复。错误转译忠实 D02 §3.2 第 8 项。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Customer';

const definition = {
  name: 'erpnext_customer_update',
  description:
    '修改既有客户的可改字段。' +
    '消歧：目标不存在或需新建走 erpnext_customer_create；本 tool 只改既有对象。' +
    '窄接口边界：只写本次变更的允许字段；name/创建时间/创建人（系统常量）不可改。',
  inputSchema: {
    type: 'object',
    properties: {
      customer_id: { type: 'string', description: '客户语义标识（客户名，必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
      customer_group: { type: 'string', description: '客户分组（引用允许清单 Customer Group，可选仅本次变更）。' },
      territory: { type: 'string', description: '区域（引用允许清单 Territory，可选仅本次变更）。' },
      customer_type: { type: 'string', description: '客户类型（可选仅本次变更）。' },
      disabled: { type: 'boolean', description: '是否禁用（可选仅本次变更）。' },
    },
    required: ['customer_id', 'modified'],
  },
  annotations: {
    title: '修改既有客户',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const customerId = args.customer_id;
  const modified = args.modified;

  // schema 校验。
  if (typeof customerId !== 'string' || customerId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'customer_id 必填：请提供客户语义标识', { retryable: true }) };
  }
  if (typeof modified !== 'string' || modified.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'modified 必填：请提供当前版本令牌（乐观并发）', { retryable: true }) };
  }

  // 可写字段白名单（接受可改字段，排除不可改 name/creation/owner/docstatus 与 customer_name）。
  const updatable = new Set(allowlist.WRITABLE_FIELDS.customer_update);
  const changeKeys = [];
  for (const k of Object.keys(args)) {
    if (k === 'customer_id' || k === 'modified') continue;
    if (!updatable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可改或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.customer_update.join('/'), { retryable: true }) };
    }
    changeKeys.push(k);
  }
  if (changeKeys.length === 0) {
    return { ok: false, error: makeError('invalid_argument', '未提供任何可改字段：请至少指定一个要变更的字段', { retryable: true }) };
  }

  // 幂等指纹（进指纹 = 对象标识 + 字段名及目标值；不进指纹 = 未变更字段）。
  const changeMap = {};
  for (const k of changeKeys) changeMap[k] = args[k];
  const businessParams = { t: 'customer_update', customer_id: customerId, changes: changeMap };
  const chk = idempotency.check('create', businessParams); // 指纹合并类（同 create 组 300s）
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言：目标存在且启用 + 分类字段有效。
  const cur = await ctx.backend.get(DOCTYPE, customerId);
  if (!cur.ok) return cur; // 目标不存在 → precondition_failed（translate 已转）
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '客户「' + customerId + '」不存在：请核对标识或先 erpnext_document_get', { retryable: false }) };
  }
  if (c.disabled === 1 || c.disabled === true) {
    return { ok: false, error: makeError('precondition_failed', '客户「' + customerId + '」已禁用：请先启用再修改', { retryable: false }) };
  }
  if (c.customer_group !== undefined || args.customer_group !== undefined) {
    const grpName = args.customer_group !== undefined ? args.customer_group : c.customer_group;
    const grp = await ctx.backend.getList('Customer Group', { fields: ['name', 'is_group'], filters: [['name', '=', grpName]], limitPageLength: 1 });
    if (!grp.ok) return grp;
    const g = (grp.data || [])[0];
    if (!g) return { ok: false, error: makeError('precondition_failed', '客户分组「' + grpName + '」不存在：请指定存在的客户分组', { retryable: false }) };
    if (g.is_group === 1) return { ok: false, error: makeError('precondition_failed', '客户分组「' + grpName + '」是分组节点：请选择非分组叶子分组', { retryable: false }) };
  }
  if (args.territory !== undefined && args.territory !== null && args.territory !== '') {
    const terr = await ctx.backend.getCount('Territory', [['name', '=', args.territory]]);
    if (!terr.ok) return terr;
    if (terr.count === 0) return { ok: false, error: makeError('precondition_failed', '区域「' + args.territory + '」不存在：请指定存在的区域', { retryable: false }) };
  }

  // 版本断言（后端 check_if_latest 与写入同事务）：预期 modified 与当前一致（server 前置提示可自纠）。
  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '客户「' + customerId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  // 确认（人确认档）。
  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_customer_update', args);
  if (!conf.ok) return conf;

  // 后端写（PUT，含 modified 乐观令牌）。
  const doc = {};
  for (const k of changeKeys) doc[k] = args[k] === false ? 0 : args[k];
  doc.modified = modified;

  const updated = await ctx.backend.update(DOCTYPE, customerId, doc);
  if (!updated.ok) return updated;

  // 写后回读终态。
  const rb = await ctx.backend.get(DOCTYPE, customerId);
  if (!rb.ok) return rb;

  const result = { name: rb.data.name, customer_name: rb.data.customer_name };
  for (const k of changeKeys) { if (rb.data[k] !== undefined) result[k] = rb.data[k]; }

  // 记首结果 + 批次（前镜像 + 版本一致才恢复）。
  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_customer_update' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: customerId, action: 'update',
      beforeState: c.modified, afterState: (rb.data && rb.data.modified) || null,
    }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

module.exports = { definition, handler };
