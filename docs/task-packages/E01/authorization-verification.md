# E01 越权验证记录（authorization-verification）

> 文档性质：E01 交付物 D06，越权验证实测记录（脱敏）。验证专用角色 `MCP Business Caller` + 专用账号 `mcp-service` 的最小权限收敛与 fail-closed：清单外对象读写、引用清单对象增删改、只读对象写均被后端原生拒绝，并转译为 D01 `permission_denied` 可自纠报错。
> 版本：v1.0（E01 实施产出）。实现主体：Claude（E01 独立实施上下文）；未读取 C01b 冻结任务集正文/断言。

---

## 1. 验证方法与环境

| 项 | 值 |
|---|---|
| 后端 | ERPNext 15.121.2 / Frappe 15.120.1，站点 `erpnext.local`（本地验收环境，非生产） |
| 被测主体 | 专用账号 `mcp-service@erpnext.local`（token 认证）+ 专用角色 `MCP Business Caller` |
| 验证方式 | 以 `mcp-service` 的 API token 直接调用后端 REST API（`/api/resource/<DocType>`），观察后端原生 PermissionError 拒绝 |
| 对照主体 | `Administrator`（管理员运维主体，全权） |
| 探测对象 | 仅合成探测对象（`E01-PROBE-` 前缀），验证后删除，零残留 |
| 敏感信息 | 凭据值、完整认证头不写入本文件（脱敏）；原始输出见验收区 evidence |

---

## 2. 正向控制（允许清单对象可读/写，证明最小权限未误伤）

| 用例 | 结果 | 结论 |
|---|---|---|
| 操作对象读 Customer / Supplier | HTTP 200 | ✓ 允许清单可读 |
| 引用对象读 Warehouse / UOM | HTTP 200 | ✓ 引用清单只读生效（读允许） |
| 只读对象读 Bin / Stock Ledger Entry | HTTP 200 | ✓ 只读对象读允许 |
| 操作对象写 Customer（create，合法叶子分组） | HTTP 200（`name=E01-PROBE-CUST`） | ✓ 读写对象可写 |

---

## 3. 反向控制（越权均被后端原生拒绝）

### 3.1 清单外对象（财务/制造/系统管理/CRM）读写

| 用例 | 结果 | 结论 |
|---|---|---|
| 读 Role | HTTP 403 `PermissionError` | ✓ 拒绝 |
| 读 Sales Invoice（财务） | HTTP 403 `PermissionError` | ✓ 拒绝 |
| 写 Sales Invoice | HTTP 403 `PermissionError` | ✓ 拒绝 |
| 写 Item Barcode（库存附件） | HTTP 403 `PermissionError` | ✓ 拒绝 |
| 写 User（新建系统用户） | HTTP 403 `PermissionError` | ✓ 拒绝 |

### 3.2 引用清单对象增删改

| 用例 | 结果 | 结论 |
|---|---|---|
| 写 Warehouse（POST 建仓） | HTTP 403 `PermissionError` | ✓ 拒绝（引用只读，不可增） |
| 改 Company（PUT gjg） | HTTP 403 `PermissionError` | ✓ 拒绝（引用只读，不可改） |
| 删 Currency（DELETE CNY） | HTTP 403 `PermissionError` | ✓ 拒绝（引用只读，不可删） |

### 3.3 只读对象写

| 用例 | 结果 | 结论 |
|---|---|---|
| 写 Bin（POST） | HTTP 403 `PermissionError` | ✓ 拒绝（Bin 只读） |
| 写 Stock Ledger Entry（POST） | HTTP 403 `PermissionError` | ✓ 拒绝（SLE 只读） |

---

## 4. 跨调用方批次读取隔离（普通调用方读他人批次）

- **结论：属 MCP server 侧强制，非后端 DocPerm 层**。后端无「批次」业务对象；批次台账由 MCP server 独立留存（E02 已封存，D01 §6.4）。
- E01 权限底座为批次隔离提供对象级基础：普通调用方主体（`mcp-service`）无用户/角色/设置对象读权限（§3.1 写 User 拒绝、读 Role 拒绝），且后端对象访问已收敛到两张允许清单。
- 批次归属（会话级 `callerId`）与「他人批次不可见（`permission_denied`，不泄露他人批次参数/涉及单据/回滚信息）、管理员可查全量」由 MCP server 的 `batch_status_get`（#26）+ `identity.resolveCaller` 强制，属 E02/F 包接入范围；E01 本包不实测该层（无 MCP server 运行实例），如实记录。

---

## 5. 框架级残余访问（如实记录，非角色 DocPerm 可完全消除）

> 下列为 Frappe 框架内置行为，**不是** `MCP Business Caller` 角色 DocPerm 授予的，也不因该角色而消除；对普通调用方主体的实际影响与 MCP tool 层白名单兜底如下。

