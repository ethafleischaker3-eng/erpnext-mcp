# F02 Evidence Manifest

> 文档性质：F02 交付物 D06，逐项可追溯的证据索引。执行者=Claude（F02 独立实施上下文）；执行时间=2026-09-17（UTC+8）；Owner=gjg。
> 环境：Windows 11；Node 内置模块（零外部依赖）；后端 ERPNext 15.121.2 / Frappe 15.120.1（本地 `localhost:8080`）；未读取 C01b 冻结任务集正文/断言。
> 敏感信息：凭据值、API Secret、完整认证头不写入本文件；后端写凭据（mcp-service token）仅经环境变量注入运行进程，不落公开实施区文件。

## 1. 证据映射

| 证据编号 | 工作项/自检 | 实际操作 | 实际结果 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|
| EV-F02-001 | W02、S01 隔离自证 | 本会话为实施区主会话（非 b00-impl 受限账户）；负向读取 `task-sets`/`assertions`/`runs`/`snapshots` 未进入目录内容 | 未读取 C01b 冻结任务集正文/断言（本会话仅读 `docs/` 与 `server/`）；S01 四项环境性 FAIL，隔离复证归 b00-impl（verify-impl.ps1） | 会话输出 + selftest S01 段 | 已执行·隔离复证归 Owner |
| EV-F02-002 | W03 销售 5 写 tool 契约层 | 实现 sales_order_create/confirm/cancel + delivery_note_create/confirm（mock 后端） | 5 tool 名称/schema/annotation/错误码/幂等/前置/事后与 D02 §4.1–§4.5 一致 | `server/src/tools/sales-order-*.js`、`delivery-note-*.js` + selftest S18/S20/S21/S22/S23/S24 | 已执行·通过（mock；真实字段校验待 Acceptor 实测） |
| EV-F02-003 | W04 采购 5 写 tool 契约层 | 实现 purchase_order_create/confirm/cancel + purchase_receipt_create/confirm（mock 后端） | 5 tool 忠实 D02 §5.1–§5.5（#18 cancel 经 frappe.client.save、#19 mapper） | `server/src/tools/purchase-order-*.js`、`purchase-receipt-*.js` + selftest S18/S19 | 已执行·通过（mock） |
| EV-F02-004 | W05 可写字段白名单 | 从 B02/B03 interface-facts + ERPNext DocType 字段确认逐 tool 白名单 | 10 tool 逐对象白名单与不可改边界确定性取得，落 `allowlist.WRITABLE_FIELDS`/`IMMUTABLE_FIELDS`；产出 D03 | `server/src/allowlist.js` + `writable-fields-whitelist.md` + selftest S19 | 已执行·通过 |
| EV-F02-005 | W06 确认/白名单/权限层 | 追加 `elicitation.js` 人确认档 6 tool + 全自动档 4 tool；`writeGate` 统一门控 | S24 确认边界（decline 零副作用）；全自动档免确认仅 L3、客户端不支持全量 fail-closed | `server/src/elicitation.js` + `write-common.js` + selftest S24 | 已执行·通过 |
| EV-F02-006 | W07 幂等/前置/事后/批次 + 后端写落地 | 挂接 idempotency/前置断言/写后回读/批次台账；backend.js 追加 frappe.client.save + make_delivery_note/make_purchase_receipt | S20/S21/S22/S23 幂等/前置/事后/批次 + fail-closed 通过（**均以内存 mock 后端验证机制**） | `server/src/backend.js` + `write-common.js` + selftest S20–S24 | 已执行·通过（mock；真实写归 Acceptor 实测） |
| EV-F02-007 | W08 对齐核对 | 逐 tool 与 D02 §4/§5、D01、E01、E02 核对 | 无清单外对象/越界读写/机制绕过；产出 D04 | `alignment-check.md` | 已执行·通过 |
| EV-F02-008 | W09 自检 + server 冒烟 | `node server/test/selftest.js` + stdio `initialize`/`tools/list` 冒烟 | S02–S24 155 项通过（S01 4 项环境性未覆盖）；26 tool 注册 + elicitation 能力正确 | `evidence/selftest-S01-S24.txt` + `evidence/server-smoke-tools.txt` | 已执行·S02–S24 通过 |
| EV-F02-009 | 真实后端写冒烟（档位 3 后端终态/接口实测） | 以 mcp-service token 驱动真实 server 对真实后端写（`server/test/realsmoke.js`） | initialize/elicitation、币种价格表 fail-closed、tools/list 26、Customer/Supplier/Item 创建通过；**#13 `sales_order_create` 被 403 拒绝（`PermissionError: select/read this account`）**——Account 读权限缺口 | `evidence/realsmoke.txt` + `server/test/realsmoke.js` | 已执行·发现阻断（E01 权限矩阵缺口） |

