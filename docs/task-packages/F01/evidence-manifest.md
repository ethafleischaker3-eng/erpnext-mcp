# F01 Evidence Manifest

> 文档性质：F01 交付物 D06，逐项可追溯的证据索引。执行者=Claude（F01 独立实施上下文）；执行时间=2026-09-16（UTC+8）；Owner=gjg。
> 环境：Windows 11；Node v24.19.0（零外部依赖）；后端 ERPNext 15.121.2 / Frappe 15.120.1（本地 `localhost:8080`，空基线无业务数据）；未读取 C01b 冻结任务集正文/断言。
> 敏感信息：凭据值、API Secret、完整认证头不写入本文件；后端只读凭据仅经环境变量注入运行进程，不落入公开实施区文件。

## 1. 证据映射

| 证据编号 | 工作项/自检 | 实际操作 | 实际结果 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|
| EV-F01-001 | W02、S01 隔离自证 | 以 `b00-impl` 身份执行 `A01/scripts/verify-impl.ps1` + `server/test/selftest.js` S01 段对 `task-sets`/`assertions`/`runs`/`snapshots` 负向读取 | verify-impl 输出 `ISOLATED: all checks passed`（exit 0）；S01 四目录均 EACCES/EPERM（ACCESS_DENIED） | `docs/task-packages/F01/evidence/selftest-S01-S10.txt`（S01 段） | 已执行·通过 |
| EV-F01-002 | W03、S02/S04 读 tool 契约层 | 实现 `document-search/document-get/stock-level-query/stock-ledger-query/supplier-search` 5 个读 tool；S02/S04 逐项核对 | 5 tool 名称/schema/annotation/错误码与 D02 §2.1–§2.5 一致；mock 后端只读语义正确 | `server/src/tools/*.js` + selftest S02/S04 段 | 已执行·通过 |
| EV-F01-003 | W04、S07 #26 批次状态查询 | 实现 `batch-status-get`，挂接 E02 `queryBatchStatus` + `identity` | 归属可查/他人 permission_denied/管理员全量/batch_not_found/不可回滚，S07 6 项通过 | `server/src/tools/batch-status-get.js` + selftest S07 段 | 已执行·通过 |
| EV-F01-004 | W05、S10 #1 filters 白名单 | 从 B01–B04 冻结事实 + 只读 DocType meta 查询（`GET /api/resource/DocType/{doctype}`）确认九类逐对象可检索字段 | 九类逐对象白名单确定性取得，落 `allowlist.FILTER_FIELDS`；S10 通过；产出 D03 `filters-whitelist.md` | `server/src/allowlist.js` + `docs/task-packages/F01/filters-whitelist.md` | 已执行·通过 |
| EV-F01-005 | W06 白名单层挂接 | 实现 `allowlist.js`（object_type 九类硬编码 + Link 目标枚举 + filters 白名单 + #5 Supplier 独占） | S03 6 项通过：九类映射/引用清单/Link 目标/排除 supplier·bin·sle/不含 Contact·Address·User | `server/src/allowlist.js` + selftest S03 段 | 已执行·通过 |
| EV-F01-006 | W07 机制挂接 + 错误转译 | 迁入 E02 lib/ 8 模块；实现 `translate.js` 统一错误形状；只读 tool 不挂接幂等/前置/事后/批次写入 | S05/S08 通过：原生异常→语义化 code、统一错误形状、只读 tool 无夹带写入、#26 仅挂 queryBatchStatus | `server/lib/*.js` + `server/src/translate.js` + selftest S05/S08 段 | 已执行·通过 |
| EV-F01-007 | W08 对齐核对 | 逐 tool 与 D02 §2、D01 §1–§7、E01 permission-matrix/allowlist 核对 | 无清单外对象、无越界读写、无通用 CRUD；产出 D04 `alignment-check.md` | `docs/task-packages/F01/alignment-check.md` | 已执行·通过 |
| EV-F01-008 | W09 只读口径 + 真实后端冒烟 | server 仅 GET（无 POST/PUT/DELETE/run_method/submit/cancel）；经 MCP 协议直接调用真实后端（空基线） | S09 通过；6 tool 冒烟：检索/详情/余量/流水/供应商/批次/错误转译均正确，未改数据库状态 | `server/` 源码 + selftest S09 段 + `docs/task-packages/F01/dev-selftest.md` §3 | 已执行·通过 |

## 2. 自检总结果

`node server/test/selftest.js`（Node v24.19.0）：**75 通过 / 0 失败，退出码 0**（S01—S10 全过）。原始输出见 `docs/task-packages/F01/evidence/selftest-S01-S10.txt`。

## 3. 敏感信息与受控位置

- 后端只读凭据（`mcp-service` token）仅存后端容器 `/tmp/mcp_token.txt`，本会话无 docker CLI 不可取用；实施自检以本机只读 token 经环境变量注入运行进程验证只读管线，凭据值不入任何实施区文件。
- 真实后端冒烟全程只读（仅 `GET /api/resource/{doctype}` 与 `GET /api/method/frappe.client.get_count`），未写入/重置/改变任何业务数据终态（空基线，无探测对象残留）。
- 未读取 `D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 内容（S01 负向读取仅为 ACCESS_DENIED 自证，未进入目录内容）。

## 4. 交付物清单核对（§11 D01–D08）

| 交付物 | 路径 | 状态 |
|---|---|---|
| D01 F01 任务包 | `docs/task-packages/F01/task.md` | 已冻结（上游，未改） |
| D02 6 读 tool server 实现 | `server/`（骨架 + lib 8 模块 + 6 tool + 白名单/机制挂接） | 已产出 |
| D03 filters 白名单 | `docs/task-packages/F01/filters-whitelist.md` + `server/src/allowlist.js` | 已产出 |
| D04 对齐核对记录 | `docs/task-packages/F01/alignment-check.md` | 已产出 |
| D05 开发自检记录 | `docs/task-packages/F01/dev-selftest.md` | 已产出 |
| D06 Evidence Manifest | `docs/task-packages/F01/evidence-manifest.md` | 本文件 |
| D07 登记表 F01 行 | `docs/governance/任务包登记表.md` | 随状态追加 |
| D08 独立验收记录 | （归 Acceptor gjg，Implementer 不产出） | 不适用 |
