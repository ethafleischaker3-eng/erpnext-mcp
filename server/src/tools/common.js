'use strict';
/*
 * F01 读 tool 公共工具（分页/过滤/字段投影）
 * ============================================================
 * 供 6 个读 tool handler 复用；不新增通用执行面（D01 §7.6：通用查询能力仅在 tool 实现内部复用，
 * 不作为 tool 执行面暴露）。
 */

const { makeError } = require('../../lib/errors');
const allowlist = require('../allowlist');

// 把 filters 对象转成 Frappe 过滤器数组（AND 并列）；键必须在白名单内，否则 invalid_argument。
// 值语义：标量 → [field, "=", value]；操作符对象 { op: operand } → [field, op, operand]。
function buildFilters(filters, fieldWhitelist) {
  const result = [];
  if (filters === undefined || filters === null) return { ok: true, filters: undefined };
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    return { ok: false, error: makeError('invalid_argument', 'filters 必须是对象（字段名 → 值），不接受数组或任意字段名', { retryable: true }) };
  }
  const allowed = new Set(fieldWhitelist);
  for (const field of Object.keys(filters)) {
    if (!allowed.has(field)) {
      return {
        ok: false,
        error: makeError('invalid_argument', 'filters 含未知字段「' + field + '」：请改用该对象的可检索字段', {
          retryable: true,
          details: { allowed_fields: fieldWhitelist.slice() },
        }),
      };
    }
    const raw = filters[field];
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      // 操作符对象：恰好一个 op 键。
      const ops = Object.keys(raw);
      if (ops.length !== 1 || allowlist.FILTER_OPERATORS.indexOf(ops[0]) === -1) {
        return {
          ok: false,
          error: makeError('invalid_argument', '字段「' + field + '」的过滤操作符非法：仅支持 ' + allowlist.FILTER_OPERATORS.join('/'), {
            retryable: true,
            details: { allowed_operators: allowlist.FILTER_OPERATORS.slice() },
          }),
        };
      }
      const op = ops[0];
      const operand = raw[op];
      if (op === 'between' && (!Array.isArray(operand) || operand.length !== 2)) {
        return { ok: false, error: makeError('invalid_argument', '字段「' + field + '」的 between 需要 [起, 止] 两个值', { retryable: true }) };
      }
      result.push([field, op, operand]);
    } else {
      result.push([field, '=', raw]);
    }
  }
  return { ok: true, filters: result };
}

// 分页归一化：page 1 起；page_size 默认 DEFAULT_PAGE_SIZE、上限 MAX_PAGE_SIZE（超出截断 + 分页提示）。
function paginate(page, pageSize) {
  const size = (pageSize === undefined || pageSize === null)
    ? allowlist.DEFAULT_PAGE_SIZE
    : Math.min(Math.max(1, parseInt(pageSize, 10) || allowlist.DEFAULT_PAGE_SIZE), allowlist.MAX_PAGE_SIZE);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const clamped = (pageSize !== undefined && pageSize !== null && (parseInt(pageSize, 10) || 0) > allowlist.MAX_PAGE_SIZE);
  return { page: p, pageSize: size, limitStart: (p - 1) * size, clamped: clamped };
}

// 字段投影：summary 只取关键字段；detail 返回全量并剥除低层系统字段。
function projectFields(doc, objectType, detailLevel) {
  if (!doc || typeof doc !== 'object') return doc;
  if (detailLevel === 'summary') {
    const keep = allowlist.SUMMARY_FIELDS[objectType] || [];
    const out = {};
    for (const k of keep) {
      if (doc[k] !== undefined) out[k] = doc[k];
    }
    return out;
  }
  // detail：剥除低层技术/系统字段。
  const system = new Set(allowlist.SYSTEM_FIELDS);
  const out = {};
  for (const k of Object.keys(doc)) {
    if (!system.has(k)) out[k] = doc[k];
  }
  return out;
}

// 语义化单据状态（docstatus → 可读状态；B02/B03/B04 §5）。
function semanticStatus(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.status !== undefined) return doc.status;
  if (doc.docstatus === 0) return 'Draft';
  if (doc.docstatus === 1) return 'Submitted';
  if (doc.docstatus === 2) return 'Cancelled';
  return null;
}

module.exports = { buildFilters, paginate, projectFields, semanticStatus };
