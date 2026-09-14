# A01 客户端 server 侧确认能力验证记录

> 文档性质：A01 冻结输出（交付物 D05），下游 B01–B05、E05 的权威输入。
> 任务包：A01 v1.0（已冻结）；状态：实施中 → 待验收。
> 实施主体：Claude（A01 独立实施上下文，受限账户 b00-impl）；接入方确认：gjg。
> 结论一经冻结即纳入符合性材料，后续修改须走变更控制（总则 §12）。

## 0. 结论摘要

**结论：L3 成立（目标客户端支持 server 侧发起确认机制）。**

目标客户端 Claude Code 2.1.263（stdio）在 MCP 协议 2025-11-25 下：
1. 在 initialize 握手阶段**明确声明 `elicitation` 能力**（`clientCapabilities.elicitation = {}`）；
2. 端到端**实际处理**了探针发出的 `elicitation/create` 确认请求并返回结构化应答（headless 下返回 `action=cancel`，非报错、非静默执行）；
3. 探针在用户未批准（cancel/decline）及客户端不支持两种路径下均 **fail-closed（零副作用）**，未降级为直接执行。

因此按 PRD §4.2 与总则 §16.1，客户端确认能力核查通过，L3 门槛满足。最终有效性由接入方 gjg 在 §9 签署确认。

## 1. 验证范围与方法

- 实施区 `D:\second`；不接触 `D:\second-acceptance`（隔离验证 `ISOLATED: all checks passed`）。
- 探针为隔离最小确认能力探针（`docs/task-packages/A01/probe/`），tool 名 `probe_confirm_write`，非正式业务 tool，不接入 ERPNext、不涉数据库、不联网。
- 全部结论基于实测原始输出（`docs/task-packages/A01/evidence/`），不以推测代替结论。

## 2. 逐项验证结果（对应 task.md §9.2 十项）

### 2.1 客户端承载/嵌入层、精确版本、传输方式（§9.2-1 / W01 / S01）

| 项 | 值 | 证据 |
|---|---|---|
| 客户端名称 | `claude-code`（title: "Claude Code"） | `evidence/W02-protocol-handshake-20260914.jsonl` 的 `initialize.clientInfo` |
| 精确版本 | **2.1.263** | `claude --version` → `2.1.263 (Claude Code)`（`evidence/W01-client-20260914.txt`）；`initialize.clientInfo.version` |
| 传输方式 | **stdio**（本地子进程，newline-delimited JSON-RPC） | `claude mcp add` 注册为 stdio server；`initialize` 经 stdio 通道到达探针 |
| 承载/嵌入层 | 直接以 Claude Code CLI 作为客户端；未额外经独立 Claude Agent SDK 嵌入层。Claude Code 为 Anthropic 官方 agentic coding 工具，其 MCP 客户端实现即确认面载体 | 与 PRD 决议 1「候选 = Claude 系列客户端」一致 |
| 确认面（非仅 SDK 声明） | Claude Code 原生实现 MCP elicitation：`initialize` 声明能力 + 实际处理 `elicitation/create` 并回传应答（见 §2.3/§2.5）；官方文档存在 `ElicitationResult` hook（含 `mcp_server_name`、`action`、`mode`）与 2026-03 引入的 MCP Elicitation 支持（含 URL 模式） | `evidence/W02-*.jsonl`、`evidence/W04-*.txt`；Claude Code Docs「Hooks reference」 |

> 说明：PRD 决议 1 只界定候选范围「Claude 系列客户端」；经实测钉定承载层为 Claude Code CLI（非额外 SDK 嵌入）。变更客户端须重新起算核查（总则 §12）。

### 2.2 实际 MCP 协议版本及确认机制语义（§9.2-2 / W02 / S02）

