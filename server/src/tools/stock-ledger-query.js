'use strict';
/*
 * F01 #4 erpnext_stock_ledger_query（W03）
 * ============================================================
 * 忠实 D02 §2.4：目标 Stock Ledger Entry（只读）；item_code/warehouse 语义引用；日期区间。
 * 盘点（Stock Reconciliation）流水以 qty_after_transaction=新基线、actual_qty=0 表达（B04 F7/F6），
 * 返回时如实呈现、不混淆。
 * 幂等/前置/事后/批次：不适用（只读）。
 */

const allowlist = require('../allowlist');
const { paginate } = require('./common');

const SLE_FIELDS = ['name', 'item_code', 'warehouse', 'posting_date', 'posting_time', 'actual_qty', 'qty_after_transaction', 'voucher_type', 'voucher_no', 'is_cancelled'];

const definition = {
  name: 'erpnext_stock_ledger_query',
  description:
    '查询库存出入库流水（Stock Ledger），追溯物料的每次入库/出库/调拨/盘点变动及其来源单据。' +
    '消歧：这是「流水」查询；当前余量用 erpnext_stock_level_query；单据/主数据用 erpnext_document_search/erpnext_document_get。' +
    '窄接口边界：只读；仅读库存流水（Stock Ledger Entry）；不写。',
  inputSchema: {
    type: 'object',
    properties: {
      item_code: { type: 'string', description: '物料编码（语义标识，解析到操作允许清单 Item）。' },
      warehouse: { type: 'string', description: '仓库名（引用允许清单 Warehouse）。' },
      from_date: { type: 'string', description: '过账起始日期（含，YYYY-MM-DD）。' },
      to_date: { type: 'string', description: '过账截止日期（含，YYYY-MM-DD）。' },
      page: { type: 'integer', description: '页码（从 1 起，缺省 1）。' },
      page_size: { type: 'integer', description: '每页条数（缺省 ' + allowlist.DEFAULT_PAGE_SIZE + '，上限 ' + allowlist.MAX_PAGE_SIZE + '，超出自动截断）。' },
      detail: { type: 'string', enum: allowlist.DETAIL_LEVELS.slice(), description: '详略：summary（简略，默认）/ detail（详细）。' },
    },
  },
  annotations: {
    title: '库存流水查询',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const makeError = ctx.errors.makeError;

  const filters = [];
  if (args.item_code !== undefined && args.item_code !== null && args.item_code !== '') {
    if (typeof args.item_code !== 'string') return { ok: false, error: makeError('invalid_argument', 'item_code 必须是物料编码字符串', { retryable: true }) };
    filters.push(['item_code', '=', args.item_code]);
  }
  if (args.warehouse !== undefined && args.warehouse !== null && args.warehouse !== '') {
    if (typeof args.warehouse !== 'string') return { ok: false, error: makeError('invalid_argument', 'warehouse 必须是仓库名字符串', { retryable: true }) };
    filters.push(['warehouse', '=', args.warehouse]);
  }

  // 日期区间：from/to 独立或组合为 between（D02 §2.4 from_date/to_date 时间区间）。
  const from = args.from_date;
  const to = args.to_date;
  if (from !== undefined && from !== null && from !== '') {
    if (to !== undefined && to !== null && to !== '') {
      filters.push(['posting_date', 'between', [from, to]]);
    } else {
      filters.push(['posting_date', '>=', from]);
    }
  } else if (to !== undefined && to !== null && to !== '') {
    filters.push(['posting_date', '<=', to]);
  }

  const detail = args.detail === undefined ? allowlist.DEFAULT_DETAIL : args.detail;
  if (allowlist.DETAIL_LEVELS.indexOf(detail) === -1) {
    return { ok: false, error: makeError('invalid_argument', 'detail 非法「' + detail + '」：仅支持 summary / detail', { retryable: true }) };
  }

  const pg = paginate(args.page, args.page_size);
  const cnt = await ctx.backend.getCount(allowlist.STOCK_LEDGER_DOCTYPE, filters.length ? filters : undefined);
  if (!cnt.ok) return cnt;
  const total = cnt.count;
  if (total > allowlist.MAX_TOTAL) {
    return { ok: false, error: makeError('result_set_overflow', '结果集过大（' + total + ' 条）：请缩小日期区间或限定 item_code/warehouse', { retryable: true }) };
  }

  const list = await ctx.backend.getList(allowlist.STOCK_LEDGER_DOCTYPE, {
    fields: detail === 'summary' ? SLE_FIELDS : ['*'],
    filters: filters.length ? filters : undefined,
    limitPageLength: pg.pageSize,
    limitStart: pg.limitStart,
    orderBy: 'posting_date desc, posting_time desc',
  });
  if (!list.ok) return list;

  const items = (list.data || []).map(function (e) {
    if (detail === 'summary') {
      // 变动数量 actual_qty / 变动后余量 qty_after_transaction（SR 盘点：actual_qty=0、qty_after_transaction=新基线，如实呈现）。
      return {
        posting_date: e.posting_date,
        ...(e.posting_time !== undefined ? { posting_time: e.posting_time } : {}),
        item_code: e.item_code,
        warehouse: e.warehouse,
        change_qty: e.actual_qty,
        balance_qty: e.qty_after_transaction,
        source_document: e.voucher_type + (e.voucher_no ? ' ' + e.voucher_no : ''),
        ...(e.is_cancelled ? { cancelled: true } : {}),
      };
    }
    return e;
  });

  const truncated = total > pg.page * pg.pageSize;
  return {
    ok: true,
    result: {
      items: items,
      total: total,
      page: pg.page,
      page_size: pg.pageSize,
      truncated: truncated,
      ...(truncated ? { hint: '结果已按分页截断：请缩小日期区间或翻页以收敛结果' } : {}),
    },
  };
}

module.exports = { definition, handler };
