# A01 隔离确认能力探针

> **性质：能力核查用最小探针，NOT 正式业务 tool，NOT 业务 tool 验收依据。**
> 用途：实测目标客户端是否支持 server 侧发起的确认（MCP elicitation）。
> 边界：不接入 ERPNext、不连接任何数据库、不发起任何外部网络调用。
> 副作用：仅写/清本地合成标记 `state/marker.json` 与事件日志 `state/events.log`，不含真实业务数据或凭据。

## 1. 文件

| 文件 | 作用 |
|---|---|
| `server.js` | 探针 MCP server（stdio / newline-delimited JSON-RPC，Node.js 免依赖） |
| `selftest.js` | 探针契约自测（fake-client 驱动，覆盖 decline/accept/URL/不支持 四类路径） |
| `README.md` | 本文（运行说明 + 清理说明） |
| `state/` | 本地合成标记与事件日志（每次运行前后清理） |

## 2. 运行说明

### 2.1 自测（免客户端）

```bash
cd D:\second\docs\task-packages\A01\probe
node selftest.js
```

预期：13 项检查全 PASS，退出码 0。覆盖：
- 正常写 → `elicitation/create` mode=form，消息含 tool 名 + 完整参数 + 拟执行动作；
- decline/cancel → fail-closed（`isError=true`）且不写 `state/marker.json`；
- accept → 写标记；
- sensitive_credential → mode=url（绝不 form）；
- 客户端未声明 elicitation → fail-closed 且不发确认、不写标记。

### 2.2 注册到 Claude Code（实测客户端）

```bash
claude mcp add -s user a01-probe -- node "D:\second\docs\task-packages\A01\probe\server.js"
claude mcp list        # 触发连接/健康检查，探针记录 initialize 握手
```

headless 端到端（允许工具后，server 会发出 elicitation，headless 下客户端回传 cancel → fail-closed）：

```bash
printf '%s' "Call probe_confirm_write with target_object_id='OBJ-X' payload='p'." \
  | claude -p --allowedTools "mcp__a01-probe__probe_confirm_write"
```

交互式人工确认（建议由接入方复核）：在**交互会话**中让 Claude Code 调用 `probe_confirm_write`，观察是否出现确认表单（含完整参数）并可 approve/decline。

## 3. 清理说明

- 标记文件：`rm -f state/marker.json`
- 事件日志：`rm -f state/events.log`
- 取消注册：`claude mcp remove a01-probe`（可选，测试用）

探针运行前后均应清理 `state/`（合成标记与日志），不遗留任何副作用；不涉及 ERPNext 或数据库，无需其他清理。

## 4. 契约要点（task.md §9.1）

- tool 名 `probe_confirm_write`；不使用 `erpnext_*` 前缀、不复用为正式业务 tool。
- annotation：`readOnlyHint=false`、`destructiveHint=true`、`idempotentHint=false`、`openWorldHint=false`（全部显式声明）。
- 确认内容：含 tool 名 + 完整参数 + 拟执行动作。
- 应答：accept → 写标记并成功；decline/cancel → 可自纠错误且不写标记；客户端不支持 → 可自纠错误且不写标记（fail-closed）。
- 敏感凭据：只走 URL 模式，绝不 form；仅占位/合成值。

## 5. 与正式业务 tool 的界限

本探针仅用于 A01 能力核查，其代码与运行结果**不得**被 F 包复用为正式业务 tool 或业务 tool 验收依据（总则 §16.1）。确认能力核查与正式业务 tool 验收是两件事。
