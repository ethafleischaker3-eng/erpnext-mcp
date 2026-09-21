# F04 库存与主数据维护

> 文档版本：v1.0；状态：已封存；Reviewer：gjg；决策人：gjg；冻结日期：2026-09-17。
> 依据《MCP 改造任务包总则》v1.1 与《MCP 改造封闭任务包模板》v1.0 起草；结构参考 F01 task.md（已通过 v1.0）。
> 档位：**档位 3（完整）**。强制环节：冻结 → 实施 → 独立验收 → 封存 + 下游影响记录 + Freeze Manifest（总则 §7.1）。

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 编号 | F04 |
| 名称 | 库存与主数据维护 |
| 版本 | v1.0 |
| 状态 | 已封存 |
| 创建人 | Claude（F04 起草上下文） |
| Owner | gjg |
| Implementer | Claude（F04 独立实施上下文，与 Acceptor 隔离；不得读取 C01b 冻结任务集正文/断言） |
| Implementation Reviewer | gjg（评审输入与实施方案，不得读取 C01b 冻结任务集正文/隐藏断言） |
| Acceptance Reviewer | 不适用（F04 为实施任务；正式验收由 G01 集成验收承担。档位 3 独立验收由 Acceptor gjg 以公开契约口径 + 后端终态/接口实测为准，不读 C01b 隐藏断言） |
| Acceptor | gjg（档位 3 独立验收，与 Implementer 隔离；不读 C01b 题，以公开契约 + 后端终态/接口实测验收） |
| 创建日期 | 2026-09-17 |
| 冻结日期 | 2026-09-17 |
| 完成日期 | 2026-09-17 |
| 上游任务包 | F01（已通过 v1.0，直接上游：`server/` 骨架 + 迁入 E02 `lib/` 8 模块 + 6 读 tool + 白名单层）；D02（已通过 v1.0，26 tool 契约，§3 为 #6–#12、§6 为 #23–#25 冻结口径）；D01（已通过 v1.0，公共契约与错误模型）；E01（已封存 v1.0，权限矩阵/允许清单/正式账号/确认与 fail-closed）；E02（已封存 v1.0，幂等/前置断言/事后校验/批次台账机制 + #26 查询逻辑 + `lib/` 8 模块）；C01b（已封存 v1.0，仅版本标识，不读正文/断言）；C01a（已封存 v1.0，object-scope 名单）；B01（已封存 v1.0，主数据接口事实）；B04（已封存 v1.0，库存接口事实） |
| 下游任务包 | F02（销售与采购业务闭环，直接下游）；G01（完整集成验收） |

