# E02 实现契约（implementation-contract）

> **文档性质**：E02 交付物 CD-5，《实现契约》正文。它是「写操作安全底座」机制实现的契约化描述，供 D02 冻结各 tool 契约与 F 包接入时**引用**，不得另起口径。
> **版本**：v1.0（E02 实施产出，待 gjg 独立验收）。
> **抽象层级**：本契约只冻结「实现层挂钩/接口（怎么做）」，不冻结「契约口径（做什么）」——后者是 D01 公共契约（`docs/task-packages/D01/common-contract.md`）的职责（E02 task §9.1 内容边界：重叠项以 D01 为准）。
> **上游依据**：B05 §18.3（幂等边界权威结论）与 `idempotency-research.md` §4/§6/§7/§8；B00 §18.3 第 1 条（可信调用方身份事实）；《开源后端 Agent 化接入规范》§9.3/§9.4/§9.5/§9.6（下文「规范 §x」）；《ERPNext-MCP 改造 PRD》§5.1–§5.4（下文「PRD §x」）；D01 `common-contract.md` §4/§5/§6（下文「D01 §x」，共同对齐参考）。
> **约束性等级**：MUST / MUST NOT / SHOULD / SHOULD NOT / MAY 沿用规范 §0.1 口径。

---

## 0. 性质与边界

1. 本契约描述 E02 实现的**机制底座**（server 侧模块/函数，位于 `docs/task-packages/E02/lib/`），以及各接口的**接入点（hook）、入参/出参形状、错误分类**。
2. 本契约 MUST NOT 写死任何单个业务 tool 的 name/description/input schema/annotation/前置断言/幂等参数范围；举例与事实引用（如对象类型、动作后缀）仅用于可复核性，不构成对业务 tool 契约的冻结。
3. 本契约不接入 ERPNext 后端、不改变任何数据库状态、不冻结任何业务 tool；机制验证以隔离探针 + 单元测试（`docs/task-packages/E02/test/selftest.js`）构成可复算断言。
4. 本契约与 D01 公共契约重叠项（前置/事后两层拆分、批次台账公共口径、`erpnext_batch_status_get` 可见性边界）**以 D01 已冻结口径为准**，本契约不反向改写。

---

## 1. 幂等机制接口（§9.1 第 1 项）

**对应实现**：`lib/fingerprint.js`、`lib/idempotency.js`。**对齐**：B05 §18.3 第 2/3/4 条、D01 §5、规范 §9.3、PRD §5.1。

### 1.1 指纹函数口径

| 项 | 冻结口径 |
|---|---|
| 计算方 | MUST 由 server 依业务参数规范化计算，agent 完全不感知 |
| 归一化 | 对象键稳定排序 + 确定性序列化；**数组（行项目）保持原顺序**（行项目顺序有业务含义，不排序） |
| 传输/客户端字段 | MUST NOT 进指纹：`id`/`progressToken`/`claudecode/toolUseId` 及 agent 随机 request id/幂等键一律剥离（顶层剥离 `_meta`/`claudecode` 容器及上述字段名） |
| 同参同指纹 | 相同业务参数（键序不同）→ 同指纹 |
| 异载异指纹 | 不同有效负载 → 不同指纹 |

- 接入点：`fingerprintOf(businessParams) -> { fingerprint: sha256-hex, canonical: string }`。
- 业务引用号（可选增强，B05 §4 第 1 条）：**是否进指纹由 D02 冻结**。E02 只提供「把业务引用号作为普通业务参数传入即可随其他参数一同进指纹」的机制；E02 不决定其进/不进指纹。同引用号=同意图、不同引用号=合法重复的语义由 D02 依 PRD §5.1 逐 tool 冻结。

### 1.2 窗口期常量与放宽禁令

| 组 | 冻结窗口期 | 来源 |
|---|---|---|
| create 组 | **300 秒（5 分钟）** | B05 §18.3 第 3 条 |
| confirm/cancel 组 | **60 秒** | B05 §18.3 第 3 条 |

- 实现 MUST NOT 放宽（`assertWindowNotWidened` 对任何超过冻结值的请求窗口直接拒绝）；缩短须走变更控制（总则 §12）。
- 接入点：`createIdempotencyStore({ now })` 返回 `{ check(group, businessParams), record(group, businessParams, firstResult) }`；`now` 为可注入时钟（供测试窗口期边界，无需真实等待）。

