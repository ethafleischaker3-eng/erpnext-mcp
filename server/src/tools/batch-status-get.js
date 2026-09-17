'use strict';
/*
 * F01 #26 erpnext_batch_status_get（W04）
 * ============================================================
 * 挂接 E02 queryBatchStatus（lib/batch-status）与 identity（lib/identity）的只读可见性边界：
 *   归属自身可信调用方身份（会话级）可查；他人批次不可见（permission_denied）；
 *   管理员（adminResolver 钩子，后端 Role/DocPerm 判定）可查全量；不可主动回滚（无 rollback 入口）。
 * 批次归属为会话级、内存不落库（E02 §5.5/B00 身份结论）；跨会话查旧批次不支持（如实记录为残余限制）。
 * 幂等/前置/事后/批次行为：不适用（只读；批次行为=只读可见性边界，非写入批次，无 rollback）。
 */

const { queryBatchStatus } = require('../../lib/batch-status');

const definition = {
  name: 'erpnext_batch_status_get',
  description:
    '查询一次工具调用对应批次的执行状态、涉及对象（对象类型/标识/动作/前后态/回滚路径）与回滚结果。' +
    '这是 server 元数据查询 tool（查询 MCP 侧批次台账，非 ERPNext 业务对象）。' +
    '消歧：查业务对象用 erpnext_document_search/erpnext_document_get；本 tool 只查批次台账。' +
    '窄接口边界：只读；不可主动回滚；只返回归属自身可信调用方身份（会话级）的批次；他人批次不可见。',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'string', description: '批次标识；不填返回归属自身会话的批次列表。' },
    },
  },
  annotations: {
    title: '批次状态查询',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

// 默认管理员判定钩子：F01 为只读接入、未接后端 Role/DocPerm 判定，默认 isAdmin=false（E02 §8.3：
// 未提供 adminResolver 前不宣称管理员查询能力成立）。F04/F02 或后续接入后端身份后可按需注入。
function defaultAdminResolver() { return false; }

async function handler(ctx, args) {
  args = args || {};
  const transportContext = (ctx && ctx.transportContext) || {};
  const adminResolver = (ctx && ctx.adminResolver) || defaultAdminResolver;

  const caller = ctx.identity.resolveCaller(transportContext, adminResolver);

  // 未指定 batch_id → 返回归属自身会话的批次列表（管理员可查全量）。
  if (args.batch_id === undefined || args.batch_id === null || args.batch_id === '') {
    const all = ctx.batchLedger.listAll();
    const visible = caller.isAdmin
      ? all
      : all.filter(function (b) { return b.callerId === caller.callerId; });
    const batches = visible.map(function (b) {
      return {
        batch_id: b.batchId,
        status: b.status,
        created_at: b.createdAt,
        ...(b.toolName ? { tool: b.toolName } : {}),
        changes: (b.changes || []).length,
      };
    });
    return { ok: true, result: { batches: batches } };
  }

  // 指定 batch_id → 挂接 E02 queryBatchStatus（只读，无回滚入口）。
  const r = queryBatchStatus(ctx.batchLedger, caller, args.batch_id);
  if (!r.ok) return r; // { ok:false, error: batch_not_found | permission_denied }
  return { ok: true, result: r.result };
}

module.exports = { definition, handler, defaultAdminResolver };
