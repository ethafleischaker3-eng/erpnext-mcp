# F02 交付物 D03：逐 tool 可写字段白名单清单

> 文档性质：F02 交付物 D03（脱敏）。工作项 W05；原始证据（只读 DocType meta 查询）受控于验收区，此处为确定性清单。
> 实现主体：Claude（F02 独立实施上下文）；Owner：gjg；日期：2026-09-17。未读取 C01b 冻结任务集正文/断言。
> 权威依据：B02/B03 interface-facts（已封存）+ D02 §4/§5 逐 tool 冻结口径 + D01 §7 窄接口边界 + E01 permission-matrix §1.3/§1.4 / allowlist §3 三层拦截第二层。
> 确定性来源：销售/采购 10 tool 目标对象 Sales Order/Purchase Order/Purchase Receipt/Delivery Note 的可写登记/状态流转字段，均自 B02 §2（Sales Order/Delivery Note 逐对象字段校验）、B03 §2（Purchase Order/Purchase Receipt 逐对象字段校验）确定性取得；**未以推测代替结论**，未从上未冻结来源新增字段。

## 1. 白名单总原则

1. **目标对象硬编码**（不允许任意 DocType 字符串）：#13/#14/#15→Sales Order、#16/#17/#18→Purchase Order、#19/#20→Purchase Receipt、#21/#22→Delivery Note。
2. **Link 字段目标硬编码**（仅引用允许清单 + 操作允许清单内的来源/交易对手引用）：Customer（#13）、Supplier（#16）、Sales Order/Purchase Order（来源单据，#19/#21）；Company/Currency/Price List 为 server 配置锁单（gjg/CNY/Standard Selling/Standard Buying），不暴露为参数。
3. **不可改字段统一禁止**（不接受其作为任何写 tool 的可写字段）：`name`/`creation`/`owner`/`docstatus`（docstatus 不暴露为可写字段，状态流转经 submit/cancel/save 端点，非普通 update）。
4. **create 不携带 modified**（新建草稿无既有版本）；**confirm/cancel 必带 modified**（B02 F2/F3、B03 F2/F3 乐观并发令牌）。
5. **不接受显式 `rate`**（#13/#16 单价由冻结价格表解析，消除 B02 F7/B03 F7 孤儿 Item Price 写副作用）。

## 2. 逐 tool 可写字段清单

| tool | 目标对象 | 可写字段（登记/状态流转） | Link 字段目标 |
|---|---|---|---|
| #13 `sales_order_create` | Sales Order | `customer`{必填}、`items[]`{必填，行 item_code/qty>0/warehouse 可选}、`transaction_date`、`delivery_date`（company/currency/selling_price_list 由 server 配置注入，不暴露；不接受 rate） | Customer、Item（items.item_code）、Warehouse（items.warehouse） |
| #14 `sales_order_confirm` | Sales Order | `sales_order_id`{必填}、`modified`{必填}（仅状态流转草稿→已生效，无新增可写字段） | — |
| #15 `sales_order_cancel` | Sales Order | `sales_order_id`{必填}、`modified`{必填}（仅状态流转已生效→已取消，经 frappe.client.save） | — |
| #16 `purchase_order_create` | Purchase Order | `supplier`{必填}、`schedule_date`{必填，B03 F8}、`items[]`{必填，行 item_code/qty>0/warehouse 可选}（company/currency/buying_price_list 由 server 配置注入；不接受 rate） | Supplier、Item、Warehouse |
| #17 `purchase_order_confirm` | Purchase Order | `purchase_order_id`{必填}、`modified`{必填}（仅状态流转） | — |
| #18 `purchase_order_cancel` | Purchase Order | `purchase_order_id`{必填}、`modified`{必填}（仅状态流转，经 frappe.client.save） | — |
| #19 `purchase_receipt_create` | Purchase Receipt | `purchase_order_id`{必填，来源须已生效}、`items[]`{可选，行 item_code/qty>0/warehouse 可选}、`posting_date` | Purchase Order（来源）、Item、Warehouse |
| #20 `purchase_receipt_confirm` | Purchase Receipt | `purchase_receipt_id`{必填}、`modified`{必填}（仅状态流转草稿→已生效） | — |
| #21 `delivery_note_create` | Delivery Note | `sales_order_id`{必填，来源须已生效}、`items[]`{可选，行 item_code/qty>0/warehouse 可选}、`posting_date` | Sales Order（来源）、Item、Warehouse |
| #22 `delivery_note_confirm` | Delivery Note | `delivery_note_id`{必填}、`modified`{必填}（仅状态流转草稿→已生效） | — |

## 3. 不可改字段边界（B01 §5 / D02 §0 第 5 条）

| 字段 | 行为 | 处理 |
|---|---|---|
| `name` | series 连续编号，创建时生成不可改（B02 F1/B03 F1） | 白名单不接受 |
| `creation` | CannotChangeConstantError 417 | 白名单不接受 |
| `owner` | CannotChangeConstantError 417 | 白名单不接受 |
| `docstatus` | 状态迁移经 submit/cancel/save，非普通 update | 白名单不接受（不暴露为可写字段） |
| `modified` | 版本令牌（provide 则校验，omit 不校验） | create 不带、confirm/cancel 必带 |
| `rate`（行项目） | 显式非零 rate 触发 Item Price 自动创建（B02 F7/B03 F7） | #13/#16 不接受 rate，行项目不暴露 rate 字段 |

## 4. 与 D02 §4/§5 逐 tool 口径核对

- 逐 tool 必填/可选字段与 D02 §4.1–§4.5、§5.1–§5.5 输入 schema 一致，无增无减、无反向放宽。
- 行项目 `items[]` 仅作父单据（Sales Order/Purchase Order/Purchase Receipt/Delivery Note）嵌套行项目，非独立操作对象（D01 §7 第 4 条）；行 `against_sales_order`/`so_detail`/`purchase_order`/`purchase_order_item`/`rate`/`uom` 等由后端 mapper 或提交自动派生，server 不暴露为 callers 可写字段。
- #14/#15/#17/#18/#20/#22 仅状态流转，无新增可写字段（`*_id` + `modified`）。
- 无清单外对象出现；引用允许清单对象仅可引用、不可经 MCP 增删改（E01 allowlist §2）；来源单据（Sales Order/Purchase Order）为操作允许清单内对象，仅作来源引用读取、不经本 tool 增删改。
