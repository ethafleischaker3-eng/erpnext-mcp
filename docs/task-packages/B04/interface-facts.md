# B04 库存、事务与回滚接口事实记录（Interface Facts）

> 冻结输出：B04 v1.0（任务包已冻结 2026-09-15，本记录为其实施产出）。本记录是 D01/D02 业务 tool 契约（#23 调拨 create、#24 调拨 confirm、#25 盘点 plan）的权威输入，逐对象逐项实测，非推测。
> 实测环境：`erpnext.local`（ERPNext 15.121.2 / Frappe 15.120.1），Token 认证 `Administrator`，2026-09-15 实施完成，测试后快照恢复归零。
> 认证与凭据值不入本记录；原始脱敏证据见 `docs/task-packages/B04/evidence/`，敏感原始输出（数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Evidence Manifest 登记）。
> 本包不冻结 tool 名称/schema/annotation，不形成最终业务权限；调拨/盘点无对应 cancel tool（PRD §5.4 / 已决议 #8），本记录的后端原生 cancel 仅作接口事实与清理摸底。

## 0. 结论速览（对 D01/D02 的权威输入）

| # | 事实 | 结论 | 对 MCP server 的直接影响 |
|---|---|---|---|
| F1 | 单据命名 | Stock Entry `MAT-STE-.YYYY.-`、Stock Reconciliation `MAT-RECO-.YYYY.-`（**非任务包推测的 MAT-REC-**）连续编号，无同名唯一性 | create 无需同名前置断言；name 为 series 连续编号，由后端生成 |
| F2 | 乐观版本断言（confirm） | `modified` 为可选并发令牌：confirm 携带陈旧 `modified` → `TimestampMismatchError` 417 且无部分写入；省略则不校验 | confirm tool 必须携带当前 `modified` 做乐观并发（经 `frappe.client.submit` 全量 doc） |
| F3 | submit/cancel 端点可用性 | SR/STE **无 whitelisted 的 `run_method:submit`/`cancel`**（403 PermissionError "not whitelisted"），须经 `frappe.client.submit(doc)`（全量 doc，非 name 串）/`frappe.client.cancel(doctype,name)`；cancel 的版本断言须走 `frappe.client.save`（docstatus=2+modified）等价路径 | D02 #24 调拨 confirm 必须走 `frappe.client.submit` 全量 doc，不能走资源端点 run_method |
| F4 | confirm 前态不校验 | 重提交已生效 SR/STE → **200 静默 no-op**（与 B02/B03 SO/PO 同） | server 必须前置断言「confirm 仅草稿、cancel 仅已生效」（PRD §5.1/§5.2） |
| F5 | 调拨库存校验时机 | STE 草稿 create **不校验**源仓库存不足与源/目同仓（`qty=100>10`、同仓均创建成功）；confirm 才触发 `NegativeStockError` 417；**源/目同仓 confirm 不被拒**（默认 `Stock Settings.validate_material_transfer_warehouses=0`） | PRD §5.2 #23「源仓可用量 ≥ 调拨量」与 #24「源/目标仓有效且不同」**后端不原生强制**，须由 server 前置断言 |
| F6 | 调拨库存变动 | STE Material Transfer confirm 只写 **SLE**（源仓 -qty、目标仓 +qty，Bin 源减目增），**不写 GL**（无估值变动）；cancel 确定性冲回（SLE 冲销 + Bin 恢复） | 调拨无 GL 副作用；`stock_ledger_query` 以 SLE 追溯调拨 |
| F7 | 盘点覆盖基线 + 估值 | SR confirm **覆盖库存基线**（Bin actual_qty 被设为 qty），SLE 记 `qty_after_transaction`=新基线而 `actual_qty`=0（与 PR/STE 的 actual_qty=±qty 不同），并写 **GL 估值调整**；新物料无估值率时 confirm 报 `Valuation Rate required`（需 `valuation_rate` 或 `allow_zero_valuation_rate`） | 盘点「只出 plan」档不改数据；F04 若提交须提供估值率 |
| F8 | 盘点 opening-entry 门槛 | 纯净实例（SLE 表为空）首笔 SR 按 **Opening Entry** 校验，expense_account 必须是 Balance Sheet 账户（默认 `stock_adjustment_account` 为 P&L 被拒 `OpeningEntryAccountError`，须显式 `Temporary Opening - G`）；SLE 非空后默认 P&L 账户可用 | 服务初始化/验收「干净基线」下首笔盘点须用资产负债表账户 |
| F9 | 失败不静默（含例外） | 全部校验/版本/库存错误结构化 `exc_type`+4xx；例外：重提交 200（F4）、`stock_entry_type` 无效值 create/confirm 均 200 不拒（Link 校验未强制）、SR item 无效报 `ValidationError`（非 DoesNotExistError） | server 不得依赖后端拒绝重提交；create 前须校验 stock_entry_type、items 非空 |
| F10 | 清理/回滚终态 | SR 已取消**不可** REST 删除（`LinkExistsError` linked GL Entry，同 B03 F9）；STE 已取消**不可** REST 删除（`LinkExistsError` linked Stock Ledger Entry）；零残留以**快照恢复**为准；SR cancel 确定性恢复紧邻前基线但**无 cancel tool**（#25 只出 plan） | 调拨/盘点「零残留」不能依赖 REST DELETE；server 不得承诺「删除已生效调拨/盘点单据」能力（PRD §5.4） |
| F11 | 盘点「只出 plan」读取 | `erpnext.stock.doctype.stock_reconciliation.stock_reconciliation.get_items(warehouse, posting_date, posting_time, company, item_code)` 读当前库存现状（current_qty/valuation_rate，as-of-time）；或读 Bin/SLE | #25 盘点 plan 的「读现状」用 get_items 或 Bin/SLE，不产生写入 |