### 1.3 命中合并返回口径

- 窗口期内同指纹命中 → 返回**首次结果** + `idempotent_replay: true` + 说明「重复请求已按幂等合并」（`errors.idempotentReplay`，对齐 D01 §4.3）。
- 窗口期外同指纹 → 不命中（`expired: true`），清理旧记录，允许作为新请求重新执行。

---

## 2. confirm/cancel 状态断言接口（§9.1 第 2 项）

**对应实现**：`lib/idempotency.js` 的 `checkStateAssertion`、`lib/errors.js` 的 `idempotentAlreadyInTargetState`。**对齐**：B05 §18.3 第 5 条、§18.4 第 2 条、`idempotency-research.md` §7.2、D01 §4.3。

1. **状态断言命中 = 幂等成功**：`currentState === targetState` 时，返回幂等成功语义（「目标单据已在目标状态，本次视为重复请求已合并」），MUST NOT 返回通用前置断言错误（否则 agent 会把幂等命中误判为失败并反复自纠）。
   - confirm 组：合法前态 draft，目标态 submitted；再次 confirm 已生效单据 → 命中幂等成功。
   - cancel 组：合法前态 submitted，目标态 cancelled；再次 cancel 已取消单据 → 命中幂等成功。
2. **状态断言未命中**（如 confirm 对已取消单据）：不是幂等命中，交由前置断言框架（§3）返回 `precondition_failed`。
3. **具体返回结构由 D02 冻结**（B05 §18.4 第 2 条、D01 §4.3）。E02 提供参考形状 `{ isError: false, idempotent_replay: true, already_in_target_state: true, message }`，仅冻结其**可验收性**：第二次调用必须返回幂等成功语义而非失败错误。
4. confirm/cancel 组无合法重复业务（同一单据不可合法二次 confirm/cancel）；窗口期仅用于并发/在途重复提交的去重（B05 §4 第 1 条）。

---

## 3. 前置断言框架接口（§9.1 第 3 项）

**对应实现**：`lib/precondition.js`。**对齐**：规范 §9.4、PRD §5.2、D01 §6.1。

1. **两层拆分**（规范 §9.4）：
   | 层 | 内容 | 是否协议已覆盖 |
   |---|---|---|
   | schema 层 | 参数格式是否合法 | 已覆盖（协议要求 server 校验参数并以业务错误返回） |
   | 业务状态层 | 当前状态是否允许此操作 | 未覆盖（本框架所指的前置断言） |
2. **硬约束**：完成 schema 校验不构成满足前置断言要求。schema 校验的通过不代表业务前置断言满足。
3. 接入点：`assertPreconditions(assertions, ctx)`，其中每条 `assertion(ctx) -> { ok:true } | { ok:false, message, retryable?, details? }`。
   - 首个失败即返回 `precondition_failed` 错误，`message` MUST 含**当前状态 + 建议动作**（D01 §4.2）。
4. 具体逐 tool 的业务状态断言（如「同名对象不存在」「来源单据已生效」「目标仍为草稿」）由 D02 依 PRD §5.2 冻结，本框架只提供挂钩与失败返回口径，不实现任何逐 tool 断言。

---

## 4. 事后校验框架接口（§9.1 第 4 项）

**对应实现**：`lib/postcondition.js`。**对齐**：规范 §9.5、PRD §5.3、D01 §6.2。

1. **两层拆分**（规范 §9.5）：
   | 层 | 内容 | 是否协议已覆盖 |
   |---|---|---|
   | 返回值形状 | 返回结构是否符合声明的契约 | 已覆盖 |
   | 写入是否落库 | 数据是否真的变成期望终态 | 未覆盖（本框架所指的事后校验） |
2. **硬约束**：返回值符合 schema 不代表写入成功。
3. 接入点：`checkReadBack(actual, expected) -> { ok:true } | { ok:false, markRollback:true, error: postcondition_failed }`。
   - 编排顺序（PRD §5.3）：写操作执行成功 → 回读目标对象 → 断言期望终态；回读不一致 → 报错（`postcondition_failed`）+ 记入批次台账 + 标记待回滚（`batchLedger.markRollbackPending`）。
