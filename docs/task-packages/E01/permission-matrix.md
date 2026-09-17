# E01 权限矩阵（permission-matrix）

> 文档性质：E01 交付物 D02，逐 tool（PRD #1–#26）明确其目标对象（操作允许/引用允许）、所需权限（读/写/只出方案）与后端 DocType；反向逐对象（12 操作 + 9 引用）列出哪些 tool 以何种权限访问。本矩阵是 F01/F02/F04 实施与 G01 验收的权威输入。
> 版本：v1.1（v1.0 实施产出；CHG-20260917-E01-001 补 Account/Cost Center 只读 DocPerm，21→23）；依据：D02 `tool-contract.md` v1.0（已通过）、D01 `common-contract.md` v1.0（已通过）、C01a `object-scope.md` v1.0（已封存）、PRD §2.1/§2.3/§5.6（2026-09-12-r1）。
> 实现主体：Claude（E01 独立实施上下文）；未读取 C01b 冻结任务集正文/断言。

---

## 0. 对象能力总口径（忠实 PRD §2.1 / C01a）

| 组 | 成员（DocType） | 声明能力 |
|---|---|---|
| 操作允许（读写，9） | Customer、Supplier、Item、Item Price、Sales Order、Purchase Order、Purchase Receipt、Delivery Note、Stock Entry | 读写 |
| 操作允许（只读，2） | Bin、Stock Ledger Entry | 只读 |
| 操作允许（只出方案，1） | Stock Reconciliation | 只出方案（可经 `document_search`/`document_get` 读，不可经 MCP 写） |
| 引用允许（只读，9） | Company、Warehouse、Price List、Currency、Customer Group、Supplier Group、Territory、Item Group、UOM | 只读（仅引用，不可经 MCP 增删改） |

- 清单外对象（用户/角色/设置、财务、制造、CRM、HR、项目、资产、Contact、Address 等）MUST NOT 读或写。
- 框架级只读依赖（Account、Cost Center）：**非 MCP tool 对象、非两张清单成员**，仅后端角色 `MCP Business Caller` 授 `read` + `select` 供销售/采购交易单据行项目 `income_account`/`expense_account`/`cost_center` Link 字段解析（CHG-20260917-E01-001）；不构成 MCP 可读/可写面，不可经 MCP 增删改、不可作 tool 目标对象。
- 子表（Sales Order Item、Purchase Order Item、Purchase Receipt Item、Delivery Note Item、Stock Entry Detail 等）仅作父单据嵌套行项目读写，不列为独立操作对象。
- DocType 名以 ERPNext 实际名为准（实测：计量单位 DocType 为 `UOM`，非「Unit of Measure」）。

---

## 1. 逐 tool 权限矩阵（前向：tool → 对象）

图例：●=读 / ▲=写（含 create/update/confirm/cancel）/ ◐=只出方案（读现状+方案，不写）/ △=引用（只读 Link）。档位：读/写/全自动/人确认/只出 plan 忠实 D02 总表。

### 1.1 读类 tool（#1–#5、#26）

| tool | 目标对象（操作允许） | 权限 | 引用对象（引用允许） | 后端 DocType |
|---|---|---|---|---|
| #1 `erpnext_document_search` | Customer、Item、Item Price、Sales Order、Purchase Order、Purchase Receipt、Delivery Note、Stock Entry、Stock Reconciliation | ● | — | 上述 9 个 DocType（**排除** Supplier、Bin、Stock Ledger Entry） |
| #2 `erpnext_document_get` | 同 #1 九类 | ● | — | 同 #1 |
| #3 `erpnext_stock_level_query` | Bin | ● | Item（item_code）、Warehouse | Bin（+ Item/Warehouse 引用） |
| #4 `erpnext_stock_ledger_query` | Stock Ledger Entry | ● | Item、Warehouse | Stock Ledger Entry（+ 引用） |
| #5 `erpnext_supplier_search` | Supplier | ● | Supplier Group | Supplier（+ Supplier Group 引用） |
| #26 `erpnext_batch_status_get` | （无后端业务对象） | ● | — | 无（server 批次台账元数据） |

### 1.2 主数据 tool（#6–#12，人确认）

