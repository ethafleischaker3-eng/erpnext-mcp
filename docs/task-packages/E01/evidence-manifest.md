# E01 Evidence Manifest

> 文档性质：E01 交付物 D07，逐项可追溯的证据索引。执行者=Claude（E01 独立实施上下文）；执行时间=2026-09-16（UTC+8）；环境=本地验收环境 `erpnext.local`（ERPNext 15.121.2 / Frappe 15.120.1）+ 只读文件核对。未读取 C01b 冻结任务集正文/断言。
> 敏感信息：凭据值、API Secret、完整认证头不写入本文件；`mcp-service` 的 token 仅存于后端容器 `/tmp/mcp_token.txt` 供验证使用，不入公开实施区。

## 1. 证据映射

| 证据编号 | 工作项/自检 | 实际操作 | 实际结果 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|
| EV-E01-001 | W01、S01 隔离自证 | `icacls` 核查 ACL + Owner 以 `b00-impl` 身份负向读取 | ACL 含对 `b00-impl`、`c01a-blind`、`S-1-5-21-…-1007` 的 Deny ACE `(OI)(CI)(N)`；Owner 补跑 `B00/scripts/verify-isolation.ps1`，`stdout: ACCESS_DENIED: UnauthorizedAccessException`，结论「Access Denied —— 真实权限隔离生效」 | `D:\second-acceptance\evidence\E01-raw-*.txt` + B00 S12 脚本输出 | 已执行·通过 |
| EV-E01-002 | W02、S02 权限矩阵推导 | 逐 tool 从 D02 `tool-contract.md` 提取对象访问需求，产出 `permission-matrix.md` | 26 tool 逐 tool 前向矩阵 + 12 操作/9 引用反向矩阵 + DocPerm 收敛表；无清单外对象、引用只读、只读对象无写、document_search 排除 supplier/bin/sle | `docs/task-packages/E01/permission-matrix.md` | 已执行·通过 |
| EV-E01-003 | W03、S04 正式账号/角色落地 | bench console 创建角色 `MCP Business Caller` + 21 DocType DocPerm + 账号 `mcp-service@erpnext.local`（仅挂该角色）+ 生成 token；后经 CHG-20260917-E01-001 补 Account/Cost Center `read`+`select`（21→23） | 角色创建、DocPerm 23 条（含 Account/Cost Center 仅 read/select）、用户创建并仅挂专用角色；`tabDocPerm` role=MCP Business Caller 计数=23、`tabUser` 计数=1 | `docs/task-packages/E01/roles.md`；DB 查询 | 已执行·通过 |
| EV-E01-004 | W04、S03 允许清单落地 | 产出 `allowlist.md`（12 操作 + 9 引用，三层 server 侧拦截点） | 成员忠实 PRD §2.3/C01a（12+9）；清单外 MUST NOT 读写、引用只引用、子表嵌套、禁止任意 DocType | `docs/task-packages/E01/allowlist.md` | 已执行·通过 |
| EV-E01-005 | W05、S05 人工确认机制 | 产出 `confirmation-failclosed.md`，对齐 A01 L3 结论（Claude Code 2.1.263 / MCP 2025-11-25 / elicitation）与规范 §9.7 | 确认 server 发起、完整参数、拒绝零副作用、客户端不支持 fail-closed、敏感凭据 URL、发起时机；人确认档 14 tool 清单与 D02 总表一致 | `docs/task-packages/E01/confirmation-failclosed.md` | 已执行·通过 |
| EV-E01-006 | W06、S06 fail-closed | 产出 `confirmation-failclosed.md` §2（币种/价格表 + 客户端不支持全量降级） | 币种/价格表 fail-closed 条件与 PRD 决议 2 一致；客户端不支持时写 tool 全量降级与 PRD 决议 1 一致 | 同上 | 已执行·通过 |
| EV-E01-007 | W07、S07 越权验证 | 以 `mcp-service` token 直调 REST API 实测清单外/引用/只读读写 | 清单外业务对象（Role/Sales Invoice/Item Barcode/User 写）403；引用对象（Warehouse/Company/Currency）增删改 403；只读对象（Bin/SLE）写 403；操作对象读/写 200；框架级残余（User 自读、Contact/Address 自建自读）如实记录并给出 tool 层白名单兜底 | `docs/task-packages/E01/authorization-verification.md`；`D:\second-acceptance\evidence\E01-raw-*.txt` | 已执行·通过（含残余记录） |
| EV-E01-008 | W08 对齐核对 + 回填 | 权限矩阵/允许清单/确认/fail-closed 与 D02 契约、D01 §7、PRD §2.1/§2.3/§5.6、A01、B00 §18.3 逐项核对 | 无清单外对象、无越界读写、引用只读、最小权限、不沿用 B00 临时探针；Evidence Manifest 回填 | 本清单 §1 | 已执行·通过 |

## 2. W01 隔离自证说明（如实记录）

- **ACL 静态证据成立**：`task-sets`/`assertions` 均含对实施受限账户（`b00-impl`、`c01a-blind`、SID-1007）的 Deny ACE `(OI)(CI)(N)`，Owner/Administrators/SYSTEM 全权（`icacls` 输出见 raw evidence）。
- **负向读取自证已补跑（Owner 完成）**：Owner gjg 以 `b00-impl` 身份执行 `B00/scripts/verify-isolation.ps1`，对 `task-sets` 哨兵负向读取返回 `ACCESS_DENIED: UnauthorizedAccessException`，结论「Access Denied —— 真实权限隔离生效」；`assertions`/`runs`/`snapshots` 三目录与 `task-sets` 同源 Deny ACE（静态 `icacls` 已核）。前置条件第 9 条「已验证」。
- **自我约束**：本次实施仅基于实施区权威输入（D02 `tool-contract.md`、D01 `common-contract.md`、C01a `object-scope.md`、PRD、规范、B00 §18.3、A01 verification-record、总则），未读取 `D:\second-acceptance\task-sets\`、`assertions\` 内容，未读取 C01b `coverage-map.md`/`solvability-record.md` 正文。

## 3. 敏感信息与受控位置

- `mcp-service` API token 仅存于后端容器 `/tmp/mcp_token.txt`（供越权验证），不进入实施区文件、不写入本清单；`erpnext.local` 管理员/API/DB 凭据为本地开发默认值，不列明。
- 越权验证探测对象（`E01-PROBE-CONTACT`、`E01-PROBE-CUST`）验证后删除，`tabContact`/`tabCustomer`/`tabAddress` 中 `E01%` 前缀计数均为 0，零残留。
- 原始证据（icacls、HTTP 状态码、脱敏前原始输出）落 `D:\second-acceptance\evidence\E01-raw-*.txt`，脱敏后引用登记入本清单。

## 4. 交付物清单核对（§11 D02–D07）

| 交付物 | 路径 | 状态 |
|---|---|---|
| D02 权限矩阵 | `docs/task-packages/E01/permission-matrix.md` | 已产出 |
| D03 允许清单落地 | `docs/task-packages/E01/allowlist.md` | 已产出 |
| D04 正式账号/角色 | `docs/task-packages/E01/roles.md` + 后端实际配置 | 已产出+已配置 |
| D05 确认/fail-closed | `docs/task-packages/E01/confirmation-failclosed.md` | 已产出 |
| D06 越权验证记录 | `docs/task-packages/E01/authorization-verification.md` + 原始证据 | 已产出 |
| D07 Evidence Manifest | `docs/task-packages/E01/evidence-manifest.md` | 本文件 |