## 1. 通用接口与认证

- Base URL `http://localhost:8080`；认证 `Authorization: token <api_key>:<api_secret>`（Cookie 登录亦可，见 erp/README.md）。
- 通用 CRUD 路由（Frappe `v1.py`）：`GET/POST /api/resource/{doctype}`、`GET/PUT/DELETE /api/resource/{doctype}/{name}`。
- 单据动作：资源端点 `run_method:submit`/`run_method:cancel` 对 SR/STE **不可用**（403，F3）；等价 whitelisted 方法 `frappe.client.submit(doc)`（doc 须为全量 doc JSON，**传 name 串会因 `json.loads` 失败报 500 JSONDecodeError**）、`frappe.client.cancel(doctype, name)`、`frappe.client.save(doc)`。
- 成功创建/读取返回 `{"data":{...}}`；`/api/method/*` 返回 `{"message":{...}}`；删除返回 `{"data":"ok"}`（HTTP 202）；失败返回 `{"exception","exc_type","exc","_server_messages"}`，HTTP 状态码按异常类型区分（见 §6）。

## 2. 逐对象接口事实

### 2.1 Stock Entry（仓库间调拨，`stock_entry_type`=Material Transfer）

| 项 | 实测结果 |
|---|---|
| 命名 | `naming_series`=`MAT-STE-.YYYY.-` → `name`=`MAT-STE-2026-00001` 连续编号；无同名唯一性 |
| 创建 | `POST /api/resource/Stock Entry`，HTTP 200；必填 `stock_entry_type`（Link）、`company`、`items[]`；`purpose` 自动从 stock_entry_type 派生为 `Material Transfer`；`from_warehouse`/`to_warehouse` 为 Material Transfer 必填（源/目均必填）；草稿 docstatus=0 |
| 子表 items[] | 嵌套读写；行自动填充 `s_warehouse`/`t_warehouse`（取 from/to_warehouse）、`uom`/`stock_uom`/`conversion_factor`（取 Item stock_uom、=1.0）、`basic_rate`（从源仓 SLE valuation_rate 自动推导，实测=10） |
| 引用字段校验 | from_warehouse 无效→`LinkValidationError`(417 "Could not find Default Source Warehouse")；to_warehouse 无效→`LinkValidationError`(417 "Default Target Warehouse")；item_code 无效→`ValidationError`(417 "X is not a stock Item")；company 无效→`LinkValidationError`(417)；**stock_entry_type 无效→create/confirm 均 200 不拒**（Link 校验未强制，须 server 校验，F9） |
| 数量校验 | qty=0→`InvalidQtyError`(417)；qty<0→`ValidationError`(417 "quantity must be positive number")；空 items→`MandatoryError`(417 "[Stock Entry, …]: items"，较 SO/PO 的 TypeError 500 更优雅) |
| 库存/同仓校验时机 | 草稿创建**不校验**源仓库存不足（qty=100>10 创建成功）与源/目同仓（同仓创建成功）；confirm 才校验（F5） |
| confirm | 经 `frappe.client.submit` 全量 doc：docstatus 0→1、modified 变化；**库存变动**：SLE 源仓 -qty/目标仓 +qty、Bin 源减目增（SRC 10→6、TGT 0→4）；只写 SLE、不写 GL（Material Transfer 无估值变动） |
| 版本断言（confirm） | 陈旧 modified→`TimestampMismatchError`(417)；正确/省略→200 |
| confirm 前态 | 重提交已生效→200 静默 no-op（不重放，F4） |
| confirm 库存不足 | qty 超过源仓可用 → `NegativeStockError`(417 "N units of Item … needed in Warehouse … to complete this transaction")，无部分写入 |
| confirm 源/目同仓 | **不被拒**（200，默认 `validate_material_transfer_warehouses`=0） |
| cancel | 经 `frappe.client.cancel`：docstatus 1→2、modified 变化；**库存冲回**：SLE 冲销（源 +4/-4、目标 -4/+4 均 is_cancelled=1）、Bin 恢复（SRC 6→10、TGT 4→0） |
| cancel 前态 | 草稿→`DocstatusTransitionError`(417)；已取消→`ValidationError`(417 "Cannot edit cancelled document") |
| 版本断言（cancel） | `frappe.client.cancel` 不接受 modified；须走 `frappe.client.save`(docstatus=2+modified) 等价路径（同 B02 F3/B03 F3） |
| 删除 | 草稿 DELETE 202；已生效 DELETE→`ValidationError`(417 "Submitted Record cannot be deleted")；**已取消 DELETE→`LinkExistsError`(417 "linked with Stock Ledger Entry")**（SLE 持久化阻断，F10） |