| tool | 目标对象 | 权限 | 引用对象 | 后端 DocType |
|---|---|---|---|---|
| #6 `erpnext_customer_create` | Customer | ▲ | Customer Group、Territory | Customer |
| #7 `erpnext_customer_update` | Customer | ▲ | Customer Group、Territory | Customer |
| #8 `erpnext_supplier_create` | Supplier | ▲ | Supplier Group | Supplier |
| #9 `erpnext_supplier_update` | Supplier | ▲ | Supplier Group | Supplier |
| #10 `erpnext_item_create` | Item | ▲ | Item Group、UOM | Item |
| #11 `erpnext_item_update` | Item | ▲ | Item Group、UOM | Item |
| #12 `erpnext_item_price_set` | Item Price | ▲ | Item（item_code）、Price List | Item Price |

### 1.3 销售链路 tool（#13–#15、#21–#22）

| tool | 目标对象 | 权限 | 引用对象 | 后端 DocType |
|---|---|---|---|---|
| #13 `erpnext_sales_order_create`（全自动） | Sales Order | ▲ | Customer、Item、Warehouse；Company/Currency/Price List（server 配置锁单 gjg/CNY/Standard Selling） | Sales Order |
| #14 `erpnext_sales_order_confirm`（人确认） | Sales Order | ▲ | — | Sales Order |
| #15 `erpnext_sales_order_cancel`（人确认） | Sales Order | ▲ | — | Sales Order |
| #21 `erpnext_delivery_note_create`（全自动） | Delivery Note | ▲ | Sales Order（来源）、Item、Warehouse；Company/Currency（server 配置） | Delivery Note |
| #22 `erpnext_delivery_note_confirm`（人确认） | Delivery Note | ▲ | — | Delivery Note |

### 1.4 采购链路 tool（#16–#20）

| tool | 目标对象 | 权限 | 引用对象 | 后端 DocType |
|---|---|---|---|---|
| #16 `erpnext_purchase_order_create`（全自动） | Purchase Order | ▲ | Supplier、Item、Warehouse；Company/Currency/Price List（server 配置） | Purchase Order |
| #17 `erpnext_purchase_order_confirm`（人确认） | Purchase Order | ▲ | — | Purchase Order |
| #18 `erpnext_purchase_order_cancel`（人确认） | Purchase Order | ▲ | — | Purchase Order |
| #19 `erpnext_purchase_receipt_create`（全自动） | Purchase Receipt | ▲ | Purchase Order（来源）、Item、Warehouse；Company/Currency（server 配置） | Purchase Receipt |
| #20 `erpnext_purchase_receipt_confirm`（人确认） | Purchase Receipt | ▲ | — | Purchase Receipt |

### 1.5 库存链路 tool（#23–#25）

| tool | 目标对象 | 权限 | 引用对象 | 后端 DocType |
|---|---|---|---|---|
| #23 `erpnext_stock_transfer_create`（全自动） | Stock Entry | ▲ | Warehouse（from/to）、Item；Company（server 配置） | Stock Entry |
| #24 `erpnext_stock_transfer_confirm`（人确认） | Stock Entry | ▲ | — | Stock Entry |
| #25 `erpnext_stock_reconciliation_plan`（只出 plan） | Bin、Stock Ledger Entry（读现状） | ◐ | Warehouse、Item | Bin、Stock Ledger Entry（只读，不写 Stock Reconciliation 单据） |

---

## 2. 反向对象矩阵（对象 → tool）

### 2.1 操作允许清单（12）

| 对象（DocType） | 声明能力 | 读访问（tool） | 写访问（tool） | 被引用（tool） |
|---|---|---|---|---|
| Customer | 读写 | #1、#2 | #6 create、#7 update | #13 |
| Supplier | 读写 | #5 | #8 create、#9 update | #16 |
| Item | 读写 | #1、#2 | #10 create、#11 update | #3、#4、#12、#13、#16、#19、#21、#23、#25 |
| Item Price | 读写 | #1、#2 | #12 set | — |
| Sales Order | 读写 | #1、#2 | #13 create、#14 confirm、#15 cancel | #21 |
| Purchase Order | 读写 | #1、#2 | #16 create、#17 confirm、#18 cancel | #19 |
| Purchase Receipt | 读写 | #1、#2 | #19 create、#20 confirm | — |
| Delivery Note | 读写 | #1、#2 | #21 create、#22 confirm | — |
| Stock Entry | 读写 | #1、#2 | #23 create、#24 confirm | — |
| Stock Reconciliation | 只出方案 | #1、#2 | 无（#25 只出 plan，不写） | — |
| Bin | 只读 | #3、#25（读现状） | 无 | — |
| Stock Ledger Entry | 只读 | #4、#25（读现状） | 无 | — |

### 2.2 引用允许清单（9，全部只读，仅引用）

