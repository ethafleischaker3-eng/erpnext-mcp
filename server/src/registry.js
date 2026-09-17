'use strict';
/*
 * F01 tool 注册表（入口/注册表只增不改）
 * ============================================================
 * 登记 6 个读 tool（#1/#2/#3/#4/#5/#26）。F04 已在 TOOL_MODULES 尾部追加 10 个写/只出 plan tool
 * （#6–#12 主数据 + #23–#25 库存），不改本表既有条目。F02 已在 F04 通过后串行追加 #13–#22（10 个销售/采购写 tool）。
 * 本表不实现任何业务逻辑，只做 name → 定义/处理器 的映射。
 */

const TOOL_MODULES = [
  require('./tools/document-search'),
  require('./tools/document-get'),
  require('./tools/stock-level-query'),
  require('./tools/stock-ledger-query'),
  require('./tools/supplier-search'),
  require('./tools/batch-status-get'),
  // F04 追加（10 个写/只出 plan tool，尾部新增，不改既有条目）
  require('./tools/customer-create'),
  require('./tools/customer-update'),
  require('./tools/supplier-create'),
  require('./tools/supplier-update'),
  require('./tools/item-create'),
  require('./tools/item-update'),
  require('./tools/item-price-set'),
  require('./tools/stock-transfer-create'),
  require('./tools/stock-transfer-confirm'),
  require('./tools/stock-reconciliation-plan'),
  // F02 追加（10 个销售/采购写 tool，尾部新增，不改既有条目）
  require('./tools/sales-order-create'),
  require('./tools/sales-order-confirm'),
  require('./tools/sales-order-cancel'),
  require('./tools/purchase-order-create'),
  require('./tools/purchase-order-confirm'),
  require('./tools/purchase-order-cancel'),
  require('./tools/purchase-receipt-create'),
  require('./tools/purchase-receipt-confirm'),
  require('./tools/delivery-note-create'),
  require('./tools/delivery-note-confirm'),
];

const registry = new Map();
for (const mod of TOOL_MODULES) {
  registry.set(mod.definition.name, mod);
}

function getTool(name) {
  return registry.get(name) || null;
}

function listTools() {
  return TOOL_MODULES.map(function (mod) { return mod.definition; });
}

module.exports = { getTool, listTools, TOOL_MODULES };
