# B03 采购链路接口事实记录（Interface Facts）

> 冻结输出：B03 v1.0（任务包已冻结 2026-09-15，本记录为其实施产出）。本记录是 D01/D02 业务 tool 契约（#16–#18 采购订单、#19–#20 采购收货单 tool）的权威输入，逐对象逐项实测，非推测。
> 实测环境：`erpnext.local`（ERPNext 15.121.2 / Frappe 15.120.1），Token 认证 `Administrator`，2026-09-15 实施完成，测试后快照恢复归零。
> 认证与凭据值不入本记录；原始脱敏证据见 `docs/task-packages/B03/evidence/`，敏感原始输出（数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Evidence Manifest 登记）。

## 0. 结论速览（对 D01/D02 的权威输入）

| # | 事实 | 结论 | 对 MCP server 的直接影响 |
|---|---|---|---|
| F1 | 单据命名 | Purchase Order `PUR-ORD-.YYYY.-`、Purchase Receipt `MAT-PRE-.YYYY.-` 连续编号，**无同名唯一性概念**（非假设的 `PO-XXXXX`/`PR-XXXXX`） | create 无需同名前置断言；name 为 series 连续编号，由后端生成 |
| F2 | 乐观版本断言（confirm） | `modified` 为可选并发令牌：confirm 携带陈旧 `modified` → `TimestampMismatchError` 417 且无部分写入；省略则不校验 | confirm tool 必须携带当前 `modified` 做乐观并发（经 `frappe.client.submit` 全量 doc） |
| F3 | 乐观版本断言（cancel） | 标准 `run_method:cancel` 加载当前值且**不接受 modified**；仅 `frappe.client.save`（docstatus=2 + modified）等价路径可施加 | cancel tool 的版本断言须走 save 等价路径或接受无版本保护，契约冻结时明确 |
| F4 | confirm 前态不校验 | **submit 已生效单据 → 200 静默 no-op**（后端视作 update_after_submit），不重放业务效果 | server 必须前置断言「confirm 仅草稿、cancel 仅已生效」（PRD §5.1/§5.2） |
| F5 | PR 超收/库存校验时机 | **超收（qty>来源未完成量）在 confirm 触发**（`OverAllowanceError` 417），草稿创建不校验；收货入库（库存增加）在 confirm 触发（Stock Ledger Entry + Bin + GL Entry） | server 草稿 create 可放行、confirm 前须校验来源未完成量 |
| F6 | 失败不静默（含例外） | 全部校验/版本/库存错误结构化 `exc_type` + 4xx；例外：submit 已生效（静默 200）、PO create 空 items（`TypeError` 500 未优雅）、PO create qty<0（`ValidationError` 417 经 Grand Total 判定） | server 不得依赖后端拒绝重复 confirm；create 前须校验 items 非空、数量非负 |
| F7 | PO create 显式 rate 的写副作用 | 行上显式给**非零** `rate` → 自动创建 Item Price（Standard Buying、buying=1、price_list_rate=rate、valid_from=当日）；不给 rate 不创建；**删除 PO 不清除该 Item Price**（孤儿主数据，与 B02 F7 SO 同机制） | `purchase_order_create` 携带 rate 会写 Item Price 主数据，须在 D02 #16 明确「是否允许携带 rate、该副作用的台账/回滚归属」；「草稿创建仅引用主数据」（PRD §4.1②）在显式 rate 下不成立 |
| F8 | PO schedule_date 必填 | PO create 缺 `schedule_date`（Reqd by Date）→ `ValidationError: Please enter Reqd by Date`（417），SO 无此约束 | `purchase_order_create` 的 schema 须将 schedule_date 列为必填或由 server 默认填充 |
| F9 | PR confirm 产生 GL Entry 且不可物理删除 | PR confirm 同时写 Stock Ledger Entry **和 GL Entry**；cancel 后二者以「已取消」保留（SLE +5/-5、GL 4 条均 `is_cancelled=1`），导致 **cancelled PR 无法 REST 删除**（`LinkExistsError` linked GL Entry），进而 cancelled PO 亦无法删除（linked PR）；master 数据被交易单据引用时删除被拒（「You can disable this X instead of deleting it」） | PR 的「零残留」清理**不能依赖 REST DELETE**，须快照恢复；server 的采购回滚/清理契约须明确「cancel 冲回库存 ≠ 物理删除单据/流水」 |