> **串行路径**：F01 → F04 → F02（总则 §13 依赖规则）。F01 是第一环（6 读 tool + `server/` 骨架），F04 是第二环（#6–#12 主数据 + #23–#25 库存，共 10 个写/只出 plan tool），F02 是第三环（#13–#22 销售与采购写 tool）。F04 复用 F01 建立的 `server/` 骨架（入口/注册表只增不改）与白名单层，后端统一经 mcp-service + MCP Business Caller 受控调用。
>
> **角色隔离与受题污染（总则 §2.5）**：F04 为档位 3（完整），需独立验收。Implementer（Claude F04 独立实施上下文）依据 D02 §3/§6 / D01 / E01 / E02 / F01 实现 10 个写/只出 plan tool，**不得读取 C01b 冻结任务集**（`D:\second-acceptance\task-sets\`、`assertions\`）的题目正文、初始数据或精确断言——写 tool 的客观口径已由 D02 §3/§6、D01、E01、E02 充分确定，无需读题即可实施。Acceptor（gjg）独立验收时不读 C01b 题（F04 验收以公开契约 + 后端终态/接口实测为准，无需隐藏断言；正式隐藏断言验收由 G01 承担）。任何读取过 C01b 冻结任务集正文/断言的主体，不得参与 F04/F02 实现、实施方案评审、调参或定向修复。

## 2. 目标

依据已冻结的 D02 业务 tool 契约（§3 主数据 #6–#12 七项 + §6 库存 #23–#25 三项）、D01 公共契约与错误模型，实现并客观验证 MCP server 侧的「库存与主数据维护」写能力，作为 F02 销售/采购闭环与 G01 集成验收的写底座：

1. **10 个写/只出 plan tool 落地**：`erpnext_customer_create`（#6）、`erpnext_customer_update`（#7）、`erpnext_supplier_create`（#8）、`erpnext_supplier_update`（#9）、`erpnext_item_create`（#10）、`erpnext_item_update`（#11）、`erpnext_item_price_set`（#12）、`erpnext_stock_transfer_create`（#23）、`erpnext_stock_transfer_confirm`（#24）、`erpnext_stock_reconciliation_plan`（#25）按 D02 §3/§6 逐 tool 冻结口径实现 name / description / 输入输出 schema / annotation / 错误转译 / 幂等边界 / 前置断言 / 事后校验 / 批次行为，不增不减、不反向放宽；
2. **E01 确认与白名单层挂接**：人确认档 8 个 tool（#6–#12、#24）挂接 server 侧确认（elicitation，未经有效确认不得写入）；全自动档 #23 免确认；只出 plan #25 无写入；三层拦截白名单（`object_type`/目标对象/Link 字段目标/可写字段硬编码枚举）；后端统一经正式账号 `mcp-service` + 角色 `MCP Business Caller`（21 DocPerm 最小权限）受控写调用；
3. **E02 机制挂接**：create 组（#6/#8/#10/#23）与指纹合并类（#7/#9/#11/#12）挂接 300s 幂等指纹合并；confirm 组（#24）挂接 60s 状态断言兜底；逐 tool 前置断言、写后回读（事后校验）、批次台账与回滚路径挂接；
4. **后端写调用落地与 fail-closed**：#24 经 `frappe.client.submit`（全量 doc）生效（B04 F3）；币种/价格表 fail-closed（PRD 决议 2）；后端不可达不自动重试写；版本断言与写入同事务；
5. **D02/D01/E01/E02 对齐核对**：逐 tool 与 D02 §3/§6、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract 逐项一致，无清单外对象、无越界读写、无绕过确认/幂等/回读/台账。

完成后得到：10 个可运行、写前确认（人确认档）、写后回读、幂等正确、批次可追溯、错误可自纠的写/只出 plan tool，附可写字段白名单、对齐核对记录、开发自检记录与 Evidence Manifest。

## 3. 非目标

- 不实现 #13–#22（销售与采购业务闭环 10 个 tool，归 F02）；
- 不实现 #1–#5、#26 读 tool（F01 已实现并已通过，F04 只复用其 `server/` 骨架与白名单层，不改其实现）；
- 不冻结、不修改任何 tool 契约（D02 已冻结，F04 只实现、不改变业务语义）；
- 不实现权限矩阵、两张允许清单、人工确认、fail-closed 底座本身（E01 已封存，F04 只挂接其确认/白名单/正式账号）；
- 不实现幂等、前置断言、事后校验、批次台账底座本身（E02 已封存，F04 只挂接其机制接口与 `lib/` 8 模块）；
- 不实现盘点提交能力：`stock_reconciliation_plan`（#25）只出 plan、不写 Stock Reconciliation 单据、不覆盖库存基线（D02 §6.3；估值率/opening-entry 门槛 B04 F7/F8 属 G01 或后续盘点提交范围，非本包写入）；
- 不读取 C01b 冻结任务集正文、初始数据、精确断言或评分细节；
- 不扩大对象、tool 或权限范围，不新增通用 CRUD 或任意代码执行面（目标对象/`object_type`/Link 字段目标/可写字段均为硬编码枚举）；
- 不提供收货/发货/调拨的 cancel tool（PRD 已决议 #8，异常回滚归管理员运维）；不承诺删除已生效/已取消的调拨/盘点单据（B04 F10）；
- 不实际运行 G01 集成验收；本包开发自检为 F04 自身写能力的客观核查，非 G01 集成验收。

## 4. 前置条件

| 条件 | 验证方式 | 状态 |
|---|---|---|
| F01 v1.0 已通过（直接上游：`server/` 骨架 + 迁入 E02 `lib/` 8 模块 + 6 读 tool + 白名单层） | 检查 F01 登记表行、task.md §17/§18 | 已验证（2026-09-16，F01 档位 2 独立验收通过，终态「已通过」） |
| D02 v1.0 已通过（`tool-contract.md` §3 冻结 #6–#12、§6 冻结 #23–#25 共 10 个 tool 口径） | 检查 D02 登记表行、Freeze Manifest | 已验证（2026-09-16） |
| D01 v1.0 已通过（`common-contract.md` 公共契约与错误模型） | 检查 D01 登记表行 | 已验证 |
| E01 v1.0 已封存（permission-matrix/allowlist/roles/confirmation-failclosed/authorization-verification + 正式账号 mcp-service + 角色 MCP Business Caller） | 检查 E01 登记表行、Freeze Manifest、task.md §18 | 已验证 |
| E02 v1.0 已封存（implementation-contract/lib 8 模块机制 + #26 查询逻辑） | 检查 E02 登记表行、Freeze Manifest、task.md §18 | 已验证 |
| C01b v1.0 已封存（冻结任务集，仅版本标识；Implementer 不读正文/断言） | 检查 C01b 登记表行（不读 task-sets/assertions） | 已验证 |
| C01a v1.0 已封存（object-scope 名单） | 检查 C01a 登记表行 | 已验证 |
| B01 v1.0 已封存（主数据接口事实：#6–#12 的重名/版本/区间/级联删除） | 检查 B01 登记表行、Freeze Manifest | 已验证 |
| B04 v1.0 已封存（库存接口事实：#23–#25 的 submit 端点/库存校验时机/覆盖基线） | 检查 B04 登记表行、Freeze Manifest | 已验证 |
| 《开源后端 Agent 化接入规范》/《PRD》/《总则》v1.1 及治理文档已冻结 | 检查页头与 Freeze Manifest | 已验证 |
| 实施区/验收区实际路径已填写、隔离已生效（Implementer 会话对 `task-sets/`、`assertions/` 只读拒绝） | 负向读取自证 + ACL 核查 | 待实施前复证（复用 F01 的 verify-impl 自证方式） |
| 本地验收环境可写（ERPNext 15.121.2 / Frappe 15.120.1；mcp-service 可写目标对象；快照重置可用） | 检查 B00/B01/B04/E01 结论与快照重置能力 | 已验证（后端 localhost:8080；mcp-service + MCP Business Caller 已由 E01 落地；`restore-snapshot.sh` 快照重置可用） |
| Owner 已明确、Implementer/Implementation Reviewer/Acceptor 已确定 | 本文件 §1 | 已验证 |

> 任一强制前置不成立，任务不得进入实施中。第 11、12 条为实施前验证（总则 §16.2/§16.3 精神）：ACL 归 Owner（复用 B00/C01b/E01/F01 隔离），Implementer 会话只做只读负向自证。
>
> **登记表上游依赖修正（已裁定，Owner gjg 2026-09-17）**：登记表 F04 行「上游依赖」已补入 F01（v1.0，直接上游，复用 `server/` 骨架 + 白名单层），与本文件 §1/§5 一致（见 §16 已裁定-1）。

## 5. 权威输入

| 优先级 | 名称 | 路径/位置 | 版本或提交标识 |
|---|---|---|---|
| 1 | 开源后端 Agent 化接入规范 | `docs/governance/开源后端Agent化接入规范.md` | 2026-09-07 定稿版 |
| 2 | ERPNext-MCP 改造 PRD | `docs/governance/ERPNext-MCP改造PRD.md` | 2026-09-12-r1 |
| 3 | D02 业务 tool 契约（**F04 直接依据**，§3 主数据 #6–#12、§6 库存 #23–#25 逐 tool 冻结口径） | `docs/task-packages/D02/tool-contract.md` | v1.0 已通过 |
| 4 | D01 公共契约与错误模型（统一基座） | `docs/task-packages/D01/common-contract.md` | v1.0 已通过 |
| 5 | MCP 改造任务包总则 | `docs/governance/MCP改造任务包总则.md` | v1.1（升版 2026-09-15） |
| 6 | E01 权限矩阵 / 两张允许清单 / 正式账号与角色 / 确认与 fail-closed / 越权验证 | `docs/task-packages/E01/permission-matrix.md`、`allowlist.md`、`roles.md`、`confirmation-failclosed.md`、`authorization-verification.md` | v1.0 已封存 |
| 7 | E02 实现契约（幂等/前置/事后/批次台账接口 + #26 查询语义） | `docs/task-packages/E02/implementation-contract.md`（+ `lib/` 8 模块） | v1.0 已封存 |
| 8 | F01 任务包与 `server/` 骨架（直接上游，复用骨架/白名单层/机制迁入） | `docs/task-packages/F01/task.md`、`server/`（仓库根） | v1.0 已通过 |
| 9 | C01a 对象范围边界名单（12 操作 + 9 引用） | `docs/task-packages/C01a/object-scope.md` | v1.0 已封存 |
| 10 | B01 主数据接口事实（#6–#12）、B04 库存接口事实（#23–#25） | `docs/task-packages/B01/interface-facts.md`、`docs/task-packages/B04/interface-facts.md` | v1.0 已封存 |
| 11 | C01b 冻结任务集（**仅版本标识**；Implementer 不可读） | `D:\second-acceptance\task-sets\`、`assertions\` | v1.0 已封存 |
| 12 | 治理约束（模板/登记表/边界） | `docs/` | v1.1 / v1.0 已冻结 |

> 与 C01b 的关系：F04 是**实施区**任务，Implementer 只读第 1–10、12 项；第 11 项（C01b 冻结任务集）仅供登记版本标识，**不得进入 Implementer 会话**（总则 §13：C01b 产物不得反馈实施区）。E01 越权/失败路径公开口径（permission-matrix/allowlist/confirmation-failclosed/authorization-verification）与 E02 机制接口已足够确定 F04 的确认/白名单/幂等/前置/事后/批次挂接，无需读题。

## 6. 授权范围与所有权

### 6.1 可读取范围

- 可读：D02 `tool-contract.md`（§3 #6–#12、§6 #23–#25）；D01 `common-contract.md`；E01 `permission-matrix.md`/`allowlist.md`/`roles.md`/`confirmation-failclosed.md`/`authorization-verification.md`；E02 `implementation-contract.md` 与 `lib/`；F01 `task.md` 与 `server/`（复用骨架，含 `src/tools/common.js`、`allowlist.js`、`backend.js`、`config.js`、`translate.js`、`registry.js`、`index.js`）；C01a `object-scope.md`；B01/B04 `interface-facts.md`；PRD 全文；规范全文；`docs/` 治理文档；本包目录 `docs/task-packages/F04/`；
- 可读（自证用）：验收区隐藏目录 `task-sets/`、`assertions/`、`runs/`、`snapshots/` 的隔离哨兵（负向读取须 ACCESS_DENIED）；
- 严禁读：C01b 冻结任务集正文、精确断言、初始数据、评分细节（`task-sets/C01b-v1.0.md`、`assertions/C01b-v1.0.md` 等）。

### 6.2 写入集

| 路径/对象 | 允许动作 | Owner | 是否共享 | 协调规则 |
|---|---|---|---|---|
| `docs/task-packages/F04/` | 新增和维护 F04 task.md、evidence-manifest.md、可写字段白名单、对齐核对记录、开发自检与独立验收记录（脱敏） | gjg | 否 | 状态变化追加记录，不覆盖历史 |
| MCP server 实现代码（`server/` 追加 10 个写/只出 plan tool 模块 + 注册表尾部新增 + 后端写端点/确认/fail-closed 增量扩展） | 新增/维护（复用 F01 `server/` 骨架；入口/注册表只增不改；既有 6 读 tool 与迁入 E02 `lib/` 8 模块不改） | gjg | 是（与 F01/F02 串行共享） | 串行：F01 已建 `server/` 骨架并拥有 6 读 tool 所有权；F04 在 `src/tools/` 尾部新增 10 个写 tool 模块、`registry.js` `TOOL_MODULES` 尾部新增条目，扩展 `backend.js`（写端点 POST/PUT + `frappe.client.submit`（confirm #24））、`index.js`（elicitation 确认处理）、`config.js`（币种/价格表 fail-closed 集中配置）、`allowlist.js`（写对象枚举与可写字段）——均为增量，不改既有条目/处理器；F02 仅在 F04 通过后按串行顺序追加 #13–#22 |
| `docs/governance/任务包登记表.md` 的 F04 行 | 更新 F04 版本、状态、角色、路径与证据位置，并**补列 F01 为上游依赖** | gjg | 是 | 仅更新 F04 行；其他任务行实质变化另走相应任务或变更流程 |
| `docs/task-records/freeze-manifests/F04-v1.0.md` | 冻结时登记 F04 冻结清单与哈希（档位 3 强制） | gjg | 否 | 哈希针对冻结文件计算，不写回被哈希文件 |
| `docs/task-records/changes/`、`returns/` | 保存 F04 变更或退回记录（如发生） | gjg | 是 | 稳定编号、独立文件 |

> 后端凭据、敏感调用日志与原始证据不入公开实施区；脱敏后引用登记入 Evidence Manifest（总则 §15.1）。

### 6.3 系统、接口、数据与环境权限

| 权限类别 | 允许范围/对象 | 允许动作 | 明确禁止 | 是否可改变状态 | 不适用理由/审批与证据 |
|---|---|---|---|---|---|
| 系统、接口与命令 | 本地 Docker Compose 生命周期；`docker exec` bench 命令；`curl` 后端 REST API（经 mcp-service token）；`mariadb` 查询（自检回读核实）；快照重置 `restore-snapshot.sh` | 启动/停止容器、执行 bench 命令、调用受限**写** API（POST/PUT `/api/resource/{doctype}`、`/api/method/frappe.client.submit`）、只读数据库查询、快照恢复 | 禁止调用清单外对象写接口；禁止修改后端源码；禁止 `git push`、历史改写 | **是**（仅本地验收环境；写操作经确认/幂等/前置/事后/批次机制 + 事后回读，证据可复核；测试后快照恢复归零） | 由本包交付物与证据证明写操作受控且零残留 |
| 数据与凭证类型 | mcp-service token（存后端容器 `/tmp/mcp_token.txt`，取值见 `erp/README.md`，本文件不列明） | 读取并使用以受控写/读调用后端 | 不得记录或输出凭据值、完整认证头 | 是（经 mcp-service 受控写） | 仅本地验收环境；证据脱敏 |
| 数据库状态 | 站点库（**受控写**） | 经 mcp-service + MCP Business Caller 对 Customer/Supplier/Item/Item Price/Stock Entry 执行冻结契约内的写动作；测试后快照恢复 | 禁止写清单外对象、引用对象增删改、只读对象写；禁止绕过确认/幂等/前置/事后/批次直接写 | **是**（测试期间可改变，终态以快照恢复归零） | 写口径由交付物与证据证明 |
| 依赖安装 | 不适用（复用 F01 已钉定的零外部依赖 Node 实现与既有环境） | 禁止安装或升级依赖 | 禁止改变项目根依赖、`frappe_docker` 或后端运行环境 | 否 | 复用现有环境 |
| 运行环境与配置 | 本地 MCP server 进程 + 后端 Docker 容器与 bench 运行时 | 启动/停止 MCP server 进程；启停后端容器（写调用用） | 禁止修改 `frappe_docker` 上游工作树或后端站点配置 | 是，仅进程/容器生命周期 | 由证据证明未改动后端 |
| 外部网络与服务 | 不适用 | 禁止外部网络调用 | 禁止外部网络访问与远程可达性探测 | 否 | 后端为本地 `localhost:8080` |

## 7. 禁止事项

- 不得修改上游规范、冻结 PRD、总则、D01/D02 契约、E01/E02 结论、F01 已通过实现或 C01b 冻结任务集；
- 不得实现 #13–#22（销售/采购，归 F02）或 #1–#5/#26（读 tool，F01 已实现）；不得改动 F01 既有 `server/` 骨架的 6 读 tool 模块、`registry.js` 既有条目或迁入的 E02 `lib/` 8 模块（入口/注册表只增不改）；
- 不得扩大对象、tool 或权限范围；不得新增通用 CRUD 或任意代码执行面；目标对象/`object_type`/Link 字段目标/可写字段必须硬编码枚举，不接受任意 DocType 字符串或任意字段名；
- 不得绕过 E01 确认层：人确认档 8 个 tool（#6–#12、#24）未经有效 server 侧确认（elicitation）不得写入；客户端不支持 `elicitation` 时 fail-closed（零写入），不得降级为直接执行（PRD 决议 1）；
- 不得绕过 E02 机制：写 tool 必须挂接幂等指纹/窗口期（create 300s / confirm 60s）、前置断言、写后回读（事后校验）、批次台账；后端不可达不得自动重试写操作；
- 不得让失败路径静默成功；错误不得以成功响应伪装；人确认拒绝/取消/客户端不支持必须零副作用；
- 不得承诺删除已生效/已取消的调拨/盘点单据（B04 F10，GL/SLE 持久化不可物理删除）；不得提供收货/发货/调拨 cancel tool（异常回滚归管理员运维，PRD 已决议 #8）；
- 不得将 `stock_reconciliation_plan`（#25）写成实际写入 Stock Reconciliation 单据或覆盖库存基线（只出 plan，D02 §6.3）；
- 不得输出密钥、密码、完整认证头、完整堆栈或未授权业务数据；不得保存不必要的敏感字段前镜像（PRD §5.4 前镜像最小化）；
- 不得让普通调用方读取其他调用方的批次信息（#26 可见性边界）；
- 不得将 C01b 冻结任务集正文、初始数据、精确断言或评分细节反馈给实施区或其他 F 包；
- 读取过 C01b 冻结任务集的人员、会话或执行实例不得参与 F04/F02 实现、评审、调参或定向修复。

## 8. 工作项

| 编号 | 工作项 | 交付物/完成断言 |
|---|---|---|
| W01 | 任务包起草（本文件） | F04 task.md 至待评审，结构完整、Owner 已指定 |
| W02 | 前置与隔离自证：核对 §4 前置；复核 F01 `server/` 骨架可复用（入口/注册表只增不改）；mcp-service 写权限与快照重置可用；Implementer 会话对 C01b `task-sets/`、`assertions/` 负向读取 ACCESS_DENIED | 隔离自证记录（只读证据），纳入 Evidence Manifest |
| W03 | 实现主数据 tool 契约层（#6/#7/#8/#9/#10/#11/#12）：name/description/输入输出 schema/annotation/错误转译/幂等边界/前置断言/事后回读/批次行为，忠实 D02 §3.1–§3.7 | 7 个主数据 tool 的 server 侧实现，逐项对齐 D02 §3 |
| W04 | 实现库存 tool 契约层（#23/#24/#25）：name/description/schema/annotation/错误转译/幂等/前置/事后/批次，忠实 D02 §6.1–§6.3（#24 经 `frappe.client.submit` 全量 doc；#25 只出 plan 不写） | 3 个库存 tool 的 server 侧实现，逐项对齐 D02 §6 |
| W05 | 确认并固定逐 tool 可写字段白名单：从 B01/B04 interface-facts + ERPNext DocType 字段确认主数据 7 tool 与调拨 create 的逐对象可写字段精确清单（含不可改字段 name/creation/owner/docstatus 与不可改边界） | 可写字段白名单清单（交付物 D03），与 D02 §3/§6 逐 tool 口径核对 |
| W06 | 挂接 E01 确认/白名单/权限层：人确认档 8 tool 挂接 server 侧确认（elicitation，accept→写入 / decline·cancel→零副作用 / 客户端不支持→fail-closed）；全自动 #23 免确认；只出 plan #25 无写入；三层拦截第二层（目标对象/Link 字段目标/可写字段硬编码枚举）；后端经 mcp-service + MCP Business Caller 受控写 | 确认与白名单挂接实现，无清单外对象、无绕过确认 |
| W07 | 挂接 E02 幂等/前置/事后/批次 + 后端写调用落地：create 组 300s 指纹合并、指纹合并类 300s、confirm 组 60s 状态断言；逐 tool 前置断言（含 #12 区间不重叠、#23 源仓可用量、#24 源/目不同 server 自建校验）；写后回读终态；批次台账与回滚路径（草稿删除/前镜像恢复/不可回滚标注）；fail-closed（币种/价格表、后端不可达不自动重试） | 机制挂接 + 后端写调用落地，对齐 E02 §7 + D02 §3/§6 + E01 confirmation-failclosed |
| W08 | D02/D01/E01/E02 对齐核对：逐 tool 与 D02 §3/§6、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract 一致，无清单外对象、无越界读写、无机制绕过 | 对齐核对记录 |
| W09 | 开发自检（Implementer，非正式验收）+ Evidence Manifest 回填，提交待验收 | 自检记录 + Evidence Manifest |
| W10 | 独立验收（Acceptor gjg，档位 3；Implementer 不自验、不参与、不调参、不定向修复）+ 封存与下游影响记录 | 独立验收记录 + 封存记录（§18） |

> 角色边界：W01–W09 由 Implementer（Claude F04 独立实施上下文）执行；W10 由 Acceptor（gjg）独立执行，Implementer 不自验、不调参、不定向修复。F02 启动前 F04 须已通过并封存（档位 3，总则 §16.3 写操作门槛）。

## 9. 输入输出契约

F04 不定义新契约，10 个 tool 的契约以 D02 `tool-contract.md` §3.1–§3.7、§6.1–§6.3 为权威（不重复、不反向放宽）。本节汇总实现口径与挂接口径。

### 9.1 10 个 tool 实现契约汇总（忠实 D02 §3/§6）

图例：▲=写 / ◐=只出 plan（读现状+方案，不写）。幂等窗口期：create 组与指纹合并类 300s、confirm 组 60s（D02 §7、B05 §18.3）。

| tool | 目标对象（操作允许） | 档位/确认 | 幂等（组/窗口期） | 前置断言（业务状态，schema 校验不计入） | 事后回读终态 | 批次/回滚路径 |
|---|---|---|---|---|---|---|
| #6 `erpnext_customer_create` | Customer ▲ | 人确认 | create 组 300s 指纹合并 | 同名 `customer_name` 不存在（server 先查，B01 F1 后端不拒重名）；`customer_group` 有效且非 `is_group=1` 分组节点；`territory` 有效（若提供） | 回读新客户语义标识 + 关键字段 | 同批=新客户；未被引用才删除，被引用转管理员处置 |
| #7 `erpnext_customer_update` | Customer ▲ | 人确认 | 指纹合并 300s | 目标存在且启用；预期 `modified` 一致；名称唯一性、分类字段有效、`name`/`creation`/`owner` 不可改；版本断言与写入同事务 | 回读变更后关键字段 | 同批=本次 update；前镜像 + 当前版本仍=写后版本才恢复 |
| #8 `erpnext_supplier_create` | Supplier ▲ | 人确认 | create 组 300s 指纹合并 | 同名 `supplier_name` 不存在（server 先查）；`supplier_group` 有效 | 回读新供应商语义标识 + 关键字段 | 同批=新供应商；未引用删除、被引用转管理员 |
| #9 `erpnext_supplier_update` | Supplier ▲ | 人确认 | 指纹合并 300s | 目标存在且启用；预期 `modified` 一致；名称唯一性、分类有效、不可改字段受限；版本断言与写入同事务 | 回读变更后字段 | 同批=本次 update；前镜像 + 版本一致恢复 |
| #10 `erpnext_item_create` | Item ▲ | 人确认 | create 组 300s 指纹合并 | 同名 `item_code` 不存在（B01 F1 后端拒重名 409）；`item_group` 有效；`stock_uom` 有效 | 回读新物料（含自动默认仓/计量单位） | 同批=新物料；未引用删除；**Item 被 Item Price 引用时删除不拒、级联删 Item Price（B01 F4），server 删除须自建引用前置检查** |
| #11 `erpnext_item_update` | Item ▲ | 人确认 | 指纹合并 300s | 目标存在且启用；预期 `modified` 一致；名称唯一性、分类有效、`docstatus` 不得被 update 改写（B01 F5）；版本断言与写入同事务 | 回读变更后字段 | 同批=本次 update；前镜像 + 版本一致恢复 |
| #12 `erpnext_item_price_set` | Item Price ▲ | 人确认 | 指纹合并 300s | 目标物料存在且启用；修改既有价时预期 `modified` 一致；**生效区间不与既有区间重叠（B01 F3 后端不校验，server 自建）**；版本与区间校验与写入同事务 | 回读价格（物料 + 价目表 + 生效区间） | 同批=价格新增/修改；新增价删除、修改/覆盖价前镜像恢复 |
| #23 `erpnext_stock_transfer_create` | Stock Entry ▲ | 全自动（免确认） | create 组 300s 指纹合并 | `stock_entry_type`=material_transfer（B04 F9 后端不强制，server 校验）；`items` 非空、数量>0；**源仓各物料可用量 ≥ 调拨量（B04 F5 草稿不校验，server 前置）**；源/目标仓存在 | 回读调拨草稿（源/目仓 + 行项目 + 草稿态） | 同批=调拨草稿；草稿 → 删除（B04 §4） |
| #24 `erpnext_stock_transfer_confirm` | Stock Entry ▲ | 人确认 | confirm 组 60s 状态断言兜底 | 目标仍为草稿且预期 `modified` 一致；**源/目标仓仍有效且不同（B04 F5 同仓 confirm 不拒，server 前置）**；**源仓可用库存仍满足调拨量（B04 F5 confirm 才校验，server 前置）**；版本断言与提交同事务；经 `frappe.client.submit` 全量 doc（B04 F3） | 回读生效调拨（docstatus=1、SLE 源减目增、不写 GL，B04 F6） | 同批=本次调拨（SLE/Bin 变动）；已生效 → 管理员运维异常回滚（无 cancel tool）；**不承诺删除已生效 STE（B04 F10）** |
| #25 `erpnext_stock_reconciliation_plan` | Bin / Stock Ledger Entry ◐ | 只出 plan（无写入） | 不适用（只读+方案） | 无写状态断言；`warehouse` 有效；物料存在（读现状用 `get_items` as-of-time 或 Bin/SLE，B04 F11） | 不适用（无写入） | 不适用（无批次、无回滚）；不写 Stock Reconciliation 单据、不覆盖库存基线 |

> **幂等实现口径（E02 §1/§2、D02 §7）**：#6/#8/#10/#23 走 create 组指纹合并（300s）；#7/#9/#11/#12 走指纹合并类（300s，无状态断言、与 create 同机制）；#24 走 confirm 组状态断言兜底（60s，命中「已在目标状态」返回 `idempotent_replay:true` + `already_in_target_state:true` 幂等成功，非通用错误）。传输/客户端字段一律不进指纹；业务引用号进/不进指纹由 D02 逐 tool 冻结（D02 §3/§6 未启用业务引用号增强，如实实施）。
>
> **乐观版本断言（D01 §6.3、D02 §0 第 4 条）**：#7/#9/#11/#12（修改既有价时）/ #24 必带 `modified`；#6/#8/#10/#12（新增价）/ #23 新建对象不携带 `modified`（并发保护由幂等指纹承担）。
>
> **回滚路径（PRD §5.4、D02 §3/§6 第 9 项）**：主数据 create 未引用删除/被引用转管理员；update/价格修改前镜像 + 版本一致才恢复；调拨草稿删除；已生效调拨无 cancel tool，走管理员运维异常回滚，不承诺物理删除。

### 9.2 E01 确认/白名单/权限挂接

1. **server 侧确认（elicitation，人确认档 8 tool）**：挂接 E01 `confirmation-failclosed.md` §1.2——确认由 server 在处理 `tools/call` 期间主动发起 `elicitation/create`；展示完整 tool 参数；`accept`→继续写、`decline`/`cancel`→零副作用；客户端 `initialize` 未声明 `elicitation`→fail-closed 拒绝写（不降级为直接执行）。人确认档 tool 清单：#6/#7/#8/#9/#10/#11/#12/#24（8 个）。
2. **全自动档 #23**：免确认（PRD §4.1 草稿创建可逆 + 仅引用主数据 + 客观标准），但仍挂接幂等/前置/事后/批次（D01 §9.2 档位要求）。**#23 免确认仅限 L3**；客户端不支持 `elicitation` 时与全量写 tool 一并 fail-closed（E01 §2.2 / PRD 决议 1），不得在 L2 降级下仍执行写入。
3. **只出 plan #25**：无写入、无确认、无幂等窗口、无批次（D02 §6.3 第 5/7/9 项）。
4. **三层拦截白名单（E01 `allowlist.md` §3）**：#6–#12 目标对象硬编码 Customer/Supplier/Item/Item Price；#23/#24 目标 Stock Entry；#25 读 Bin/SLE；Link 字段目标仅限引用允许清单（Customer Group/Supplier Group/Territory/Item Group/UOM/Warehouse/Price List）；可写字段为逐 tool 冻结白名单（D03）。清单外对象后端无 DocPerm → 原生 403 → 转译 `permission_denied`。
5. **后端调用方**：统一经正式账号 `mcp-service` + 角色 `MCP Business Caller`（21 DocPerm 最小权限）受控写调用（E01 `roles.md`/`permission-matrix.md` §3）；异常回滚（已生效调拨取消）归管理员运维主体，不对普通调用方开放。
6. **fail-closed（E01 `confirmation-failclosed.md` §2）**：`gjg.default_currency` 为空或 `selling=1 且 enabled=1` 价格表数量 ≠ 1 → server 拒绝初始化写入能力并 fail closed；后端不可达不自动重试写。

### 9.3 E02 机制挂接

1. **幂等**：挂接 `fingerprintOf`（稳定排序 + 行项目保持原顺序）+ `createIdempotencyStore().check/record`（create 组 300s / confirm 组 60s）+ `checkStateAssertion`（#24 confirm 仅草稿、命中目标态幂等成功）；`assertWindowNotWidened` 拒绝对超冻结值窗口的放宽（E02 §1/§2）。
2. **前置断言**：挂接 `assertPreconditions(assertions, ctx)`——逐 tool 业务状态断言（§9.1 前置断言列），首个失败返回 `precondition_failed`（含当前状态 + 建议动作）；schema 校验通过不构成前置断言满足（E02 §3）。
3. **事后回读**：挂接 `checkReadBack(actual, expected)`——写后回读目标对象断言期望终态，不一致报 `postcondition_failed` + 记批次台账 + 标记待回滚；写操作成功响应前完成事后回读（E02 §4、D01 §6.2）。
4. **批次台账**：挂接 `createBatchLedger`（一次 `tools/call` 一批次、内存不落库、会话级归属）+ `rollbackPathFor`（草稿删除/已生效管理员回滚/已取消终态如实标注）；`#26` 可见性沿用 E02 §6（归属自身会话可查/他人不可见/管理员全量/不可主动回滚）。
5. **错误转译**：挂接 `lib/errors` 统一错误形状（`isError:true` + 稳定语义化 `code` + 可自纠 `message` + `retryable` + 可选 `details`），不裸抛堆栈/后端原生异常名；失败路径不静默成功（D01 §4）。

