# F04 交付物 D04：对齐核对记录

> 文档性质：F04 交付物 D04（脱敏）。工作项 W08；逐 tool 与 D02 §3/§6、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract 一致性核对，无机制绕过。

## 1. 逐 tool 与 D02 §3/§6 契约核对

| tool | name ✓ | schema ✓ | annotation ✓ | 错误转译 ✓ | 幂等 ✓ | 前置断言 ✓ | 事后回读 ✓ | 批次 ✓ |
|---|---|---|---|---|---|---|---|---|
| #6 customer_create | ✓ | ✓ | readOnly=false/destructive=true/idempotent=true | duplicate→precondition_failed/duplicate_name | create 300s | 同名不存在/分组有效/区域有效 | 新客户语义标识+关键字段 | 同批=新客户 |
| #7 customer_update | ✓ | ✓ | 同上 | TimestampMismatch→concurrency_conflict | 指纹合并 300s | 存在启用/modified 一致/分类有效 | 变更后关键字段 | 前镜像+版本恢复 |
| #8 supplier_create | ✓ | ✓ | 同上 | DuplicateEntry→duplicate_name | create 300s | 同名不存在/分组有效 | 新供应商语义标识 | 同批=新供应商 |
| #9 supplier_update | ✓ | ✓ | 同上 | 同 #7 | 指纹合并 300s | 同上 | 变更后字段 | 前镜像+版本恢复 |
| #10 item_create | ✓ | ✓ | 同上 | DuplicateEntry→duplicate_name | create 300s | 同名不存在/分组/UOM 有效 | 新物料(含默认仓/UOM) | 同批=新物料；级联引用检查 |
| #11 item_update | ✓ | ✓ | 同上 | 同 #7 | 指纹合并 300s | 同上+docstatus 阻断 | 变更后字段 | 前镜像+版本恢复 |
| #12 item_price_set | ✓ | ✓ | 同上 | 区间重叠→precondition_failed | 指纹合并 300s | 物料有效/区间不重叠/修改价 modified | 价格语义标识 | 新增删除/修改前镜像 |
| #23 stock_transfer_create | ✓ | ✓ | destructive=false(可逆草稿) | 源仓不足→precondition_failed；stock_entry_type→invalid_argument | create 300s | 类型/items 非空/源仓可用量/仓存在 | 草稿(源/目仓+行+草稿态) | 草稿→删除 |
| #24 stock_transfer_confirm | ✓ | ✓ | destructive=true | 源目同仓→precondition_failed；负库存→precondition_failed | confirm 60s 状态断言 | 草稿+modified/源目不同/源仓可用 | docstatus=1+SLE 源减目增 | submitted→管理员回滚 |
| #25 stock_reconciliation_plan | ✓ | ✓ | readOnly=true(只出 plan) | warehouse/item 无效→precondition_failed | 不适用(只读) | 无写断言/warehouse 有效 | 不适用(无写入) | 不适用(无批次) |

> **#25 读取机制口径补充**：D02 §6.3 冻结 `posting_date`/`posting_time` 为可选，且 description 声明「只读现状（Bin/SLE 或 get_items as-of-time，B04 F11）」。实际后端 `get_items(warehouse, posting_date, posting_time, company, item_code=None)` 的 `posting_date`/`posting_time` 为无默认值位置参数，省略会被 Python 拒绝。故 F04 落地为**缺省时点走 Bin 读现状、仅在 posting_date+posting_time 齐备时走 get_items**——忠实 D02「Bin/SLE 或 get_items」双向口径，不改变 D02 契约、不反向放宽。#25 该处为「实现手法」落点（D02 §0 第 3 条：契约只冻结做什么、不冻结怎么做），末经契约变更。

## 2. D01 §1–§7 公共口径核对

