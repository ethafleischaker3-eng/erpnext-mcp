# F01 通用查询能力

> 文档版本：v1.0；状态：已冻结；Reviewer：gjg；决策人：gjg；冻结日期：2026-09-16。
> 依据《MCP 改造任务包总则》v1.1 与《MCP 改造封闭任务包模板》v1.0 起草；结构参考 E01/E02 task.md。
> 档位：**档位 2（标准，独立验收）**。封存不强制单独进行，终态为「已通过」，封存与下游影响记录并入 P00 总控或直接下游（总则 §7.1）。

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 编号 | F01 |
| 名称 | 通用查询能力 |
| 版本 | v1.0 |
| 状态 | 已冻结 |
| 创建人 | Claude（F01 起草上下文） |
| Owner | gjg |
| Implementer | Claude（F01 独立实施上下文，与 Acceptor 隔离；不得读取 C01b 冻结任务集正文/断言） |
| Implementation Reviewer | gjg（评审输入与实施方案，不得读取 C01b 冻结任务集正文/隐藏断言） |
| Acceptance Reviewer | 不适用（F01 不接触正式验收题、隐藏数据或终态断言；档位 2 独立验收以公开契约口径 + 后端终态/接口实测为准） |
| Acceptor | gjg（档位 2 独立验收，与 Implementer 隔离；不读 C01b 题） |
| 创建日期 | 2026-09-16 |
| 冻结日期 | 2026-09-16 |
| 完成日期 | 不适用 |
| 上游任务包 | D02（已通过，26 tool 契约，§2 为 6 个读 tool 冻结口径）；D01（已通过，公共契约与错误模型）；E01（已封存，权限矩阵/允许清单/正式账号/确认与 fail-closed）；E02（已封存，幂等/前置断言/事后校验/批次台账机制与 #26 查询逻辑）；C01b（已封存，仅版本标识，不读正文/断言）；B01–B04（已封存，接口事实：Bin/SLE/Supplier/单据查询等读相关事实） |
| 下游任务包 | F04（库存与主数据维护，直接下游）；F02（销售与采购业务闭环，经 F04）；G01（完整集成验收） |

