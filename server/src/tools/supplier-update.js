'use strict';
/*
 * F04 #9 erpnext_supplier_update（W03/W06/W07）
 * 忠实 D02 §3.4：修改既有供应商可改字段（人确认）。指纹合并类 300s；必带 modified。
 * 前置断言：目标存在且启用；modified 一致；分组有效、不可改字段受限。
 * 回滚：前镜像 + 版本一致才恢复。错误转译忠实 D02 §3.4 第 8 项。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Supplier';

const definition = {
  name: 'erpnext_supplier_update',
  description:
    '修改既有供应商可改字段。' +
    '消歧：目标不存在/新建走 erpnext_supplier_create。' +
    '窄接口边界：只写本次变更允许字段；name/创建时间/创建人不可改。',
  inputSchema: {
    type: 'object',
    properties: {
      supplier_id: { type: 'string', description: '供应商语义标识（供应商名，必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
      supplier_group: { type: 'string', description: '供应商分组（引用允许清单 Supplier Group，可选仅本次变更）。' },
      supplier_type: { type: 'string', description: '供应商类型（可选仅本次变更）。' },
      disabled: { type: 'boolean', description: '是否禁用（可选仅本次变更）。' },
    },
    required: ['supplier_id', 'modified'],
  },
  annotations: {
    title: '修改既有供应商',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const supplierId = args.supplier_id;
  const modified = args.modified;

  if (typeof supplierId !== 'string' || supplierId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'supplier_id 必填：请提供供应商语义标识', { retryable: true }) };
  }
  if (typeof modified !== 'string' || modified.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'modified 必填：请提供当前版本令牌（乐观并发）', { retryable: true }) };
  }

  const updatable = new Set(allowlist.WRITABLE_FIELDS.supplier_update);
  const changeKeys = [];
  for (const k of Object.keys(args)) {
    if (k === 'supplier_id' || k === 'modified') continue;
    if (!updatable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可改或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.supplier_update.join('/'), { retryable: true }) };
    }
    changeKeys.push(k);
  }
  if (changeKeys.length === 0) {
    return { ok: false, error: makeError('invalid_argument', '未提供任何可改字段：请至少指定一个要变更的字段', { retryable: true }) };
  }

  const changeMap = {};
  for (const k of changeKeys) changeMap[k] = args[k];
  const businessParams = { t: 'supplier_update', supplier_id: supplierId, changes: changeMap };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  const cur = await ctx.backend.get(DOCTYPE, supplierId);
  if (!cur.ok) return cur;
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '供应商「' + supplierId + '」不存在：请核对标识或先 erpnext_document_get', { retryable: false }) };
  }
  if (c.disabled === 1 || c.disabled === true) {
    return { ok: false, error: makeError('precondition_failed', '供应商「' + supplierId + '」已禁用：请先启用再修改', { retryable: false }) };
  }
  if (args.supplier_group !== undefined && args.supplier_group !== null && args.supplier_group !== '') {
    const grp = await ctx.backend.getCount('Supplier Group', [['name', '=', args.supplier_group]]);
    if (!grp.ok) return grp;
    if (grp.count === 0) return { ok: false, error: makeError('precondition_failed', '供应商分组「' + args.supplier_group + '」不存在：请指定存在的供应商分组', { retryable: false }) };
  }

  // 版本断言（并发冲突保护）。改名（supplier_name 通过 supplier_id 语义改变不做，故此处置于白名单外）。
  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '供应商「' + supplierId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_supplier_update', args);
  if (!conf.ok) return conf;

  const doc = {};
  for (const k of changeKeys) doc[k] = args[k] === false ? 0 : args[k];
  doc.modified = modified;

  const updated = await ctx.backend.update(DOCTYPE, supplierId, doc);
  if (!updated.ok) return updated;

  const rb = await ctx.backend.get(DOCTYPE, supplierId);
  if (!rb.ok) return rb;

  const result = { name: rb.data.name, supplier_name: rb.data.supplier_name };
  for (const k of changeKeys) { if (rb.data[k] !== undefined) result[k] = rb.data[k]; }

  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_supplier_update' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: supplierId, action: 'update',
      beforeState: c.modified, afterState: (rb.data && rb.data.modified) || null,
    }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

module.exports = { definition, handler };
