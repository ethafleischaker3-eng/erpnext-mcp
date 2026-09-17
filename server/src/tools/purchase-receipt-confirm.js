'use strict';
/*
 * F02 #20 erpnext_purchase_receipt_confirm（W04/W06/W07）
 * 忠实 D02 §5.5：收货入库生效（人确认）。confirm 组 60s 状态断言兜底；必带 modified。
 * 前置断言：目标仍草稿且 modified 一致；来源 PO 仍已生效；来源行剩余可收数量满足本次收货（超收后端 OverAllowanceError 强制，server 前置校验可自纠）；仓库有效；版本断言与提交同事务。
 * 写：frappe.client.submit 全量 doc（B03 F2）。回读 docstatus=1（含 Bin/SLE/GL 变动）。回滚：已生效 → 管理员运维异常回滚（无 cancel tool，不承诺删除）。
 */

const { makeError, idempotentReplay, idempotentAlreadyInTargetState } = require('../../lib/errors');
const { checkStateAssertion } = require('../../lib/idempotency');
const { confirmIfNeeded, writeGate, idempotency, callerId, buildChange } = require('./write-common');

const DOCTYPE = 'Purchase Receipt';
const SOURCE_DOCTYPE = 'Purchase Order';

const definition = {
  name: 'erpnext_purchase_receipt_confirm',
  description:
    '将采购收货单草稿生效（真实收货入库、增加库存并产生流水/记账）。' +
    '消歧：erpnext_purchase_receipt_create 只产草稿；本 tool 才入库。' +
    '窄接口边界：只做状态流转（草稿→已生效）。',
  inputSchema: {
    type: 'object',
    properties: {
      purchase_receipt_id: { type: 'string', description: '采购收货单编号语义标识（必填）。' },
      modified: { type: 'string', description: '当前版本令牌（乐观并发，必填）。' },
    },
    required: ['purchase_receipt_id', 'modified'],
  },
  annotations: {
    title: '收货入库生效',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

async function handler(ctx, args) {
  args = args || {};
  const purchaseReceiptId = args.purchase_receipt_id;
  const modified = args.modified;

  if (typeof purchaseReceiptId !== 'string' || purchaseReceiptId.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'purchase_receipt_id 必填：请提供采购收货单编号', { retryable: true }) };
  }
  if (typeof modified !== 'string' || modified.trim() === '') {
    return { ok: false, error: makeError('invalid_argument', 'modified 必填：请提供当前版本令牌（乐观并发）', { retryable: true }) };
  }

  const cur = await ctx.backend.get(DOCTYPE, purchaseReceiptId);
  if (!cur.ok) return cur;
  const c = cur.data;
  if (!c) {
    return { ok: false, error: makeError('precondition_failed', '采购收货单「' + purchaseReceiptId + '」不存在：请核对编号', { retryable: false }) };
  }

  const state = stateOf(c.docstatus);
  const sa = checkStateAssertion({ currentState: state, targetState: 'submitted' });
  if (sa.hit) {
    return { ok: true, result: idempotentAlreadyInTargetState(sa.message) };
  }
  if (state !== 'draft') {
    return { ok: false, error: makeError('precondition_failed', '采购收货单「' + purchaseReceiptId + '」当前为「' + state + '」：仅草稿可生效', { retryable: false }) };
  }

  const businessParams = { t: 'purchase_receipt_confirm', purchase_receipt_id: purchaseReceiptId, action: 'confirm' };
  const chk = idempotency.check('confirm/cancel', businessParams);
  if (chk.hit && chk.firstResult) {
    return { ok: true, result: idempotentReplay(chk.firstResult) };
  }

  if (c.modified !== undefined && c.modified !== modified) {
    return { ok: false, error: makeError('concurrency_conflict', '采购收货单「' + purchaseReceiptId + '」已被并发修改：请重新读取最新版本（modified）后重试', { retryable: true }) };
  }

  // 前置断言：来源 PO 仍已生效；来源行剩余可收数量满足本次收货（B03 F5）。
  const rows = Array.isArray(c.items) ? c.items : [];
  const sourceName = sourceOrderName(c, rows, 'purchase_order');
  if (sourceName) {
    const po = await ctx.backend.get(SOURCE_DOCTYPE, sourceName);
    if (!po.ok) return po;
    if (!po.data) {
      return { ok: false, error: makeError('precondition_failed', '来源采购订单「' + sourceName + '」不存在：请核对单据', { retryable: false }) };
    }
    if (po.data.docstatus !== 1) {
      return { ok: false, error: makeError('precondition_failed', '来源采购订单「' + sourceName + '」已失效：请先恢复来源订单生效', { retryable: false }) };
    }
    const poItems = Array.isArray(po.data.items) ? po.data.items : [];
    for (const row of rows) {
      const src = poItems.find(function (p) { return p.name === row.purchase_order_item || p.name === row.name; });
      if (!src) continue; // 无法解析来源行时交由后端 OverAllowanceError 强制
      const ordered = typeof src.qty === 'number' ? src.qty : 0;
      const received = typeof src.received_qty === 'number' ? src.received_qty : 0;
      const remaining = ordered - received;
      if (typeof row.qty === 'number' && row.qty > remaining) {
        return {
          ok: false,
          error: makeError('precondition_failed',
            '物料「' + row.item_code + '」收货量 ' + row.qty + ' 超过来源剩余可收量 ' + remaining + '：请减量或分批收货', {
            retryable: true,
            details: { item_code: row.item_code, requested: row.qty, remaining: remaining },
          }),
        };
      }
    }
  }

  const gate = writeGate(ctx);
  if (!gate.ok) return gate;
  const conf = await confirmIfNeeded(ctx, 'erpnext_purchase_receipt_confirm', args);
  if (!conf.ok) return conf;

  const submitted = await ctx.backend.submit(DOCTYPE, c);
  if (!submitted.ok) return submitted;

  const rb = await ctx.backend.get(DOCTYPE, purchaseReceiptId);
  if (!rb.ok) return rb;
  if (rb.data.docstatus !== 1) {
    return { ok: false, error: makeError('postcondition_failed', '采购收货单生效后回读 docstatus 非 1：标记待回滚', { retryable: false }) };
  }

  const result = { name: rb.data.name, status: 'Submitted', docstatus: rb.data.docstatus };

  idempotency.record('confirm/cancel', businessParams, result);
  if (ctx.batchLedger) {
    const bId = ctx.batchLedger.createBatch({ callerId: callerId(ctx), toolName: 'erpnext_purchase_receipt_confirm' });
    ctx.batchLedger.recordChange(bId, buildChange({
      objectType: DOCTYPE, objectName: purchaseReceiptId, action: 'confirm',
      beforeState: 'draft', afterState: 'submitted',
    }));
    ctx.batchLedger.complete(bId);
  }

  return { ok: true, result: result };
}

function sourceOrderName(doc, rows, linkField) {
  if (doc && typeof doc[linkField] === 'string' && doc[linkField]) return doc[linkField];
  for (const row of rows) {
    if (row && typeof row[linkField] === 'string' && row[linkField]) return row[linkField];
  }
  return null;
}

function stateOf(docstatus) {
  if (docstatus === 1) return 'submitted';
  if (docstatus === 2) return 'cancelled';
  return 'draft';
}

module.exports = { definition, handler };
