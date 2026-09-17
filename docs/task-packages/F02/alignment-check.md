# F02 交付物 D04：对齐核对记录

> 文档性质：F02 交付物 D04（脱敏）。工作项 W08；逐 tool 与 D02 §4/§5、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract 一致性核对，无机制绕过。

## 1. 逐 tool 与 D02 §4/§5 契约核对

| tool | name ✓ | schema ✓ | annotation ✓ | 错误转译 ✓ | 幂等 ✓ | 前置断言 ✓ | 事后回读 ✓ | 批次 ✓ |
|---|---|---|---|---|---|---|---|---|
| #13 sales_order_create | ✓ | ✓ | destructive=false(可逆草稿) | 无效 customer/item→precondition_failed；空 items→invalid_argument | create 300s | 客户/物料启用、items 非空 | 草稿(编号+客户+行+草稿态) | 同批=销售订单草稿；草稿→删除 |
| #14 sales_order_confirm | ✓ | ✓ | destructive=true | TimestampMismatch→concurrency_conflict | confirm 60s 状态断言 | 草稿+modified 一致 | docstatus=1 | submitted→cancel |
| #15 sales_order_cancel | ✓ | ✓ | destructive=true | 下游 DN(LinkExistsError)→precondition_failed | cancel 60s 状态断言 | 已生效+modified 一致 | docstatus=2 | cancelled→terminal |
| #16 purchase_order_create | ✓ | ✓ | destructive=false | 无效 supplier/item→precondition_failed；缺 schedule_date→invalid_argument | create 300s | 供应商/物料启用、items 非空、schedule_date | 草稿(编号+供应商+行+草稿态) | 同批=采购订单草稿；草稿→删除 |
| #17 purchase_order_confirm | ✓ | ✓ | destructive=true | 同 #14 | confirm 60s 状态断言 | 草稿+modified 一致 | docstatus=1 | submitted→cancel |
| #18 purchase_order_cancel | ✓ | ✓ | destructive=true | 下游 PR(LinkExistsError)→precondition_failed | cancel 60s 状态断言 | 已生效+modified 一致 | docstatus=2 | cancelled→terminal |
| #19 purchase_receipt_create | ✓ | ✓ | destructive=false | 来源非生效→precondition_failed；超收→precondition_failed | create 300s | 来源 PO 已生效、行数量≤未完成量 | 草稿(编号+来源订单+行+草稿态) | 草稿→删除；不承诺删除已生效/已取消 PR |
| #20 purchase_receipt_confirm | ✓ | ✓ | destructive=true | 超收 OverAllowanceError→precondition_failed | confirm 60s 状态断言 | 草稿+modified、来源 PO 已生效、剩余可收 | docstatus=1 | submitted→管理员回滚 |
| #21 delivery_note_create | ✓ | ✓ | destructive=false | 来源非生效→precondition_failed；超发→precondition_failed | create 300s | 来源 SO 已生效、行数量≤未完成量 | 草稿(编号+来源订单+行+草稿态) | 草稿→删除 |
| #22 delivery_note_confirm | ✓ | ✓ | destructive=true | 超发 OverAllowanceError/负库存 NegativeStockError→precondition_failed | confirm 60s 状态断言 | 草稿+modified、来源 SO 已生效、剩余可发 | docstatus=1 | submitted→管理员回滚 |

> **#15/#18 cancel 版本保护落地**：D02 §0 第 5 条冻结「标准 cancel 端点不接受 modified，cancel 须经 `frappe.client.save`(docstatus=2+modified) 等价路径施加版本保护」。F02 落地为 `backend.save`（`POST /api/method/frappe.client.save`，body `{doc: 全量 doc 且 docstatus=2 + modified}`），并经 read-back 断言 docstatus=2；下游约束（已确认 DN/PR 的 `LinkExistsError`）由后端在该 save 事务内强制、经 `translate.js` 转译 `precondition_failed`。
>
> **#19/#21 超发/超收前置断言**：D02 §4.4/§5.4 冻结「草稿创建后端不校验超发/超收、confirm 才触发（B02/B03 F5），server 前置校验给可自纠报错」。F02 落地为 mapper 返回来源未完成量 → 显式 items 时按 item_code 覆写并校验 `qty ≤ 来源未完成量`，超限返回 `precondition_failed`（含缺口数量与可用量）。

## 2. D01 §1–§7 公共口径核对

- **§1 命名**：`erpnext_<资源>_<动作>` 前缀一致（sales_order/purchase_order/purchase_receipt/delivery_note + create/confirm/cancel）；消歧文案写入 description（create 只产草稿、confirm/cancel 才生效/取消）。
- **§2 schema**：必填/可选显式；Link 用语义标识（客户名/供应商名/单据编号）；禁止任意字段名/DocType；返回语义化标识无低层技术标识符。
- **§3 annotation**：四布尔全部显式声明；对外声明与对内执法分离（写 tool 幂等声明对内挂接 idempotency store）；`idempotent=true` 对应 server 侧实现。
- **§4 错误模型**：统一 `isError/code/message/retryable/details`；幂等命中非错误（idempotent_replay/already_in_target_state）；confirm/cancel 状态断言命中返回幂等成功非通用错误。
- **§5 幂等**：窗口期 create 300s/confirm·cancel 60s 不放宽；传输/客户端字段剥离（lib/fingerprint）；confirm/cancel 状态断言兜底。
- **§6 前置/事后/批次**：两层拆分显式（schema 校验不计入前置断言）；写后回读终态（docstatus=0/1/2）；乐观版本断言（confirm/cancel 必带 modified）。
- **§7 窄接口**：目标对象/Link 目标/可写字段硬编码枚举；不新增通用 CRUD/任意代码执行面。