> **串行路径**：F01 → F04 → F02（总则 §13 依赖规则；F01 是第一环，只实现读类 tool，为后续 F04/F02 提供查询底座）。
>
> **角色隔离与受题污染（总则 §2.5）**：F01 为档位 2（标准），需独立验收。Implementer（Claude F01 独立实施上下文）依据 D02 §2 / D01 / E01 / E02 实现 6 个读 tool，**不得读取 C01b 冻结任务集**（`D:\second-acceptance\task-sets\`、`assertions\`）的题目正文、初始数据或精确断言——读 tool 的客观口径已由 D02 §2、D01、E01、E02 充分确定，无需读题即可实施。Acceptor（gjg）独立验收时不读 C01b 题（F01 为只读能力，验收以公开契约 + 后端终态/接口实测为准，无需隐藏断言）。Implementation Reviewer 与 Acceptor 由同一自然人 gjg 兼任时，Acceptor 读题后即受题污染、不得参与 F02/F04 实现/评审/调参/定向修复。

## 2. 目标

依据已冻结的 D02 业务 tool 契约（§2 六项读 tool）、D01 公共契约与错误模型，实现并客观验证 MCP server 侧的「通用查询能力」，作为 F04/F02 业务闭环与 G01 集成验收的读底座：

1. **6 个读 tool 落地**：`erpnext_document_search`（#1）、`erpnext_document_get`（#2）、`erpnext_stock_level_query`（#3）、`erpnext_stock_ledger_query`（#4）、`erpnext_supplier_search`（#5）、`erpnext_batch_status_get`（#26）按 D02 §2 逐 tool 冻结口径实现 name / description / 输入输出 schema / annotation / 错误转译 / 批次行为，不增不减、不反向放宽；
2. **E01 白名单层挂接**：6 个读 tool 的 `object_type` / 目标对象 / Link 字段目标硬编码枚举，后端统一经正式账号 `mcp-service` + 角色 `MCP Business Caller`（21 DocPerm 最小权限）调用，切断 Contact/Address/User 框架残余的 agent 触达路径（E01 §18.4 兜底）；
3. **E02 机制挂接**：只读 tool 的幂等/前置（写状态）/事后校验/批次写入如实标注「不适用」及理由；#26 挂接 E02 批次台账查询逻辑与可见性边界；错误转译挂接 E02 统一错误形状；
4. **D02/D01/E01 对齐核对**：逐 tool 与 D02 §2、D01 §1–§7、E01 permission-matrix/allowlist 逐项一致，无清单外对象、无越界读写；
5. **server 骨架与机制迁入**：在仓库根 `server/` 建立 MCP server 骨架（入口/注册表只增不改），迁入 E02 `lib/` 8 模块作为机制底座，6 个读 tool 作为首批业务 tool 接入；E02 原 `lib/` 保留为机制参考不动。

完成后得到：6 个可运行、可查询、错误可自纠、白名单枚举硬编码、批次查询可见性边界正确的读 tool，附对齐核对记录、开发自检记录与 Evidence Manifest。

## 3. 非目标

- 不实现任何写 tool（#6–#24，归 F02 销售与采购闭环 / F04 库存与主数据维护）；
- 不实现 #25 `erpnext_stock_reconciliation_plan`（读+方案、只出 plan，属库存链路，归 F04）；
- 不冻结、不修改任何 tool 契约（D02 已冻结，F01 只实现、不改变业务语义）；
- 不实现权限矩阵、两张允许清单、人工确认、fail-closed 底座本身（E01 已封存，F01 只挂接其白名单层与正式账号）；
- 不实现幂等、前置断言、事后校验、批次台账底座本身（E02 已封存，F01 只挂接其机制接口）；
- 不读取 C01b 冻结任务集正文、初始数据、精确断言或评分细节；
- 不扩大对象、tool 或权限范围，不新增通用 CRUD 或任意代码执行面（`document_search` 的 `object_type` 仅九类枚举，不接受任意 DocType 字符串）；
- 不改变 ERPNext 数据库状态（F01 全读，无写入、无批次、无回滚）；
- 不实际运行 G01 集成验收；本包开发自检为 F01 自身只读能力的客观核查，非 G01 集成验收。

## 4. 前置条件

| 条件 | 验证方式 | 状态 |
|---|---|---|
| D02 v1.0 已通过（`tool-contract.md` §2 冻结 6 个读 tool 口径） | 检查 D02 登记表行、Freeze Manifest | 已验证（2026-09-16） |
| D01 v1.0 已通过（`common-contract.md` 公共契约与错误模型） | 检查 D01 登记表行 | 已验证 |
| E01 v1.0 已封存（permission-matrix/allowlist/roles/confirmation-failclosed + 正式账号 mcp-service） | 检查 E01 登记表行、Freeze Manifest、task.md §18 | 已验证 |
| E02 v1.0 已封存（implementation-contract/lib 机制 + #26 查询逻辑） | 检查 E02 登记表行、Freeze Manifest、task.md §18 | 已验证 |
| C01b v1.0 已封存（冻结任务集，仅版本标识；Implementer 不读正文/断言） | 检查 C01b 登记表行（不读 task-sets/assertions） | 已验证 |
| B01–B04 v1.0 已封存（接口事实：Bin/SLE/Supplier/单据查询等读事实） | 检查 B01–B04 登记表行、Freeze Manifest | 已验证 |
| 《开源后端 Agent 化接入规范》/《PRD》/《总则》v1.1 及治理文档已冻结 | 检查页头与 Freeze Manifest | 已验证 |
| 实施区/验收区实际路径已填写、隔离已生效（Implementer 会话对 `task-sets/`、`assertions/` 只读拒绝） | 负向读取自证 + ACL 核查 | 待实施前验证（冻结后、实施前自证 ACCESS_DENIED） |
| 本地验收环境可读（ERPNext 15.121.2 / Frappe 15.120.1；mcp-service 可读目标对象，只读不写） | 检查 B00/E01 结论与快照重置能力 | 待实施前验证 |
| Owner 已明确、Implementer/Implementation Reviewer/Acceptor 已确定 | 本文件 §1 | 已验证 |

> 任一强制前置不成立，任务不得进入实施中。第 9、10 条为实施前验证（总则 §16.2 精神）：ACL 归 Owner（复用 B00/C01b/E01 隔离），Implementer 会话只做只读负向自证。

## 5. 权威输入

| 优先级 | 名称 | 路径/位置 | 版本或提交标识 |
|---|---|---|---|
| 1 | 开源后端 Agent 化接入规范 | `docs/开源后端Agent化接入规范.md` | 2026-09-07 定稿版 |
| 2 | ERPNext-MCP 改造 PRD | `docs/ERPNext-MCP改造PRD.md` | 2026-09-12-r1 |
| 3 | D02 业务 tool 契约（**F01 直接依据**，§2 六项读 tool 逐 tool 冻结口径） | `docs/task-packages/D02/tool-contract.md` | v1.0 已通过 |
| 4 | D01 公共契约与错误模型（统一基座） | `docs/task-packages/D01/common-contract.md` | v1.0 已通过 |
| 5 | MCP 改造任务包总则 | `docs/MCP改造任务包总则.md` | v1.1（升版 2026-09-15） |
| 6 | E01 权限矩阵 / 两张允许清单 / 正式账号与角色 / 确认与 fail-closed / 越权验证 | `docs/task-packages/E01/permission-matrix.md`、`allowlist.md`、`roles.md`、`confirmation-failclosed.md`、`authorization-verification.md` | v1.0 已封存 |
| 7 | E02 实现契约（幂等/前置/事后/批次台账接口 + #26 查询语义） | `docs/task-packages/E02/implementation-contract.md`（+ `lib/`） | v1.0 已封存 |
| 8 | C01a 对象范围边界名单（12 操作 + 9 引用） | `docs/task-packages/C01a/object-scope.md` | v1.0 已封存 |
| 9 | B01–B04 接口事实记录（读相关：Bin/SLE/Supplier/单据查询） | `docs/task-packages/B01/interface-facts.md`、`B02/`、`B03/`、`B04/` | v1.0 已封存 |
| 10 | C01b 冻结任务集（**仅版本标识**；Implementer 不可读） | `D:\second-acceptance\task-sets\`、`assertions\` | v1.0 已封存 |
| 11 | 治理约束（模板/登记表/边界） | `docs/` | v1.1 / v1.0 已冻结 |

> 与 C01b 的关系：F01 是**实施区**任务，Implementer 只读第 1–9、11 项；第 10 项（C01b 冻结任务集）仅供登记版本标识，**不得进入 Implementer 会话**（总则 §13：C01b 产物不得反馈实施区）。E01 越权/失败路径的公开口径（permission-matrix/allowlist/authorization-verification）已足够确定 F01 的白名单挂接与错误转译，无需读题。

## 6. 授权范围与所有权

### 6.1 可读取范围

- 可读：D02 `tool-contract.md`（§2 六项读 tool）；D01 `common-contract.md`；E01 `permission-matrix.md`/`allowlist.md`/`roles.md`/`confirmation-failclosed.md`/`authorization-verification.md`；E02 `implementation-contract.md` 与 `lib/`（迁入 `server/` 的机制源，原 `lib/` 保留不动）；C01a `object-scope.md`；B01–B04 `interface-facts.md`；PRD 全文；规范全文；`docs/` 治理文档；本包目录 `docs/task-packages/F01/`；
- 可读（自证用）：验收区隐藏目录 `task-sets/`、`assertions/`、`runs/`、`snapshots/` 的隔离哨兵（负向读取须 ACCESS_DENIED）；
- 严禁读：C01b 冻结任务集正文、精确断言、初始数据、评分细节（`task-sets/C01b-v1.0.md`、`assertions/C01b-v1.0.md` 等）。

### 6.2 写入集

| 路径/对象 | 允许动作 | Owner | 是否共享 | 协调规则 |
|---|---|---|---|---|
| `docs/task-packages/F01/` | 新增和维护 F01 task.md、evidence-manifest.md、开发自检与对齐核对记录（脱敏） | gjg | 否 | 状态变化追加记录，不覆盖历史 |
| MCP server 实现代码（`server/` 骨架 + 迁入 E02 `lib/` 8 模块 + 6 个读 tool 模块 + 白名单/错误转译挂接） | 新增/维护（代码落点已裁定：仓库根 `server/`，入口/注册表只增不改） | gjg | 是（与 F04/F02 串行共享） | 串行：F01 建 `server/` 骨架 + 迁入 E02 `lib/` 8 模块 + 6 读 tool 并拥有其所有权；E02 原 `lib/` 保留为机制参考不动；F04/F02 仅在 F01 通过后按串行顺序追加写 tool，只增不改入口/注册表 |
| `docs/任务包登记表.md` 的 F01 行 | 更新 F01 版本、状态、角色、路径与证据位置 | gjg | 是 | 仅更新 F01 行；其他任务行实质变化另走相应任务或变更流程 |
| `docs/task-records/freeze-manifests/F01-v1.0.md` | 冻结时登记 F01 冻结清单与哈希 | gjg | 否 | 哈希针对冻结文件计算，不写回被哈希文件 |
| `docs/task-records/changes/`、`returns/` | 保存 F01 变更或退回记录（如发生） | gjg | 是 | 稳定编号、独立文件 |

> 后端凭据、敏感调用日志与原始证据不入公开实施区；脱敏后引用登记入 Evidence Manifest（总则 §15.1）。

### 6.3 系统、接口、数据与环境权限

| 权限类别 | 允许范围/对象 | 允许动作 | 明确禁止 | 是否可改变状态 | 不适用理由/审批与证据 |
|---|---|---|---|---|---|
| 系统、接口与命令 | 本地 Docker Compose 生命周期；`docker exec` bench 命令；`curl` 后端 REST API（经 mcp-service token）；`mariadb` 只读查询（自检回读核实） | 启动/停止容器、执行只读 bench 命令、调用受限**只读** API、只读数据库查询 | 禁止调用任何业务**写**接口/端点；禁止修改后端源码；禁止 `git push`、历史改写 | 否（仅启动/停止本地容器进程，不改变业务数据终态） | 由本包交付物与证据证明只读 |
| 数据与凭证类型 | mcp-service token（存后端容器 `/tmp/mcp_token.txt`，取值见 `erp/README.md`，本文件不列明） | 读取并使用以只读调用后端 | 不得记录或输出凭据值、完整认证头 | 否 | 仅本地验收环境；证据脱敏 |
| 数据库状态 | 站点库（**只读**） | 读 Bin / Stock Ledger Entry / Supplier / 九类单据主数据及引用对象 | 禁止写入、重置或改变任何业务单据/主数据终态 | **否**（F01 全读，无写入、无批次、无回滚） | 只读口径由交付物与证据证明 |
| 依赖安装 | 不适用（复用 E02 已钉定的 MCP SDK v1.29.0 与既有环境） | 禁止安装或升级依赖 | 禁止改变项目根依赖、`frappe_docker` 或后端运行环境 | 否 | 复用现有环境 |
| 运行环境与配置 | 本地 MCP server 进程 + 后端 Docker 容器与 bench 运行时 | 启动/停止 MCP server 进程；启停后端容器（只读查询用） | 禁止修改 `frappe_docker` 上游工作树或后端站点配置 | 是，仅进程/容器生命周期 | 由证据证明未改动后端 |
| 外部网络与服务 | 不适用 | 禁止外部网络调用 | 禁止外部网络访问与远程可达性探测 | 否 | 后端为本地 `localhost:8080` |

## 7. 禁止事项

- 不得修改上游规范、冻结 PRD、总则、D01/D02 契约、E01/E02 结论或 C01b 冻结任务集；
- 不得实现任何写 tool（#6–#24）或 #25 盘点 plan tool（归 F02/F04）；
- 不得扩大对象、tool 或权限范围；不得新增通用 CRUD 或任意代码执行面；
- 不得绕过 E01 白名单层：6 个读 tool 的 `object_type`/目标对象/Link 字段目标必须硬编码枚举，不接受任意 DocType 字符串或任意字段名（切断 Contact/Address/User 框架残余，E01 §18.4）；
- 不得让 `document_search` 接受 supplier/bin/stock_ledger_entry 为目标对象（供应商专走 #5、库存余量/流水专走 #3/#4）；
- 不得绕过 server 侧确认（F01 无确认，但不得借「只读」之名夹带写）；
- 不得改变 ERPNext 数据库状态；不得让失败路径静默成功；错误不得以成功响应伪装；
- 不得输出密钥、密码、完整认证头、完整堆栈或未授权业务数据；
- 不得让普通调用方读取其他调用方的批次信息（#26 可见性边界）；
- 不得将 C01b 冻结任务集正文、初始数据、精确断言或评分细节反馈给实施区或其他 F 包；
- 读取过 C01b 冻结任务集的人员、会话或执行实例不得参与 F01/F02/F04 实现、评审、调参或定向修复。

## 8. 工作项

| 编号 | 工作项 | 交付物/完成断言 |
|---|---|---|
| W01 | 任务包起草（本文件） | F01 task.md 至待评审，结构完整、Owner 已指定 |
| W02 | 前置与隔离自证：核对 §4 前置；Implementer 会话对 C01b `task-sets/`、`assertions/` 负向读取 ACCESS_DENIED | 隔离自证记录（只读证据），纳入 Evidence Manifest |
| W03 | 实现读 tool 契约层（#1/#2/#3/#4/#5）：name/description/输入输出 schema/annotation/错误转译，忠实 D02 §2.1–§2.5 | 5 个读 tool 的 server 侧实现，逐项对齐 D02 §2 |
| W04 | 实现 #26 `erpnext_batch_status_get`：挂接 E02 `queryBatchStatus`，可见性边界（归属自身会话可查/他人不可见/管理员可查全量/不可主动回滚） | #26 查询逻辑实现，对齐 E02 §6 + D02 §2.6 |
| W05 | 确认并固定 #1 `filters` 可检索字段白名单：从 B01–B04 interface-facts + ERPNext DocType 字段确认逐对象精确清单 | 可检索字段白名单清单（交付物 D03），与 D02 §2.1「仅该对象的可检索字段」口径核对 |
| W06 | 挂接 E01 白名单层：三层拦截第二层（`object_type` 硬编码九类、Link 字段目标枚举、可读字段白名单、#5 Supplier 独占）；后端经 mcp-service + MCP Business Caller 只读调用 | 白名单挂接实现，无清单外对象、无任意 DocType |
| W07 | 挂接 E02 机制：错误转译挂接统一错误形状（isError/code/message/retryable/details）；只读 tool 幂等/前置（写状态）/事后校验/批次写入标注「不适用」及理由 | 机制挂接实现 + 不适用标注，对齐 E02 §7 与 D02 §2 |
| W08 | D02/D01/E01 对齐核对：逐 tool 与 D02 §2、D01 §1–§7、E01 permission-matrix/allowlist 一致，无清单外对象、无越界读写 | 对齐核对记录 |
| W09 | 开发自检（Implementer，非正式验收）+ Evidence Manifest 回填，提交待验收 | 自检记录 + Evidence Manifest |
| W10 | 独立验收（Acceptor gjg，档位 2；Implementer 不自验、不参与） | 独立验收记录（随封存，见 §18） |

> 角色边界：W01–W09 由 Implementer（Claude F01 独立实施上下文）执行；W10 由 Acceptor（gjg）独立执行，Implementer 不自验、不调参、不定向修复。

## 9. 输入输出契约

F01 不定义新契约，6 个读 tool 的契约以 D02 `tool-contract.md` §2.1–§2.6 为权威（不重复、不反向放宽）。本节汇总实现口径与挂接口径。

### 9.1 6 个读 tool 实现契约汇总（忠实 D02 §2）

| tool | 目标对象（操作允许） | 白名单枚举（硬编码） | 错误转译（code） | 幂等/前置/事后/批次「不适用」理由 |
|---|---|---|---|---|
| #1 `erpnext_document_search` | customer、item、item_price、sales_order、purchase_order、purchase_receipt、delivery_note、stock_entry、stock_reconciliation（九类） | `object_type` 仅九类（**排除** supplier/bin/stock_ledger_entry）；`filters` 仅该对象可检索字段；分页/详略参数 | object_type 非法→`invalid_argument`；filters 未知字段→`invalid_argument`；结果集超限→`result_set_overflow`；越权→`permission_denied`；后端不可达→`backend_unavailable` | 幂等不适用（只读天然幂等，readOnly 与 idempotent 分别显式声明）；前置不适用（无写状态断言，schema 校验失败 `invalid_argument` 不计入业务前置）；事后不适用（无写入、无写后回读）；批次不适用（无批次、无回滚） |
| #2 `erpnext_document_get` | 同 #1 九类 | `object_type` 同九类枚举；`object_id` 语义标识由 server 解析 | 目标不存在（404）→`precondition_failed`；object_type 非法→`invalid_argument`；越权→`permission_denied`；后端不可达→`backend_unavailable` | 幂等不适用（只读）；前置不适用（无写状态断言，object_id 不存在按 `precondition_failed` 目标不存在返回）；事后/批次不适用（只读） |
| #3 `erpnext_stock_level_query` | Bin（只读） | 目标 Bin；`item_code` 物料编码语义标识（解析到操作清单 Item）；`warehouse` Link → 引用允许清单 Warehouse；分页/详略 | 引用不存在（LinkValidationError 417）→`precondition_failed`；结果集超限→`result_set_overflow`；越权→`permission_denied`；后端不可达→`backend_unavailable` | 幂等不适用（只读）；前置不适用（无写状态断言，item_code/warehouse 引用不存在 `precondition_failed`）；事后/批次不适用（只读） |
| #4 `erpnext_stock_ledger_query` | Stock Ledger Entry（只读） | 目标 SLE；`item_code` 物料编码语义标识（解析到操作清单 Item）；`warehouse` Link → 引用允许清单 Warehouse；日期区间、分页/详略 | 引用不存在→`precondition_failed`；结果集超限→`result_set_overflow`；越权→`permission_denied`；后端不可达→`backend_unavailable` | 幂等/前置/事后/批次不适用（只读，理由同 #3） |
| #5 `erpnext_supplier_search` | Supplier（只读） | 目标**仅** Supplier；引用 `supplier_group`(Supplier Group)；分页/详略 | supplier_group 引用不存在（417）→`precondition_failed`；结果集超限→`result_set_overflow`；越权→`permission_denied`；后端不可达→`backend_unavailable` | 幂等/前置/事后/批次不适用（只读，理由同 #3） |
| #26 `erpnext_batch_status_get` | 无后端业务对象（server 批次台账元数据） | 无 DocType 目标；`batch_id` 可选；可见性边界硬约束（归属自身会话可查/他人不可见/管理员可查全量/不可主动回滚） | 批次不存在→`batch_not_found`；非归属批次→`permission_denied`（不泄露他人批次参数/涉及单据/回滚信息） | 幂等不适用（只读）；前置不适用（无写状态断言，批次不存在 `batch_not_found`、非归属 `permission_denied`）；事后不适用（无写入）；批次行为=**只读可见性边界**（非写入批次、无 rollback 入口） |

> 所有读 tool 的 annotation 统一为 `readOnly=true`、`destructive=false`、`idempotent=true`、`openWorld=false`（D02 §2 各块第 5 项）。只读声明（readOnly）与幂等声明（idempotent）为两个独立布尔，必须分别显式声明（D01 §3.4）。

### 9.2 E01 白名单层挂接（三层拦截第二层）

1. **对象类型硬编码枚举**：#1/#2 的 `object_type` 仅九类（排除 supplier/bin/stock_ledger_entry）；#3/#4 目标仅 Bin/SLE；#5 目标仅 Supplier；#26 无后端 DocType。不接受任意 DocType 字符串（D01 §7、E01 `allowlist.md` §3.2）。
2. **Link 字段目标硬编码枚举**：仅限引用允许清单九类（Warehouse、Supplier Group 等）；`item_code` 为物料编码语义标识、解析到操作允许清单 Item，不按「引用清单 Link」建模（D01 §7.2）。
3. **后端调用方**：统一经正式账号 `mcp-service` + 角色 `MCP Business Caller`（21 DocPerm 最小权限）只读调用；清单外对象后端无 DocPerm → 原生 403 → 转译 `permission_denied`（E01 `roles.md`/`permission-matrix.md` §3）。
4. **框架残余兜底**：`object_type` 枚举不含 Contact/Address/User，从 MCP tool 层切断 E01 §18.4 记录的框架级残余（User 列表可见、Contact/Address 自建自读）的 agent 触达路径。
5. **对象能力一致性**：只读对象（Bin/SLE）无写 tool、Stock Reconciliation 无写 tool，`document_search`/`document_get` 只读；越能力访问由第三层校验拒绝（E01 `allowlist.md` §3.3）。

### 9.3 E02 机制挂接

1. **#26 查询逻辑**：挂接 E02 `queryBatchStatus(batchLedger, caller, batchId)`——归属自身会话可查、他人批次不可见（`permission_denied`）、管理员（`adminResolver` 钩子，后端 Role/DocPerm 判定，不得 agent 自报）可查全量、不可主动回滚（E02 §6）。沿用 E02 冻结结论：批次归属为**会话级身份**、**内存不落库**（E02 §5.5/B00 身份结论），跨会话普通调用方查询旧批次不支持，如实呈现为残余限制。
2. **错误转译**：挂接 E02 `lib/errors` 统一错误形状（`isError:true` + 稳定语义化 `code` + 可自纠 `message` + `retryable` + 可选 `details`），不裸抛堆栈/后端原生异常名；失败路径不静默成功（D01 §4）。
3. **只读机制「不适用」标注**：6 个读 tool 均无写入、无批次、无回滚，故幂等指纹/窗口期、业务状态前置断言、写后回读（事后校验）、批次写入四项机制**不适用**——只读 tool 天然幂等，readOnly 与 idempotent 分别声明即可，不接 `fingerprintOf`/`createIdempotencyStore`/`assertPreconditions`/`checkReadBack`/`createBatchLedger`（E02 §7 接入点表）。

## 10. 不变量

- 两张允许清单之外的对象不可被操作或引用；引用允许清单对象只可引用、不可经 MCP 增删改（总则 §6.10、D01 §8）；
- 只读 tool 不改变任何数据库状态（无写入、无批次、无回滚）；失败路径不静默成功、错误不以成功响应伪装；
- 后端不可达 → `backend_unavailable`（F01 全读，无写操作自动重试问题，总则 §6.10）；
- 越权一律由后端原生权限拒绝并转译为 `permission_denied` 可自纠报错，不透出堆栈（D01 §4.2）；
- 普通调用方不得读取其他调用方的批次信息；管理员可查全量（#26 可见性边界，D01 §6.4）；
- `document_search`/`document_get` 的 `object_type` 不接受 supplier/bin/stock_ledger_entry（供应商专走 #5、库存余量/流水专走 #3/#4）；
- 对象类型/Link 字段目标硬编码枚举，不接受任意 DocType 字符串或任意字段名（D01 §7、E01 §3.2）；
- 只读声明（readOnly）与幂等声明（idempotent）分别显式声明，不依赖协议默认值（D01 §3.1）；
- 未经上游冻结结论的字段/行为表述不得写入实现（不以推测代替结论）。

## 11. 交付物

| 编号 | 交付物 | 存放位置 | 验收方式 |
|---|---|---|---|
| D01 | F01 任务包 | `docs/task-packages/F01/task.md` | 结构完整、Owner 已指定 |
| D02 | 6 个读 tool 的 server 侧实现（`server/` 骨架 + 迁入 E02 `lib/` 8 模块 + E01 白名单挂接 + E02 机制挂接） | `server/`（仓库根） | 逐 tool 与 D02 §2、D01、E01、E02 一致，可运行、可只读查询 |
| D03 | #1 `filters` 可检索字段白名单清单 | `docs/task-packages/F01/`（脱敏） | 逐对象可复核，与 D02 §2.1 口径核对 |
| D04 | 对齐核对记录 | `docs/task-packages/F01/`（脱敏） | 逐 tool 逐项可复核，无清单外对象 |
| D05 | 开发自检记录 | `docs/task-packages/F01/`（脱敏） | S01–S10 可复核 |
| D06 | Evidence Manifest | `docs/task-packages/F01/evidence-manifest.md` | 逐项可追溯 |
| D07 | 更新后的登记表 | `docs/任务包登记表.md` | F01 行与本文件一致 |
| D08 | 独立验收记录 | `docs/task-packages/F01/`（脱敏，随 §18） | Acceptor gjg 独立验收通过（档位 2） |

## 12. 开发自检

| 编号 | 检查方法 | 预期结果 |
|---|---|---|
| S01 | Implementer 会话负向读取 C01b `task-sets/`、`assertions/` 哨兵 | ACCESS_DENIED（隔离生效） |
| S02 | 6 个读 tool 逐 tool 与 D02 §2 核对（name/schema/annotation/错误码/批次行为） | 逐项一致、无漂移、无反向放宽 |
| S03 | 白名单枚举核对（#1/#2 九类、#5 仅 Supplier、#3/#4 目标 Bin/SLE、#26 无 DocType） | 无清单外对象、无任意 DocType |
| S04 | 只读正确性：#1/#2 查单据主数据、#3 Bin 余量、#4 SLE 流水、#5 Supplier、#26 批次查询 | 返回值语义化、无低层技术标识符、分页/截断正确 |
| S05 | 错误转译核对（invalid_argument/precondition_failed/result_set_overflow/permission_denied/batch_not_found/backend_unavailable） | 可自纠 message + retryable 正确 |
| S06 | 越权拒绝：清单外对象读、引用对象增删改、跨会话批次读 | 全 403 转 `permission_denied` |
| S07 | #26 可见性边界（归属自身会话可查、他人不可见、管理员可查全量、不可主动回滚） | 边界正确、无 rollback 入口 |
| S08 | 幂等/前置（写状态）/事后校验/批次写入「不适用」标注核对 | 无漏标、无夹带写入 |
| S09 | Evidence Manifest 完整性 + 只读口径（未改变数据库状态） | 证据齐全、可追溯 |
| S10 | #1 `filters` 可检索字段白名单与 D02 §2.1 口径、B01–B04 interface-facts 核对 | 无未知字段、无越界字段、逐对象一致 |

> 自检通过不等于正式验收通过（总则 §6.12）；档位 2 独立验收由 Acceptor gjg 完成，Implementer 不自验。

## 13. Evidence Manifest

证据统一维护在 `docs/task-packages/F01/evidence-manifest.md`，本文件不重复记录明细。

## 14. 完成定义

- [ ] 全部前置条件已经验证（含 Implementer 会话隔离自证）；
- [ ] 工作项与交付物全部完成（W01–W10；D01–D08）；
- [ ] 6 个读 tool 与 D02 §2 契约、D01 §1–§7、E01 permission-matrix/allowlist 逐项一致，无清单外对象、无越界读写；
- [ ] 白名单枚举硬编码、E01 白名单层与 E02 机制挂接正确；`#1 filters` 可检索字段白名单清单与 D02 §2.1 口径一致；
- [ ] 只读不变量均有证据（未改变数据库状态、无写入、无批次、无回滚）；
- [ ] 开发自检通过（S01–S10）；
- [ ] Evidence Manifest 完整且能够逐项追溯完成条件；
- [ ] 未修改禁止范围（未读 C01b 冻结任务集、未实现写 tool、未扩大范围）；
- [ ] 剩余限制和风险已记录；
- [ ] 独立验收通过（档位 2，Acceptor gjg 独立于 Implementer）。

