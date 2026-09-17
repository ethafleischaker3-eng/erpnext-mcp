'use strict';
/*
 * F01 #2 erpnext_document_get（W03）
 * ============================================================
 * 忠实 D02 §2.2 冻结口径。目标类型同 #1 九类；object_id 为语义标识（客户名/物料编码/单据编号），
 * 由 server 直接作为后端 name 解析，不要求填内部标识符。目标不存在（404）→ precondition_failed。
 * 幂等/前置/事后/批次：不适用（只读）。
 */

const allowlist = require('../allowlist');
const { projectFields, semanticStatus } = require('./common');

const definition = {
  name: 'erpnext_document_get',
  description:
    '按语义标识（客户名、物料编码、单据编号等业务可读标识）读取单个单据或主数据对象的完整详情与当前状态（含单据状态机当前态）。' +
    '消歧：这是「单个对象详情」，批量检索用 erpnext_document_search；查库存余量/流水分别用 erpnext_stock_level_query/erpnext_stock_ledger_query。' +
    '窄接口边界：只读；目标类型同 erpnext_document_search 的九类对象；子表仅随父单据一并返回，不作为独立目标查询。',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        enum: allowlist.OBJECT_TYPES.slice(),
        description: '目标对象类型（同 erpnext_document_search 的九类枚举，不含 supplier/bin/stock_ledger_entry）。',
      },
      object_id: { type: 'string', description: '语义标识（客户名、物料编码、单据编号等）；由 server 解析为后端标识，不要求填内部标识符。' },
    },
    required: ['object_type', 'object_id'],
  },
  annotations: {
    title: '单据/主数据详情查询',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const makeError = ctx.errors.makeError;

  const objectType = args.object_type;
  const doctype = allowlist.OBJECT_TYPE_TO_DOCTYPE[objectType];
  if (!doctype) {
    return {
      ok: false,
      error: makeError('invalid_argument', 'object_type 非法「' + objectType + '」：请从九类允许对象中指定一个', {
        retryable: true,
        details: { allowed_object_types: allowlist.OBJECT_TYPES.slice() },
      }),
    };
  }

  if (typeof args.object_id !== 'string' || args.object_id.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'object_id 必填：请提供客户名/物料编码/单据编号等语义标识', { retryable: true }) };
  }

  // 单条只读查询；目标不存在（DoesNotExistError 404）由 translate 转 precondition_failed（D02 §2.2 第 8 项）。
  const got = await ctx.backend.get(doctype, args.object_id);
  if (!got.ok) return got;

  const doc = got.data;
  if (!doc || typeof doc !== 'object') {
    return { ok: false, error: makeError('precondition_failed', '未找到 ' + objectType + ' 标识「' + args.object_id + '」：请核对语义标识或先用 erpnext_document_search 定位', { retryable: false }) };
  }

  const status = semanticStatus(doc);
  const detail = projectFields(doc, objectType, 'detail');
  return {
    ok: true,
    result: {
      object_type: objectType,
      name: doc.name,
      status: status,
      ...(doc.docstatus !== undefined ? { docstatus: doc.docstatus } : {}),
      ...(doc.modified !== undefined ? { modified: doc.modified } : {}),
      ...detail,
    },
  };
}

module.exports = { definition, handler };