- **§1 命名**：`erpnext_<资源>_<动作>` 前缀一致；消歧文案写入 description。
- **§2 schema**：必填/可选显式；Link 用语义标识；禁止任意字段名/DocType；返回语义化标识无低层技术标识符。
- **§3 annotation**：四布尔全部显式声明；对外声明与对内执法分离（写 tool 幂等声明对内挂接 idempotency 店）。
- **§4 错误模型**：统一 `isError/code/message/retryable/details`；幂等命中非错误（idempotent_replay/already_in_target_state）。
- **§5 幂等**：窗口期 create 300s/confirm 60s 不放宽；传输/客户端字段进剥离（lib/fingerprint）；confirm 状态断言兜底。
- **§6 前置/事后/批次**：两层拆分显式（schema 校验不计入前置断言）；写后回读终态；乐观版本断言（update/confirm 必带 modified）。
- **§7 窄接口**：目标对象/Link 目标/可写字段硬编码枚举；不新增通用 CRUD/任意代码执行面。

## 3. E01 permission-matrix/allowlist/confirmation-failclosed 核对

- **权限矩阵 §1.2**：1 个 token 对应 7 tool 的目标对象/引用对象与 E01 逐 tool 权限矩阵一致（Customer/Supplier/Item/Item Price/Stock Entry + 引用 Customer Group/Supplier Group/Territory/Item Group/UOM/Price List/Warehouse）。
- **allowlist §3 三层拦截**：第二层（目标对象/Link 字段目标/可写字段硬编码枚举）已落地于 `server/src/allowlist.js` WRITE_DOCTYPES/WRITE_LINK_TARGETS/WRITABLE_FIELDS/IMMUTABLE_FIELDS；第三层（对象能力一致性）由各写 tool handler 在写前校验。
- **confirmation-failclosed §1.2**：人确认档 8 tool 经 `elicitation.requireConfirmation`（accept→写/decline·cancel→零副作用）；客户端不支持 → fail-closed（`writeGate` 统一门控，含 #23 全自动档）。
- **fail-closed §2.1**：公司/币种/价格表锁单配置（`config.LOCKED_BUSINESS`）+ `assertWriteEligible`（币种空/价格表数量≠1 → 拒绝初始化写入能力，`writeGate` 接入）。
- **§2.3**：后端不可达不自动重试写（backend.js 写方法返回 `backend_unavailable`，无 retry 循环）。

## 4. E02 implementation-contract 核对

| 接口 | E02 接入点 | F04 落地 |
|---|---|---|
| 幂等指纹 | `fingerprintOf` | 逐 tool 构造 `businessParams` 经 `idempotency.check/record`（lib/idempotency 内部调用 fingerprintOf） |
| 窗口期 | `createIdempotencyStore().check/record` | 进程级单例 `write-common.idempotency`；create 组/指纹合并类 group 'create'、confirm group 'confirm/cancel' |
| confirm 状态断言 | `checkStateAssertion` | #24 先读 state 再 `checkStateAssertion(draft→submitted)`，命中 `idempotentAlreadyInTargetState` |
| 前置断言 | `assertPreconditions` | 逐 tool 手写 async 前置断言编排（框架为同步断言；write tool 用 async 后端查询故手写编排，语义对齐 D01 §6.1 两层拆分） |
| 事后校验 | `checkReadBack` | 写后回读终态逐 tool 手写回读 + 语义化断言；不一致报 `postcondition_failed` |
| 批次台账 | `createBatchLedger`/`recordChange`/`complete` | 写 tool 写后 `recordChange` + `complete`；会话级归属 `callerId(ctx)` |
| #26 可见性 | `queryBatchStatus` | 沿用 F01 `batch-status-get`（只读，无 rollback 入口） |

## 5. 无清单外对象 / 无越界读写 / 无机制绕过

- 无清单外对象：写 tool 目标对象/Link 字段目标/可写字段均由硬编码枚举限定，无 Contact/Address/User/财务/制造等对象出现。
- 无越界读写：引用允许清单对象仅作前置断言校验与 Link 引用，create/update/confirm 目标不含引用对象；#25 只读 Bin/SLE 不写。
- 无机制绕过：未经确认不得写入（`writeGate` + `confirmIfNeeded` + 8 tool 清单）；未经幂等窗口不重复写；未经写后回读不宣告成功；批次台账会话级归属。
- 后端写仅 POST/PUT + `frappe.client.submit`（#24）；无 DELETE/`run_method`/`frappe.client.cancel`（回滚归管理员运维）。

## 6. 对齐结论

逐 tool 逐项核对与 D02 §3/§6、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract **一致**，无漂移、无反向放宽、无清单外对象、无越界读写、无机制绕过。
