# E01 正式账号/角色与权限配置（roles）

> 文档性质：E01 交付物 D04，正式业务账号 + 专用角色的定义与权限配置（脱敏）。区分管理员运维主体与普通 MCP 调用方主体；权限收敛到允许清单最小权限，不沿用 B00 临时探针权限。
> 版本：v1.0（E01 实施产出）。实现主体：Claude（E01 独立实施上下文）；未读取 C01b 冻结任务集正文/断言。

---

## 1. 主体分离（B00 身份结论 + PRD §5.6）

| 主体 | 后端账号/角色 | 用途 | 权限 |
|---|---|---|---|
| 管理员运维主体 | `Administrator`（含 System Manager） | 异常回滚、账号/角色/权限配置、快照重置、环境运维 | 全量（后端管理） |
| 普通 MCP 调用方主体 | 专用系统账号 `mcp-service` + 专用角色 `MCP Business Caller` | 26 个 MCP 业务 tool 的后端调用 | 收敛到两张允许清单最小权限 |

- 普通调用方主体的后端调用（读写）一律经专用账号 `mcp-service` + 专用角色，**不沿用 Administrator 全权、不沿用 B00 临时探针权限**。
- 异常回滚（PR/DN/SE 取消、草稿删除）仅管理员运维主体执行，不对普通调用方开放（PRD §5.4）。

---

## 2. 正式账号定义

| 项 | 值 |
|---|---|
| 用户名（email） | `mcp-service@erpnext.local` |
| first_name / full_name | MCP Service |
| user_type | System User |
| 角色 | 仅 `MCP Business Caller`（不授予任何标准角色） |
| enabled | 1 |
| API 凭证 | 专用 Token（脱敏；原始值见验收区 evidence，不写入本文件） |
| 密码 | 不启用交互登录（token 认证）；凭据脱敏 |

---

## 3. 专用角色 DocPerm 配置（DocType 级，最小权限）

角色 `MCP Business Caller` 对下表 21 个 DocType 授予 `permlevel=0` 的 DocPerm；未列出的 DocType **不授予任何权限**。

| DocType | 类别 | read | write | create | submit | cancel |
|---|---|---|---|---|---|---|
| Customer | 操作-读写 | ✓ | ✓ | ✓ | — | — |
| Supplier | 操作-读写 | ✓ | ✓ | ✓ | — | — |
| Item | 操作-读写 | ✓ | ✓ | ✓ | — | — |
| Item Price | 操作-读写 | ✓ | ✓ | ✓ | — | — |
| Sales Order | 操作-读写 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Purchase Order | 操作-读写 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Purchase Receipt | 操作-读写 | ✓ | ✓ | ✓ | ✓ | — |
| Delivery Note | 操作-读写 | ✓ | ✓ | ✓ | ✓ | — |
| Stock Entry | 操作-读写 | ✓ | ✓ | ✓ | ✓ | — |
| Stock Reconciliation | 操作-只出方案 | ✓ | — | — | — | — |
| Bin | 操作-只读 | ✓ | — | — | — | — |
| Stock Ledger Entry | 操作-只读 | ✓ | — | — | — | — |
| Company | 引用-只读 | ✓ | — | — | — | — |
| Warehouse | 引用-只读 | ✓ | — | — | — | — |
| Price List | 引用-只读 | ✓ | — | — | — | — |
| Currency | 引用-只读 | ✓ | — | — | — | — |
| Customer Group | 引用-只读 | ✓ | — | — | — | — |
| Supplier Group | 引用-只读 | ✓ | — | — | — | — |
| Territory | 引用-只读 | ✓ | — | — | — | — |
| Item Group | 引用-只读 | ✓ | — | — | — | — |
| UOM | 引用-只读 | ✓ | — | — | — | — |

- `delete`/`amend`/`report`/`import`/`export`/`share`/`print`/`email`/`set_user_permissions` 一律不授予。
- 除上表 21 个 DocType 外，用户/角色/设置（User、Role、System Settings 等）、财务（Sales Invoice、Payment Entry、Journal Entry、GL Entry 等）、制造（BOM、Work Order 等）、CRM、HR、项目、资产、Contact、Address 等**不授予任何 DocPerm**。

---

## 4. 落地命令（验收环境，脱敏）

在本地验收环境 `erpnext.local`（非生产、可销毁）经管理员执行，每次变更记录命令与终态：

1. 创建专用角色（含 21 个 DocType 的 DocPerm）。
2. 创建专用系统账号 `mcp-service@erpnext.local`，仅挂 `MCP Business Caller` 角色。
3. 生成专用 API Token 并脱敏登记。
4. 实测越权（见 `authorization-verification.md`）后回填终态。

> 落地实现与逐条命令/终态见验收区原始证据（`D:\second-acceptance\evidence\`）与 `evidence-manifest.md` 脱敏引用；本文件不列明凭据值。

---

## 5. 与 PRD §5.6 / B00 结论一致性核对（S04）

1. 专用系统账号 + 专用角色，权限收敛到「各操作允许对象按其声明能力读写 + 引用允许对象读」—— 满足（§3 表）。
2. 不授予用户/角色/设置与两张清单外对象任何权限 —— 满足（仅 21 个 DocType）。
3. 只读对象（Bin、Stock Ledger Entry）仅读；只出方案对象（Stock Reconciliation）仅读、无写 —— 满足。
4. 管理员运维主体与普通调用方主体分离 —— 满足（§1 表）。
5. 不沿用 B00 临时探针权限 —— 满足（全新账号/角色，B00 探针已清理，见 `authorization-verification.md` §5）。
