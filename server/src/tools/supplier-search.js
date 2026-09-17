'use strict';
/*
 * F01 #5 erpnext_supplier_search（W03）
 * ============================================================
 * 忠实 D02 §2.5：目标仅 Supplier（Supplier 检索必须走本 tool，document_search 不接受 supplier）；
 * supplier_group Link → 引用允许清单 Supplier Group。引用不存在（417）→ precondition_failed。
 * 幂等/前置/事后/批次：不适用（只读）。
 */

const allowlist = require('../allowlist');
const { paginate } = require('./common');

const SUPPLIER_FIELDS = ['name', 'supplier_name', 'supplier_group', 'disabled'];

const definition = {
  name: 'erpnext_supplier_search',
  description:
    '检索供应商主数据。' +
    '消歧：供应商检索必须走本 tool；erpnext_document_search 不接受供应商为目标对象（server 侧禁止）。' +
    '窄接口边界：只读；目标仅供应商（Supplier）。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '供应商名称/编码关键字匹配（模糊匹配供应商名称）。' },
      supplier_group: { type: 'string', description: '供应商分组（引用允许清单 Supplier Group）。' },
      page: { type: 'integer', description: '页码（从 1 起，缺省 1）。' },
      page_size: { type: 'integer', description: '每页条数（缺省 ' + allowlist.DEFAULT_PAGE_SIZE + '，上限 ' + allowlist.MAX_PAGE_SIZE + '，超出自动截断）。' },
      detail: { type: 'string', enum: allowlist.DETAIL_LEVELS.slice(), description: '详略：summary（简略，默认）/ detail（详细）。' },
    },
  },
  annotations: {
    title: '供应商检索',
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
  if (args.keyword !== undefined && args.keyword !== null && args.keyword !== '') {
    if (typeof args.keyword !== 'string') return { ok: false, error: makeError('invalid_argument', 'keyword 必须是供应商名称/编码关键字字符串', { retryable: true }) };
    // 供应商 name 取 supplier_name（B01 §2.2），关键字对 supplier_name 模糊匹配。
    filters.push(['supplier_name', 'like', '%' + args.keyword + '%']);
  }
  if (args.supplier_group !== undefined && args.supplier_group !== null && args.supplier_group !== '') {
    if (typeof args.supplier_group !== 'string') return { ok: false, error: makeError('invalid_argument', 'supplier_group 必须是供应商分组名字符串', { retryable: true }) };
    filters.push(['supplier_group', '=', args.supplier_group]);
  }

  const detail = args.detail === undefined ? allowlist.DEFAULT_DETAIL : args.detail;
  if (allowlist.DETAIL_LEVELS.indexOf(detail) === -1) {
    return { ok: false, error: makeError('invalid_argument', 'detail 非法「' + detail + '」：仅支持 summary / detail', { retryable: true }) };
  }

  const pg = paginate(args.page, args.page_size);
  const cnt = await ctx.backend.getCount(allowlist.SUPPLIER_DOCTYPE, filters.length ? filters : undefined);
  if (!cnt.ok) return cnt;
  const total = cnt.count;
  if (total > allowlist.MAX_TOTAL) {
    return { ok: false, error: makeError('result_set_overflow', '结果集过大（' + total + ' 条）：请追加关键字或分组过滤、或翻页', { retryable: true }) };
  }

  const list = await ctx.backend.getList(allowlist.SUPPLIER_DOCTYPE, {
    fields: detail === 'summary' ? SUPPLIER_FIELDS : ['*'],
    filters: filters.length ? filters : undefined,
    limitPageLength: pg.pageSize,
    limitStart: pg.limitStart,
  });
  if (!list.ok) return list;

  const items = (list.data || []).map(function (s) {
    if (detail === 'summary') {
      return {
        supplier_name: s.name !== undefined ? s.name : s.supplier_name,
        ...(s.supplier_group !== undefined ? { supplier_group: s.supplier_group } : {}),
        ...(s.disabled !== undefined ? { disabled: s.disabled } : {}),
      };
    }
    return s;
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
      ...(truncated ? { hint: '结果已按分页截断：请追加关键字/分组过滤或翻页以收敛结果' } : {}),
    },
  };
}

module.exports = { definition, handler };
