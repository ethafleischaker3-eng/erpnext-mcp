# E02 隔离探针

> **性质：机制底座的可运行探针，NOT 正式业务 tool，NOT 业务 tool 验收依据。**
> 用途：证明幂等 / 前置断言 / 事后校验 / 批次台账机制可作为一个 stdio MCP server 进程运行，并支持注入合成状态/故障。
> 边界：不接入 ERPNext、不连接任何数据库、不发起任何外部网络调用；不含凭据。
> 副作用：仅写/清本地合成状态 `state/marker.json` 与事件日志 `state/events.log`。

## 1. 文件

| 文件 | 作用 |
|---|---|
| `server.js` | 探针 MCP server（stdio / newline-delimited JSON-RPC，Node.js 免依赖） |
| `selftest.js` | 探针可运行性自测（fake-client 驱动） |
| `README.md` | 本文（运行说明 + 清理说明） |
| `state/` | 本地合成状态、事件日志与故障模式文件（每次运行前后清理） |

探针 tool（非业务 tool，四布尔 annotation 显式声明）：

| tool | 作用 |
|---|---|
| `e02_fingerprint_probe` | 计算业务参数的服务端幂等指纹（传输/客户端字段不进指纹） |
| `e02_idempotency_probe` | 记录/检查 create/confirm/cancel 组窗口期命中（合并/未命中） |
| `e02_batch_status_probe` | 查询会话内批次台账状态（只读、无回滚） |

## 2. 运行说明

### 2.1 探针自测（免客户端）

```bash
cd D:\second\docs\task-packages\E02\probe
node selftest.js
```

预期：全部 PASS，退出码 0。覆盖 initialize / tools/list / tools/call + 故障注入（`state/fault-mode.txt` = `postcondition_mismatch` 一 shot）。

### 2.2 机制正确性自测（S01—S09，主证据）

```bash
cd D:\second\docs\task-packages\E02
node test/selftest.js
```

预期：45 通过 / 0 失败，退出码 0。

### 2.3 清理

```bash
rm -rf D:\second\docs\task-packages\E02\probe\state
```

## 3. 故障/状态注入

`state/fault-mode.txt` 支持：

| 值 | 效果 |
|---|---|
| `normal`（默认） | 幂等探针正常记录 |
| `postcondition_mismatch` | 幂等探针记录后返回 `postcondition_failed`（合成回读不一致，标记待回滚），一 shot 后重置 |

> 真实后端适配（Role/DocPerm 管理员判定、写后回读真实终态、批次持久化）由 F 包接入时提供，本探针不实现。