## 1. 通用接口与认证

- Base URL `http://localhost:8080`；认证 `Authorization: token <api_key>:<api_secret>`（Cookie 登录亦可，见 erp/README.md）。
- 通用 CRUD 路由（Frappe `v1.py`）：`GET/POST /api/resource/{doctype}`、`GET/PUT/DELETE /api/resource/{doctype}/{name}`。
- 单据动作：`POST /api/resource/{doctype}/{name}` body `{"run_method":"submit"|"cancel"}`；等价 whitelisted 方法 `frappe.client.submit(doc)`（doc 可为 name 或全量 doc JSON）、`frappe.client.cancel(doctype, name)`、`frappe.client.save(doc)`。
- 按来源生成收货草稿：`POST /api/method/erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt` body `{"source_name":"<PO name>"}` → 返回草稿 dict（docstatus=0、`__islocal`=1）→ `POST /api/resource/Purchase%20Receipt` 插入。
- 成功创建/读取返回 `{"data":{...}}`；删除返回 `{"data":"ok"}`（HTTP 202）；失败返回 `{"exception","exc_type","exc","_server_messages"}`，HTTP 状态码按异常类型区分（见 §6）。

## 2. 逐对象接口事实

### 2.1 Purchase Order

| 项 | 实测结果 |
|---|---|
| 命名 | `naming_series`=`PUR-ORD-.YYYY.-` → `name`=`PUR-ORD-2026-00001` 连续编号；无同名唯一性 |
| 创建 | `POST /api/resource/Purchase%20Order`，HTTP 200；必填 supplier、company、items[]（item_code+qty）**及 schedule_date**；currency=CNY、buying_price_list=Standard Buying 自动填充；草稿 docstatus=0、status=Draft |
| schedule_date | 缺 `schedule_date`（Reqd by Date）→ `ValidationError: Please enter Reqd by Date`（417，PO 特有，F8） |
| 子表 items[] | 嵌套读写；行含 item_code/qty/rate/warehouse（默认 Stores - G）/stock_uom/uom/conversion_factor/expense_account（Cost of Goods Sold - G）/cost_center（Main - G）等 |
| 引用字段校验 | supplier 无效→`DoesNotExistError`(404)；item_code 无效→`DoesNotExistError`(404)；company/buying_price_list/warehouse/currency 无效→`LinkValidationError`(417) |
| 数量校验 | qty=0→`InvalidQtyError`(417)；qty<0→`ValidationError`(417，"Grand Total (Company Currency) must be >= 0.0"，**非 SO 的 NonNegativeError**)；空 items→`TypeError`(500 未优雅) |
| 显式 rate 副作用 | 行上显式给**非零** `rate` → 自动创建 Item Price（Standard Buying、buying=1、price_list_rate=rate、valid_from=当日）；不给 rate 不创建；Item Price 为独立主数据 doc（非 PO 子表），删除 PO 不清除（F7，与 B02 F7 SO 同机制） |
| confirm | `run_method:submit` 或 `frappe.client.submit`：docstatus 0→1、status→`To Receive and Bill`、modified 变化 |
| 版本断言（confirm） | 陈旧 modified→`TimestampMismatchError`(417)；正确/省略→200 |
| confirm 前态 | submit 已生效→200 静默 no-op（不重放，须 server 前置断言） |
| cancel | `run_method:cancel`：docstatus 1→2、status→`Cancelled`、modified 变化；PO 无库存/流水，cancel 仅状态翻转（无冲回库存） |
| cancel 前态 | 草稿→`DocstatusTransitionError`(417，"Cannot change docstatus from 0 (Draft) to 2 (Cancelled)")；已取消→`ValidationError`(417，"Cannot edit cancelled document") |
| 版本断言（cancel） | `run_method:cancel` 加载当前值不接受 modified；`frappe.client.save`(docstatus=2+modified 陈旧)→`TimestampMismatchError`(417) |
| 下游约束 | 存在已确认 Purchase Receipt → `LinkExistsError`(417) 拒绝 cancel（"linked with Purchase Receipt"） |
| 删除 | 草稿 DELETE 202；已取消且无下游 → DELETE 202；已取消但存在（已取消）下游 PR → `LinkExistsError`(417)；已生效 DELETE→`ValidationError`(417，须先 cancel) |