### 9.4 后端写调用落地（B01/B04 冻结事实）

- **主数据**（#6–#12）：`POST /api/resource/{doctype}` 创建、`PUT /api/resource/{doctype}/{name}` 更新，单次后端事务，`modified` 乐观断言在 `_save()` 内与写入同事务（B01 §3）。
- **调拨创建**（#23）：`POST /api/resource/Stock Entry`（`stock_entry_type=material_transfer`）。
- **调拨生效**（#24）：经 `frappe.client.submit`（全量 doc，非 name 串），**不得走资源端点 `run_method:submit`（403 PermissionError 非 whitelisted，B04 F3）**。
- **盘点方案**（#25）：`get_items(warehouse, posting_date, posting_time, company, item_code)` 或 Bin/SLE 读现状（as-of-time），无写入（B04 F11）。

## 10. 不变量

- 两张允许清单之外的对象不可被操作或引用；引用允许清单对象只可引用、不可经 MCP 增删改（总则 §6.10、D01 §8）；
- 人确认操作未经有效 server 侧确认不得写入（#6–#12、#24；拒绝/取消/客户端不支持→零副作用）；
- 按 B05 冻结的「同一业务意图」判定规则，重复重试最多产生一次业务变化；独立的合法重复业务不得被幂等机制合并（create 组 300s / confirm 组 60s，不反向放宽）；
- 写操作成功响应前必须完成事后回读（写后回读终态）；
- 普通调用方不得读取其他调用方的批次信息；管理员可查全量（#26 可见性边界，D01 §6.4）；
- 后端不可达时不得自动重试写操作；错误不得以成功响应伪装、失败路径不静默成功；
- 目标对象/Link 字段目标/可写字段硬编码枚举，不接受任意 DocType 字符串或任意字段名（D01 §7、E01 §3.2）；
- #12 生效区间不重叠、#23 源仓可用量、#24 源/目仓不同由 server 前置断言强制（后端不原生校验，B01 F3 / B04 F5）；
- #24 经 `frappe.client.submit` 全量 doc 生效，不承诺删除已生效/已取消调拨/盘点单据（B04 F3/F10）；
- #25 只出 plan、不写 Stock Reconciliation 单据、不覆盖库存基线；
- 未经上游冻结结论的字段/行为表述不得写入实现（不以推测代替结论）。