## 3. E01 permission-matrix/allowlist/confirmation-failclosed 核对

- **权限矩阵 §1.3/§1.4**：10 tool 的目标对象/引用对象与 E01 逐 tool 权限矩阵一致（Sales Order/Purchase Order/Purchase Receipt/Delivery Note + 引用 Customer/Supplier/Item/Warehouse/Sales Order(来源)/Purchase Order(来源) + Company/Currency/Price List(server 配置)）。
- **allowlist §3 三层拦截**：第二层（目标对象/Link 字段目标/可写字段硬编码枚举）已落地于 `server/src/allowlist.js` WRITE_DOCTYPES/WRITE_LINK_TARGETS/WRITABLE_FIELDS/IMMUTABLE_FIELDS；第三层（对象能力一致性）由各写 tool handler 在写前校验（无 object_type 字符串输入面）。
- **confirmation-failclosed §1.2**：人确认档 6 tool（#14/#15/#17/#18/#20/#22）经 `elicitation.requireConfirmation`（accept→写/decline·cancel→零副作用）；客户端不支持 → fail-closed（`writeGate` 统一门控，含全自动 4 tool）。
- **§1.3 全自动档**：#13/#16/#19/#21 免确认仅限 L3，仍挂接幂等/前置/事后/批次；客户端不支持 elicitation 时全量 fail-closed。
- **fail-closed §2.1**：公司/币种/价格表锁单配置（`config.LOCKED_BUSINESS`，含 buyingPriceList）+ `assertWriteEligible`（币种空/价格表数量≠1 → 拒绝初始化写入能力，`writeGate` 接入）。
- **§2.3**：后端不可达不自动重试写（backend.js 写方法返回 `backend_unavailable`，无 retry 循环）。

## 4. E02 implementation-contract 核对

| 接口 | E02 接入点 | F02 落地 |
|---|---|---|
| 幂等指纹 | `fingerprintOf` | 逐 tool 构造 `businessParams` 经 `idempotency.check/record`（lib/idempotency 内部调用 fingerprintOf） |
| 窗口期 | `createIdempotencyStore().check/record` | 进程级单例 `write-common.idempotency`；create 组 group 'create'、confirm/cancel 组 group 'confirm/cancel' |
| confirm/cancel 状态断言 | `checkStateAssertion` | #14/#15/#17/#18/#20/#22 先读 state 再 `checkStateAssertion`，命中 `idempotentAlreadyInTargetState` |
| 前置断言 | `assertPreconditions` | 逐 tool 手写 async 前置断言编排（框架为同步断言；write tool 用 async 后端查询故手写编排，语义对齐 D01 §6.1 两层拆分） |
| 事后校验 | `checkReadBack` | 写后回读终态逐 tool 手写回读 + docstatus 断言；不一致报 `postcondition_failed` |
| 批次台账 | `createBatchLedger`/`recordChange`/`complete` | 写 tool 写后 `recordChange` + `complete`；会话级归属 `callerId(ctx)`；`rollbackPathFor`（草稿 delete/已生效 cancel/已取消 terminal） |
| #26 可见性 | `queryBatchStatus` | 沿用 F01 `batch-status-get`（只读，无 rollback 入口） |

## 5. 无清单外对象 / 无越界读写 / 无机制绕过

- 无清单外对象：写 tool 目标对象/Link 字段目标/可写字段均由硬编码枚举限定，无 Contact/Address/User/财务/制造等对象出现。
- 无越界读写：引用允许清单对象（Warehouse/Company/Currency/Price List 等）仅作前置断言校验与 Link 引用/server 配置；来源单据（Sales Order/Purchase Order）仅作来源引用读取、不经本 tool 增删改。
- 无机制绕过：未经确认不得写入（`writeGate` + `confirmIfNeeded` + 6 tool 清单）；未经幂等窗口不重复写；未经写后回读不宣告成功；批次台账会话级归属。
- 后端写仅 POST（create/insert）+ `frappe.client.submit`（confirm）+ `frappe.client.save`（cancel）+ mapper（#19/#21）；无 DELETE/`run_method`/`frappe.client.cancel`（回滚归管理员运维）。
- #13/#16 不接受显式 `rate`，从契约层消除 B02 F7/B03 F7 孤儿 Item Price 写副作用。

## 6. 对齐结论

逐 tool 逐项核对与 D02 §4/§5、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract **一致**，无漂移、无反向放宽、无清单外对象、无越界读写、无机制绕过。