### 2.2 Purchase Receipt

| 项 | 实测结果 |
|---|---|
| 命名 | `naming_series`=`MAT-PRE-.YYYY.-` → `name`=`MAT-PRE-2026-00001` 连续编号 |
| 按来源生成 | `make_purchase_receipt(source_name)` mapper：来源 PO 必须 docstatus=1（否则 `ValidationError` 417 "Cannot map because following condition fails: docstatus=1"）→ 返回草稿 dict（items[] 含 purchase_order_item/purchase_order/qty=来源未完成量/warehouse）→ insert；亦可直接 create 并逐行指定 `purchase_order`/`purchase_order_item` |
| 创建 | 草稿 docstatus=0、status=Draft |
| 超收校验时机 | 草稿创建**不校验** qty>来源未完成量（qty 6>5 创建成功）；confirm 触发 `OverAllowanceError`(417，"over limit by Qty 1.0") |
| confirm（收货入库） | docstatus 0→1、status→`To Bill`；**正向收货成立**：Bin `actual_qty` 0→+5、Stock Ledger Entry 正向 +5（qty_after_transaction=5）、并产生 GL Entry（4 条，F9） |
| 版本断言（confirm） | 陈旧 modified→`TimestampMismatchError`(417)，无部分写入 |
| cancel（冲回库存） | `run_method:cancel`：docstatus 1→2、status→`Cancelled`；**库存冲回归零**：Bin 5→0、SLE 正向 +5 与冲回 -5 均标记 `is_cancelled=1`、GL Entry 标记 `is_cancelled=1`（仅作清理摸底，不构成 D02 新增 `purchase_receipt_cancel` tool 依据，PRD §3.3/已决议 #8） |
| 删除 | 草稿 DELETE 202；**已取消 DELETE 被拒** `LinkExistsError`(417，"linked with GL Entry"，F9)；已生效 DELETE→`ValidationError`(417，须先 cancel) |

## 3. 原子性结论（PRD §5.5）

- create/confirm/cancel 均单次 REST → 单后端事务：`insert()`/`submit()`/`cancel()` 最终都进入 `_save()`；`check_if_latest()`（版本断言 + `check_docstatus_transition` 状态迁移校验）先于 `validate` 执行，与落库同一次 `save()` 事务（复用 B02 已冻结方法结论，本包实测无部分写入佐证）。
- 乐观版本断言与写入同事务：陈旧 `modified` 时 `TimestampMismatchError` 抛出，无部分写入（实测失败后 docstatus/modified 均不变，PO confirm/cancel、PR confirm 均验证）。
- confirm 状态校验与提交同一事务（`check_if_latest` → `validate` → 落库在同一 `_save`），满足 PRD §5.5「不得以先查后调冒充同一事务」的判定基础。
- 写入失败均正确报告（§6），无静默成功——唯二例外见 F4/F6。

## 4. 回滚/取消条件（PRD §5.4）

- 草稿删除为回滚路径：`DELETE /api/resource/{doctype}/{name}` → HTTP 202（PO/PR 草稿均适用，实测）。
- 已生效单据：删除被拒（`ValidationError` 417），须先 cancel 再 delete。
- **已取消 PO（无下游）：可 DELETE 202 物理删除（实测 PO 草稿/已取消无下游均 202）。**
- **已取消 PR：不可 DELETE（`LinkExistsError` 417，"linked with GL Entry"）**——PR confirm 产生的 GL Entry/SLE 即使 cancel 后仍以 `is_cancelled=1` 保留，物理删除被后端拒绝（F9，B03 特有，与 B02 SO/DN「已取消可 DELETE」不同）。
- cancel 合法前态仅「已生效」；草稿/已取消被拒（DocstatusTransitionError/ValidationError）。
- 下游约束：已生效 PO 存在已确认 PR → cancel 被 `LinkExistsError`(417) 拒绝（"linked with Purchase Receipt"）；须先 cancel/删下游 PR。
- master 数据清理：Supplier/Item 被交易单据引用时 DELETE → `LinkExistsError`(417，"You can disable this X instead of deleting it")，不级联删除（与 B01 F4 Item→Item Price 级联不同，Supplier/Item 被单据引用走「禁用提示」而非拒绝级联）。
- **清理终态结论**：采购链路的「零残留」清理**不能仅靠 REST DELETE**（cancelled PR/PO 因 GL/SLE 持久化被拒）；本包以**快照恢复**（`D:\second-acceptance\reset\restore-snapshot.sh` → 纯净基线 `baseline-20260914-095506.sql`）实现零残留，恢复后 Supplier/Item/PO/PR/SLE/GL/Item Price 六类 `B03-PROBE-` 相关对象全部归零（实测确认）。

