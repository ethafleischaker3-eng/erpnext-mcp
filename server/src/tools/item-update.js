'use strict';
/*
 * F04 #11 erpnext_item_update（W03/W06/W07）
 * 忠实 D02 §3.6：修改既有物料可改字段（人确认）。指纹合并类 300s；必带 modified。
 * 前置断言：目标存在且启用；modified 一致；分类字段有效；docstatus 不得被 update 改写（B01 F5，白名单阻断）。
 * 回滚：前镜像 + 版本一致才恢复。错误转译忠实 D02 §3.6 第 8 项。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Item';

const definition = {
  name: 'erpnext_item_update',
  description:
    '修改既有物料可改字段。' +
    '消歧：目标不存在/新建走 erpnext_item_create。' +
    '窄接口边界：只写本次变更允许字段；name/创建时间/创建人不可改；docstatus 不暴露为可写字段。',
  inputSchema: {
    type: 'object',
    properties: {
      item_id: { type: 'string', description: '物料编码语义标识（必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
      item_name: { type: 'string', description: '物料名称（可选仅本次变更）。' },
      item_group: { type: 'string', description: '物料分组（引用允许清单 Item Group，可选仅本次变更）。' },
      stock_uom: { type: 'string', description: '计量单位（引用允许清单 UOM，可选仅本次变更）。' },
      is_stock_item: { type: 'boolean', description: '是否库存物料（可选仅本次变更）。' },
      disabled: { type: 'boolean', description: '是否禁用（可选仅本次变更）。' },
    },
    required: ['item_id', 'modified'],
  },
  annotations: {
    title: '修改既有物料',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const itemId = args.item_id;
  const modified = args.modified;

  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'item_id 必填：请提供物料编码语义标识', { retryable: true }) };
  }
  if (typeof modified !== 'string' || modified.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'modified 必填：请提供当前版本令牌（乐观并发）', { retryable: true }) };
  }

  const updatable = new Set(allowlist.WRITABLE_FIELDS.item_update);
  const changeKeys = [];
  for (const k of Object.keys(args)) {
    if (k === 'item_id' || k === 'modified') continue;
    if (!updatable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可改或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.item_update.join('/'), { retryable: true }) };
    }
    changeKeys.push(k);
  }
  if (changeKeys.length === 0) {
    return { ok: false, error: makeError('invalid_argument', '未提供任何可改字段：请至少指定一个要变更的字段', { retryable: true }) };
  }

  const changeMap = {};
  for (const k of changeKeys) changeMap[k] = args[k];
  const businessParams = { t: 'item_update', item_id: itemId, changes: changeMap };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  const cur = await ctx.backend.get(DOCTYPE, itemId);
  if (!cur.ok) return cur;
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '物料「' + itemId + '」不存在：请核对标识或先 erpnext_document_get', { retryable: false }) };
  }
  if (c.disabled === 1 || c.disabled === true) {
    return { ok: false, error: makeError('precondition_failed', '物料「' + itemId + '」已禁用：请先启用再修改', { retryable: false }) };
  }
  if (args.item_group !== undefined && args.item_group !== null && args.item_group !== '') {
    const grp = await ctx.backend.getCount('Item Group', [['name', '=', args.item_group]]);
    if (!grp.ok) return grp;
    if (grp.count === 0) return { ok: false, error: makeError('precondition_failed', '物料分组「' + args.item_group + '」不存在：请指定存在的物料分组', { retryable: false }) };
  }
  if (args.stock_uom !== undefined && args.stock_uom !== null && args.stock_uom !== '') {
    const uom = await ctx.backend.getCount('UOM', [['name', '=', args.stock_uom]]);
    if (!uom.ok) return uom;
    if (uom.count === 0) return { ok: false, error: makeError('precondition_failed', '计量单位「' + args.stock_uom + '」不存在：请指定存在的计量单位', { retryable: false }) };
  }

  // 版本断言。
  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '物料「' + itemId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_item_update', args);
  if (!conf.ok) return conf;

  const doc = {};
  for (const k of changeKeys) doc[k] = args[k] === false ? 0 : (args[k] === true ? 1 : args[k]);
  doc.modified = modified;

  const updated = await ctx.backend.update(DOCTYPE, itemId, doc);
  if (!updated.ok) return updated;

  const rb = await ctx.backend.get(DOCTYPE, itemId);
  if (!rb.ok) return rb;

  const result = { name: rb.data.name, item_code: rb.data.item_code, item_name: rb.data.item_name };
  for (const k of changeKeys) { if (rb.data[k] !== undefined) result[k] = rb.data[k]; }

  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_item_update' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: itemId, action: 'update',
      beforeState: c.modified, afterState: (rb.data && rb.data.modified) || null,
    }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

module.exports = { definition, handler };
