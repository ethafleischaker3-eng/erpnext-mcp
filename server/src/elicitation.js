'use strict';
/*
 * F04 server 侧确认层（W06：挂接 E01 confirmation-failclosed §1.2 / 规范 §9.7）
 * ============================================================
 * 人确认档写 tool（#6–#12、#24）未经有效 server 侧确认不得写入。
 * 本模块提供确认编排钩子；elicitation 请求体的封装不依赖具体传输（由 index.js 注入 sender）。
 * 挂接次序（E01 §1.4）：schema → 前置断言 → 确认 → 后端写 → 事后回读 → 批次台账。
 *
 * 边界：本模块不接后端、不接触凭据；仅决定「是否需要确认」与「确认结果是否放行」。
 *       客户端 initialize 未声明 elicitation → 写 tool 全量 fail-closed（零写入，PRD 决议 1）。
 */

const { makeError } = require('../lib/errors');

// 人确认档 8 tool 清单（E01 confirmation-failclosed §1.3；F04 范围内）。
const HUMAN_CONFIRM_TOOLS = Object.freeze([
  'erpnext_customer_create',
  'erpnext_customer_update',
  'erpnext_supplier_create',
  'erpnext_supplier_update',
  'erpnext_item_create',
  'erpnext_item_update',
  'erpnext_item_price_set',
  'erpnext_stock_transfer_confirm',
]);

// 全自动档（F04 范围内：#23 免确认，仅限 L3；客户端不支持 elicitation 时全量 fail-closed）。
const AUTO_TOOLS = Object.freeze(['erpnext_stock_transfer_create']);

function needsConfirmation(toolName) {
  return HUMAN_CONFIRM_TOOLS.indexOf(toolName) !== -1;
}
function isAutoTool(toolName) {
  return AUTO_TOOLS.indexOf(toolName) !== -1;
}

/*
 * 确认编排。ctx 须注入：
 *   ctx.clientSupportsElicitation : boolean（initialize 握手解析）
 *   ctx.sendElicitation(params)   : Promise<{ action }>，action ∈ accept | decline | cancel
 * 返回 { ok:true } | { ok:false, error }。非 accept 一律零副作用。
 */
async function requireConfirmation(ctx, toolName, args) {
  return new Promise(function (resolve) {
    // 客户端不支持 elicitation → fail-closed（PRD 决议 1 / E01 §2.2），零写入。
    if (!ctx || ctx.clientSupportsElicitation !== true) {
      resolve({
        ok: false,
        error: makeError('permission_denied',
          '客户端未声明 elicitation 能力：人确认写操作已 fail-closed（零写入，不降级为直接执行）', { retryable: false }),
      });
      return;
    }
    // 由 sender 发起；无 sender 注入时 fail-closed（不夹带直接执行）。
    if (typeof ctx.sendElicitation !== 'function') {
      resolve({
        ok: false,
        error: makeError('permission_denied',
          '确认发送器未注入：人确认写操作已 fail-closed（零写入）', { retryable: false }),
      });
      return;
    }

    // 完整参数展示（E01 §1.2 第 2 项：tool 名 + 全部参数 + 拟执行动作）。
    const params = {
      tool: toolName,
      arguments: args,
      message: '执行写操作「' + toolName + '」：请确认参数无误后 accept；decline / cancel 均零副作用（不写入）。',
    };

    ctx.sendElicitation(params).then(function (resp) {
      const action = resp && resp.action;
      if (action === 'accept') {
        resolve({ ok: true });
        return;
      }
      resolve({
        ok: false,
        error: makeError('permission_denied',
          '用户未确认写操作（' + (action === 'decline' ? 'decline' : 'cancel') + '）：本次不写入，零副作用', {
          retryable: false,
          details: { action: action },
        }),
      });
    }).catch(function () {
      resolve({
        ok: false,
        error: makeError('permission_denied',
          '确认请求失败：本次不写入，零副作用', { retryable: false }),
      });
    });
  });
}

module.exports = { requireConfirmation, needsConfirmation, isAutoTool, HUMAN_CONFIRM_TOOLS, AUTO_TOOLS };