### 2.2 Stock Reconciliation（库存盘点）

| 项 | 实测结果 |
|---|---|
| 命名 | `naming_series`=`MAT-RECO-.YYYY.-` → `name`=`MAT-RECO-2026-00001` 连续编号；无同名唯一性（**非任务包推测的 MAT-REC-**） |
| 创建 | `POST /api/resource/Stock Reconciliation`，HTTP 200；必填 `company`、`purpose`（Literal ""/Opening Stock/Stock Reconciliation）、`items[]`；**无 status 字段**（仅 docstatus）；草稿 docstatus=0 |
| expense_account | 默认取 Company `stock_adjustment_account`（"Stock Adjustment - G"，P&L）；**纯净实例（SLE 表空）按 Opening Entry 校验，需 Balance Sheet 账户**（`Temporary Opening - G`），否则 `OpeningEntryAccountError`(417)；SLE 非空后默认 P&L 账户可用（F8） |
| 子表 items[] | 行含 `item_code`(reqd)、`warehouse`(reqd)、`qty`（新数量）、`valuation_rate`、`current_qty`（get_items 或 UI 回填，直接 create 不自动回填，实测=0.0）、`allow_zero_valuation_rate` |
| 引用字段校验 | warehouse 无效→`LinkValidationError`(417 "Could not find Row #1: Warehouse: X")；item_code 无效→`ValidationError`(417 "Items X do not exist in the Item master"，**非** DoesNotExistError)；company 无效→`LinkValidationError`(417)；purpose 无效→`ValidationError`(417 "Purpose cannot be … should be one of …") |
| 数量/估值校验 | qty<0→`ValidationError`(417 "Negative Quantity is not allowed")；qty 缺失且无 valuation_rate→`EmptyStockReconciliationItemsError`(417)；items 空→`EmptyStockReconciliationItemsError`(417)；qty 缺失但有 valuation_rate→**200**（仅估值调整）；新物料无估值率 confirm→`ValidationError`(417 "Valuation Rate required for Item …") |
| 「只出 plan」读取 | `get_items(warehouse, posting_date, posting_time, company, item_code=None)` → 返回当前 `current_qty`/`valuation_rate`（as-of-time，`get_stock_balance`）；亦可读 Bin/SLE（F11） |
| confirm | 经 `frappe.client.submit` 全量 doc：docstatus 0→1、modified 变化；**覆盖库存基线**：Bin actual_qty 被设为 qty（0→5）；SLE 记 `qty_after_transaction`=新基线且 `actual_qty`=0；写 GL 估值调整（Stock In Hand debit / expense_account credit） |
| 版本断言（confirm） | 陈旧 modified→`TimestampMismatchError`(417)；正确/省略→200 |
| confirm 前态 | 重提交已生效→200 静默 no-op（F4） |
| cancel | 经 `frappe.client.cancel`：docstatus 1→2；**确定性恢复紧邻前基线**（Bin 3→5，reversal SLE is_cancelled=1 + `repost_future_sle_and_gle`），GL 冲销（is_cancelled=1）；但「正确库存」为系统外事实、无 cancel tool（#25 只出 plan），修正须再次盘点 |
| cancel 前态 | 草稿→`DocstatusTransitionError`(417) |
| 删除 | 草稿 DELETE 202；**已取消 DELETE→`LinkExistsError`(417 "linked with GL Entry")**（GL 持久化阻断，同 B03 F9） |