## 15. 停止与升级条件

继承《MCP 改造任务包总则》第 6.15 节。本包特有：

- D02/D01/E01/E02 权威输入互相冲突，或 ERPNext 实际行为与 B01–B04 冻结接口事实不一致（停止）；
- 需要新增对象、tool、权限或外部依赖才能完成 6 个读 tool（停止并升级）；
- 必需对象不在允许清单，或无法满足 E01 白名单层强制拦截（清单外对象可被读，停止）；
- 无法从 B01–B04 interface-facts 与 ERPNext DocType 字段确定性取得 #1 `filters` 可检索字段白名单（停止并升级）；
- 需要读取 C01b 冻结任务集正文、断言或隐藏数据才能完成本包（停止，不得读题）；
- 需要改变 D02 契约才能实现（停止并回 D02 走变更控制，不得在 F01 内静默调整）。

报告必须包含阻断事实、影响范围、已完成的安全检查以及需要谁作出什么决定。

## 16. 风险、假设与待决事项

- **受题污染**：单一自然人 gjg 兼任 Owner / Implementation Reviewer / Acceptor；F01 为档位 2 独立验收，Acceptor（gjg）不读 C01b 题（F01 读能力验收以公开契约 + 后端终态/接口实测为准，无需隐藏断言）。Acceptor 若读题即受污染，不得参与 F02/F04 实现/评审/调参/定向修复；
- **已裁定-1（MCP server 实现代码落点，Owner gjg 2026-09-16）**：落点 = 仓库根 `server/`。F01 建骨架 + 迁入 E02 `lib/` 8 模块 + 6 个读 tool；入口/注册表只增不改；F04/F02 串行追加；E02 原 `lib/` 保留为机制参考不动。已写入 §6.2 写入集与 §18 下游影响，不再作为待决；
- **已裁定-2（`#1 filters` 白名单降为工作项，Owner gjg 2026-09-16）**：非冻结前待决，降为工作项 W05——实施时从 B01–B04 interface-facts + ERPNext DocType 字段确认精确清单，作为交付物 D03 并纳入自检 S10（与 D02 §2.1 口径核对）。实施中若无法确定性取得，按 §15 升级；
- **已裁定-3（#26 批次台账沿用 E02 冻结结论，Owner gjg 2026-09-16）**：沿用 E02 冻结结论（会话级内存、不落库、跨会话查旧批次不支持并如实记录），不新增待决；
- **框架级残余兜底**：Contact/Address/User 由 MCP tool 层白名单兜底（E01 §18.4），F01 必须落实 `object_type` 硬编码枚举切断触达路径；若需后端原生拒绝须走框架级变更控制（总则 §12）；
- **只读能力与写能力解耦**：F01 只实现读类 tool 与 `server/` 骨架挂接，不绑定 F04/F02 写 tool 实现；F04/F02 接入时须复用 F01 建立的 `server/` 骨架（入口/注册表只增不改）与白名单层（总则 §16.3）；
- **档位 2 封存口径**：封存不强制单独进行，终态「已通过」，封存与下游影响记录并入 P00 总控或直接下游（总则 §7.1）；若 Owner 决定单独封存（同 E02 先例），再补 §18。