## 5. 状态机与 docstatus 语义

| 字段 | 行为 |
|---|---|
| `docstatus` | 0=草稿、1=已生效、2=已取消；迁移经后端 submit/cancel（不是普通 update） |
| `modified` | 每次 submit/cancel/save 后更新；同时作为乐观并发令牌（F2/F3） |
| `status` | PO：Draft →（submit）`To Receive and Bill` →（cancel）`Cancelled`；PR：Draft →（submit）`To Bill` →（cancel）`Cancelled` |
| `name` | naming_series 连续编号，创建时生成，不可改 |

## 6. 错误类型与 HTTP 状态码（失败不静默）

| 异常 | HTTP | 场景 |
|---|---|---|
| DoesNotExistError | 404 | PO create 无效 supplier / item_code |
| LinkValidationError | 417 | 无效 company / buying_price_list / warehouse / currency |
| ValidationError | 417 | PO create 缺 schedule_date（"Please enter Reqd by Date"）、PO create qty<0（"Grand Total must be >= 0.0"）、cancel 已取消、删已生效、mapper 来源草稿 |
| MandatoryError | 417 | PO create 缺失 supplier / company（Link 必填） |
| InvalidQtyError | 417 | PO create qty=0 |
| TimestampMismatchError | 417 | confirm/cancel 陈旧 modified |
| DocstatusTransitionError | 417 | cancel 草稿（"Cannot change docstatus from 0 (Draft) to 2 (Cancelled)"） |
| LinkExistsError | 417 | cancel PO 存在已确认 PR、DELETE 已取消 PR（linked GL Entry）、DELETE 已取消 PO（linked PR）、DELETE 被引用 Supplier/Item（"disable instead of deleting"） |
| OverAllowanceError | 417 | PR confirm 超收（qty>来源未完成量，"over limit by Qty N"） |
| TypeError | 500 | PO create 空 items（未优雅，非静默） |

## 7. 对 D01/D02 契约冻结的输入要点

1. `purchase_order_create`/`purchase_receipt_create` 不依赖后端「同名唯一性」（series 编号，无重复概念，F1）；create 前须校验 items 非空（F6）、数量非负、且 PO 须提供 `schedule_date`（F8，或由 server 默认填充）。
2. `purchase_order_confirm`/`purchase_receipt_confirm` 的前置断言必须携带当前 `modified` 做乐观并发（经 `frappe.client.submit` 全量 doc；省略则不校验，F2）。
3. `purchase_order_cancel` 版本断言不可经标准 cancel 端点实现，须走 `frappe.client.save`（docstatus=2+modified）等价路径，或契约冻结时明确放弃 cancel 的版本保护（F3）。
4. confirm/cancel 均须 server 前置断言合法前态（confirm 仅草稿、cancel 仅已生效），后端不拒绝重复 confirm（静默 no-op，F4）。
5. `purchase_receipt_confirm` 的超收校验由后端在 confirm 强制（`OverAllowanceError`，F5），但 server 仍应前置校验来源未完成量以给出可自纠报错（PRD §7）；收货入库会产生真实库存增加（Bin/SLE/GL，F5/F9）。
6. `purchase_order_create` 携带显式非零 `rate` 会对 Item Price 产生主数据写入副作用（自动创建 Standard Buying 价，删除 PO 不清除），须在 D02 #16 契约中明确「create 是否允许携带 rate、该副作用的台账归属与回滚」（F7）。
7. **采购链路的清理/回滚契约须明确：PR 的 cancel 冲回库存 ≠ 物理删除单据/流水**（cancelled PR 因 GL Entry 持久化不可 REST DELETE，F9）；「零残留」以快照恢复为准，server 不得承诺「删除采购收货单」能力（PRD §5.4、§3.3）。
8. 以上结论写入 PRD 或成为 D01/D02 权威输入时走变更控制；本记录本身不改 PRD 冻结语义。