## 11. 交付物

| 编号 | 交付物 | 存放位置 | 验收方式 |
|---|---|---|---|
| D01 | F04 任务包 | `docs/task-packages/F04/task.md` | 结构完整、Owner 已指定 |
| D02 | 10 个写/只出 plan tool 的 server 侧实现（复用 F01 `server/` 骨架，追加 10 写 tool 模块 + 注册表尾部新增 + 后端写端点/确认/fail-closed 增量扩展） | `server/`（仓库根） | 逐 tool 与 D02 §3/§6、D01、E01、E02 一致，可运行、写前确认、写后回读 |
| D03 | 逐 tool 可写字段白名单清单（主数据 7 tool + 调拨 create，含不可改字段边界） | `docs/task-packages/F04/`（脱敏） | 逐对象可复核，与 D02 §3/§6 逐 tool 口径核对 |
| D04 | 对齐核对记录 | `docs/task-packages/F04/`（脱敏） | 逐 tool 逐项可复核，无清单外对象、无机制绕过 |
| D05 | 开发自检记录 | `docs/task-packages/F04/`（脱敏） | S01–S12 可复核 |
| D06 | Evidence Manifest | `docs/task-packages/F04/evidence-manifest.md` | 逐项可追溯 |
| D07 | 更新后的登记表 | `docs/governance/任务包登记表.md` | F04 行与本文件一致（含上游依赖补 F01） |
| D08 | 独立验收记录 + 封存记录 | `docs/task-packages/F04/`（脱敏，随 §18）+ `docs/task-records/freeze-manifests/F04-v1.0.md` | Acceptor gjg 独立验收通过（档位 3），封存与下游影响记录完整 |