## 17. 评审与状态记录

| 时间 | 原状态 | 新状态 | 操作人 | 依据/说明 |
|---|---|---|---|---|
| 2026-09-16 | 规划中 | 草拟 | Claude（F01 起草上下文） | 依据总则 §5/§13 与登记表 F01 行，创建完整任务包文件并指定 Owner gjg；档位 2（标准）实施包，只做 6 个读 tool（#1/#2/#3/#4/#5/#26）；上游 D02/D01/E01/E02/C01b（仅版本标识）/B01–B04 均已通过/封存；待 gjg 评审冻结 |
| 2026-09-16 | 草拟 | 待评审 | Claude（F01 起草上下文） | 必备结构完整，提交 gjg 评审 |
| 2026-09-16 | 待评审 | 待评审 | gjg（Owner） | 待决项裁定（非状态变更）：① 代码落点=仓库根 `server/`（建骨架 + 迁入 E02 `lib/` 8 模块 + 6 读 tool；入口/注册表只增不改，F04/F02 串行追加，E02 原 `lib/` 保留不动）；② `filters` 白名单降为工作项 W05（交付物 D03、自检 S10）；③ #26 沿用 E02 冻结结论（会话级内存、不落库、跨会话查旧批次不支持如实记录）。已回填 §2/§6.1/§6.2/§8/§9.3/§11/§12/§14/§15/§16/§18 |
| 2026-09-16 | 待评审 | 已冻结 | gjg（Owner） | 评审通过，无阻断问题；批准 F01 v1.0 冻结。评审中已修正三项：① §9.2.2/§9.1 #3/#4 将 `Item` 从引用允许清单示例移除，`item_code` 明确为物料编码语义标识、解析到操作允许清单 Item（不按引用清单 Link 建模）；② 全文统一「#1 `filters` 可检索字段白名单」（原「#1/#2 filters」，#2 无 `filters` 参数）；③ §5 权威输入第 6 项补列 `authorization-verification.md`。尚未实施或验收 |

## 18. 封存记录与下游影响（预留）

> 本节在档位 2 独立验收通过后回填（若 Owner 决定单独封存，同 E02 §18；否则封存与下游影响记录并入 P00 总控或直接下游 F04）。预填下游影响口径：F01 封存后为 F04（直接下游）与 F02 提供 `server/` 骨架（含迁入的 E02 `lib/` 8 模块）、6 个读 tool 与白名单层；F04/F02 须复用 F01 的 `server/` 骨架（入口/注册表只增不改、串行追加写 tool），并以 mcp-service 为后端调用方（总则 §16.3 写操作门槛）；E02 原 `lib/` 保留为机制参考不动。
