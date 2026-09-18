'use strict';
/*
 * F04 #23 erpnext_stock_transfer_create（W04/W06/W07）
 * 忠实 D02 §6.1：创建仓库间调拨草稿（全自动免确认，仅限 L3）。目标 Stock Entry ▲；create 组 300s；不带 modified。
 * 前置断言（server 自建，后端草稿不校验，B04 F5/F9）：stock_entry_type=material_transfer；
 *   items 非空、数量 >0；源仓各物料可用量 ≥ 调拨量（server 查 Bin）；源/目标仓存在。
 * 写：POST /api/resource/Stock Entry；写后回读调拨草稿（源/目仓 + 行项目 + 草稿态）。
 * 回滚：草稿 → 删除（B04 §4）。不写 GL，仅草稿态。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { idempotency, callerId, buildChange, writeGate } = require('./write-common');

const DOCTYPE = 'Stock Entry';

const definition = {
  name: 'erpnext_stock_transfer_create',
  description:
    '创建一张仓库间调拨（Material Transfer）草稿。' +
    '消歧：已知源/目标仓库的移动用本 tool；账实对齐（盘点）用 erpnext_stock_reconciliation_plan。' +
    '窄接口边界：只写 Stock Entry（Material Transfer）草稿及嵌套行项目；不隐式创建/修改物料。',
  inputSchema: {
    type: 'object',
    properties: {
      stock_entry_type: { type: 'string', description: '固定 material_transfer（server 校验，后端不强制）。' },
      from_warehouse: { type: 'string', description: '源仓库（引用允许清单 Warehouse，必填）。' },
      to_warehouse: { type: 'string', description: '目标仓库（引用允许清单 Warehouse，必填）。' },
      items: {
        type: 'array',
        description: '行项目数组（每行 item_code、qty（>0））。',
        items: {
          type: 'object',
          properties: {
            item_code: { type: 'string', description: '物料编码（必填）。' },
            qty: { type: 'number', description: '调拨数量（必填，>0）。' },
          },
          required: ['item_code', 'qty'],
        },
      },
      posting_date: { type: 'string', description: '过账日期（可选，YYYY-MM-DD）。' },
    },
    required: ['from_warehouse', 'to_warehouse', 'items'],
  },
  annotations: {
    title: '创建仓库间调拨草稿',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const stockEntryType = args.stock_entry_type;
  const fromWarehouse = args.from_warehouse;
  const toWarehouse = args.to_warehouse;
  const items = args.items;

  // schema 校验。stock_entry_type 缺省取 material_transfer（必填且须为该值）。
  if (stockEntryType !== undefined && stockEntryType !== 'material_transfer') {
    return { ok: false, error: makeError('invalid_argument', 'stock_entry_type 必须为 material_transfer（后端不强制，server 校验）', { retryable: true }) };
  }
  if (typeof fromWarehouse !== 'string' || fromWarehouse.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'from_warehouse 必填：请提供源仓库', { retryable: true }) };
  }
  if (typeof toWarehouse !== 'string' || toWarehouse.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'to_warehouse 必填：请提供目标仓库', { retryable: true }) };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: makeError('invalid_argument', 'items 必填且非空：请提供行项目数组', { retryable: true }) };
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (typeof it.item_code !== 'string' || it.item_code.trim() === '') {
      return { ok: false, error: makeError('invalid_argument', 'items[' + i + '].item_code 必填', { retryable: true }) };
    }
    if (typeof it.qty !== 'number' || !(it.qty > 0)) {
      return { ok: false, error: makeError('invalid_argument', 'items[' + i + '].qty 必须 >0（当前 ' + it.qty + '）', { retryable: true }) };
    }
  }

  // 可写字段白名单（第二层拦截）。
  const writable = new Set(allowlist.WRITABLE_FIELDS.stock_transfer_create);
  for (const k of Object.keys(args)) {
    if (k === 'from_warehouse' || k === 'to_warehouse' || k === 'items' || k === 'stock_entry_type') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.stock_transfer_create.join('/'), { retryable: true }) };
    }
  }

  // 幂等指纹（进指纹 = 公司 + 源仓/目仓 + 行项目 + 过账日期）。
  const businessParams = {
    t: 'stock_transfer_create',
    from_warehouse: fromWarehouse,
    to_warehouse: toWarehouse,
    items: items,
    ...(args.posting_date ? { posting_date: args.posting_date } : {}),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言：源/目标仓存在。
  const fw = await ctx.backend.getCount('Warehouse', [['name', '=', fromWarehouse]]);
  if (!fw.ok) return fw;
  if (fw.count === 0) return { ok: false, error: makeError('precondition_failed', '源仓库「' + fromWarehouse + '」不存在：请指定存在的仓库', { retryable: false }) };
  const tw = await ctx.backend.getCount('Warehouse', [['name', '=', toWarehouse]]);
  if (!tw.ok) return tw;
  if (tw.count === 0) return { ok: false, error: makeError('precondition_failed', '目标仓库「' + toWarehouse + '」不存在：请指定存在的仓库', { retryable: false }) };

  // 前置断言：源仓各物料可用量 ≥ 调拨量（server 查 Bin，projected_qty 为可用量，B04 F5）。
  for (const it of items) {
    const bin = await ctx.backend.getList('Bin', {
      fields: ['name', 'item_code', 'warehouse', 'projected_qty', 'actual_qty'],
      filters: [['item_code', '=', it.item_code], ['warehouse', '=', fromWarehouse]],
      limitPageLength: 1,
    });
    if (!bin.ok) return bin;
    const b = (bin.data || [])[0];
    const available = b ? (typeof b.projected_qty === 'number' ? b.projected_qty : b.actual_qty) : 0;
    if (available < it.qty) {
      return {
        ok: false,
        error: makeError('precondition_failed',
          '源仓「' + fromWarehouse + '」物料「' + it.item_code + '」可用量不足（需 ' + it.qty + '，可 ' + available + '）：请减量或换仓', {
          retryable: false,
          details: { item_code: it.item_code, required: it.qty, available: available },
        }),
      };
    }
    // 物料存在且为库存物料（Bin 无记录时可用量 0，前置拦截）。
    if (!b) {
      return { ok: false, error: makeError('precondition_failed', '物料「' + it.item_code + '」在源仓无库存记录：请指定存在的库存物料', { retryable: false }) };
    }
  }

  // 全自动档：仅 L3 免确认；写入能力门控（币种/价格表 fail-closed + 客户端 elicitation，PRD 决议 1/2）。
  const gate = writeGate(ctx);
  if (!gate.ok) return gate;

  // 后端写（POST Stock Entry；stock_entry_type 必填，purpose 由后端派生）。
  const doc = {
    stock_entry_type: 'Material Transfer',
    from_warehouse: fromWarehouse,
    to_warehouse: toWarehouse,
    items: items.map(function (it) { return { item_code: it.item_code, qty: it.qty, s_warehouse: fromWarehouse, t_warehouse: toWarehouse }; }),
  };
  if (args.posting_date !== undefined && args.posting_date !== null && args.posting_date !== '') doc.posting_date = args.posting_date;

  const created = await ctx.backend.create(DOCTYPE, doc);
  if (!created.ok) return created;

  // 写后回读终态（源/目仓 + 行项目 + 草稿态）。
  const newName = (created.data && created.data.name);
  const rb = await ctx.backend.get(DOCTYPE, newName);
  if (!rb.ok) return rb;

  const result = {
    name: rb.data.name,
    stock_entry_type: rb.data.stock_entry_type,
    from_warehouse: rb.data.from_warehouse,
    to_warehouse: rb.data.to_warehouse,
    status: rb.data.docstatus === 0 ? 'Draft' : (rb.data.docstatus === 1 ? 'Submitted' : 'Cancelled'),
    items: items.map(function (it) { return { item_code: it.item_code, qty: it.qty }; }),
  };

  // 记首结果 + 批次（同批 = 调拨草稿；回滚草稿 → 删除）。
  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_stock_transfer_create' });
    ctx.batchLedger.recordChange(bId, buildChange({ objectType: DOCTYPE, objectName: result.name, action: 'create', afterState: 'draft' }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

module.exports = { definition, handler };