| 对象（DocType） | 被引用（tool） |
|---|---|
| Company | #13、#16、#19、#21、#23（server 配置锁单 gjg） |
| Warehouse | #3、#4、#13、#16、#19、#21、#23（from/to）、#25 |
| Price List | #12、#13、#16（server 配置 Standard Selling/Standard Buying） |
| Currency | #13、#16、#19、#21、#23（server 配置 CNY） |
| Customer Group | #6、#7 |
| Supplier Group | #5、#8、#9 |
| Territory | #6、#7 |
| Item Group | #10、#11 |
| UOM | #10、#11 |

---

## 3. DocType → DocPerm 收敛映射（后端角色落地口径）

> 档位说明：权限矩阵保留 tool 级映射（§1/§2）供 F 包接线；后端角色按 **DocType 级**收敛（§16 待决默认「DocType 级 + 角色收敛」）。下表为角色 DocPerm 的权威口径，落地与实测见 `roles.md` / `authorization-verification.md`。

| DocType | read | write | create | submit | cancel | delete/amend/report 等 |
|---|---|---|---|---|---|---|
| Customer | ✓ | ✓ | ✓ | — | — | — |
| Supplier | ✓ | ✓ | ✓ | — | — | — |
| Item | ✓ | ✓ | ✓ | — | — | — |
| Item Price | ✓ | ✓ | ✓ | — | — | — |
| Sales Order | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Purchase Order | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Purchase Receipt | ✓ | ✓ | ✓ | ✓ | — | — |
| Delivery Note | ✓ | ✓ | ✓ | ✓ | — | — |
| Stock Entry | ✓ | ✓ | ✓ | ✓ | — | — |
| Stock Reconciliation | ✓ | — | — | — | — | — |
| Bin | ✓ | — | — | — | — | — |
| Stock Ledger Entry | ✓ | — | — | — | — | — |
| Company | ✓ | — | — | — | — | — |
| Warehouse | ✓ | — | — | — | — | — |
| Price List | ✓ | — | — | — | — | — |
| Currency | ✓ | — | — | — | — | — |
| Customer Group | ✓ | — | — | — | — | — |
| Supplier Group | ✓ | — | — | — | — | — |
| Territory | ✓ | — | — | — | — | — |
| Item Group | ✓ | — | — | — | — | — |
| UOM | ✓ | — | — | — | — | — |
| Account | ✓ | — | — | — | — | — |
| Cost Center | ✓ | — | — | — | — | — |

- 除上表 23 个 DocType 外，**不授予任何其他 DocType 的任何 DocPerm**（清单外 MUST NOT 读写）。
- Account / Cost Center 仅授 `read` + `select`（框架级只读依赖，CHG-20260917-E01-001）：交易单据落库须解析行项目 `income_account`/`expense_account`/`cost_center`（Link 到 Account/Cost Center）；不授 `write/create/submit/cancel`，不升为允许清单成员，不可经 MCP 增删改、不可作 tool 目标对象。
- `write` 授予所有 9 个读写对象（含 SO/PO/PR/DN/SE），覆盖主数据 update 及 cancel 的 `frappe.client.save`（docstatus=2 + modified）等价版本保护路径（D02 §0 第 5 条、B02 F3/B03 F3）所需。
- `delete`/`amend`/`report`/`import`/`export` 等一律不授予普通 MCP 调用方角色——回滚（草稿→删除、异常回滚取消 PR/DN/SE）属管理员运维主体（PRD §5.4），不落入普通调用方「声明能力」。

---

## 4. 与 D02/D01 一致性核对（S02 静态核对）

1. **无清单外对象**：§1 所有 tool 的目标对象与引用对象均落在 §0 两张清单内，无财务/制造/CRM/HR/系统管理/Contact/Address 等对象出现。
2. **引用清单只读**：§2.2 九类引用对象仅「被引用」，无任何 tool 对其 create/update/delete/confirm/cancel。
3. **只读对象无写**：Bin、Stock Ledger Entry 仅 #3/#4/#25 读；Stock Reconciliation 仅 #1/#2 读 + #25 只出 plan，无写 tool。
4. **document_search 排除 Supplier/Bin/SLE**：与 D02 §2.1 一致（Supplier 检索专走 #5；库存余量/流水专走 #3/#4）。
5. **子表不独立**：Sales Order Item 等子表未列为独立对象，仅随父单据嵌套。
6. **权限收敛最小**：§3 仅授予 23 个 DocType 的最小 DocPerm（其中 Account/Cost Center 仅 `read` + `select`，为交易单据 Link 解析的框架级依赖，CHG-20260917-E01-001），与 PRD §5.6「专用角色权限收敛到各对象声明能力 + 引用对象读」一致。
