'use strict';
/*
 * F04 #8 erpnext_supplier_create（W03/W06/W07）
 * 忠实 D02 §3.3：登记新供应商（人确认）。目标 Supplier ▲；create 组 300s；不带 modified。
 * 前置断言：同名 supplier_name 不存在（server 先查，后端 DuplicateEntryError 409，B01 F1）；supplier_group 有效。
 * 写：POST /api/resource/Supplier；写后回读新供应商语义标识 + 关键字段。
 * 回滚：未引用删除；被引用转管理员。错误转译忠实 D02 §3.3 第 8 项。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Supplier';

const definition = {
  name: 'erpnext_supplier_create',
  description:
    '登记一个新供应商。' +
    '消歧：同名供应商不存在才 create；已存在走 erpnext_supplier_update。' +
    '窄接口边界：只写 Supplier 登记字段；不隐式创建/修改 Contact、Address。',
  inputSchema: {
    type: 'object',
    properties: {
      supplier_name: { type: 'string', description: '供应商名称（语义标识，必填）。' },
      supplier_group: { type: 'string', description: '供应商分组（引用允许清单 Supplier Group，必填）。' },
      supplier_type: { type: 'string', description: '供应商类型（可选）。' },
      disabled: { type: 'boolean', description: '是否禁用（可选，缺省启用）。' },
    },
    required: ['supplier_name', 'supplier_group'],
  },
  annotations: {
    title: '登记新供应商',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const supplierName = args.supplier_name;
  const supplierGroup = args.supplier_group;

  if (typeof supplierName !== 'string' || supplierName.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'supplier_name 必填：请提供供应商名称', { retryable: true }) };
  }
  if (typeof supplierGroup !== 'string' || supplierGroup.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'supplier_group 必填：请提供供应商分组（引用允许清单 Supplier Group）', { retryable: true }) };
  }

  const writable = new Set(allowlist.WRITABLE_FIELDS.supplier_create);
  for (const k of Object.keys(args)) {
    if (k === 'supplier_name' || k === 'supplier_group') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.supplier_create.join('/'), { retryable: true }) };
    }
  }

  const businessParams = {
    t: 'supplier_create',
    supplier_name: supplierName,
    supplier_group: supplierGroup,
    ...pick(args, ['supplier_type', 'disabled']),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 同名供应商不存在。
  const dup = await ctx.backend.getCount(DOCTYPE, [['supplier_name', '=', supplierName]]);
  if (!dup.ok) return dup;
  if (dup.count > 0) {
    return { ok: false, error: makeError('duplicate_name', '同名供应商「' + supplierName + '」已存在：请改用 erpnext_supplier_update', { retryable: false }) };
  }

  // supplier_group 有效。
  const grp = await ctx.backend.getCount('Supplier Group', [['name', '=', supplierGroup]]);
  if (!grp.ok) return grp;
  if (grp.count === 0) {
    return { ok: false, error: makeError('precondition_failed', '供应商分组「' + supplierGroup + '」不存在：请指定存在的供应商分组', { retryable: false }) };
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_supplier_create', args);
  if (!conf.ok) return conf;

  const doc = { supplier_name: supplierName, supplier_group: supplierGroup };
  if (args.supplier_type !== undefined && args.supplier_type !== null && args.supplier_type !== '') doc.supplier_type = args.supplier_type;
  if (args.disabled !== undefined) doc.disabled = args.disabled ? 1 : 0;

  const created = await ctx.backend.create(DOCTYPE, doc);
  if (!created.ok) return created;

  const newName = (created.data && created.data.name) || supplierName;
  const rb = await ctx.backend.get(DOCTYPE, newName);
  if (!rb.ok) return rb;

  const result = {
    name: rb.data && rb.data.name ? rb.data.name : newName,
    supplier_name: rb.data.supplier_name,
    supplier_group: rb.data.supplier_group,
  };

  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_supplier_create' });
    ctx.batchLedger.recordChange(bId, buildChange({ objectType: DOCTYPE, objectName: result.name, action: 'create', afterState: 'draft' }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k]; }
  return out;
}

module.exports = { definition, handler };
