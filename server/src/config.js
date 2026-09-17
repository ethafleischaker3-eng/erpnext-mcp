'use strict';
/*
 * F01 server 集中配置（读取运行时环境，不硬编码凭据）
 * ============================================================
 * - 后端 Base URL / 认证 token 从环境变量读取，凭据值不进入代码、不进入公开实施区文件。
 * - 正式后端调用方为专用账号 mcp-service + 角色 MCP Business Caller（E01 roles.md）；
 *   token 于部署时从后端容器 /tmp/mcp_token.txt 注入环境变量 ERP_API_KEY / ERP_API_SECRET。
 * - 本文件不含任何密钥/密码/完整认证头（凭据脱敏，D01 §4.1 透出边界）。
 */

const DEFAULT_BASE_URL = 'http://localhost:8080';

// F04 锁单集中配置（PRD 决议 2 / E01 confirmation-failclosed §2.1，非散落硬编码）。
// 公司 gjg / 币种 CNY / 销售价格表 Standard Selling / 采购价格表 Standard Buying。
const LOCKED_BUSINESS = Object.freeze({
  company: 'gjg',
  currency: 'CNY',
  sellingPriceList: 'Standard Selling',
  buyingPriceList: 'Standard Buying',
});

function loadConfig(env) {
  env = env || process.env;
  return {
    baseUrl: env.ERP_BASE_URL || DEFAULT_BASE_URL,
    apiKey: env.ERP_API_KEY || '',
    apiSecret: env.ERP_API_SECRET || '',
    // 是否已配置认证（未配置时后端调用会以「未授权/不可达」口径呈现，不夹带凭据猜测）。
    hasAuth: !!(env.ERP_API_KEY && env.ERP_API_SECRET),
    // 锁单业务配置（公司/币种/价格表），供写 tool 签入 company/currency/price_list。
    locked: LOCKED_BUSINESS,
  };
}

/*
 * fail-closed 判定钩子（E01 confirmation-failclosed §2.1，PRD 决议 2）：
 * 写入能力的运行时前置。判定依据由后端运行时查询给出（Company.gjg.default_currency、
 * Price List selling=1 且 enabled=1 的数量），本函数只落地判定逻辑、不接后端。
 *   - currency 与售卖价目表数量二者任一不满足 → 拒绝初始化写入能力（fail closed）。
 * 只读 tool 不受本钩子影响（见 index.js 的 write 能力门控）。
 */
function assertWriteEligible(currency, sellingPriceListCount) {
  if (!currency) {
    return { ok: false, reason: 'default_currency 为空：无法确定记账币种，写入能力 fail-closed' };
  }
  if (sellingPriceListCount !== 1) {
    return {
      ok: false,
      reason: 'selling 且 enabled 的价格表数量为 ' + sellingPriceListCount + '（应为 1）：无法确定默认销售价格表，写入能力 fail-closed',
    };
  }
  return { ok: true };
}

module.exports = { loadConfig, assertWriteEligible, LOCKED_BUSINESS, DEFAULT_BASE_URL };