## 12. 开发自检

| 编号 | 检查方法 | 预期结果 |
|---|---|---|
| S01 | Implementer 会话负向读取 C01b `task-sets/`、`assertions/` 哨兵 | ACCESS_DENIED（隔离生效） |
| S02 | 10 个 tool 逐 tool 与 D02 §3/§6 核对（name/schema/annotation/错误码/幂等/前置/事后/批次） | 逐项一致、无漂移、无反向放宽 |
| S03 | 白名单/可写字段枚举核对（#6–#12 目标 Customer/Supplier/Item/Item Price；#23/#24 Stock Entry；#25 Bin/SLE；Link 仅引用清单） | 无清单外对象、无任意 DocType、无任意字段名 |
| S04 | 人确认档 server 侧确认（8 tool）：accept→写入、decline/cancel→零副作用、客户端不支持 elicitation→fail-closed 零写入 | 确认边界正确、零副作用 |
| S05 | 幂等：create 组（#6/#8/#10/#23）与指纹合并类（#7/#9/#11/#12）300s 指纹合并；confirm 组（#24）60s 状态断言兜底 | 窗口期不放宽、重复合并、状态断言命中幂等成功 |
| S06 | 前置断言逐 tool（同名不存在/存在启用/modified 一致/区间不重叠/源仓可用量/源目不同） | 断言正确、可自纠报错 |
| S07 | 事后回读：写后回读终态（新客户/供应商/物料/价格/调拨草稿/生效调拨 SLE） | 终态一致、不一致报 `postcondition_failed` |
| S08 | 批次台账 + #26 可见性（归属自身会话可查、他人不可见、管理员全量、不可主动回滚） | 边界正确、无 rollback 入口 |
| S09 | 错误转译（invalid_argument/precondition_failed/duplicate_name/concurrency_conflict/permission_denied/backend_unavailable） | 可自纠 message + retryable 正确 |
| S10 | 越权拒绝：清单外对象写、引用对象增删改、只读对象写 | 全 403 转 `permission_denied` |
| S11 | fail-closed（币种/价格表数量≠1 拒绝初始化写入；后端不可达不自动重试写）+ 可写字段白名单与 D02 §3/§6 核对 | fail-closed 生效、白名单逐对象一致 |
| S12 | Evidence Manifest 完整性 + 写操作口径（写前确认/写后回读/批次记录/测试后快照归零） | 证据齐全、可追溯、零残留 |

