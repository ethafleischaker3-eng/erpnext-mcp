# F04 Evidence Manifest

> 文档性质：F04 交付物 D06，逐项可追溯的证据索引。执行者=Claude（F04 独立实施上下文）；执行时间=2026-09-17（UTC+8）；Owner=gjg。
> 环境：Windows 11；Node v24.19.0（零外部依赖）；后端 ERPNext 15.121.2 / Frappe 15.120.1（本地 `localhost:8080`）；未读取 C01b 冻结任务集正文/断言。
> 敏感信息：凭据值、API Secret、完整认证头不写入本文件；后端写凭据（mcp-service token）仅经环境变量注入运行进程，不落公开实施区文件。

## 1. 证据映射

| 证据编号 | 工作项/自检 | 实际操作 | 实际结果 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|
| EV-F04-001 | W02、S01 隔离自证 | `b00-impl` 身份执行 `A01/scripts/verify-impl.ps1` + 负向读取 `task-sets`/`assertions`/`runs`/`snapshots` | verify-impl `ISOLATED: all checks passed`（exit 0）；四目录均 ACCESS_DENIED | `evidence/selftest-S01-S17.txt`（S01 段）+ 会话输出 | 已执行·通过 |
| EV-F04-002 | W03 主数据 7 写 tool 契约层 | 实现 customer/supplier/item create/update + item_price_set（mock 后端） | 7 tool 名称/schema/annotation/错误码/幂等/前置/事后与 D02 §3.1–§3.7 一致 | `server/src/tools/customer-*.js`、`supplier-*.js`、`item-*.js`、`item-price-set.js` + selftest S11/S12/S15 | 已执行·通过（mock；真实字段校验待 Acceptor 实测） |
| EV-F04-003 | W04 库存 3 tool 契约层 | 实现 stock_transfer_create/confirm + stock_reconciliation_plan（mock 后端）；#25 按 D02「Bin/SLE 或 get_items」修正为缺省时点走 Bin、提供 posting_date+posting_time 时走 get_items（规避 get_items 必填位置参数） | 忠实 D02 §6.1–§6.3（#24 submit 全量 doc、#25 只出 plan 不写） | `server/src/tools/stock-transfer-*.js`、`stock-reconciliation-plan.js` + selftest S11/S14/S16（含 S16.2b/2c） | 已执行·通过（mock；真实 submit/get_items 待 Acceptor 实测） |
| EV-F04-004 | W05 可写字段白名单 | 从 B01/B04 interface-facts + ERPNext DocType 字段确认逐 tool 白名单 | 10 tool 逐对象白名单与不可改边界确定性取得，落 `allowlist.WRITABLE_FIELDS`/`IMMUTABLE_FIELDS`；产出 D03 | `server/src/allowlist.js` + `writable-fields-whitelist.md` + selftest S12 | 已执行·通过 |
| EV-F04-005 | W06 确认/白名单/权限层 | 实现 `elicitation.js` + `writeGate`；8 人确认 tool 挂接；#23 免确认（仅 L3）、#25 无写入 | S13 确认边界（accept/decline/cancel/不支持）6 项通过；S17 fail-closed 正确 | `server/src/elicitation.js` + `write-common.js` + selftest S13/S17 | 已执行·通过 |
| EV-F04-006 | W07 幂等/前置/事后/批次 + 后端写落地 | 挂接 idempotency/前置断言/写后回读/批次台账；backend.js 追加 POST/PUT/submit | S14 幂等、S15 前置断言、S16 事后回读+批次、S17 fail-closed 通过（**均以内存 mock 后端验证机制**） | `server/src/backend.js` + `write-common.js` + selftest S14–S17 | 已执行·通过（mock；真实写归 Acceptor 实测） |
| EV-F04-007 | W08 对齐核对 | 逐 tool 与 D02 §3/§6、D01、E01、E02 核对 | 无清单外对象/越界读写/机制绕过；产出 D04 | `alignment-check.md` | 已执行·通过 |
| EV-F04-008 | W09 自检 + server 冒烟 | `node server/test/selftest.js` + stdio `initialize`/`tools/list` 冒烟 | 120/120 退出码 0；16 tool 注册 + elicitation 能力正确 | `evidence/selftest-S01-S17.txt` + `evidence/server-smoke-tools.txt` | 已执行·通过 |

## 2. 自检总结果

`node server/test/selftest.js`（Node v24.19.0）：**122 通过 / 0 失败，退出码 0**（S01—S17 全过）。原始输出见 `evidence/selftest-S01-S17.txt`。

## 3. 敏感信息与受控位置

- 后端写凭据（`mcp-service` token）仅存后端容器 `/tmp/mcp_token.txt`，本会话无 docker CLI 不可取用；写后端调用以内存 mock 验证机制（create/update/submit 语义），真实写凭据不经实施区文件（E01 §18.4「供验收验证、F 包接线前须重发托管」）。
- 未读取 `D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 内容（S01 负向读取仅为 ACCESS_DENIED 自证，未进入目录内容）。
- **未对真实后端执行写冒烟**（无 mcp-service 写凭据）：10 个写/只出 plan tool 的机制/工具逻辑经内存 mock 覆盖，真实后端写管线（#23/#24/#25 与 supplier/item/item_price 的字段校验、`frappe.client.submit`/`get_items` 返回形状、子表自动派生、naming_series）待 Acceptor gjg 以 mcp-service token 独立实测并快照恢复归零。

## 4. 写操作口径（写前确认/写后回读/批次/归零）

- **写前确认**：8 人确认 tool 经 `elicitation.requireConfirmation`，未经有效确认零写入；#23 全自动仅 L3 免确认，客户端不支持 elicitation 时全量 fail-closed。
- **写后回读**：写 tool 成功响应前回读目标对象终态（主数据关键字段/价格语义/调拨 docstatus=1）。
- **批次记录**：写 tool 写后 `batchLedger.recordChange` + `complete`，会话级归属。
- **归零**：本自检全程 mock，未改真实后端数据库状态；真实写操作测试后经快照恢复归零。
- **覆盖边界**（如实）：自检覆盖 S11–S17（契约/白名单/确认/幂等/前置/事后/批次/fail-closed），以 mock 后端验证；**真实后端写未覆盖**，归 Acceptor 档位 3 独立验收（后端终态/接口实测，F04 验收以公开契约 + 后端终态/接口实测为准，非隐藏断言）。

## 5. 交付物清单核对（§11 D01–D08）

| 交付物 | 路径 | 状态 |
|---|---|---|
| D01 F04 任务包 | `docs/task-packages/F04/task.md` | 已冻结（上游，未改） |
| D02 10 写/只出 plan tool server 实现 | `server/`（复用 F01 骨架，追加 10 写 + 确认/fail-closed/白名单/机制挂接） | 已产出 |
| D03 逐 tool 可写字段白名单 | `docs/task-packages/F04/writable-fields-whitelist.md` + `server/src/allowlist.js` | 已产出 |
| D04 对齐核对记录 | `docs/task-packages/F04/alignment-check.md` | 已产出 |
| D05 开发自检记录 | `docs/task-packages/F04/dev-selftest.md` | 已产出 |
| D06 Evidence Manifest | `docs/task-packages/F04/evidence-manifest.md` | 本文件 |
| D07 登记表 F04 行 | `docs/governance/任务包登记表.md` | 随状态追加 |
| D08 独立验收记录 | （归 Acceptor gjg，Implementer 不产出） | 不适用 |
