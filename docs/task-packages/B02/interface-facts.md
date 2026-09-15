# B02 销售链路接口事实记录（Interface Facts）

> 冻结输出：B02 v1.0（已冻结，2026-09-14）。本记录是 D01/D02 业务 tool 契约（#13–#15 销售订单、#21–#22 发货单 tool）的权威输入，逐对象逐项实测，非推测。
> 实测环境：`erpnext.local`（ERPNext 15.121.2 / Frappe 15.120.1），Token 认证 `Administrator`，2026-09-14 实施完成。
> 认证与凭据值不入本记录；原始脱敏证据见 `docs/task-packages/B02/evidence/`，敏感原始输出受控于 `D:\second-acceptance\evidence\`（Evidence Manifest 登记）。

## 0. 结论速览（对 D01/D02 的权威输入）

| # | 事实 | 结论 | 对 MCP server 的直接影响 |
|---|---|---|---|
| F1 | 单据命名 | Sales Order `SAL-ORD-.YYYY.-`、Delivery Note `MAT-DN-.YYYY.-` 连续编号，**无同名唯一性概念**（非假设的 `SO-XXXXX`/`DN-XXXXX`） | create 无需同名前置断言；name 为 series 连续编号，由后端生成 |
| F2 | 乐观版本断言（confirm） | `modified` 为可选并发令牌：confirm 携带陈旧 `modified` → `TimestampMismatchError` 417 且无部分写入；省略则不校验 | confirm tool 必须携带当前 `modified` 做乐观并发（经 `frappe.client.submit` 全量 doc） |
| F3 | 乐观版本断言（cancel） | 标准 `run_method:cancel`/`frappe.client.cancel` 加载当前值且**不接受 modified**；仅 `frappe.client.save`（docstatus=2 + modified）等价路径可施加 | cancel tool 的版本断言须走 save 等价路径或接受无版本保护，契约冻结时明确 |
| F4 | confirm 前态不校验 | **submit 已生效单据 → 200 静默 no-op**（后端视作 update_after_submit），不重放业务效果 | server 必须前置断言「confirm 仅草稿、cancel 仅已生效」（PRD §5.1/§5.2） |
| F5 | DN 超发/库存校验时机 | **超发（qty>未完成量）在 confirm 触发**（`OverAllowanceError` 417），草稿创建不校验；库存不足在 confirm 触发（`NegativeStockError` 417） | server 草稿 create 可放行、confirm 前须校验来源未完成量 + 可用库存 |
| F6 | 失败不静默（含例外） | 全部校验/版本/库存错误结构化 `exc_type` + 4xx；唯二例外：submit 已生效（静默 200）、SO create 空 items（`TypeError` 500 未优雅） | server 不得依赖后端拒绝重复 confirm；create 前须校验 items 非空 |

## 1. 通用接口与认证

- Base URL `http://localhost:8080`；认证 `Authorization: token <api_key>:<api_secret>`（Cookie 登录亦可）。
- 通用 CRUD 路由（Frappe `v1.py`）：`GET/POST /api/resource/{doctype}`、`GET/PUT/DELETE /api/resource/{doctype}/{name}`。
- 单据动作：`POST /api/resource/{doctype}/{name}` body `{"run_method":"submit"|"cancel"}`；等价 whitelisted 方法 `frappe.client.submit(doc)`（doc 可为 name 或全量 doc JSON）、`frappe.client.cancel(doctype, name)`。
- 按来源生成发货草稿：`POST /api/method/erpnext.selling.doctype.sales_order.sales_order.make_delivery_note` body `{"source_name":"<SO name>"}` → 返回草稿 dict → `POST /api/resource/Delivery%20Note` 插入。
- 成功创建/读取返回 `{"data":{...}}`；删除返回 `{"data":"ok"}`（HTTP 202）；失败返回 `{"exception","exc_type","exc","_server_messages"}`，HTTP 状态码按异常类型区分（见 §6）。

