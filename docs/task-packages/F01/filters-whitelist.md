# F01 交付物 D03：#1 `erpnext_document_search` filters 可检索字段白名单

> 文档性质：F01 交付物 D03（脱敏）。工作项 W05；对应自检 S10。
> 实现主体：Claude（F01 独立实施上下文）；Owner：gjg；日期：2026-09-16。未读取 C01b 冻结任务集正文/断言。
> 落点：`server/src/allowlist.js` 的 `FILTER_FIELDS`（硬编码，server 侧强制拦截第二层）。

## 1. 口径与来源

`#1 erpnext_document_search` 的 `filters` 参数只接受「该对象的可检索字段」，不接受任意字段名（D02 §2.1、D01 §7、E01 `allowlist.md` §3.2）。本清单为逐对象精确白名单，来源：

1. **B01–B04 interface-facts（冻结，权威）**：逐对象实测记录的关键业务字段（身份/分类/状态/日期/关键引用）。
2. **ERPNext DocType 字段名（只读 meta 查询，2026-09-16）**：`GET /api/resource/DocType/{doctype}` 逐对象字段名核对，确保字段名与后端一致、无推测。
3. **Frappe 系统字段**：`name`（语义标识/主键）、`creation`、`modified` 为 Frappe 恒可过滤的系统字段，逐对象统一纳入。

> 确定性取得说明：B01–B04 冻结事实已覆盖逐对象关键字段；本清单另经只读 DocType meta 查询核对字段名一致，未依赖推测，无需按 §15 升级。

## 2. 逐对象可检索字段白名单（九类）

| object_type | 可检索字段（filters 键） |
|---|---|
| `customer` | `name`、`customer_name`、`customer_type`、`customer_group`、`territory`、`disabled`、`creation`、`modified` |
| `item` | `name`、`item_code`、`item_name`、`item_group`、`stock_uom`、`is_stock_item`、`disabled`、`creation`、`modified` |
| `item_price` | `name`、`item_code`、`price_list`、`price_list_rate`、`buying`、`selling`、`currency`、`valid_from`、`valid_upto`、`creation`、`modified` |
| `sales_order` | `name`、`customer`、`customer_name`、`transaction_date`、`delivery_date`、`status`、`docstatus`、`company`、`creation`、`modified` |
| `purchase_order` | `name`、`supplier`、`supplier_name`、`transaction_date`、`schedule_date`、`status`、`docstatus`、`company`、`creation`、`modified` |
| `purchase_receipt` | `name`、`supplier`、`supplier_name`、`posting_date`、`status`、`docstatus`、`company`、`creation`、`modified` |
| `delivery_note` | `name`、`customer`、`customer_name`、`posting_date`、`status`、`docstatus`、`company`、`creation`、`modified` |
| `stock_entry` | `name`、`stock_entry_type`、`purpose`、`from_warehouse`、`to_warehouse`、`posting_date`、`docstatus`、`company`、`creation`、`modified` |
| `stock_reconciliation` | `name`、`purpose`、`posting_date`、`docstatus`、`company`、`expense_account`、`creation`、`modified` |

## 3. 边界与不变量

- **排除 supplier / bin / stock_ledger_entry**：三者不作为 `document_search` 的 `object_type`（供应商专走 #5，库存余量/流水专走 #3/#4），故 `FILTER_FIELDS` 不含对应键。
- **无任意字段名**：`filters` 键不在上表白名单内 → `invalid_argument`（附 `allowed_fields` 详情）。
- **子表不作标量过滤**：`items`（Table 型子表，如 Sales Order Item）不作为 filters 键；行项目仅随父单据嵌套返回（PRD §2.3、E01 `allowlist.md` §2.3）。
- **无越界字段**：白名单仅含该对象业务字段 + `name`/`creation`/`modified` 系统字段；不含财务/制造/CRM/HR/系统管理对象的任何字段，不含 Contact/Address/User（E01 §18.4 框架残余兜底）。

## 4. filters 值语义（server 实现口径，非 D02 冻结内容，供复核）

- 值为**标量**（字符串/数值/布尔）→ 等值过滤 `[field, "=", value]`。
- 值为**操作符对象** `{ "<op>": operand }` → `[field, "<op>", operand]`，`<op>` 限 `=`、`!=`、`<`、`>`、`<=`、`>=`、`like`、`not like`、`in`、`not in`、`between`（`between` 需 `[起, 止]` 两值）。
- 覆盖 D02 §2.1「名称包含 / 状态 / 日期区间 / 分类」示例：名称包含用 `{ "customer_name": { "like": "%ACME%" } }`，状态用 `{ "status": "To Bill" }` 或 `{ "docstatus": 1 }`，日期区间用 `{ "transaction_date": { "between": ["2026-01-01","2026-12-31"] } }`，分类用 `{ "customer_group": "Commercial" }`。