> 自检通过不等于正式验收通过（总则 §6.12）；档位 3 独立验收由 Acceptor gjg 完成，Implementer 不自验。

## 13. Evidence Manifest

证据统一维护在 `docs/task-packages/F04/evidence-manifest.md`，本文件不重复记录明细。

## 14. 完成定义

- [ ] 全部前置条件已经验证（含 F01 v1.0 已通过、Implementer 会话隔离自证、登记表 F04 行上游依赖补 F01）；
- [ ] 工作项与交付物全部完成（W01–W10；D01–D08）；
- [ ] 10 个 tool 与 D02 §3/§6 契约、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract 逐项一致，无清单外对象、无越界读写、无机制绕过；
- [ ] 人确认档 8 tool 未经有效确认零写入；幂等窗口期不放宽；写后回读终态；批次台账可见性边界正确；
- [ ] 可写字段白名单清单（D03）与 D02 §3/§6 逐 tool 口径一致；
- [ ] 写操作不变量均有证据（写前确认/写后回读/后端不可达不重试/不承诺删除已生效调拨/盘点单据/测试后快照归零）；
- [ ] 开发自检通过（S01–S12）；
- [ ] Evidence Manifest 完整且能够逐项追溯完成条件；
- [ ] 未修改禁止范围（未读 C01b 冻结任务集、未实现 #13–#22、未改动 F01 既有 6 读 tool 与 E02 `lib/`、未扩大范围）；
- [ ] 剩余限制和风险已记录；
- [ ] 独立验收通过（档位 3，Acceptor gjg 独立于 Implementer），封存与下游影响记录完成（档位 3 强制）。