4. 具体逐 tool 的回读字段与期望终态（单据状态、行项目数量与价格、价格生效区间等）由 D02 依 PRD §5.3 冻结，本框架只提供回读编排与不一致处理口径。

---

## 5. 批次台账接口（§9.1 第 5 项）

**对应实现**：`lib/batch-ledger.js`、`lib/identity.js`。**对齐**：PRD §5.4、D01 §6.4、规范 §9.6。

1. **批次粒度**：一次 `tools/call` 一个批次，server 生成批次标识（`batch-<time>-<seq>-<rand>`）；单次调用产生的全部变更同批。
2. **台账独立留存**：server 独立留存（`batch-ledger.js` 为内存参考实现；持久化存储为接入适配器钩子，E02 不接后端、不落库），不依赖后端。
3. **回滚路径**（`rollbackPathFor`）：草稿 → 删除；已生效 → 后端原生取消；已取消 → 终态不可回滚（`terminal`，如实标注）。未知状态不猜测，返回 `null`，调用方须升级。
4. **批次依赖顺序**：跨批次按单据上下游倒序回滚（先下游后上游），台账记录批次间依赖（`addDependency`；聚合回滚为二期，PRD §5.4）。
5. **批次 Owner 持久化与查询授权（依 B00 §18.3 身份结论）**：
   - 事实（B00 §18.3 第 1 条 + B05 §3）：所有调用方共用 ERPNext Administrator 服务账号，主体区分在后端由 Role/DocPerm 承担；stdio 下无跨会话稳定身份信号。
   - 确定性结论（非推测）：MCP server 侧无每调用方可信身份，批次归属只能到**会话**粒度（server 生成的会话 ID，`identity.createSessionIdentityProvider().sessionId`）。
   - 授权：普通调用方只查归属自身会话的批次；管理员（后端 Role/DocPerm 判定，`identity.resolveCaller` 的 `adminResolver` 钩子）可查全量。管理员判定 MUST 由 server 侧可信获取，不得由 agent 自报（B00「非 agent 自报」）。
   - **残余限制（如实记录，不得宣称未成立的能力）**：普通调用方跨会话「查询自身旧批次」不可确定性证明（会话 ID 非跨会话稳定），本契约明确**不支持**；若后续 B00 验收区 D08 详细身份证据补充进公开实施区，可通过升级 `identity` 钩子在不改批次台账核心的前提下支持，须走变更控制。

---

## 6. #26 状态查询语义（§9.1 第 6 项）

**对应实现**：`lib/batch-status.js`。**对齐**：PRD §3.3 #26、§5.4、D01 §6.4。

1. **只读可见性边界**（`queryBatchStatus(batchLedger, caller, batchId)`）：
   - 归属自身可信调用方身份（会话级）的批次可查；
   - 他人批次不可见（返回 `permission_denied`，不泄露他人批次参数/涉及单据/回滚信息）；
   - 管理员（后端 Role/DocPerm 判定）可查全量；
   - 不可主动回滚（本查询为只读，无任何回滚动作、无 rollback 入口）。
2. **返回内容**：批次标识、状态、创建时间、涉及对象（objectType/objectName/action/beforeState/afterState/rollbackPath）、回滚结果（rollbackEntries、rollbackReason）、批次依赖。
3. **契约边界**：`erpnext_batch_status_get`（#26）的 name/schema/annotation 由 D02 冻结；本契约只冻结其**查询语义与实现逻辑**（E02 task §9.1 第 6 项）。

---

## 7. 机制的可接入性声明（§9.1 第 7 项）

下表汇总各接口的接入点、入参/出参形状、错误分类，供 D02 契约与 F 包实现引用。本契约 MUST NOT 写死任何单个业务 tool 的 name/schema/断言。

