'use strict';
/*
 * F01 #3 erpnext_stock_level_query（W03）
 * ============================================================
 * 忠实 D02 §2.3：目标 Bin（只读）；item_code 为物料编码语义标识（解析到操作允许清单 Item）；
 * warehouse Link → 引用允许清单 Warehouse。引用不存在（LinkValidationError 417）→ precondition_failed。
 * 幂等/前置/事后/批次：不适用（只读，理由同 D02 §2.3 第 7/9 项）。
 */

const allowlist = require('../allowlist');
const { paginate } = require('./common');

// Bin 语义化余量字段（D02 §2.3：actual_qty 实际 / available 可用 / reserved 预留）。
const BIN_FIELDS = ['name', 'item_code', 'warehouse', 'actual_qty', 'projected_qty', 'reserved_qty', 'stock_uom'];

const definition = {
  name: 'erpnext_stock_level_query',
  description:
    '查询物料在各仓库的实物库存余量（实际量、可用量、预留量）。' +
    '消歧：这是「实物库存余量」查询；查单据/主数据用 erpnext_document_search/erpnext_document_get，查出入库流水用 erpnext_stock_ledger_query。' +
    '窄接口边界：只读；仅读库存余量（Bin）；不写、不调拨。',
  inputSchema: {
    type: 'object',
    properties: {
      item_code: { type: 'string', description: '物料编码（语义标识，解析到操作允许清单 Item）；不填返回全部有库存的物料。' },
      warehouse: { type: 'string', description: '仓库名（引用允许清单 Warehouse）；不填返回全部仓库。' },
      page: { type: 'integer', description: '页码（从 1 起，缺省 1）。' },
      page_size: { type: 'integer', description: '每页条数（缺省 ' + allowlist.DEFAULT_PAGE_SIZE + '，上限 ' + allowlist.MAX_PAGE_SIZE + '，超出自动截断）。' },
      detail: { type: 'string', enum: allowlist.DETAIL_LEVELS.slice(), description: '详略：summary（简略，默认）/ detail（详细）。' },
    },
  },
  annotations: {
    title: '库存余量查询',
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

  const detail = args.detail === undefined ? allowlist.DEFAULT_DETAIL : args.detail;
  if (allowlist.DETAIL_LEVELS.indexOf(detail) === -1) {
    return { ok: false, error: makeError('invalid_argument', 'detail 非法「' + detail + '」：仅支持 summary / detail', { retryable: true }) };
  }

  const pg = paginate(args.page, args.page_size);
  const cnt = await ctx.backend.getCount(allowlist.STOCK_LEVEL_DOCTYPE, filters.length ? filters : undefined);
  if (!cnt.ok) return cnt;
  const total = cnt.count;
  if (total > allowlist.MAX_TOTAL) {
    return { ok: false, error: makeError('result_set_overflow', '结果集过大（' + total + ' 条）：请限定 item_code 或 warehouse、或翻页', { retryable: true }) };
  }

  const list = await ctx.backend.getList(allowlist.STOCK_LEVEL_DOCTYPE, {
    fields: detail === 'summary' ? BIN_FIELDS : ['*'],
    filters: filters.length ? filters : undefined,
    limitPageLength: pg.pageSize,
    limitStart: pg.limitStart,
  });
  if (!list.ok) return list;

  const items = (list.data || []).map(function (b) {
    if (detail === 'summary') {
      return {
        item_code: b.item_code,
        warehouse: b.warehouse,
        actual_qty: b.actual_qty,        // 实际量
        available_qty: b.projected_qty,  // 可用量（Bin.projected_qty）
        reserved_qty: b.reserved_qty,    // 预留量
        ...(b.stock_uom !== undefined ? { stock_uom: b.stock_uom } : {}),
      };
    }
    return b;
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
      ...(truncated ? { hint: '结果已按分页截断：请翻页或限定 item_code/warehouse 以收敛结果' } : {}),
    },
  };
}

module.exports = { definition, handler };
