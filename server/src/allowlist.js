'use strict';
/*
 * F01 白名单层（W06：E01 allowlist 三层拦截之第二层 + 第三层能力一致性）
 * ============================================================
 * 忠实 D02 §2（6 读 tool 逐 tool 冻结口径）+ E01 permission-matrix / allowlist + D01 §7 + C01a object-scope。
 *
 * 本模块只做「对象类型 / 目标对象 / Link 字段目标 / 可检索字段」的硬编码枚举（server 侧强制拦截第二层），
 * 不接受任意 DocType 字符串或任意字段名；第三层「对象能力一致性」由各 tool handler 在解析后、执行后端读前校验。
 *
 * 边界：本模块是纯静态枚举，不接后端、不读库、不发起网络调用。
 */

// ---------------------------------------------------------------------------
// 一、对象类型白名单（document_search / document_get 的 object_type 硬编码九类）
//    D02 §2.1/§2.2：仅九类；MUST NOT 含 supplier / bin / stock_ledger_entry。
// ---------------------------------------------------------------------------

const OBJECT_TYPE_TO_DOCTYPE = Object.freeze({
  customer: 'Customer',
  item: 'Item',
  item_price: 'Item Price',
  sales_order: 'Sales Order',
  purchase_order: 'Purchase Order',
  purchase_receipt: 'Purchase Receipt',
  delivery_note: 'Delivery Note',
  stock_entry: 'Stock Entry',
  stock_reconciliation: 'Stock Reconciliation',
});

const OBJECT_TYPES = Object.freeze(Object.keys(OBJECT_TYPE_TO_DOCTYPE)); // 九类，硬编码枚举

// 显式排除（不得作为 document_search/document_get 目标对象；供应商专走 #5、库存余量/流水专走 #3/#4）。
const EXCLUDED_OBJECT_TYPES = Object.freeze(['supplier', 'bin', 'stock_ledger_entry']);

// ---------------------------------------------------------------------------
// 二、专有 tool 目标对象（#3/#4/#5 目标对象硬编码；#26 无后端业务对象）
// ---------------------------------------------------------------------------

// #3 stock_level_query 目标 Bin（只读）；#4 stock_ledger_query 目标 Stock Ledger Entry（只读）。
const STOCK_LEVEL_DOCTYPE = 'Bin';
const STOCK_LEDGER_DOCTYPE = 'Stock Ledger Entry';
// #5 supplier_search 目标仅 Supplier（Supplier 检索必须走 #5，document_search 不接受 supplier）。
const SUPPLIER_DOCTYPE = 'Supplier';

// ---------------------------------------------------------------------------
// 三、引用允许清单（9 类，只读，仅引用；D01 §7 / C01a / E01 allowlist §1.2）
//    Link 字段目标仅限此清单；item_code 为物料编码语义标识、解析到操作允许清单 Item（不按 Link 建模）。
// ---------------------------------------------------------------------------

const REFERENCE_ALLOWLIST = Object.freeze([
  'Company', 'Warehouse', 'Price List', 'Currency',
  'Customer Group', 'Supplier Group', 'Territory', 'Item Group', 'UOM',
]);

// 各读 tool 的 Link 字段目标硬编码枚举（D02 §2 / E01 permission-matrix §1.1）。
const LINK_TARGETS = Object.freeze({
  stock_level_query: Object.freeze({ warehouse: 'Warehouse' }),            // #3
  stock_ledger_query: Object.freeze({ warehouse: 'Warehouse' }),           // #4
  supplier_search: Object.freeze({ supplier_group: 'Supplier Group' }),    // #5
});

// ---------------------------------------------------------------------------
// 四、#1 document_search 的 filters 可检索字段白名单（W05 交付物 D03）
//    来源：B01–B04 interface-facts（冻结）+ ERPNext DocType 字段名（2026-09-16 只读 meta 查询）。
//    口径：仅该对象的业务字段（名称/状态/日期区间/分类/关键引用）；不接受任意字段名。
//    name/creation/modified 为 Frappe 系统字段（恒可过滤），逐对象统一纳入。
// ---------------------------------------------------------------------------

