'use strict';
/*
 * F04 #25 erpnext_stock_reconciliation_plan（W04）
 * 忠实 D02 §6.3：生成盘点调整方案（只出 plan，不写数据）。目标 Bin/SLE ◐。
 * 读现状（get_items as-of-time 或 Bin/SLE，B04 F11）；无写入、无确认、无幂等窗口、无批次。
 * 输出客观 plan：拟调整物料/仓库/数量（current_qty/valuation_rate/建议 qty）、执行顺序、前置条件、
 *   风险提示（新物料无估值率 / 纯净实例首笔 opening-entry 门槛，B04 F7/F8）。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');

const definition = {
  name: 'erpnext_stock_reconciliation_plan',
  description:
    '读取仓库当前库存现状，产出库存盘点调整方案（拟调整的物料、仓库、数量、估值率与执行顺序、风险提示），不写任何数据。' +
    '消歧：账实对齐（盘点）用本 tool；已知源/目标仓库的确定性移动用 erpnext_stock_transfer_create。' +
    '窄接口边界：只读现状（Bin/SLE 或 get_items）；不提交、不改数据、不产生盘点单据。',
  inputSchema: {
    type: 'object',
    properties: {
      warehouse: { type: 'string', description: '盘点仓库（引用允许清单 Warehouse，必填）。' },
      item_code: { type: 'string', description: '限定物料（缺省返回仓库内全部物料现状）。' },
      posting_date: { type: 'string', description: 'as-of-time 读取日期（可选，YYYY-MM-DD）。' },
      posting_time: { type: 'string', description: 'as-of-time 读取时间（可选，HH:MM:SS）。' },
    },
    required: ['warehouse'],
  },
  annotations: {
    title: '生成盘点调整方案',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const warehouse = args.warehouse;
  const itemCode = args.item_code;

  if (typeof warehouse !== 'string' || warehouse.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'warehouse 必填：请提供盘点仓库', { retryable: true }) };
  }

  // warehouse 有效。
  const wh = await ctx.backend.getCount('Warehouse', [['name', '=', warehouse]]);
  if (!wh.ok) return wh;
  if (wh.count === 0) {
    return { ok: false, error: makeError('precondition_failed', '仓库「' + warehouse + '」不存在：请指定存在的仓库', { retryable: false }) };
  }

  const hasPostingDate = args.posting_date !== undefined && args.posting_date !== null && args.posting_date !== '';
  const hasPostingTime = args.posting_time !== undefined && args.posting_time !== null && args.posting_time !== '';

  // 读现状口径（D02 §6.3：Bin/SLE 或 get_items as-of-time，B04 F11）。
  // get_items 的 posting_date/posting_time 为无默认值位置参数，仅在二者齐备时可用；
  // 缺省（D02 冻结 posting_date/posting_time 为可选）时改走 Bin 读现状（复用 F01 stock_level_query 语义）。
  let rows;
  if (hasPostingDate && hasPostingTime) {
    const gi = await ctx.backend.getItems({
      warehouse: warehouse,
      postingDate: args.posting_date,
      postingTime: args.posting_time,
      company: ctx.config && ctx.config.locked ? ctx.config.locked.company : 'gjg',
      itemCode: itemCode,
    });
    if (!gi.ok) return gi;
    rows = (Array.isArray(gi.data) ? gi.data : []).map(function (r) {
      // get_items 返回 current_qty / valuation_rate（as-of-time）。
      return {
        item_code: r.item_code,
        warehouse: r.warehouse || warehouse,
        current_qty: r.current_qty !== undefined ? r.current_qty : null,
        valuation_rate: r.valuation_rate !== undefined ? r.valuation_rate : (r.current_valuation_rate !== undefined ? r.current_valuation_rate : null),
      };
    });
  } else {
    // Bin 读现状（current_qty = actual_qty）。
    const binFilters = [['warehouse', '=', warehouse]];
    if (itemCode !== undefined && itemCode !== null && itemCode !== '') binFilters.push(['item_code', '=', itemCode]);
    const bin = await ctx.backend.getList('Bin', {
      fields: ['item_code', 'warehouse', 'actual_qty'],
      filters: binFilters,
    });
    if (!bin.ok) return bin;
    rows = (bin.data || []).map(function (b) {
      return { item_code: b.item_code, warehouse: b.warehouse || warehouse, current_qty: b.actual_qty, valuation_rate: null };
    });
  }

  const plan = rows.map(function (r) {
    return {
      item_code: r.item_code,
      warehouse: r.warehouse || warehouse,
      current_qty: r.current_qty !== undefined ? r.current_qty : null,
      valuation_rate: r.valuation_rate !== undefined ? r.valuation_rate : null,
      // 建议 qty：默认取 current_qty（账实一致，无系统外事实输入）；估值率缺失时提示。
      suggested_qty: r.current_qty !== undefined ? r.current_qty : null,
      risk: (!r.valuation_rate || r.valuation_rate === 0)
        ? '该物料无估值率：若需提交盘点，请提供 valuation_rate 或 allow_zero_valuation_rate'
        : null,
    };
  });

  // 客观 plan（不覆盖库存基线、不写 Stock Reconciliation 单据）。
  return {
    ok: true,
    result: {
      warehouse: warehouse,
      as_of: {
        posting_date: args.posting_date || null,
        posting_time: args.posting_time || null,
      },
      plan: plan,
      execution_order: plan.map(function (p) { return p.item_code; }),
      preconditions: [
        '盘点提交（若后续 F04 需）须提供 valuation_rate 或按 opening-entry 门槛处理',
        '纯净实例（SLE 空）首笔盘点须用资产负债表账户（expense_account = Temporary Opening 等）',
      ],
      risks: [
        '本 tool 只出 plan、不提交、不改数据；「正确库存」为系统外事实',
        '新物料无估值率时确认报 Valuation Rate required（B04 F7）',
        '首笔 opening-entry 若 expense_account 为 P&L 账户会被 OpeningEntryAccountError 拒绝（B04 F8）',
      ],
    },
  };
}

module.exports = { definition, handler };
