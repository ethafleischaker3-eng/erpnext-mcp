# A01 Evidence Manifest

> 当前状态：A01 v1.0 已进入实施中。下列 `EV-A01-*` 为按冻结自检方法 S01—S10 重新执行后登记的正式证据（实施完成、待独立验收）。原始输出统一落盘于 `docs/task-packages/A01/evidence/`（公开脱敏证据）。

## 1. 证据映射（已执行）

| 证据编号 | 对应工作项/自检 | 实际命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-A01-001 | W01、S01 客户端与传输方式 | `claude --version`；读取探针 initialize 握手 `clientInfo` | 与 PRD 决议 1 一致；精确版本/传输方式钉定 | 客户端 `claude-code` 2.1.263，stdio；一致 | `evidence/W01-client-20260914.txt`、`evidence/W02-protocol-handshake-20260914.jsonl` | 已完成 |
| EV-A01-002 | W02、S02 协议版本与确认语义 | 读取 initialize 握手 `protocolVersion` 与 `capabilities.elicitation` | 版本钉定；握手校验版本后加载逻辑；语义明确 | 协议 2025-11-25；elicitation/create（message/requestedSchema/mode form\|url），应答 action accept/decline/cancel | `evidence/W02-protocol-handshake-20260914.jsonl` | 已完成 |
| EV-A01-003 | W03、S03 探针搭建 | `node selftest.js`（13 项）；`claude mcp add` + `claude mcp list` 健康检查 | 可启动、可连接、不接入 ERPNext | 自测 13/13 PASS；`✔ Connected`；无 ERPNext 调用 | `evidence/W03-selftest-20260914.txt` | 已完成 |
| EV-A01-004 | W04、S04 确认由 server 发起并呈现 | headless 端到端触发 `tools/call`，观察 `elicitation_send` | server 发起并被客户端处理（或明确不支持） | 客户端声明 elicitation 能力并实际处理，回传 `action=cancel`（headless） | `evidence/W04-headless-e2e-20260914.txt`、`evidence/W02-protocol-handshake-20260914.jsonl` | 已完成 |
| EV-A01-005 | W05、S05 完整参数展示 | 捕获 `elicitation_send.message` | 含 tool 名 + 完整参数 + 拟执行动作 | 含 `probe_confirm_write`、target_object_id、payload、拟执行动作 | `evidence/W02-protocol-handshake-20260914.jsonl` | 已完成 |
| EV-A01-006 | W06、S06 拒绝/取消 fail-closed | headless 回传 `action=cancel`；自测回传 `decline` | 可自纠错误；副作用未发生 | `isError=true`；`state/marker.json` 未写 | `evidence/W04-headless-e2e-20260914.txt`、`evidence/W03-selftest-20260914.txt` | 已完成 |
| EV-A01-007 | W07、S07 不支持 fail-closed | 自测以无 elicitation 能力的客户端调用 | 拒绝执行；副作用未发生；无静默执行 | `isError=true`；未发确认、未写标记 | `evidence/W03-selftest-20260914.txt` | 已完成 |
| EV-A01-008 | W08、S08 敏感凭据 form/URL | 自测 `scenario=sensitive_credential` | server 只走 URL 模式（占位/合成值） | `elicitation_send.mode=url`（普通写为 form） | `evidence/W03-selftest-20260914.txt` | 已完成 |
| EV-A01-009 | W09、S09 确认发起时机 | 检查事件日志顺序 | 仅在处理客户端请求期间发出 | `tools_call → elicitation_send`，无凭空发起 | `evidence/W02-protocol-handshake-20260914.jsonl` | 已完成 |
| EV-A01-010 | W10、S10 验证记录与结论 | 汇总形成验证记录并给出 L3/L2 结论 | 覆盖 §9.2 十项；结论明确；接入方确认 | 覆盖十项；结论 L3 成立；接入方确认待签署 | `evidence/W10-verification-record-20260914.txt`（正文见 `verification-record.md`） | 已完成（待接入方签署） |

## 2. 正式证据记录要求（已逐条满足）

每条证据的执行者、时间、环境、命令、退出码、预期/实际值、原始输出位置、SHA-256 与脱敏说明汇总如下：

| 证据编号 | 执行者 | 时间（UTC） | 环境 | 退出码 | 原始输出 SHA-256 | 脱敏说明 |
|---|---|---|---|---|---|---|
| EV-A01-001 | Claude（A01 实施上下文，账户 b00-impl） | 2026-09-14 | Windows 11 / Git Bash；Claude Code 2.1.263；Node v24.19.0 | 0 | `b223e2a39cb8534c8a0923ee0ec5050b0ed073905f830f89ef5b84a754e98185` | 无凭据，仅版本字符串 |
| EV-A01-002 | 同上 | 2026-09-14 | 同上 | 0 | `78030cb919ce4b070c780072fcaf3d6014932c1f40acc9af058dd0aa31f18654` | 握手元数据，无凭据 |
| EV-A01-003 | 同上 | 2026-09-14 | 同上 | 0 | `4501528290aeadf613a35fdd86537ec5eeee63b5f89c3fa8b51cf55c0002f91a` | 自测日志，合成值 |
| EV-A01-004 | 同上 | 2026-09-14 | 同上 | 0 | `384395d7e24ccbc887462bdbf8f6a749c5869e458605be622df8dfd735214feb` | headless 输出，合成值 |
| EV-A01-005 | 同上 | 2026-09-14 | 同上 | 0 | 同 EV-A01-002 | 合成参数 |
| EV-A01-006 | 同上 | 2026-09-14 | 同上 | 0 | 同 EV-A01-004 / EV-A01-003 | 合成值 |
| EV-A01-007 | 同上 | 2026-09-14 | 同上 | 0 | 同 EV-A01-003 | 合成值 |
| EV-A01-008 | 同上 | 2026-09-14 | 同上 | 0 | 同 EV-A01-003 | 占位 URL（probe.example.invalid） |
| EV-A01-009 | 同上 | 2026-09-14 | 同上 | 0 | 同 EV-A01-002 | 事件顺序，无敏感数据 |
| EV-A01-010 | 同上 | 2026-09-14 | 同上 | 0 | 见 `verification-record.md` 哈希（接入方签署时锚定） | 公开脱敏结论 |

> 探针交付物哈希：`probe/server.js` = `3e2b7852d3f4d76a169e22b00d929b842fff0492b0d6cf6d0781d0e7ce1ae763`；`probe/selftest.js` = `1a3507520984f11b330b6121d2f0e9ec4f5d2e72447f04c659be2b43a009e993`。

## 3. 敏感信息与受控位置

- A01 为客户端能力核查，不涉 ERPNext 后端凭据、数据库或真实业务数据；证据统一为公开脱敏证据，位于 `docs/task-packages/A01/evidence/`。
- 探针副作用仅为本地合成标记 `docs/task-packages/A01/probe/state/`（`marker.json` 在测试后未残留；`events.log` 为事件诊断日志），不含真实业务数据或凭据。
- 敏感凭据核查仅用占位/合成值（`synthetic-secret-placeholder`、`probe.example.invalid`），未记录或输出任何真实凭据值、完整认证头。