const FILTER_FIELDS = Object.freeze({
  customer: Object.freeze([
    'name', 'customer_name', 'customer_type', 'customer_group', 'territory',
    'disabled', 'creation', 'modified',
  ]),
  item: Object.freeze([
    'name', 'item_code', 'item_name', 'item_group', 'stock_uom',
    'is_stock_item', 'disabled', 'creation', 'modified',
  ]),
  item_price: Object.freeze([
    'name', 'item_code', 'price_list', 'price_list_rate',
    'buying', 'selling', 'currency', 'valid_from', 'valid_upto',
    'creation', 'modified',
  ]),
  sales_order: Object.freeze([
    'name', 'customer', 'customer_name', 'transaction_date', 'delivery_date',
    'status', 'docstatus', 'company', 'creation', 'modified',
  ]),
  purchase_order: Object.freeze([
    'name', 'supplier', 'supplier_name', 'transaction_date', 'schedule_date',
    'status', 'docstatus', 'company', 'creation', 'modified',
  ]),
  purchase_receipt: Object.freeze([
    'name', 'supplier', 'supplier_name', 'posting_date',
    'status', 'docstatus', 'company', 'creation', 'modified',
  ]),
  delivery_note: Object.freeze([
    'name', 'customer', 'customer_name', 'posting_date',
    'status', 'docstatus', 'company', 'creation', 'modified',
  ]),
  stock_entry: Object.freeze([
    'name', 'stock_entry_type', 'purpose', 'from_warehouse', 'to_warehouse',
    'posting_date', 'docstatus', 'company', 'creation', 'modified',
  ]),
  stock_reconciliation: Object.freeze([
    'name', 'purpose', 'posting_date', 'docstatus', 'company',
    'expense_account', 'creation', 'modified',
  ]),
});

// ---------------------------------------------------------------------------
// 五、详略（summary / detail）返回字段（D01 §2.2 语义化标识 + 高信噪比）
//     summary：关键可读字段；detail：后端全量（剥离低层技术/系统字段，见 SYSTEM_FIELDS）。
// ---------------------------------------------------------------------------

const SUMMARY_FIELDS = Object.freeze({
  customer: Object.freeze(['name', 'customer_name', 'customer_group', 'territory', 'disabled']),
  item: Object.freeze(['name', 'item_code', 'item_name', 'item_group', 'stock_uom', 'is_stock_item', 'disabled']),
  item_price: Object.freeze(['name', 'item_code', 'price_list', 'price_list_rate', 'currency', 'selling', 'buying', 'valid_from', 'valid_upto']),
  sales_order: Object.freeze(['name', 'customer', 'customer_name', 'transaction_date', 'delivery_date', 'status', 'docstatus', 'company']),
  purchase_order: Object.freeze(['name', 'supplier', 'supplier_name', 'transaction_date', 'schedule_date', 'status', 'docstatus', 'company']),
  purchase_receipt: Object.freeze(['name', 'supplier', 'supplier_name', 'posting_date', 'status', 'docstatus', 'company']),
  delivery_note: Object.freeze(['name', 'customer', 'customer_name', 'posting_date', 'status', 'docstatus', 'company']),
  stock_entry: Object.freeze(['name', 'stock_entry_type', 'purpose', 'from_warehouse', 'to_warehouse', 'posting_date', 'docstatus', 'company']),
  stock_reconciliation: Object.freeze(['name', 'purpose', 'posting_date', 'docstatus', 'company', 'expense_account']),
});

