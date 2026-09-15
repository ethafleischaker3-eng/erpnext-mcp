# B05 Evidence Manifest

> 当前状态：B05 v1.0 已冻结并**已实施**（2026-09-15），下列 `EV-B05-*` 已按冻结自检方法 S01—S11 逐项执行并回填实际值、原始输出位置与状态。公开脱敏证据落盘于 `docs/task-packages/B05/evidence/`；本包不接入 ERPNext 后端、不涉数据库，无敏感后端原始输出需转存验收区。

## 1. 证据映射（实施回填）

| 证据编号 | 对应工作项/自检 | 计划命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-B05-001 | W01、S01 客户端/SDK/传输钉定 | `claude --version`；`claude mcp add` 握手；SDK `package.json` | 客户端 Claude Code 2.1.263、MCP 2025-11-25、stdio；SDK 精确版本钉定 | Claude Code 2.1.263（`claude-code`）、MCP 2025-11-25、stdio；独立 SDK `@modelcontextprotocol/sdk` v1.29.0（bun 全局）；Claude Code 为编译单文件可执行、内置 SDK 版本不可单独读取 | `evidence/S02-handshake.jsonl`；SDK `package.json`（`C:\Users\乐\.bun\install\global\node_modules\@modelcontextprotocol\sdk\package.json`） | 已执行 |
| EV-B05-002 | W02、S02 协议与字段语义 | 读 MCP 协议/SDK 源码 + 真实握手 | 协议版本、协议层 vs 传输层字段区分、JSON-RPC id/_meta/progressToken/会话语义明确 | 协议 2025-11-25；请求形状 `{id,name,arguments,params._meta}`；`id` 单调计数器（每请求新值）；`_meta.progressToken` 仅 onprogress 时 = id；`claudecode/toolUseId` 为客户端特定字段；stdio 无 sessionId/resumptionToken（仅 streamable HTTP 有） | SDK `dist/esm/shared/protocol.js`（v1.29.0）+ `evidence/S02-handshake.jsonl` | 已执行 |
| EV-B05-003 | W03、S03 探针搭建与连接 | 写 server.js/selftest.js/README；`node selftest.js` | 探针可启动、可注入故障、可记录到达、不接入 ERPNext | `node selftest.js` 25 项全 PASS（退出码 0）；覆盖 normal/error/slow/crash 注入 + fingerprint 稳定性；`claude mcp add` 后握手成功（`✔ Connected`） | `evidence/S03-selftest.txt`；`probe/server.js`、`probe/selftest.js` | 已执行 |
| EV-B05-004 | W04、S04 超时行为 | 注入 slow（70s）故障，观察客户端 | 超时后是否重发、是否复用 id、payload 是否一致均有记录 | 70s 慢响应**未触发超时**（客户端完整等待 70s，无 `notifications/cancelled`）；单次 `tools_call`、无重发；Claude Code 覆写 SDK 默认 60s 超时（真实上限未测出） | `evidence/S06-slow-events.log`、`S06-slow-stdout.txt` | 已执行 |
| EV-B05-005 | W05、S05 断线/重连行为 | 注入 crash（进程退出）故障 | 崩溃后是否重连、是否新握手、重发是否可关联均有记录 | 崩溃后仅 1 次 `tools_call`（id=2）；**无透明重发、无自动重连/重握手**；客户端报 `MCP error -32000: Connection closed`，模型仅询问是否重试 | `evidence/S05-crash-events.log`、`S05-crash-stdout.txt` | 已执行 |
| EV-B05-006 | W06、S06 失败/成功路径 | 注入 error 故障 + 基线两次成功调用 | 业务错误后是否自动重试、成功后是否重复调用、三层区分 | 业务错误后**模型自纠重试**：改 payload（`p-err`→`p-ok`）重新发起，新 `id`(3)、新 `toolUseId`（`call_00_P1ii…`）；成功路径无重复调用；三层区分结论见 research §2 | `evidence/S06-error-events.log`、`S06-error-stdout.txt`、`S04-baseline-events.log` | 已执行 |
| EV-B05-007 | W07、S07 关联信号判定矩阵 | 汇总 W04–W06，逐候选信号判定四项 | 矩阵完整、逐项可复核 | 矩阵见 research §3；结论：无「合规可信且跨重试可关联」信号（id/progressToken/toolUseId 均每请求新值；进程身份会话级不区分；stdio 无 sessionId） | `idempotency-research.md` §3 | 已执行 |
| EV-B05-008 | W08、S08 分叉决策 | 依矩阵形成分叉结论并记录依据 | 有信号→冻结；无信号→业务层方案+残余风险 | 走「无信号」分支：confirm/cancel 状态断言兜底；create 组业务引用号（可选）+ 窗口期缩短 + 误合并策略；残余风险记录 | `idempotency-research.md` §4、§6、§9 | 已执行 |
| EV-B05-009 | W09、S09 指纹不可覆盖验证 | selftest 指纹稳定性 + 原则验证 | agent request id/幂等键不参与指纹；同参同指纹、异载异指纹 | 指纹仅业务参数稳定排序；同业务参数（键序不同）同指纹、不同 payload 不同指纹；不含 JSON-RPC id/连接身份；`id`/`progressToken`/`toolUseId` 不进指纹 | `evidence/S03-selftest.txt`；`idempotency-research.md` §5 | 已执行 |
| EV-B05-010 | W10、S10 两类验收方法 | 形成两类终态断言 | 终态可判定、非 agent 自评 | 「同一业务意图连续调用只变更一次」（对象/单据计数=1、流水无重复）+「合法重复业务表达」（计数=2、不被合并）可执行断言 | `idempotency-research.md` §7、§8 | 已执行 |
| EV-B05-011 | W11、S11 调研结论汇总 | 汇总 W01–W10 形成 D05 | 覆盖 §9.2 全部 10 项、结论由接入方确认 | `idempotency-research.md` 覆盖 §9.2 全部 10 项；结论：无透明重试 + 无可信关联信号 → 业务层方案 + 窗口期冻结（create 300s / confirm·cancel 60s） | `idempotency-research.md` | 已执行 |