## 2. 逐对象接口事实

### 2.1 Sales Order

| 项 | 实测结果 |
|---|---|
| 命名 | `naming_series`=`SAL-ORD-.YYYY.-` → `name`=`SAL-ORD-2026-00001` 连续编号；无同名唯一性 |
| 创建 | `POST /api/resource/Sales%20Order`，HTTP 200；必填 customer、company、items[]（item_code+qty）；transaction_date/delivery_date 建议显式；currency=CNY、selling_price_list=Standard Selling 自动填充；草稿 docstatus=0、status=Draft |
| 子表 items[] | 嵌套读写；行含 item_code/qty/warehouse（默认 Stores - G）/is_stock_item/rate 等 |
| 引用字段校验 | customer 无效→`DoesNotExistError`(404)；item_code 无效→`DoesNotExistError`(404)；warehouse/company/currency/selling_price_list 无效→`LinkValidationError`(417) |
| 数量校验 | qty=0→`InvalidQtyError`(417)；qty<0→`NonNegativeError`(417)；空 items→`TypeError`(500 未优雅) |
| confirm | `run_method:submit` 或 `frappe.client.submit`：docstatus 0→1、status→`To Deliver and Bill`、modified 变化 |
| 版本断言（confirm） | 陈旧 modified→`TimestampMismatchError`(417)；正确/省略→200 |
| confirm 前态 | submit 已生效→200 静默 no-op（不重放，须 server 前置断言） |
| cancel | `run_method:cancel`：docstatus 1→2、status→`Cancelled`、modified 变化 |
| cancel 前态 | 草稿→`DocstatusTransitionError`(417)；已取消→`ValidationError`(417) |
| 版本断言（cancel） | `run_method:cancel` 传 modified→`TypeError`(500)；`frappe.client.save`(docstatus=2+modified)→`TimestampMismatchError`(417) |
| 下游约束 | 存在已确认 DN → `LinkExistsError`(417) 拒绝 cancel |
| 删除 | 草稿 DELETE 202；已生效 DELETE→`ValidationError`(417，须先 cancel)；已取消 DELETE 202 |

### 2.2 Delivery Note

| 项 | 实测结果 |
|---|---|
| 命名 | `naming_series`=`MAT-DN-.YYYY.-` → `name`=`MAT-DN-2026-00001` 连续编号 |
| 按来源生成 | `make_delivery_note(source_name)` mapper：来源 SO 必须 docstatus=1（否则 `ValidationError` 417 "docstatus=1"）→ 返回草稿 dict → insert；亦可直接 create 并逐行指定 against_sales_order/so_detail |
| 创建 | 草稿 docstatus=0、status=Draft；行含 against_sales_order/so_detail/qty/warehouse |
| 超发校验时机 | 草稿创建**不校验** qty>未完成量（qty 6>5 创建成功）；confirm 触发 `OverAllowanceError`(417) |
| confirm（非库存物料） | service item（is_stock_item=0）：docstatus 0→1、status→`To Bill`，正向发货成立 |
| confirm（库存不足） | stock item 无库存：`NegativeStockError`(417) "needed in Warehouse ... to complete this transaction" |
| 版本断言（confirm） | 陈旧 modified→`TimestampMismatchError`(417) |
| 充足库存正向发货 | 未实测（需真实库存就绪，B03/B04/F02 范围，冻结边界） |

## 3. 原子性结论（PRD §5.5）

- create/confirm/cancel 均单次 REST → 单后端事务：`insert()`/`submit()`/`cancel()` 最终都进入 `_save()`；`check_if_latest()`（版本断言 + `check_docstatus_transition` 状态迁移校验）先于 `validate` 执行，与落库同一次 `save()` 事务。
- 乐观版本断言与写入同事务：陈旧 `modified` 时 `TimestampMismatchError` 抛出，无部分写入（实测失败后 modified/docstatus 均不变）。
- confirm 状态校验与提交同一事务（`check_if_latest` → `validate` → 落库在同一 `_save`），满足 PRD §5.5「不得以先查后调冒充同一事务」的判定基础。
- 写入失败均正确报告（§6），无静默成功——唯二例外见 F4/F6。