// detail 模式下剥除的低层技术/系统字段（D01 §2.2「无低层技术标识符」）。
// 保留 name/docstatus/status/modified 等语义化状态字段。
const SYSTEM_FIELDS = Object.freeze([
  'owner', 'modified_by', 'creation', 'doctype', 'idx',
  'parent', 'parentfield', 'parenttype',
  '_user_tags', '_comments', '_assign', '_liked_by',
]);

// 详略枚举（D02 §2.1：summary 简略（默认）/ detail 详细）。
const DETAIL_LEVELS = Object.freeze(['summary', 'detail']);
const DEFAULT_DETAIL = 'summary';

// ---------------------------------------------------------------------------
// 六、分页与结果集上限（D02 §2.1「page_size 有上限，超出触发截断 + 分页提示」）
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_TOTAL = 10000; // 结果集硬上限：total 超过此值 → result_set_overflow

// 过滤器合法操作符（filters 值可为标量=等值，或 { op: operand } 操作符对象）。
const FILTER_OPERATORS = Object.freeze(['=', '!=', '<', '>', '<=', '>=', 'like', 'not like', 'in', 'not in', 'between']);

// ---------------------------------------------------------------------------
// 七、F04 写对象/可写字段白名单（W05 交付物 D03；只增不改既有条目）
//     DokType 与逐字段可写区间来源：B01/B04 interface-facts（冻结）+ ERPNext DocType 字段名。
//     不可改字段统一：name/creation/owner/docstatus（docstatus 不暴露为可写字段，见 B01 F5）。
//     Link 字段目标硬编码枚举（E01 allowlist §3 第二层拦截）：不接受任意字段名/DocType。
// ---------------------------------------------------------------------------

// 写 tool 目标对象 → DocType（#6–#12 主数据 + #23/#24 调拨；#25 只读 Bin/SLE；#13–#22 销售/采购）。
const WRITE_DOCTYPES = Object.freeze({
  customer_create: 'Customer',
  customer_update: 'Customer',
  supplier_create: 'Supplier',
  supplier_update: 'Supplier',
  item_create: 'Item',
  item_update: 'Item',
  item_price_set: 'Item Price',
  stock_transfer_create: 'Stock Entry',
  stock_transfer_confirm: 'Stock Entry',
  sales_order_create: 'Sales Order',
  sales_order_confirm: 'Sales Order',
  sales_order_cancel: 'Sales Order',
  purchase_order_create: 'Purchase Order',
  purchase_order_confirm: 'Purchase Order',
  purchase_order_cancel: 'Purchase Order',
  purchase_receipt_create: 'Purchase Receipt',
  purchase_receipt_confirm: 'Purchase Receipt',
  delivery_note_create: 'Delivery Note',
  delivery_note_confirm: 'Delivery Note',
});

// 各写 tool 的 Link 字段目标硬编码枚举（引用允许清单；E01 permission-matrix §1.2）。
const WRITE_LINK_TARGETS = Object.freeze({
  customer_create: Object.freeze({ customer_group: 'Customer Group', territory: 'Territory' }),
  customer_update: Object.freeze({ customer_group: 'Customer Group', territory: 'Territory' }),
  supplier_create: Object.freeze({ supplier_group: 'Supplier Group' }),
  supplier_update: Object.freeze({ supplier_group: 'Supplier Group' }),
  item_create: Object.freeze({ item_group: 'Item Group', stock_uom: 'UOM' }),
  item_update: Object.freeze({ item_group: 'Item Group', stock_uom: 'UOM' }),
  item_price_set: Object.freeze({ item_code: 'Item', price_list: 'Price List' }),
  stock_transfer_create: Object.freeze({ from_warehouse: 'Warehouse', to_warehouse: 'Warehouse' }),
  stock_transfer_confirm: Object.freeze({}),
  sales_order_create: Object.freeze({ customer: 'Customer' }),
  sales_order_confirm: Object.freeze({}),
  sales_order_cancel: Object.freeze({}),
  purchase_order_create: Object.freeze({ supplier: 'Supplier' }),
  purchase_order_confirm: Object.freeze({}),
  purchase_order_cancel: Object.freeze({}),
  purchase_receipt_create: Object.freeze({ purchase_order: 'Purchase Order' }),
  purchase_receipt_confirm: Object.freeze({}),
  delivery_note_create: Object.freeze({ sales_order: 'Sales Order' }),
  delivery_note_confirm: Object.freeze({}),
});

