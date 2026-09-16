'use strict';
/*
 * E02 可信调用方身份提供者（W07/W08 依赖）
 * ============================================================
 * 依 B00 §18.3 第 1 条 + B05 §3 的冻结结论：
 *   - 服务账号共享：所有 MCP 调用方共用 ERPNext Administrator 服务账号，
 *     主体区分在后端由 Role/DocPerm 承担（非 MCP 层每调用方身份）。
 *   - B05 §3：stdio 下无 sessionId/resumptionToken；进程/连接身份为会话级，
 *     不存在「合规可信且跨重试可关联」的每调用方信号。
 * 确定性结论（非推测）：
 *   - MCP server 侧无每调用方可信身份；批次归属只能到「会话」粒度（server 生成的会话 ID）。
 *   - 跨会话「查询自身旧批次」对普通调用方不可确定性证明 → 不支持（如实记录为残余限制）。
 *   - 管理员判定须由后端 Role/DocPerm 提供（hook，E02 不接后端 → 默认 false），不得由 agent 自报。
 */

const crypto = require('crypto');

// 会话级身份提供者：每个 stdio 连接分配一个 server 生成的会话 ID。
function createSessionIdentityProvider() {
  const sessionId = 'sess-' + crypto.randomUUID();
  return {
    sessionId: sessionId,
    /*
     * resolveCaller(transportContext, adminResolver)
     *   transportContext：传输/连接上下文（仅作 adminResolver 输入，不参与身份自报）。
     *   adminResolver：后端 Role/DocPerm 管理员判定钩子（F 包接入时提供；E02 不接后端 → 缺省 false）。
     * 返回 { callerId, isAdmin }。callerId = 会话 ID（会话级、非跨会话稳定）。
     */
    resolveCaller: function (transportContext, adminResolver) {
      const isAdmin = typeof adminResolver === 'function' ? !!adminResolver(transportContext || {}) : false;
      return { callerId: this.sessionId, isAdmin };
    },
  };
}

module.exports = { createSessionIdentityProvider };