| 框架行为 | 实测 | 影响与兜底 |
|---|---|---|
| `User` 列表可读（System User 框架内置） | `mcp-service`（System User）读 `User` 列表返回**全量**用户（实测 2 个：`mcp-service@erpnext.local` 与 `1149594622@qq.com`），非仅自身 | 框架内置：User DocType `has_permission` 对 System User 放行读列表（`tabDocPerm` 中 `MCP Business Caller` 角色对 User **无任何权限**，非角色授予）；仅暴露 name/email 基础字段、无凭据；**MCP tool 层白名单兜底**：26 个 tool 无一触及 User |
| `Contact`/`Address`（文档共享 Doctype）自建自读 | `mcp-service` 可 POST 创建自身 Contact（`E01-PROBE-CONTACT` HTTP 200）；`Address` 权限检查通过（417 MandatoryError 而非 403） | 框架「All」角色 `read/write/create + if_owner=1`（仅自有记录）+ `dynamic_links`（仅可访问已链接文档）——非跨用户泄露、非全量；**MCP tool 层白名单兜底**：`document_search`/`document_get` 的 `object_type` 硬编码枚举不含 Contact/Address/User，26 个 tool 无一可触及 |

**结论**：越权验证的**核心安全属性成立**——清单外**业务对象**（财务/制造/CRM/HR/系统管理）读写、引用清单对象增删改、只读对象写均被后端原生拒绝；Contact/Address/User 的「自有记录 + 已链接文档」框架级访问为 ERPNext 标准行为，且 MCP tool 层白名单（第二层拦截）完全切断 agent 经 MCP 触达路径。

> **已决断（Owner gjg，2026-09-16）：接受为残余风险（选项 A）**。不改后端框架默认权限；由 MCP tool 层白名单（第二层拦截：`document_search`/`document_get` 的 `object_type` 硬编码枚举不含 Contact/Address/User，26 个 tool 无一可触及）兜底，F 包实施时须落实该白名单层。若未来要求后端原生也拒绝 Contact/Address 自建自读，须修改框架「All」角色对这两个 DocType 的默认 DocPerm（影响全站所有用户），属框架级变更，走变更控制（总则 §12）。

> **验收期修正（Acceptor gjg，2026-09-16）**：本包实施期将 `mcp-service` 账号落地为 `user_type=Website User`，与 `roles.md` §2 声明的「System User」不符。独立验收时由 Acceptor 修正为 `user_type=System User`（`frappe.db.set_value`，未改角色/DocPerm/token），并独立重跑全部越权/正向用例：越权 9 项仍全 403、正向读 4 项仍全 200、Customer create 200、跨 owner 读可见——核心安全属性无回归。修正的已知副作用为 `User` 列表可见性从「仅自身」放宽为「全量」（本表上方 `User` 行已按 System User 终态改写）：此为 Frappe System User 内置行为、非角色 DocPerm 授予，由 MCP tool 层白名单兜底，接受为残余风险。

---

## 6. 越权转译口径核对（S07）

后端原生拒绝为 `PermissionError`(403)，MCP server 转译为 D01 §4.2 `permission_denied` 可自纠报错（不透出堆栈，转译列出所需对象/权限）。实测后端 403 响应含 `exc_type=PermissionError`，为转译的事实来源（D01 §4.2 事实源：`PermissionError` 403）。

| 后端原生/场景 | 转译 code | 自纠建议 |
|---|---|---|
| 清单外对象读写（PermissionError 403） | `permission_denied` | 对象不在两张允许清单，指定允许清单内对象 |
| 引用清单对象增删改（PermissionError 403） | `permission_denied` | 引用对象只可引用，不可经 MCP 增删改 |
| 只读对象写（PermissionError 403） | `permission_denied` | 该对象只读，无写 tool |

---

## 7. 终端态与清理

- 探测对象（`E01-PROBE-CONTACT`、`E01-PROBE-CUST`）验证后经 `Administrator` 删除，`tabContact`/`tabCustomer` 中 `E01%` 前缀计数为 0，零残留。
- 正式账号 `mcp-service` + 角色 `MCP Business Caller`（23 DocType DocPerm：21 操作/引用 + Account/Cost Center 框架级只读 `read`+`select`，CHG-20260917-E01-001）为 E01 交付终态，保留供 F 包接线（不删除）。
- Account/Cost Center 仅读不可写的越权复测（CHG-20260917-E01-001 评审结论 ④）由 **F02 档位 3 独立验收**覆盖并记录于 `docs/task-packages/F02/acceptance-record.md` §4.3：写 Account 403、写 Cost Center 403、`tabDocPerm` 核实 Account/Cost Center `read=1 select=1 write=0`。本文件 §3 反向控制为 E01 实施期 v1.0 用例（21 DocPerm），v1.1 复测以 F02 验收记录为准。
- 原始证据（命令、HTTP 状态码、脱敏前原始输出）落 `D:\second-acceptance\evidence\`，脱敏引用登记入 `evidence-manifest.md`。