## 2. 正式证据记录要求

执行者=Claude（B05 独立实施上下文）、时间=2026-09-15（UTC+8）、环境=本机进程（探针 stdio server + 目标客户端 Claude Code 2.1.263 / MCP 2025-11-25 / stdio），不接入 ERPNext、不涉数据库。原始输出（到达日志 `events-*.log`、客户端输出 `*-stdout.txt`、自测 `S03-selftest.txt`、握手 `S02-handshake.jsonl`）落盘于 `evidence/`；含凭据或完整堆栈的内容已 REDACTED，完整堆栈不入公开实施区。

动态实测驱动方法（复用 A01 已建立事实）：`claude mcp add -s user b05-probe -- node <server.js>` 注册探针，`printf '<提示>' | claude -p --allowedTools "mcp__b05-probe__probe_retry_write"` 以 headless 模式驱动目标客户端调用；故障经 `probe/state/fault-mode.txt` 注入（normal/error/slow/crash）；每次运行后读 `probe/state/events.log` 重建「是否重发/是否重连/id 是否复用」事件序列。测试完成后 `claude mcp remove b05-probe` 并清理 `state/`。

## 3. 敏感信息与受控位置

- B05 不接入 ERPNext 后端、不调用其 REST API 或数据库，探针与目标客户端均为本机进程，原始输出不含 ERPNext 凭据；已检查到达日志与客户端输出，无认证头/令牌/完整堆栈（客户端输出的 `-32000 Connection closed` 等为 MCP 错误码，非敏感）；
- 本包无敏感后端原始输出需转存验收区 `D:\second-acceptance\evidence\`；
- 合成对象与标记仅为本机探针副作用（`probe/state/marker.json`、`events.log`、`fault-mode.txt`），测试后已全部清理，无残留；
- 目标客户端 `claudecode/toolUseId` 为合成探针会话产生的客户端内部标识（非凭据），仅作信号判定观测、不进任何幂等实现依据。
