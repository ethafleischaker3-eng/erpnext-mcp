# E01 人工确认与 fail-closed 机制规范（confirmation-failclosed）

> 文档性质：E01 交付物 D05，人工确认机制（对齐 A01 L3 结论、规范 §9.7）与 fail-closed 兜底（PRD 决议 1/2）的机制规范。是 F 包实施时逐 tool 挂接确认/fail-closed 的权威输入。
> 版本：v1.0（E01 实施产出）；实现主体：Claude（E01 独立实施上下文）；未读取 C01b 冻结任务集正文/断言。

---

## 1. 人工确认机制（对齐 A01 L3 结论 + 规范 §9.7）

### 1.1 冻结前提（A01 v1.0 结论）

- 目标客户端 Claude Code 2.1.263（stdio）、MCP 协议 2025-11-25，`initialize` 声明 `elicitation` 能力，支持 server 侧发起确认（`elicitation/create`）。
- 确认应答 `result.action`：`accept`（批准）/ `decline`（拒绝）/ `cancel`（无人工可确认时安全取消）。
- **结论：L3 成立**。人确认档写 tool 可执行真实写入，但必须经有效 server 侧确认。

### 1.2 确认机制强制要求（MUST）

1. **确认由 server 侧发起**（规范 §9.7）：确认动作由 server 在处理 `tools/call` 期间主动发出 `elicitation/create`，不得依赖客户端权限配置实现「确认」。
2. **完整参数展示**：确认请求 MUST 展示完整 tool 调用参数（tool 名 + 全部参数 + 拟执行动作），MUST NOT 只给 tool 名称或摘要。
3. **用户裁决，拒绝即不写入**：`action=accept` → 继续执行写入；`action=decline` / `action=cancel` → 返回可自纠错误且**零副作用（不写入）**。
4. **客户端不支持即 fail-closed**（规范 §9.7）：客户端 `initialize` 未声明 `elicitation` 能力 → server 拒绝执行并返回可自纠错误，MUST NOT 降级为直接执行。
5. **敏感凭据只走 URL 模式**（规范 §9.7 / A01 W08）：`mode=url`（跳转/浏览器安全表单），MUST NOT 用 `mode=form` 索取密码/密钥；本域工具不索取真实凭据，普通写走 `mode=form`。
6. **发起时机**：确认请求只在处理某个客户端请求期间发出，无凭空发起的确认（规范 §9.7 / A01 W09）。
7. **协议版本动态适配**（A01 W02）：server 在 `initialize` 握手读取 `protocolVersion` 与 `capabilities.elicitation` 后加载对应处理逻辑，不硬编码字段名/交互模式。

### 1.3 人确认档 tool 清单（忠实 D02 总表）

| 档位 | tool |
|---|---|
| 人确认（未经确认不得写入） | #6 `customer_create`、#7 `customer_update`、#8 `supplier_create`、#9 `supplier_update`、#10 `item_create`、#11 `item_update`、#12 `item_price_set`、#14 `sales_order_confirm`、#15 `sales_order_cancel`、#17 `purchase_order_confirm`、#18 `purchase_order_cancel`、#20 `purchase_receipt_confirm`、#22 `delivery_note_confirm`、#24 `stock_transfer_confirm` |
| 全自动（草稿创建，无需确认） | #13 `sales_order_create`、#16 `purchase_order_create`、#19 `purchase_receipt_create`、#21 `delivery_note_create`、#23 `stock_transfer_create` |
| 只出 plan（无写入） | #25 `stock_reconciliation_plan` |

> 全自动档仅覆盖草稿创建（PRD §4.1 三条推导：可逆 + 仅引用主数据 + 客观标准满足）；生效/取消/主数据一律人确认。

### 1.4 确认机制与幂等/事后校验的次序（F 包挂接口径）

对每个人确认写 tool：① schema 校验 → ② 前置断言（业务状态）→ ③ **server 侧确认（elicitation）** → ④ 执行后端写（乐观版本断言）→ ⑤ 事后回读断言终态 → ⑥ 记入批次台账。任一步失败即中止后续写入，零副作用。

---

## 2. fail-closed 兜底（PRD 决议 1/2）

### 2.1 币种/默认价格表 fail-closed（PRD 决议 2）

- MVP 锁单：公司 `gjg`、币种 `CNY`（`gjg.default_currency` 唯一）、销售价格表 `Standard Selling`（全实例唯一 `selling=1 且 enabled=1`，currency=CNY）、采购价格表 `Standard Buying`。作为 server 集中配置，非散落硬编码。
- **fail-closed 条件**：`gjg.default_currency` 为空，或 `selling=1 且 enabled=1` 的价格表数量 ≠ 1（0 个或多个）时，server **拒绝初始化写入能力**并 fail closed（只读 tool 可用），MUST NOT 静默选用或任选其一。
- 兜底性质：币种/价格表是写入能力的**运行时前置**，命中即禁止初始化写入；只读 tool（查询/检索/详情/批次查询）不受影响。

### 2.2 客户端不支持确认时写 tool 全量降级 fail-closed（PRD 决议 1）

- 若 `initialize` 未声明 `elicitation`（客户端不支持 server 侧确认），**所有写 tool（含原全自动草稿创建 #13/#16/#19/#21/#23）均拒绝写入**，仅返回 plan 或可自纠错误；只读 tool 正常使用，不得保留任何全自动写入。
- 降级语义（PRD §4.2）：不通过时所有写操作统一按「只出 plan」运行，不得保留任何全自动写入；否则仍属 L3。
- 兜底性质：E01 只提供 fail-closed 兜底；实际激活形态（L3/L2）由 G01 运行时客户端能力核查结果决定（PRD §1.3）。

### 2.3 后端不可达不自动重试（D01 §4.2 / 总则 §6.10）

- 写操作后端不可达时，server 明确报「后端不可达」（`backend_unavailable`），MUST NOT 由 server 自动重试写操作；错误不得以成功响应伪装。

---

## 3. 失败路径不静默成功（D01 §4.4）

- 人确认档写 tool 未经有效确认（拒绝/取消/客户端不支持）必须 fail-closed：返回可自纠错误且零副作用。
- 失败路径 MUST NOT 静默成功，错误 MUST NOT 以成功响应伪装。
- 幂等命中（`idempotent_replay`）与 confirm/cancel 状态断言命中（`already_in_target_state`）是成功语义，非错误（D01 §4.3）。

---

## 4. 与 A01 / 规范 / PRD 一致性核对（S05/S06）

1. 确认由 server 侧发起、完整参数、拒绝零副作用、客户端不支持 fail-closed、敏感凭据 URL 模式、发起时机 —— 逐项对齐 A01 verification-record §2.3–§2.8 与规范 §9.7。
2. 币种/价格表 fail-closed 条件与 PRD 决议 2 逐字一致（`gjg.default_currency` 空 / selling 价格表数量 ≠ 1 → 拒绝初始化写入）。
3. 客户端不支持确认时写 tool 全量降级 —— 对齐 PRD 决议 1、PRD §4.2、规范 §7.3。
4. 档位归属（全自动/人确认/只出 plan）与 D02 总表、PRD §4.1 逐字一致。