| 接口 | 接入点 | 入参 | 出参 | 错误分类 |
|---|---|---|---|---|
| 幂等指纹 | `fingerprintOf` | 业务参数对象 | `{ fingerprint, canonical }` | —（纯函数） |
| 幂等窗口/合并 | `createIdempotencyStore().check/record` | 组（create/confirm/cancel）、业务参数、首次结果 | `{ hit, fingerprint, firstResult?, merged?, expired? }` | 窗口期放宽 → 抛错（拒绝） |
| confirm/cancel 状态断言 | `checkStateAssertion` | `{ currentState, targetState }` | `{ hit, idempotent?, alreadyInTargetState?, message }` | 未命中 → 交前置断言 `precondition_failed` |
| 前置断言 | `assertPreconditions` | 断言数组、ctx | `{ ok } | { ok:false, error }` | `precondition_failed`（含当前状态 + 建议动作） |
| 事后校验 | `checkReadBack` | 回读终态、期望终态 | `{ ok } | { ok:false, markRollback, error }` | `postcondition_failed`（标记待回滚） |
| 批次台账 | `createBatchLedger` 全家 | 批次元数据、变更记录 | 批次记录/路径/状态 | 未知批次 → 抛错（调用方须升级） |
| 身份 | `createSessionIdentityProvider().resolveCaller` | 传输上下文、adminResolver 钩子 | `{ callerId, isAdmin }` | — |
| #26 查询 | `queryBatchStatus` | 台账、caller、batchId | `{ ok, result } | { ok:false, error }` | `batch_not_found` / `permission_denied` |

**错误分类总原则**（对齐 D01 §4）：`isError:true` + 稳定语义化 `code` + 可自纠 `message` + `retryable` + 可选 `details`；不裸抛堆栈、不裸抛后端原生异常名；失败路径不静默成功。

---

## 8. 符合性声明与残余风险

1. **误合并残余风险（create 组）**：窗口期（300s）内「同参数合法重复」会被误合并；无业务引用号的对象无法彻底消除此风险（B05 §9 第 1 条）。E02 如实记录，缓解手段为窗口期缩短 + 业务引用号（D02 择定）+ #26 批次状态查询暴露（agent 可查「是否已建过这笔」）。
2. **会话级归属限制**：批次归属只能到会话粒度；普通调用方跨会话查询旧批次不支持（见 §5.5、§6）。
3. **管理员判定为 hook**：管理员判定须由后端 Role/DocPerm 提供（E02 不接后端，缺省 `isAdmin=false`）；F 包接入时提供 `adminResolver`，未提供前不宣称管理员查询能力成立。
4. **机制验证不接后端**：本契约机制经隔离探针 + 单元测试验证（`test/selftest.js`），不含 ERPNext 真实业务状态；与真实后端的适配由 F 包接入时验证。
5. **不绑定传输层字段**：机制不以 `id`/`progressToken`/`claudecode/toolUseId` 等传输/客户端字段作幂等或批次归属依据（规范 §9.3、B05 §18.3 第 2 条）。

---

## 9. 权威输入 → 本契约条款对照（可复核索引）

| 权威输入 | 条款/事实 | 本契约落点 |
|---|---|---|
| 规范 §9.3 | 幂等键 server 生成、agent 不感知、不绑定传输字段 | §1 |
| 规范 §9.4 | 前置断言两层拆分、schema 校验不计入 | §3 |
| 规范 §9.5 | 事后校验两层拆分、返回值符合 schema 不代表写入成功 | §4 |
| 规范 §9.6 | 窄接口、可回滚批次 | §5 |
| PRD §5.1 | 幂等指纹参数范围、窗口期口径、confirm/cancel 状态断言兜底 | §1、§2 |
| PRD §5.2 | 前置断言业务状态（逐 tool） | §3 |
| PRD §5.3 | 事后校验口径 | §4 |
| PRD §5.4 | 回滚批次粒度、台账独立留存、回滚路径、可见性边界 | §5、§6 |
| PRD §3.3 #26 | `erpnext_batch_status_get` 查询语义 | §6 |
| B05 §18.3 第 1–5 条 | 无透明重试、无可信关联信号、窗口期 300s/60s、指纹不可覆盖、两类验收方法 | §1、§2 |
| B05 idempotency-research §4/§6/§7/§8 | 分叉决策、窗口期冻结值、两类验收方法、合法重复表达 | §1、§2 |
| B00 §18.3 第 1 条 | 可信调用方身份事实（共用 Administrator、Role/DocPerm 区分主体） | §5、§6 |
| D01 §4/§5/§6 | 公共错误模型、幂等边界契约、前置/事后/批次公共口径 | 全文（重叠项以 D01 为准） |