## 3. 原子性结论（PRD §5.5）

- create/confirm/cancel 均单次 REST → 单后端事务：`insert()`/`submit()`/`cancel()` 最终进入 `_save()`；`check_if_latest()`（版本断言 + `check_docstatus_transition`）先于 `validate` 执行，与落库同一次 `save()` 事务（复用 B02/B03 已冻结方法结论，本包实测无部分写入佐证）。
- 乐观版本断言与写入同事务：陈旧 `modified` 时 `TimestampMismatchError` 抛出，无部分写入（实测失败后 docstatus/库存均不变，SR/STE confirm 均验证）。
- 库存不足校验（STE `NegativeStockError`）与 confirm 提交同一事务，失败后源/目仓库存不变（实测 STE#2 confirm 失败后 SRC 仍 6）。
- 写入失败均正确报告（§6），无静默成功——例外见 F4/F9。

## 4. 回滚/取消条件（PRD §5.4）

- 草稿删除为回滚路径：`DELETE /api/resource/{doctype}/{name}` → HTTP 202（SR/STE 草稿均适用，实测）。
- 已生效单据：删除被拒（`ValidationError` 417），须先 cancel 再 delete。
- **Stock Entry 已取消：不可 DELETE（`LinkExistsError` linked Stock Ledger Entry）**——Material Transfer 虽不写 GL，但 confirm 产生的 SLE 即使 cancel 后仍以 is_cancelled=1 保留，物理删除被后端拒绝（F10）。
- **Stock Reconciliation 已取消：不可 DELETE（`LinkExistsError` linked GL Entry）**——同 B03 F9 机制（F10）。
- cancel 合法前态仅「已生效」；草稿/已取消被拒（DocstatusTransitionError/ValidationError）。
- **库存冲回**：STE cancel 确定性冲回（SLE 冲销 + Bin 恢复）；SR cancel 确定性恢复紧邻前基线（reversal SLE + repost），但均不物理删除单据/流水。
- **回滚路径汇总（复用 B01/B02/B03 已冻结事实，不重复摸底）**：
  - 主数据：Item 被 Item Price 引用删除 → 不拒绝、级联删 Item Price（B01 F4）；Customer/Supplier/Item 被交易单据引用删除 → `LinkExistsError`「disable instead of deleting」不级联（B03 F9）。
  - 价格：SO/PO create 显式非零 `rate` → 自动创建 Item Price（Standard Selling/Buying），删单不清除（孤儿主数据，B02 F7/B03 F7）。
  - 单据：SO/PO 已取消可 REST 删（B02/B03）；PR 已取消不可删（B03 F9，linked GL）；DN 已取消可删（B02）；SR/STE 已取消不可删（本包 F10，linked GL/SLE）。
  - 库存：STE cancel 冲回库存、SR cancel 恢复前基线（本包新增，均非物理删除）。
- **清理终态结论**：库存链路的「零残留」清理**不能仅靠 REST DELETE**（cancelled SR/STE 因 GL/SLE 持久化被拒）；本包以**快照恢复**（`D:\second-acceptance\reset\restore-snapshot.sh` → 纯净基线）实现零残留，恢复后 Item/Stock Entry/Stock Reconciliation/Item Price/SLE/GL/Bin 七类 `B04-PROBE-` 相关对象全部归零（实测确认，W07）。