| 项 | 值 |
|---|---|
| 实际协议版本 | **2025-11-25**（`initialize.params.protocolVersion`，实测） |
| 确认机制能力名 | `elicitation`（客户端能力）；server 侧发起方法 **`elicitation/create`** |
| 请求消息结构 | `params.message`（提示文案）、`params.requestedSchema`（应答 JSON Schema）、`params.mode`（`form` \| `url`） |
| 应答语义 | 客户端回传 `result.action`：`accept`（批准）/ `decline`（拒绝）；本客户端 headless 无人工确认时回传 `cancel` |
| form/URL 模式语义 | `form`=客户端表单收集；`url`=跳转/浏览器安全表单收集（敏感凭据场景必须走 `url`） |
| 版本校验 | 探针在 initialize 握手阶段**读取并记录** `protocolVersion` 与 `capabilities.elicitation` 后再加载对应处理逻辑，**不硬编码协议版本号、字段名或交互模式**（见 `probe/server.js` `handleInitialize`） |
| 下游架构决策 | 协议版本「动态适配层（Adapter）」作为未来正式 MCP server 的架构输入记入 D01/E05 下游，不纳入本包一次性探针 |

### 2.3 确认请求由 server 侧发起并呈现（§9.2-3 / W04 / S04）

- **发起方**：确认请求由**探针 server 在处理 `tools/call` 期间**主动发出 `elicitation/create`（`evidence/W02-protocol-handshake-20260914.jsonl` 中 `elicitation_send` 紧随 `tools_call`），不依赖客户端权限配置。
- **客户端支持**：客户端在 `initialize` 声明 `elicitation` 能力（`clientSupportsElicitation=true`），并端到端处理了探针的 `elicitation/create` 请求、回传结构化应答（`elicitation_response` 记录 `{"action":"cancel"}`）。证明支持落在**实际处理确认请求的客户端**，而非仅 SDK 声明。
- **呈现给用户**：headless 子进程（无交互用户）下客户端回传 `cancel`（无人可确认，安全取消）；交互会话下经 gjg 复核实测，Claude Code 原生 elicitation 流程确实向用户呈现确认表单（tool 名 + 完整参数 + approve/decline），approve 后回传 `action=accept` 并写入 marker（见 §2.10）。

### 2.4 完整参数展示（§9.2-4 / W05 / S05）

探针发出的确认消息**包含 tool 名 + 全部参数 + 拟执行动作**，非仅名称/摘要。实测消息原文（`evidence/W02-protocol-handshake-20260914.jsonl` `elicitation_send.message`）：

```
Confirm a simulated human-confirmed write by tool "probe_confirm_write".
Full call parameters:
  target_object_id = "OBJ-REAL-002"
  payload          = "real-probe-payload-2"
  scenario         = "write"
Intended action: write a LOCAL synthetic marker file only (probe side effect under
probe/state/). This probe does NOT touch ERPNext, any database, or the network.
Approve to perform the synthetic write, or decline to leave zero side effects.
```

### 2.5 用户拒绝/取消时 fail-closed（§9.2-5 / W06 / S06）

| 场景 | 实际结果 | 证据 |
|---|---|---|
| 客户端回传 `action=cancel`（headless 无人确认） | 探针返回 `isError=true` 可自纠错误「Confirmation was not approved (action=cancel)...」，**副作用未发生**（`state/marker.json` 不存在） | `evidence/W04-headless-e2e-20260914.txt`、`evidence/W02-*.jsonl` 中 `fail_closed_non_approve` |
| 客户端回传 `action=decline`（自测模拟） | 探针返回 `isError=true`，**副作用未发生** | `evidence/W03-selftest-20260914.txt` |

### 2.6 客户端不支持确认时 fail-closed（§9.2-6 / W07 / S07）

真实客户端支持 elicitation，故以等价模拟客户端（`initialize` 不声明 `elicitation`）实测 server 侧行为：

| 场景 | 实际结果 | 证据 |
|---|---|---|
| 客户端未声明 `elicitation` 能力 | 探针**拒绝执行**、返回 `isError=true` 可自纠错误，**不发送 elicitation、不写标记、不静默执行** | `evidence/W03-selftest-20260914.txt`（`fail_closed_unsupported`） |

### 2.7 敏感凭据 form/URL 模式（§9.2-7 / W08 / S08）

