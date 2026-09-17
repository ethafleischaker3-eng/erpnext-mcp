'use strict';
/*
 * F04 #12 erpnext_item_price_set（W03/W06/W07）
 * 忠实 D02 §3.7：为物料在指定价目表设置售价及生效区间（新增或修改，人确认）。目标 Item Price ▲。
 * 指纹合并类 300s；修改既有价时必带 modified，新增价时不带。
 * 前置断言：目标物料存在且启用；修改既有价时 modified 一致；价格生效区间不与既有区间重叠（B01 F3 后端不校验，server 自建）。
 * 写：POST/PUT /api/resource/Item Price；写后回读价格（物料 + 价目表 + 生效区间）。
 * 回滚：新增价删除；修改/覆盖价前镜像恢复。错误转译忠实 D02 §3.7 第 8 项。
 */

const allowlist = require('../allowlist');
const { makeError } = require('../../lib/errors');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Item Price';

const definition = {
  name: 'erpnext_item_price_set',
  description:
    '为物料在指定价目表设置（新增或修改）售价及其生效区间。' +
    '消歧：这是维护「物料价格主数据」的专用 tool；新建物料走 erpnext_item_create，建销售/采购订单走对应 create（其单价由价格表解析，不在此改价）。' +
    '窄接口边界：只写 Item Price；目标物料必须存在于操作允许清单。',
  inputSchema: {
    type: 'object',
    properties: {
      item_code: { type: 'string', description: '物料编码（操作允许清单 Item，必填）。' },
      price_list: { type: 'string', description: '价目表（引用允许清单 Price List，必填）。' },
      price_list_rate: { type: 'number', description: '价格（必填）。' },
      valid_from: { type: 'string', description: '生效起始日期（可选，YYYY-MM-DD）。' },
      valid_upto: { type: 'string', description: '生效截止日期（可选，YYYY-MM-DD）。' },
      selling: { type: 'boolean', description: '销售价标记（可选）。' },
      buying: { type: 'boolean', description: '采购价标记（可选）。' },
      modified: { type: 'string', description: '修改既有价格时的当前版本令牌；新增价格时不适用。' },
    },
    required: ['item_code', 'price_list', 'price_list_rate'],
  },
  annotations: {
    title: '设置物料价格',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const itemCode = args.item_code;
  const priceList = args.price_list;
  const rate = args.price_list_rate;

  // schema 校验。
  if (typeof itemCode !== 'string' || itemCode.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'item_code 必填：请提供物料编码', { retryable: true }) };
  }
  if (typeof priceList !== 'string' || priceList.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'price_list 必填：请提供价目表（引用允许清单 Price List）', { retryable: true }) };
  }
  if (typeof rate !== 'number' || !(rate >= 0)) {
    return { ok: false, error: makeError('invalid_argument', 'price_list_rate 必填且须为 ≥0 的数值', { retryable: true }) };
  }

  // 可写字段白名单。
  const writable = new Set(allowlist.WRITABLE_FIELDS.item_price_set);
  for (const k of Object.keys(args)) {
    if (k === 'item_code' || k === 'price_list' || k === 'price_list_rate') continue;
    if (!writable.has(k)) {
      return { ok: false, error: makeError('invalid_argument', '字段「' + k + '」不可写或不受支持：仅限 ' + allowlist.WRITABLE_FIELDS.item_price_set.join('/'), { retryable: true }) };
    }
  }

  // 判断新增 vs 修改：修改需带 modified。
  const isUpdate = typeof args.modified === 'string' && args.modified.trim() !== '';

  // 幂等指纹（进指纹 = 对象标识（item_code + price_list + 生效区间）+ 字段名及目标值）。
  const businessParams = {
    t: 'item_price_set',
    item_code: itemCode,
    price_list: priceList,
    valid_from: args.valid_from,
    valid_upto: args.valid_upto,
    price_list_rate: rate,
    ...pick(args, ['selling', 'buying', 'currency']),
  };
  const chk = idempotency.check('create', businessParams);
  if (chk.hit && chk.firstResult) {
    const { idempotentReplay } = require('../../lib/errors');
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  // 前置断言 ①：物料存在且启用。
  const item = await ctx.backend.get('Item', itemCode);
  if (!item.ok) return item;
  if (!item.data) {
    return { ok: false, error: makeError('precondition_failed', '物料「' + itemCode + '」不存在：请指定存在的物料', { retryable: false }) };
  }
  if (item.data.disabled === 1 || item.data.disabled === true) {
    return { ok: false, error: makeError('precondition_failed', '物料「' + itemCode + '」已禁用：请先启用再设置价格', { retryable: false }) };
  }

  // 前置断言 ②：价目表有效。
  const pl = await ctx.backend.getCount('Price List', [['name', '=', priceList]]);
  if (!pl.ok) return pl;
  if (pl.count === 0) {
    return { ok: false, error: makeError('precondition_failed', '价目表「' + priceList + '」不存在：请指定存在的价目表', { retryable: false }) };
  }

  // 前置断言 ③：生效区间不与既有区间重叠（B01 F3 后端不校验，server 自建）。
  const existing = await ctx.backend.getList(DOCTYPE, {
    fields: ['name', 'item_code', 'price_list', 'valid_from', 'valid_upto', 'modified'],
    filters: [['item_code', '=', itemCode], ['price_list', '=', priceList]],
  });
  if (!existing.ok) return existing;
  const overlap = findOverlap(existing.data || [], args.valid_from, args.valid_upto, isUpdate, args);
  if (overlap) {
    return {
      ok: false,
      error: makeError('precondition_failed',
        '价格生效区间与既有区间重叠（' + overlap.name + (overlap.valid_from ? ' ' + overlap.valid_from : '') + (overlap.valid_upto ? '~' + overlap.valid_upto : '') + '）：请调整生效区间使其不重叠', {
        retryable: true,
        details: { overlapped_price: overlap.name },
      }),
    };
  }

  // 修改既有价：定位目标（区间内单条，或命中 firstPrice），校验 modified。
  let targetName = null;
  if (isUpdate) {
    const target = (existing.data || []).find(function (p) {
      return sameInterval(p, args.valid_from, args.valid_upto);
    });
    if (!target) {
      return { ok: false, error: makeError('precondition_failed', '未找到匹配生效区间的既有价格：请核对 valid_from/valid_upto 或作为新增价处理（不带 modified）', { retryable: false }) };
    }
    if (target.modified !== undefined && target.modified !== args.modified) {
      return { ok: false, error: makeError('concurrency_conflict', '价格已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
    }
    targetName = target.name;
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_item_price_set', args);
  if (!conf.ok) return conf;

  // 后端写：新增走 POST，修改走 PUT。
  const doc = {
    item_code: itemCode,
    price_list: priceList,
    price_list_rate: rate,
    ...(args.selling !== undefined ? { selling: args.selling ? 1 : 0 } : {}),
    ...(args.buying !== undefined ? { buying: args.buying ? 1 : 0 } : {}),
  };
  if (args.valid_from !== undefined && args.valid_from !== null && args.valid_from !== '') doc.valid_from = args.valid_from;
  if (args.valid_upto !== undefined && args.valid_upto !== null && args.valid_upto !== '') doc.valid_upto = args.valid_upto;

  let written;
  if (isUpdate) {
    doc.modified = args.modified;
    written = await ctx.backend.update(DOCTYPE, targetName, doc);
  } else {
    written = await ctx.backend.create(DOCTYPE, doc);
  }
  if (!written.ok) return written;

  // 写后回读终态（物料 + 价目表 + 生效区间）。
  const finalName = (written.data && written.data.name) || targetName;
  const rb = await ctx.backend.getList(DOCTYPE, {
    fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'valid_from', 'valid_upto', 'selling', 'buying'],
    filters: [['item_code', '=', itemCode], ['price_list', '=', priceList]],
  });
  if (!rb.ok) return rb;
  const match = (rb.data || []).filter(function (p) { return (!finalName || p.name === finalName); });
  const confirmed = match.length ? match[0] : (rb.data[0] || {});

  const result = {
    name: confirmed.name,
    item_code: confirmed.item_code || itemCode,
    price_list: confirmed.price_list || priceList,
    price_list_rate: confirmed.price_list_rate,
    ...(confirmed.valid_from !== undefined ? { valid_from: confirmed.valid_from } : {}),
    ...(confirmed.valid_upto !== undefined ? { valid_upto: confirmed.valid_upto } : {}),
  };

  // 记首结果 + 批次（新增价未引用删除/修改价前镜像恢复）。
  idempotency.record('create', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_item_price_set' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: result.name, action: isUpdate ? 'update' : 'create',
      afterState: isUpdate ? 'modified' : 'draft',
    }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

// 区间重叠判定（含半开区间：[valid_from, valid_upto]）。忽略自身（同名 + 同区间 + 修改场景）。
function findOverlap(rows, vf, vt, isUpdate, args) {
  const a = vf ? new Date(vf).getTime() : -Infinity;
  const b = vt ? new Date(vt).getTime() : Infinity;
  for (const row of rows) {
    if (isUpdate && sameInterval(row, vf, vt)) continue; // 自身目标区间，非重叠
    const ra = row.valid_from ? new Date(row.valid_from).getTime() : -Infinity;
    const rb = row.valid_upto ? new Date(row.valid_upto).getTime() : Infinity;
    // 重叠当 ra <= b 且 a <= rb。
    if (ra <= b && a <= rb) return row;
  }
  return null;
}

function sameInterval(row, vf, vt) {
  const rv = row.valid_from || null;
  const rt = row.valid_upto || null;
  const av = vf || null;
  const at = vt || null;
  return rv === av && rt === at;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k]; }
  return out;
}

module.exports = { definition, handler };