## 5. 状态机与 docstatus 语义

| 字段 | 行为 |
|---|---|
| `docstatus` | 0=草稿、1=已生效、2=已取消；迁移经后端 submit/cancel（`frappe.client.*`，不是 `run_method`，见 F3） |
| `modified` | 每次 submit/cancel/save 后更新；同时作为乐观并发令牌（F2） |
| `status` | SR **无 status 字段**（仅 docstatus）；STE 无独立业务 status（purpose 区分类型），均以 docstatus 判状态 |
| `name` | naming_series 连续编号（MAT-STE-/MAT-RECO-），创建时生成，不可改 |

## 6. 错误类型与 HTTP 状态码（失败不静默）

| 异常 | HTTP | 场景 |
|---|---|---|
| LinkValidationError | 417 | 无效 from/to_warehouse（STE）、无效 warehouse/company（SR）、无效 company（STE） |
| ValidationError | 417 | SR item 无效（"do not exist in Item master"）、SR purpose 无效、SR qty<0、STE qty<0、STE item 非库存物料、SR confirm 缺估值率、cancel 已取消、删已生效 |
| OpeningEntryAccountError | 417 | SR 纯净实例首笔、expense_account 为 P&L（F8） |
| EmptyStockReconciliationItemsError | 417 | SR qty 缺失无估值率、items 空 |
| MandatoryError | 417 | STE create 空 items（"[Stock Entry, …]: items"） |
| InvalidQtyError | 417 | STE create qty=0 |
| TimestampMismatchError | 417 | confirm/cancel 陈旧 modified |
| NegativeStockError | 417 | STE confirm 源仓库存不足 |
| DocstatusTransitionError | 417 | cancel 草稿 |
| LinkExistsError | 417 | DELETE 已取消 SR（linked GL）、DELETE 已取消 STE（linked SLE） |
| PermissionError | 403 | `run_method:submit`/`cancel`（F3，非 whitelisted） |
| JSONDecodeError | 500 | `frappe.client.submit` 传 name 串（未优雅，非静默；须传全量 doc） |

## 7. 对 D01/D02 契约冻结的输入要点

1. `stock_transfer_create`/`stock_transfer_confirm` 不依赖后端「同名唯一性」（series 编号，F1）；create 前须校验 items 非空、数量非负、`stock_entry_type` 有效（后端 create/confirm 均不拒 stock_entry_type 无效，F9）。
2. `stock_transfer_confirm` 的前置断言必须携带当前 `modified` 做乐观并发（经 `frappe.client.submit` 全量 doc；省略则不校验，F2）；且**必须走 `frappe.client.submit`，不能走资源端点 run_method**（403，F3）。
3. `stock_transfer_create` 的「源仓各物料可用量 ≥ 调拨量」（PRD §5.2 #23）与 `stock_transfer_confirm` 的「源/目标仓有效且不同」（#24）**后端不原生强制**（草稿不校验、同仓 confirm 不拒），须由 server 前置断言（F5）。
4. `stock_transfer_confirm` 会写真实库存变动（SLE 源减目增，不写 GL，F6）；调拨无 cancel tool，其取消属「异常回滚」由管理员运维执行（已决议 #8）。
5. `stock_reconciliation_plan`（#25）为「只出 plan」：读现状用 `get_items`（as-of-time）或 Bin/SLE，**不提交不改数据**（F11/F7）；F04 不得将 SR 的 confirm「覆盖库存基线、无取消 tool」误作 plan 档的写入依据。
6. 盘点「覆盖库存基线 + 估值率要求 + 纯净实例 opening-entry 门槛」（F7/F8）是 F04 实现盘点方案须知的底层事实；server 不得承诺「删除已生效调拨/盘点单据」能力（cancelled 后 GL/SLE 持久化不可物理删除，F10，PRD §5.4）。
7. `stock_ledger_query`（#4）对 SR 单据须注意：SR 的 SLE `actual_qty`=0、以 `qty_after_transaction`=新基线表达，与 PR/STE 的 `actual_qty`=±qty 不同（F7/F6）。
8. 以上结论写入 PRD 或成为 D01/D02 权威输入时走变更控制；本记录本身不改 PRD 冻结语义。