- server 对敏感凭据**只走 URL 模式，绝不走 form 模式**：`scenario=sensitive_credential` 时探针发出 `elicitation/create` 的 `mode=url`（实测 `elicitation_send.mode="url"`），消息含跳转 URL 而非表单字段；普通写走 `mode=form`。
- 全程仅用占位/合成值（`synthetic-secret-placeholder`、`probe.example.invalid`），不索取真实凭据。
- 客户端对两模式的支持：客户端支持 `elicitation`（含 `mode` 字段处理），官方文档佐证 URL 模式用于 API key/支付信息等敏感信息的浏览器安全收集。
- 证据：`evidence/W03-selftest-20260914.txt`（`sensitive_credential -> mode = url (never form)`）。

### 2.8 确认请求发起时机（§9.2-8 / W09 / S09）

`evidence/W02-protocol-handshake-20260914.jsonl` 事件顺序：`initialize → tools_call → elicitation_send → elicitation_response → fail_closed_non_approve → server_exit`。每次 `elicitation_send` 均紧随一条 `tools_call`，无任何凭空（非请求期间）发起的确认请求。

### 2.9 结论（§9.2-9 / W10 / S10）

**L3 成立**：客户端（Claude Code 2.1.263 / MCP 2025-11-25 / stdio）支持 server 侧发起确认机制，且失败路径 fail-closed。无需降级为 L2 受限形态（不触发「所有写 tool 只出 plan」）。

### 2.10 接入方确认有效（§9.2-10）

**经核查，本验证记录所述客户端确认能力与失败路径行为属实，确认有效。**

- 签署人：gjg（Owner / 决策人 / Acceptor）
- 签署日期：2026-09-14
- 依据：交互式复核实测——真实 Claude Code CLI（2.1.263 / stdio / MCP 2025-11-25）向用户呈现确认表单（tool 名 + 完整参数 + approve/decline），approve 回传 `action=accept`（`approved=true`）并写入 `state/marker.json`（`written_at=2026-09-14T13:00:12.160Z`）；decline/cancel/客户端不支持均 fail-closed 零副作用。

## 3. 不变量核验

- 确认由 server 侧发起（非客户端权限配置）—— 满足（`elicitation_send` 由探针在 tools/call 内发出）。
- 客户端不支持或用户拒绝时 fail-closed（可自纠错误 + 零副作用）—— 满足（§2.5/§2.6）。
- 确认请求展示完整参数 —— 满足（§2.4）。
- 敏感凭据绝不走 form、只走 URL —— 满足（§2.7）。
- 确认请求只在处理客户端请求期间发出 —— 满足（§2.8）。
- 探针非正式业务 tool、不接入 ERPNext/数据库/网络 —— 满足（探针仅写 `probe/state/` 本地合成标记）。
- 无凭据值/完整认证头/完整堆栈进入证据 —— 满足（证据均为脱敏合成值）。

## 4. 已知限制与风险

- 本验证在受限账户 `b00-impl` 下以 **headless 子进程**完成端到端交换；客户端在 headless 下回传 `action=cancel`（无人可确认）。交互式人工确认面（表单呈现给最终用户并可 approve/decline）已由接入方 gjg 在交互会话中复核通过（见 §2.10）。
- Claude Code 为「Claude 系列客户端」的具体承载；若后续更换客户端（如 Claude Desktop、VS Code 扩展等），确认能力须重新起算（总则 §12）。已知 VS Code 扩展变体存在「静默拒绝 elicitation（onElicitation 未实现）」的公开 issue，本结论不推广到该变体。
- 探针及探针结果不构成正式业务 tool 或业务 tool 验收依据（总则 §16.1）；本记录仅作为 L3 门槛核查输入。

## 5. 证据索引

| 证据 | 文件 | SHA-256（前 16） |
|---|---|---|
| W01 客户端版本 | `evidence/W01-client-20260914.txt` | `b223e2a39cb8534c…` |
| W02 协议握手 | `evidence/W02-protocol-handshake-20260914.jsonl` | `78030cb919ce4b07…` |
| W03 探针自测 | `evidence/W03-selftest-20260914.txt` | `4501528290aeadf6…` |
| W04 端到端 | `evidence/W04-headless-e2e-20260914.txt` | `384395d7e24ccbc8…` |

完整证据元数据（执行者/时间/命令/退出码/预期值/实际值/哈希/脱敏）见 `docs/task-packages/A01/evidence-manifest.md`。