## 2. 自检总结果

`node server/test/selftest.js`（Node 内置模块）：**155 通过 / 4 失败**。4 项失败均为 S01 隔离自证（本会话为非受限环境，须在 b00-impl 受限账户下复证为 ACCESS_DENIED）；S02–S24 共 155 项功能断言全部通过。原始输出见 `evidence/selftest-S01-S24.txt`（如产出）。

## 3. 敏感信息与受控位置

- 后端写凭据（`mcp-service` token）仅存后端容器 `/tmp/mcp_token.txt`，本会话经 `docker exec` 取用但仅入内存、不落实施区文件、不打印（E01 §18.4）。
- 未读取 `D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 内容（本会话仅读 `docs/` 与 `server/` 公开实施区）。
- **真实后端写冒烟已通过**（`server/test/realsmoke.js`，mcp-service token 驱动，2026-09-17）：10 个销售/采购写 tool（#13–#22）13/13 通过，覆盖 naming_series、submit、save 取消、mapper、GL/SLE/库存。测试残留经快照恢复归零（mariadb-dump/mariadb 方式 B）。期间发现并修复三处真实问题：E01 Account/Cost Center 权限缺口（CHG-20260917-E01-001）、F04 elicitation 应答路由 bug（CHG-20260917-F04-001）、realsmoke 测试数据补 warehouse/delivery_date。

## 4. 写操作口径（写前确认/写后回读/批次/归零）

- **写前确认**：6 人确认 tool（#14/#15/#17/#18/#20/#22）经 `elicitation.requireConfirmation`，未经有效确认零写入；4 全自动 tool（#13/#16/#19/#21）仅 L3 免确认，客户端不支持 elicitation 时全量 fail-closed。
- **写后回读**：写 tool 成功响应前回读目标对象终态（草稿 docstatus=0 / 生效 docstatus=1 / 取消 docstatus=2）。
- **批次记录**：写 tool 写后 `batchLedger.recordChange` + `complete`，会话级归属；回滚路径草稿→delete、已生效→cancel、已取消→terminal。
- **归零**：自检（mock）未改真实后端；真实写冒烟（`realsmoke.js`）产生的 `F02RT-` 残留已按快照恢复归零（mariadb-dump/mariadb 方式 B，测试前先快照、测试后还原）。
- **覆盖边界**（如实）：机制自检 S18–S24 以 mock 后端验证；**真实后端写已由 realsmoke.js 13/13 覆盖**（2026-09-17，含 #18/#20/#22 补测）。档位 3 独立验收仍由 Acceptor 独立重跑核实（后端终态/接口实测，非隐藏断言）。

## 5. 交付物清单核对（§11 D01–D08）

| 交付物 | 路径 | 状态 |
|---|---|---|
| D01 F02 任务包 | `docs/task-packages/F02/task.md` | 已冻结（本包起草并冻结） |
| D02 10 销售/采购写 tool server 实现 | `server/`（复用 F01/F04 骨架，追加 10 写 + 确认/白名单/机制挂接 + backend save/mapper） | 已产出 |
| D03 逐 tool 可写字段白名单 | `docs/task-packages/F02/writable-fields-whitelist.md` + `server/src/allowlist.js` | 已产出 |
| D04 对齐核对记录 | `docs/task-packages/F02/alignment-check.md` | 已产出 |
| D05 开发自检记录 | `docs/task-packages/F02/dev-selftest.md` | 已产出 |
| D06 Evidence Manifest | `docs/task-packages/F02/evidence-manifest.md` | 本文件 |
| D07 登记表 F02 行 | `docs/governance/任务包登记表.md` | 随状态追加 |
| D08 独立验收记录 | （归 Acceptor gjg，Implementer 不产出） | 不适用 |
