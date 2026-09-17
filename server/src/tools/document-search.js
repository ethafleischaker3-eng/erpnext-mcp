'use strict';
/*
 * F01 #1 erpnext_document_search（W03）
 * ============================================================
 * 忠实 D02 §2.1 冻结口径：name/description/输入输出 schema/annotation/错误转译/批次行为。
 * 白名单挂接（W06）：object_type 硬编码九类（排除 supplier/bin/stock_ledger_entry）；
 * filters 仅该对象可检索字段（allowlist.FILTER_FIELDS）；后端经 mcp-service 只读调用。
 * 幂等/前置/事后/批次：不适用（只读，理由见 D02 §2.1 第 7/9 项）。
 */

const allowlist = require('../allowlist');
const { buildFilters, paginate, projectFields } = require('./common');

const definition = {
  name: 'erpnext_document_search',
  description:
    '按业务条件在一类单据或主数据对象中检索匹配记录，返回分页、可过滤、可截断的结果列表。' +
    '查询对象限于操作允许清单中的单据与主数据（客户、物料、物料价格、销售订单、采购订单、采购收货单、销售发货单、库存调拨、库存盘点），不含供应商、库存余量与库存流水。' +
    '消歧：供应商检索必须用 erpnext_supplier_search（本 tool 不接受供应商为目标对象）；查实物库存用 erpnext_stock_level_query，查出入库流水用 erpnext_stock_ledger_query，查单个对象详情用 erpnext_document_get。' +
    '窄接口边界：只读；不接受任意对象类型或任意字段名；对象类型限定为上述九类。',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        enum: allowlist.OBJECT_TYPES.slice(),
        description: '目标对象类型（九类之一：customer/item/item_price/sales_order/purchase_order/purchase_receipt/delivery_note/stock_entry/stock_reconciliation）。不含 supplier/bin/stock_ledger_entry。',
      },
      filters: {
        type: 'object',
        description: '按该对象类型的业务字段过滤（字段名限该对象可检索字段；值为标量=等值，或 {操作符: 值}，操作符限 =/!=/</>/<=/>=/like/not like/in/not in/between）。不接受任意字段名。',
      },
      page: { type: 'integer', description: '页码（从 1 起，缺省 1）。' },
      page_size: { type: 'integer', description: '每页条数（缺省 ' + allowlist.DEFAULT_PAGE_SIZE + '，上限 ' + allowlist.MAX_PAGE_SIZE + '，超出自动截断并附分页提示）。' },
      detail: { type: 'string', enum: allowlist.DETAIL_LEVELS.slice(), description: '详略：summary（简略，默认）/ detail（详细）。' },
    },
    required: ['object_type'],
  },
  annotations: {
    title: '通用单据/主数据检索',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const makeError = ctx.errors.makeError;

  // 对象类型硬编码枚举校验（第二层拦截）；非法（含 supplier/bin/stock_ledger_entry）→ invalid_argument。
  const objectType = args.object_type;
  const doctype = allowlist.OBJECT_TYPE_TO_DOCTYPE[objectType];
  if (!doctype) {
    return {
      ok: false,
      error: makeError('invalid_argument', 'object_type 非法「' + objectType + '」：请从九类允许对象中指定一个（customer/item/item_price/sales_order/purchase_order/purchase_receipt/delivery_note/stock_entry/stock_reconciliation）', {
        retryable: true,
        details: { allowed_object_types: allowlist.OBJECT_TYPES.slice() },
      }),
    };
  }

  // 详略枚举校验。
  const detail = args.detail === undefined ? allowlist.DEFAULT_DETAIL : args.detail;
  if (allowlist.DETAIL_LEVELS.indexOf(detail) === -1) {
    return { ok: false, error: makeError('invalid_argument', 'detail 非法「' + detail + '」：仅支持 summary / detail', { retryable: true }) };
  }

  // filters 字段白名单校验 + 转 Frappe 过滤器。
  const fb = buildFilters(args.filters, allowlist.FILTER_FIELDS[objectType]);
  if (!fb.ok) return fb;

  // 分页归一化（page_size 有上限，超出截断）。
  const pg = paginate(args.page, args.page_size);

  // 结果集硬上限：total 超限 → result_set_overflow（D02 §2.1 错误转译）。
  const cnt = await ctx.backend.getCount(doctype, fb.filters);
  if (!cnt.ok) return cnt;
  const total = cnt.count;
  if (total > allowlist.MAX_TOTAL) {
    return { ok: false, error: makeError('result_set_overflow', '结果集过大（' + total + ' 条）：请追加过滤、缩小日期区间或翻页', { retryable: true }) };
  }

  // 只读列表查询。
  const fields = detail === 'summary' ? allowlist.SUMMARY_FIELDS[objectType] : ['*'];
  const list = await ctx.backend.getList(doctype, {
    fields: fields,
    filters: fb.filters,
    limitPageLength: pg.pageSize,
    limitStart: pg.limitStart,
  });
  if (!list.ok) return list;

  const items = (list.data || []).map(function (doc) { return projectFields(doc, objectType, detail); });
  const truncated = total > pg.page * pg.pageSize;
  return {
    ok: true,
    result: {
      items: items,
      total: total,
      page: pg.page,
      page_size: pg.pageSize,
      truncated: truncated,
      ...(truncated ? { hint: '结果已按分页截断：请翻页或追加过滤以收敛结果' } : {}),
    },
  };
}

module.exports = { definition, handler };
