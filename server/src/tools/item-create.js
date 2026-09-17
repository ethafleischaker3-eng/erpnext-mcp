'use strict';
/*
 * F04 #10 erpnext_item_create（W03/W06/W07）
 * 忠实 D02 §3.5：登记新物料（人确认）。目标 Item ▲；create 组 300s；不带 modified。
 * 前置断言：同名 item_code 不存在（后端 DuplicateEntryError 409，B01 F1，server 前置断言）；
 *   item_group 有效；stock_uom 有效。
 * 写：POST /api/resource/Item；写后回读新物料（含自动默认仓/计量单位）。
 * 回滚：未引用删除；被 Item Price 引用时删除不拒、级联删 Item Price（B01 F4），server 须自建引用前置检查。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Item';

const definition = {
  name: 'erpnext_item_create',
  description:
    '登记一个新物料。' +
    '消歧：同名物料编码不存在才 create；已存在走 erpnext_item_update。' +
    '窄接口边界：只写 Item 登记字段；不隐式创建/修改物料价格（价格走 erpnext_item_price_set）。',
  inputSchema: {
    type: 'object',
    properties: {
      item_code: { type: 'string', description: '物料编码（语义标识，必填）。' },
      item_name: { type: 'string', description: '物料名称（缺省取 item_code）。' },
      item_group: { type: 'string', description: '物料分组（引用允许清单 Item Group，必填）。' },
      stock_uom: { type: 'string', description: '计量单位（引用允许清单 UOM，必填）。' },
      is_stock_item: { type: 'boolean', description: '是否库存物料（可选，缺省 true）。' },
      disabled: { type: 'boolean', description: '是否禁用（可选，缺省启用）。' },
    },
    required: ['item_code', 'item_group', 'stock_uom'],
  },
  annotations: {
    title: '登记新物料',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const itemCode = args.item_code;
  const itemGroup = args.item_group;
  const stockUom = args.stock_uom;

  if (typeof itemCode !== 'string' || itemCode.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'item_code 必填：请提供物料编码', { retryable: true }) };
  }
  if (typeof itemGroup !== 'string' || itemGroup.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'item_group 必填：请提供物料分组（引用允许清单 Item Group）', { retryable: true }) };
  }
  if (typeof stockUom !== 'string' || stockUom.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'stock_uom 必填：请提供计量单位（引用允许清单 UOM）', { retryable: true }) };
  }

  const writable = new Set(allowlist.WRITABLE_FIELDS.item_create);
  for (const k of Object.keys(args)) {
    if (k === 'item_code' || k === 'item_group' || k === 'stock_uom') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.item_create.join('/'), { retryable: true }) };
    }
  }

  const businessParams = {
    t: 'item_create',
    item_code: itemCode,
    item_group: itemGroup,
    stock_uom: stockUom,
    ...pick(args, ['item_name', 'is_stock_item', 'disabled']),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 同名 item_code 不存在。
  const dup = await ctx.backend.getCount(DOCTYPE, [['item_code', '=', itemCode]]);
  if (!dup.ok) return dup;
  if (dup.count > 0) {
    return { ok: false, error: makeError('duplicate_name', '同名物料「' + itemCode + '」已存在：请改用 erpnext_item_update', { retryable: false }) };
  }

  // item_group 有效。
  const grp = await ctx.backend.getCount('Item Group', [['name', '=', itemGroup]]);
  if (!grp.ok) return grp;
  if (grp.count === 0) {
    return { ok: false, error: makeError('precondition_failed', '物料分组「' + itemGroup + '」不存在：请指定存在的物料分组', { retryable: false }) };
  }

  // stock_uom 有效（UOM 以 name 为编码）。
  const uom = await ctx.backend.getCount('UOM', [['name', '=', stockUom]]);
  if (!uom.ok) return uom;
  if (uom.count === 0) {
    return { ok: false, error: makeError('precondition_failed', '计量单位「' + stockUom + '」不存在：请指定存在的计量单位', { retryable: false }) };
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_item_create', args);
  if (!conf.ok) return conf;

  const doc = { item_code: itemCode, item_group: itemGroup, stock_uom: stockUom };
  if (args.item_name !== undefined && args.item_name !== null && args.item_name !== '') doc.item_name = args.item_name;
  if (args.is_stock_item !== undefined) doc.is_stock_item = args.is_stock_item ? 1 : 0;
  if (args.disabled !== undefined) doc.disabled = args.disabled ? 1 : 0;

  const created = await ctx.backend.create(DOCTYPE, doc);
  if (!created.ok) return created;

  const rb = await ctx.backend.get(DOCTYPE, itemCode);
  if (!rb.ok) return rb;

  const result = {
    name: rb.data.name,
    item_code: rb.data.item_code,
    item_name: rb.data.item_name,
    item_group: rb.data.item_group,
    stock_uom: rb.data.stock_uom,
  };

  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_item_create' });
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