## 4. 回滚/取消条件（PRD §5.4）

- 草稿删除为回滚路径：`DELETE /api/resource/{doctype}/{name}` → HTTP 202（SO/DN 草稿均适用）。
- 已生效单据：删除被拒（`ValidationError` 417 "Submitted Record cannot be deleted. You must Cancel"），须先 cancel 再 delete。
- 已取消单据：可 DELETE 202 物理删除（SO 实测）。
- cancel 合法前态仅「已生效」；草稿/已取消被拒（DocstatusTransitionError/ValidationError）。
- 下游约束：已生效 SO 存在已确认 DN → cancel 被 `LinkExistsError`(417) 拒绝；须先删/取消下游 DN。
- 清理顺序（§16）：先删下游 DN（草稿 DELETE；已生效 cancel→DELETE），再 cancel→delete SO，最后删前置 Customer/Item。

## 5. 状态机与 docstatus 语义

| 字段 | 行为 |
|---|---|
| `docstatus` | 0=草稿、1=已生效、2=已取消；迁移经后端 submit/cancel（不是普通 update），普通 update 改写 docstatus 的行为见 B01 F5（交易单据应避免） |
| `modified` | 每次 submit/cancel/save 后更新；同时作为乐观并发令牌（F2/F3） |
| `status` | Draft →（submit）`To Deliver and Bill`（SO）/`To Bill`（DN）→（cancel）`Cancelled` |
| `name` | naming_series 连续编号，创建时生成，不可改 |

## 6. 错误类型与 HTTP 状态码（失败不静默）

| 异常 | HTTP | 场景 |
|---|---|---|
| DoesNotExistError | 404 | SO create 无效 customer / item_code |
| LinkValidationError | 417 | 无效 warehouse / company / currency / price list |
| MandatoryError | 417 | SO create 缺失 customer |
| InvalidQtyError / NonNegativeError | 417 | SO create qty=0 / qty<0 |
| TimestampMismatchError | 417 | confirm/cancel 陈旧 modified |
| DocstatusTransitionError | 417 | cancel 草稿 |
| LinkExistsError | 417 | cancel 存在已确认下游 DN |
| OverAllowanceError / NegativeStockError | 417 | DN confirm 超发 / 库存不足 |
| ValidationError | 417 | 删已生效、cancel 已取消、mapper 来源草稿 |
| TypeError | 500 | SO create 空 items；run_method:cancel 传 modified（未优雅，非静默） |

## 7. 对 D01/D02 契约冻结的输入要点

1. `sales_order_create`/`delivery_note_create` 不依赖后端「同名唯一性」（series 编号，无重复概念，F1）；create 前须校验 items 非空（F6）。
2. `sales_order_confirm`/`delivery_note_confirm` 的前置断言必须携带当前 `modified` 做乐观并发（经 `frappe.client.submit` 全量 doc；省略则不校验，F2）。
3. `sales_order_cancel` 版本断言不可经标准 cancel 端点实现，须走 `frappe.client.save`（docstatus=2+modified）等价路径，或契约冻结时明确放弃 cancel 的版本保护（F3）。
4. confirm/cancel 均须 server 前置断言合法前态（confirm 仅草稿、cancel 仅已生效），后端不拒绝重复 confirm（静默 no-op，F4）。
5. `delivery_note_confirm` 的超发与库存校验由后端在 confirm 强制（F5），但 server 仍应前置校验来源未完成量与可用库存以给出可自纠报错（PRD §7）。
6. 以上结论写入 PRD 或成为 D01/D02 权威输入时走变更控制；本记录本身不改 PRD 冻结语义。
