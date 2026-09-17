'use strict';
/*
 * F04 #6 erpnext_customer_create（W03/W06/W07）
 * ============================================================
 * 忠实 D02 §3.1：登记新客户（人确认）。目标 Customer ▲；create 组 300s 指纹合并；不带 modified。
 * 前置断言（server 侧）：同名 customer_name 不存在（B01 F1 后端不拒重名，须 server 先查）；
 *   customer_group 有效且非 is_group=1；territory 有效（若提供）。
 * 写：POST /api/resource/Customer；写后回读新客户语义标识 + 关键字段。
 * 回滚：未被引用才删除；被引用转管理员。错误转译忠实 D02 §3.1 第 8 项。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Customer';

const definition = {
  name: 'erpnext_customer_create',
  description:
    '登记一个新客户。' +
    '消歧：同名客户不存在时才用本 tool 创建；已存在必须走 erpnext_customer_update，本 tool 会报错并指回 update。' +
    '窄接口边界：只写 Customer 的登记字段；不隐式创建或修改 Contact、Address；引用字段目标仅限引用允许清单（Customer Group / Territory）。',
  inputSchema: {
    type: 'object',
    properties: {
      customer_name: { type: 'string', description: '客户名称（作为语义标识，必填）。' },
      customer_group: { type: 'string', description: '客户分组（引用允许清单 Customer Group，必填，且不得指向 is_group=1 的分组节点）。' },
      territory: { type: 'string', description: '区域（引用允许清单 Territory，可选）。' },
      customer_type: { type: 'string', description: '客户类型（可选）。' },
      disabled: { type: 'boolean', description: '是否禁用（可选，缺省启用）。' },
    },
    required: ['customer_name', 'customer_group'],
  },
  annotations: {
    title: '登记新客户',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const customerName = args.customer_name;
  const customerGroup = args.customer_group;

  // schema 校验（不计入业务前置断言）。
  if (typeof customerName !== 'string' || customerName.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'customer_name 必填：请提供客户名称', { retryable: true }) };
  }
  if (typeof customerGroup !== 'string' || customerGroup.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'customer_group 必填：请提供客户分组（引用允许清单 Customer Group）', { retryable: true }) };
  }

  // 可写字段白名单（第二层拦截）：不接受任意字段名/不可改字段。
  const writable = new Set(allowlist.WRITABLE_FIELDS.customer_create);
  for (const k of Object.keys(args)) {
    if (k === 'customer_name' || k === 'customer_group') continue; // 已显式校验的参数
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.customer_create.join('/'), { retryable: true }) };
    }
  }

  // 幂等指纹（进指纹 = 对象类型 + 全部业务有效输入）。
  const businessParams = {
    t: 'customer_create',
    customer_name: customerName,
    customer_group: customerGroup,
    ...pick(args, ['territory', 'customer_type', 'disabled']),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言（业务状态层，依次 await）。
  // ① 同名客户不存在（server 先查，B01 F1）。
  const dup = await ctx.backend.getCount(DOCTYPE, [['customer_name', '=', customerName]]);
  if (!dup.ok) return dup;
  if (dup.count > 0) {
    return { ok: false, error: makeError('precondition_failed', '同名客户「' + customerName + '」已存在：请改用 erpnext_customer_update', { retryable: false }) };
  }

  // ② customer_group 有效且非分组节点（is_group=1）。
  const grp = await ctx.backend.getList('Customer Group', { fields: ['name', 'is_group'], filters: [['name', '=', customerGroup]], limitPageLength: 1 });
  if (!grp.ok) return grp;
  const g = (grp.data || [])[0];
  if (!g) {
    return { ok: false, error: makeError('precondition_failed', '客户分组「' + customerGroup + '」不存在：请指定存在的客户分组', { retryable: false }) };
  }
  if (g.is_group === 1) {
    return { ok: false, error: makeError('precondition_failed', '客户分组「' + customerGroup + '」是分组节点：请选择非分组叶子分组', { retryable: false }) };
  }

  // ③ territory 有效（若提供）。
  if (args.territory !== undefined && args.territory !== null && args.territory !== '') {
    const terr = await ctx.backend.getCount('Territory', [['name', '=', args.territory]]);
    if (!terr.ok) return terr;
    if (terr.count === 0) {
      return { ok: false, error: makeError('precondition_failed', '区域「' + args.territory + '」不存在：请指定存在的区域', { retryable: false }) };
    }
  }

  // 写入能力门控（币种/价格表 fail-closed + 客户端 elicitation，PRD 决议 1/2）。
  const gate = writeGate(ctx);
  if (!gate.ok) return gate;

  // 确认（人确认档）。
  const conf = await confirmIfNeeded(ctx, 'erpnext_customer_create', args);
  if (!conf.ok) return conf;

  // 后端写（POST）。
  const doc = { customer_name: customerName, customer_group: customerGroup };
  if (args.territory !== undefined && args.territory !== null && args.territory !== '') doc.territory = args.territory;
  if (args.customer_type !== undefined && args.customer_type !== null && args.customer_type !== '') doc.customer_type = args.customer_type;
  if (args.disabled !== undefined) doc.disabled = args.disabled ? 1 : 0;

  const created = await ctx.backend.create(DOCTYPE, doc);
  if (!created.ok) return created;

  // 写后回读终态。
  const newName = (created.data && created.data.name) || customerName;
  const rb = await ctx.backend.get(DOCTYPE, newName);
  if (!rb.ok) return rb;

  const result = {
    name: rb.data && rb.data.name ? rb.data.name : newName,
    customer_name: rb.data.customer_name,
    customer_group: rb.data.customer_group,
    ...(rb.data.territory !== undefined ? { territory: rb.data.territory } : {}),
  };

  // 记首结果 + 批次（同批 = 新客户；回滚路径 draft→delete，未引用才删）。
  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_customer_create' });
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