## 15. 停止与升级条件

继承《MCP 改造任务包总则》第 6.15 节。本包特有：

- D02/D01/E01/E02/F01 权威输入互相冲突，或 ERPNext 实际行为与 B01/B04 冻结接口事实不一致（如 #24 `frappe.client.submit` 失效、后端重名/区间/库存校验行为与 B01/B04 不符，停止）；
- 需要新增对象、tool、权限或外部依赖才能完成 10 个 tool（停止并升级）；
- 必需对象不在允许清单，或无法满足 E01 白名单层/确认/fail-closed 强制（清单外对象可写、人确认未经确认可写、币种/价格表 fail-closed 无法落地，停止）；
- 无法从 B01/B04 interface-facts 与 ERPNext DocType 字段确定性取得逐 tool 可写字段白名单（停止并升级）；
- 需要读取 C01b 冻结任务集正文、断言或隐藏数据才能完成本包（停止，不得读题）；
- 需要改变 D02 契约才能实现（停止并回 D02 走变更控制，不得在 F04 内静默调整）；
- F01 `server/` 骨架无法复用（需修改入口/注册表既有条目、或改动 E02 `lib/` 8 模块才能落地写 tool，停止并升级）。

报告必须包含阻断事实、影响范围、已完成的安全检查以及需要谁作出什么决定。

## 16. 风险、假设与待决事项

- **受题污染**：单一自然人 gjg 兼任 Owner / Implementation Reviewer / Acceptor；F04 为档位 3 独立验收，Acceptor（gjg）不读 C01b 题（F04 验收以公开契约 + 后端终态/接口实测为准，无需隐藏断言；正式隐藏断言验收由 G01 承担）。任何主体读取过 C01b 冻结任务集正文/断言后，不得参与 F04/F02 实现/评审/调参/定向修复；
- **已裁定-1（登记表 F04 行上游依赖补 F01，Owner gjg 2026-09-17）**：登记表 F04 行上游依赖补入 F01（v1.0，直接上游，复用 `server/` 骨架 + 白名单层）；串行路径 F01→F04→F02 已写入 §1/§4。已回填 §1/§4/§5/§6.2/§14/§15，不再作为待决；
- **已裁定-2（可写字段白名单降为工作项 W05，Owner gjg 2026-09-17）**：参照 F01「#1 filters 白名单降为工作项」先例，逐 tool 可写字段白名单降为 W05（交付物 D03、自检 S03/S11），实施时从 B01/B04 interface-facts + ERPNext DocType 字段确认，与 D02 §3/§6 口径核对；无法确定性取得按 §15 升级。已回填 §8/§11/§12/§15，不再作为待决；
- **Item→Item Price 级联删除（B01 F4）**：后端删除被 Item Price 引用的 Item 时**不拒绝、级联删除 Item Price**。F04 的 Item 删除/回滚（#10 create 回滚）须自建引用前置检查，不依赖后端拒绝；已被交易单据引用的 Item 删除不级联、转管理员处置（B04 §4 回滚路径汇总已转引 B03 F9）；
- **#23/#24 server 前置断言责任（B04 F5）**：源仓可用量不足（#23）与源/目同仓（#24）后端不原生强制，F04 必须 server 侧前置断言；此为 D02 §6 已冻结口径，非新增待决，但属实施必须落实的关键点；
- **#25 只出 plan 的边界**：`stock_reconciliation_plan` 不提交、不覆盖库存基线；盘点实际提交所需的估值率/opening-entry 门槛（B04 F7/F8）属 G01 或后续盘点提交范围，F04 不实现，仅在 plan 输出中如实附风险提示（D02 §6.3 输出 schema 已冻结）；
- **server 骨架增量扩展**：F04 复用 F01 `server/` 骨架时，入口 `index.js`（elicitation 确认处理）、`registry.js`（尾部新增 10 写 tool）、`backend.js`（写端点 POST/PUT + `frappe.client.submit`（confirm #24））、`config.js`（币种/价格表 fail-closed 集中配置）、`allowlist.js`（写对象枚举与可写字段）为**增量扩展**，不改既有 6 读 tool 处理器与 E02 `lib/` 8 模块；入口/注册表只增不改（总则 §16.3 写操作门槛：写 tool 须在确认/幂等/前置/事后/批次接入并验证后才登记）；
- **档位 3 封存口径**：F04 为档位 3（完整），封存与下游影响记录 + Freeze Manifest **强制**单独进行（总则 §7.1）；封存后为 F02 提供 10 个写 tool 与复用骨架，F02 须复用 F01/F04 建立的 `server/` 骨架（入口/注册表只增不改、串行追加 #13–#22）。

## 17. 评审与状态记录