// 逐 tool 可写字段白名单（D03）。item_price_set 的「可写字段」散列在业务字段，由 tool 校验无需白名单枚举其子集；
// 此处枚举其输入业务字段供越界校验参考。所有对象统一排除 name/creation/owner/docstatus。
const WRITABLE_FIELDS = Object.freeze({
  customer_create: Object.freeze(['customer_name', 'customer_group', 'territory', 'customer_type', 'disabled']),
  customer_update: Object.freeze(['customer_group', 'territory', 'customer_type', 'disabled']),
  supplier_create: Object.freeze(['supplier_name', 'supplier_group', 'supplier_type', 'disabled']),
  supplier_update: Object.freeze(['supplier_group', 'supplier_type', 'disabled']),
  item_create: Object.freeze(['item_code', 'item_name', 'item_group', 'stock_uom', 'is_stock_item', 'disabled']),
  item_update: Object.freeze(['item_name', 'item_group', 'stock_uom', 'is_stock_item', 'disabled']),
  item_price_set: Object.freeze(['item_code', 'price_list', 'price_list_rate', 'valid_from', 'valid_upto', 'selling', 'buying', 'currency']),
  stock_transfer_create: Object.freeze(['stock_entry_type', 'from_warehouse', 'to_warehouse', 'posting_date', 'items']),
  stock_transfer_confirm: Object.freeze(['stock_entry_id', 'modified']),
  sales_order_create: Object.freeze(['customer', 'items', 'transaction_date', 'delivery_date']),
  sales_order_confirm: Object.freeze(['sales_order_id', 'modified']),
  sales_order_cancel: Object.freeze(['sales_order_id', 'modified']),
  purchase_order_create: Object.freeze(['supplier', 'schedule_date', 'items']),
  purchase_order_confirm: Object.freeze(['purchase_order_id', 'modified']),
  purchase_order_cancel: Object.freeze(['purchase_order_id', 'modified']),
  purchase_receipt_create: Object.freeze(['purchase_order_id', 'items', 'posting_date']),
  purchase_receipt_confirm: Object.freeze(['purchase_receipt_id', 'modified']),
  delivery_note_create: Object.freeze(['sales_order_id', 'items', 'posting_date']),
  delivery_note_confirm: Object.freeze(['delivery_note_id', 'modified']),
});

// 不可改字段统一（不接受其作为任何写 tool 的可写字段；update 亦阻断 docstatus，B01 F5）。
const IMMUTABLE_FIELDS = Object.freeze(['name', 'creation', 'owner', 'docstatus']);

// 行项目（子表）key（Stock Entry Detail 仅作父单据嵌套行项目，不作为独立对象）。
const SUBTABLE_ITEM_KEY = 'items';

module.exports = {
  OBJECT_TYPE_TO_DOCTYPE,
  OBJECT_TYPES,
  EXCLUDED_OBJECT_TYPES,
  STOCK_LEVEL_DOCTYPE,
  STOCK_LEDGER_DOCTYPE,
  SUPPLIER_DOCTYPE,
  REFERENCE_ALLOWLIST,
  LINK_TARGETS,
  FILTER_FIELDS,
  SUMMARY_FIELDS,
  SYSTEM_FIELDS,
  DETAIL_LEVELS,
  DEFAULT_DETAIL,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_TOTAL,
  FILTER_OPERATORS,
  WRITE_DOCTYPES,
  WRITE_LINK_TARGETS,
  WRITABLE_FIELDS,
  IMMUTABLE_FIELDS,
  SUBTABLE_ITEM_KEY,
};
