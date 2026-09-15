# B05 隔离重试/关联探针

> **性质：能力调研用最小探针，NOT 正式业务 tool，NOT 业务 tool 验收依据。**
> 用途：实测目标客户端、MCP SDK 与传输方式对 `tools/call` 的自动重试与请求关联行为。
> 边界：不接入 ERPNext、不连接任何数据库、不发起任何外部网络调用。
> 副作用：仅写/清本地合成标记 `state/marker.json` 与事件日志 `state/events.log`，不含真实业务数据或凭据。

## 1. 文件

| 文件 | 作用 |
|---|---|
| `server.js` | 探针 MCP server（stdio / newline-delimited JSON-RPC，Node.js 免依赖） |
| `selftest.js` | 探针契约与故障注入自测（fake-client 驱动） |
| `README.md` | 本文（运行说明 + 清理说明） |
| `state/` | 本地合成标记、事件日志与故障模式文件（每次运行前后清理） |

## 2. 运行说明

### 2.1 自测（免客户端）

```bash
cd D:\second\docs\task-packages\B05\probe
node selftest.js
```

预期：全部 PASS，退出码 0。覆盖 normal/error/slow/crash 四类故障注入 + fingerprint 稳定性。

### 2.2 注册到 Claude Code（实测客户端）

```bash
claude mcp add -s user b05-probe -- node "D:\second\docs\task-packages\B05\probe\server.js"
claude mcp list        # 触发连接/健康检查，探针记录 initialize 握手
```

设定故障模式（在每次 headless 运行前写入 `state/fault-mode.txt`：`normal`/`error`/`slow`/`crash`），然后：

```bash
printf '%s' "Call probe_retry_write with target_object_id='OBJ-X' payload='p'." \
  | claude -p --allowedTools "mcp__b05-probe__probe_retry_write"
```

每次运行后读取 `state/events.log`，按 `event`（`server_start`/`initialize`/`tools_call`/`fault_*`/`rx_notification`）与 `pid`/`connEpoch` 重建「是否重发、是否重连、id 是否复用」的事件序列。

## 3. 清理说明

- 标记文件：`rm -f state/marker.json`
- 事件日志：`rm -f state/events.log`
- 故障模式：`rm -f state/fault-mode.txt`
- 取消注册：`claude mcp remove b05-probe`（可选，测试用）

探针运行前后均应清理 `state/`（合成标记与日志），不遗留任何副作用；不涉及 ERPNext 或数据库，无需其他清理。

## 4. 契约要点（task.md §9.1）

- tool 名 `probe_retry_write`；不使用 `erpnext_*` 前缀、不复用为正式业务 tool。
- annotation：`readOnlyHint=false`、`destructiveHint=true`、`idempotentHint=false`、`openWorldHint=false`（全部显式声明）。
- 故障注入：读 `state/fault-mode.txt`，`error`/`crash` 一 shot（执行后重置 `normal`），`slow` 用 `delay_ms`（默认 70000ms）。
- 到达观测：每次 `tools/call` 先落盘（时间戳、JSON-RPC `id`、payload 规范化指纹、`pid`/`connEpoch`、故障模式）。
- fingerprint：仅业务参数稳定排序后序列化，JSON-RPC `id`/连接身份/agent 自报 request_id 均不参与。

## 5. 与正式业务 tool 的界限

本探针仅用于 B05 重试/关联调研，其代码与运行结果**不得**被 E/F 包复用为正式业务 tool 或业务 tool 验收依据（总则 §16.1）。重试/关联调研与正式业务 tool 验收是两件事。