| 时间 | 原状态 | 新状态 | 操作人 | 依据/说明 |
|---|---|---|---|---|
| 2026-09-17 | 规划中 | 草拟 | Claude（F04 起草上下文） | 依据总则 §5/§13 与登记表 F04 行，创建完整任务包文件并指定 Owner gjg；档位 3（完整）实施包，实现 10 个写/只出 plan tool（#6–#12 主数据 + #23–#25 库存）；上游 F01（直接，已通过）/D02/D01/E01/E02/C01b（仅版本标识）/C01a/B01/B04 均已通过/封存；登记表 F04 行上游依赖当前未列 F01，已在本文件 §1/§4 补上并列为待决-1 |
| 2026-09-17 | 草拟 | 待评审 | Claude（F04 起草上下文） | 必备结构完整，提交 gjg 评审 |
| 2026-09-17 | 待评审 | 待评审 | gjg（Owner） | 待决项裁定（非状态变更）：① 登记表 F04 行上游依赖补入 F01（v1.0，直接上游，复用 `server/` 骨架 + 白名单层），串行路径 F01→F04→F02 已写入 §1/§4；② 可写字段白名单降为工作项 W05（交付物 D03、自检 S03/S11），实施时从 B01/B04 + ERPNext DocType 确认，与 D02 §3/§6 口径核对，无法确定性取得按 §15 升级。已回填 §4/§16 |
| 2026-09-17 | 待评审 | 已冻结 | gjg（Owner） | 评审通过，无阻断问题；批准 F04 v1.0 冻结。评审中在两项待决裁定（① 登记表上游依赖补 F01；② 可写字段白名单降为 W05）基础上另修正三项：③ §6.2/§16 backend.js 扩展清单改为「POST/PUT + `frappe.client.submit`（confirm #24）」，删除 F04 无需的 DELETE（草稿删除回滚归管理员运维、mcp-service 无 delete DocPerm）与 `frappe.client.save`（F02 cancel 路径）；④ §9.2 补明 #23 全自动档免确认仅限 L3、客户端不支持 `elicitation` 时全量 fail-closed（E01 §2.2）；⑤ §16「B03 F9」改引「B04 §4 回滚路径汇总已转引 B03 F9」。尚未实施或验收 |
| 2026-09-17 | 已冻结 | 实施中 | Claude（F04 实施上下文） | 开工前五步完成：依序读核 F04 task.md（含 frozen/v1.0 快照 diff 一致）+ D02 §3/§6 + D01 + E01（permission-matrix/allowlist/roles/confirmation-failclosed）+ E02 implementation-contract + `lib/` 8 模块 + F01 task.md + `server/` + C01a + B01/B04；§4 前置条件成立；`git status` 未改 D02/D01/E01/E02/F01 冻结产物；verify-impl `ISOLATED: all checks passed`；run/snapshots 负向读取 ACCESS_DENIED。实施 10 写/只出 plan tool（W03–W07），自检 S01–S17 120/120 通过 |
| 2026-09-17 | 实施中 | 待验收 | Claude（F04 实施上下文） | W02–W09 完成：10 写/只出 plan tool 落地（#6–#12 主数据 + #23–#25 库存）+ 确认/白名单/权限层 + 幂等/前置/事后/批次机制 + 后端写端点；D03 可写字段白名单、D04 对齐核对、D05 开发自检 S01–S17 120/120、D06 Evidence Manifest 均已产出；提交待验收（档位 3 独立验收归 Acceptor gjg，Implementer 不自验、不标已通过） |
| 2026-09-17 | 待验收 | 退回（整改中） | gjg（Acceptor，档位 3 独立验收） | 首轮独立验收：冻结完整性/逐 tool 静态核对/自检独立重跑（S02–S17）通过；发现两项阻断——① index.js 残留 F01「6 只读 tool / 不提供写端点」文案（用户可见、事实错误）；② Implementer 全程内存 mock 未做真实后端写冒烟，档位 3「后端终态/接口实测」未覆盖全部 10 写 tool。退回整改，详见 acceptance-record.md §5.1 |
| 2026-09-17 | 退回（整改中） | 已封存 | gjg（Acceptor，档位 3 独立验收） | 复验：① index.js 三处文案改对（16 tool 口径）；② Acceptor 以 mcp-service 凭据补做真实后端全接口实测（#8/#10/#12 create、#23 调拨草稿、#24 frappe.client.submit 全量 doc + SLE 源 -10/目 +10、#25 get_items 与 Bin 回退、错误转译/越权拒绝/fail-closed），并印证 B01 F1、B04 F3/F6/F10；③ 复验发现并修复 #25 posting_date/posting_time 默认值缺陷（缺省改走 Bin 读现状，D02 §6.3「Bin/SLE 或 get_items」授权）。档位 3 独立验收通过，封存 + 下游影响记录 + Freeze Manifest 见 §18 与 F04-v1.0.md |

## 18. 封存记录与下游影响

### 18.1 封存记录

| 时间 | 动作 | 操作人 | 依据/说明 |
|---|---|---|---|
| 2026-09-17 | 档位 3 独立验收通过并封存 | gjg（Acceptor，独立于 Implementer） | 10 写/只出 plan tool 经逐 tool 静态核对 + 自检独立重跑（S02–S17 118 项）+ 真实后端全接口实测全部达标；首轮两项阻断（index.js 文案、后端实测覆盖）与复验 #25 默认值缺陷均已整改闭环；§14 完成定义全部满足，未触发 §15 停止条件。封存依据 `acceptance-record.md`（D08） |

### 18.2 下游影响记录（F02 / G01）

- **F02（销售与采购业务闭环，直接下游）**：F04 封存为其提供 10 个写/只出 plan tool（#6–#12 主数据 + #23–#25 库存）与复用 `server/` 骨架。F02 须复用 F01/F04 建立的 `server/` 骨架（入口 `index.js`/注册表 `registry.js` 只增不改、串行追加 #13–#22），以 mcp-service + MCP Business Caller 为后端调用方，挂接 E01 确认层（elicitation，人确认档未经有效确认零写入）与 E02 机制（幂等/前置/事后/批次），写 tool 须在确认/幂等/前置/事后/批次接入并验证后才登记（总则 §16.3 写操作门槛）。
- **G01（完整集成验收）**：以 E/F 全部完成（含 F04）为前置；F04 的 10 写/只出 plan tool 与 F01 的 6 读 tool 构成 16 tool 底座（6 读 + 10 写/只出 plan），供 G01 集成验收。
- **串行路径**：F01 → F04 → F02（总则 §13）。F04 已封存，F02 可启动。

### 18.3 剩余运营事项（非 F04 代码缺陷）

- 验收冒烟产生的已取消 STE/SLE 与 `F04RT-` 物料因 B04 F10（GL/SLE 持久化）无法 REST 删除，零残留以快照恢复归零；当前可用快照为 pre-E01（Sep 12/14），直接恢复会清掉 mcp-service 账号/角色，须先补 post-E01 快照后再归零（运营动作，归 Owner/管理员）。
