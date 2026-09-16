# D02 业务 tool 契约冻结

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 编号 | D02 |
| 名称 | 业务 tool 契约冻结 |
| 版本 | v1.0 |
| 状态 | 已冻结 |
| 创建人 | Claude（D02 起草上下文） |
| Owner | gjg |
| Implementer | Claude（D02 独立实施上下文） |
| Implementation Reviewer | gjg；不得读取 C01a 题目正文、隐藏数据或终态断言 |
| Acceptance Reviewer | 不适用（档位 1 纯文档设计，不接触隐藏验收材料） |
| Acceptor | 不适用（档位 1 不强制独立验收；正确性由下游 F 包首次使用时验证） |
| 创建日期 | 2026-09-16 |
| 冻结日期 | 2026-09-16 |
| 完成日期 | 不适用 |
| 上游任务包 | D01（已通过，`common-contract.md` 为统一基座）；C01a（已封存，仅记录版本/完成标识，不读取候选正文）；B01–B04、B05（均已封存，为逐 tool 接口事实与幂等边界权威输入） |
| 下游任务包 | C01b（覆盖映射与任务集最终冻结，消费冻结契约）；E01（权限/允许清单/人工确认）；F01/F02/F04（业务实现，消费冻结契约）；E02 的「接入具体 tool」阶段待 D02 契约冻结后按冻结契约落地 |

> **档位说明（总则 §7.1 档 1 轻量）**：D02 为契约设计任务包（总则 §4.3），纯文档产出、无数据库写入、不接触隐藏验收材料。其终态为「已通过」而非「已封存」；不强制独立验收，由 Implementation Reviewer 记录评审替代；封存与下游影响记录合并入 P00 总控或直接下游（C01b/F 包）的封存环节；正确性由下游 F 包首次使用时验证。冻结时仍需 Freeze Manifest 记录权威输入版本与完成定义（总则 §7.1）。
>
> 角色隔离：Implementer 为独立实施上下文，与 Owner/Implementation Reviewer（gjg）分离；D02 不接触正式验收题、隐藏数据或终态断言，不读取 C01a 候选正文（`D:\second-acceptance\candidates\`）。

## 2. 目标

在**不接入 ERPNext、不改变任何数据库状态、不实现任何 tool 代码**的前提下，冻结 26 个业务 tool（PRD §3.3 #1–#26）的**各自契约**，作为 E01、C01b、F01/F02/F04 实施与验收的权威输入。每个 tool 契约必须逐项覆盖并落地以下九项，且全部以 D01 公共契约（`common-contract.md`）为统一基座、忠实 PRD 档位/类型/消歧、落地 B01–B04 接口事实与 B05 幂等边界：

1. **tool 标识与档位**（name 必须 `erpnext_<资源>_<动作>`、业务动作、类型、自主度档位，忠实 PRD §3.2/§3.3/§4.1）；
2. **description**（向团队新人介绍标准、相近 tool 消歧文案、窄接口边界声明，无 ERPNext 专有名词，规范 §8.3/§8.4、PRD §3.4）；
3. **输入 schema**（必填/可选、Link 字段语义引用表达、嵌套行项目结构、写 tool 必带 `modified` 乐观版本令牌）；
4. **输出 schema**（语义化、高信噪比、分页/过滤/截断/详略默认值，规范 §8.5）；
5. **annotation**（四布尔显式声明、旁挂后端「与外部世界交互=否」，规范 §8.1）；
6. **前置断言**（业务状态层，含同名不存在、状态机前态、来源/库存约束、乐观版本断言，PRD §5.2、B01–B04）；
7. **幂等边界**（进指纹参数、窗口期 create 300s / confirm·cancel 60s、confirm/cancel 状态断言兜底、误合并/合法重复表达，PRD §5.1、B05 §18.3）；
8. **错误转译**（DuplicateEntryError 409 / TimestampMismatchError 417 等转译口径与可自纠建议，D01 错误模型、B01–B04）；
9. **批次行为**（同批变更、回滚路径、`batch_status_get` 可见性，PRD §5.4）。

26 个 tool 清单（忠实 PRD §3.3，不增不减）：

| PRD # | tool | 类型 | 档位 |
|---|---|---|---|
| 1 | erpnext_document_search | 读 | — |
| 2 | erpnext_document_get | 读 | — |
| 3 | erpnext_stock_level_query | 读 | — |
| 4 | erpnext_stock_ledger_query | 读 | — |
| 5 | erpnext_supplier_search | 读 | — |
| 6 | erpnext_customer_create | 写 | 人确认 |
| 7 | erpnext_customer_update | 写 | 人确认 |
| 8 | erpnext_supplier_create | 写 | 人确认 |
| 9 | erpnext_supplier_update | 写 | 人确认 |
| 10 | erpnext_item_create | 写 | 人确认 |
| 11 | erpnext_item_update | 写 | 人确认 |
| 12 | erpnext_item_price_set | 写 | 人确认 |
| 13 | erpnext_sales_order_create | 写 | 全自动 |
| 14 | erpnext_sales_order_confirm | 写 | 人确认 |
| 15 | erpnext_sales_order_cancel | 写 | 人确认 |
| 16 | erpnext_purchase_order_create | 写 | 全自动 |
| 17 | erpnext_purchase_order_confirm | 写 | 人确认 |
| 18 | erpnext_purchase_order_cancel | 写 | 人确认 |
| 19 | erpnext_purchase_receipt_create | 写 | 全自动 |
| 20 | erpnext_purchase_receipt_confirm | 写 | 人确认 |
| 21 | erpnext_delivery_note_create | 写 | 全自动 |
| 22 | erpnext_delivery_note_confirm | 写 | 人确认 |
| 23 | erpnext_stock_transfer_create | 写 | 全自动 |
| 24 | erpnext_stock_transfer_confirm | 写 | 人确认 |
| 25 | erpnext_stock_reconciliation_plan | 读+方案 | 只出 plan |
| 26 | erpnext_batch_status_get | 读 | — |

## 3. 非目标

- 不实现任何 tool 代码、不选型或落地 MCP server 技术方案、不产出部署/运维说明（E/F 包职责）；
- 不接入 ERPNext 后端，不调用 REST API、bench 命令或数据库，不改变 ERPNext 数据库状态；
- 不改变 D01 公共契约口径，不反向放宽 B05 幂等边界，不重新实测 B01–B04 接口事实；
- 不新增、删除、合并或拆分 tool（忠实 PRD §3.3 的 26 个），不改变 PRD §4.1 档位归属；
- 不冻结 E01 权限矩阵/专用角色/允许清单的落地配置，不冻结 E02 的机制实现手法（仅冻结契约口径）；
- 不读取 C01a 题目正文、隐藏数据或终态断言（只记录 C01a 版本/完成标识）；
- 不冻结 C01b 的验收任务集、覆盖映射或每题调用次数。

## 4. 前置条件

| 条件 | 验证方式 | 状态 |
|---|---|---|
| D01 v1.0 已通过（公共契约 `common-contract.md` 为权威输入） | 检查 D01 登记表行、task.md §17、Freeze Manifest | 已验证 |
| B01 v1.0 已封存（主数据接口事实） | 检查 B01 登记表行与 `interface-facts.md` | 已验证 |
| B02 v1.0 已封存（销售链路接口事实） | 检查 B02 登记表行与 `interface-facts.md` | 已验证 |
| B03 v1.0 已封存（采购链路接口事实） | 检查 B03 登记表行与 `interface-facts.md` | 已验证 |
| B04 v1.0 已封存（库存、事务与回滚接口事实） | 检查 B04 登记表行与 `interface-facts.md` | 已验证 |
| B05 v1.0 已封存（幂等可实现性结论，§18.3 权威结论） | 检查 B05 登记表行、`idempotency-research.md` §10、task.md §18.3 | 已验证 |
| C01a v1.0 已封存（仅记录版本/完成标识，不构成先后依赖；总则 §13 允许 D02 与 C01a 并行） | 检查 C01a 登记表行状态=已封存，仅记录版本/完成标识、不读取候选正文 | 已验证（非强制前置） |
| 《开源后端 Agent 化接入规范》已冻结 | 检查页头「2026-09-07 定稿版」 | 已验证 |
| 《ERPNext-MCP 改造 PRD》已冻结 | 检查页头基线 `2026-09-12-r1` | 已验证 |
| 《MCP 改造任务包总则》v1.1 及配套模板、登记表结构、边界规则已冻结 | 检查各文档页头及 Freeze Manifest | 已验证 |
| MCP 协议版本与 SDK 版本已由 B05 钉定 | 检查 B05 `idempotency-research.md` §1（MCP 2025-11-25 / SDK v1.29.0） | 已验证 |
| Owner 已明确 | Owner 为 gjg | 已验证 |
| Implementer、Implementation Reviewer 已确定 | Implementer=独立实施上下文、Implementation Reviewer=gjg | 已验证 |

任一强制前置条件不成立，任务不得进入「实施中」。

> **前置条件边界说明**：D02 为契约设计任务包（总则 §4.3）。「26 个 tool 各自契约正文」是本包的**产出**（W01–W06 形成并写入交付物 CD-2），不是进入实施中的强制前置条件；冻结时被固定的是**契约的输出结构与完成定义**（第 9、14 节）以及权威输入/目标/范围（总则 §2.2），而非 26 个契约答案本身。实施中若权威输入冲突或无法取得确定性口径，按第 15 节停止与升级条件处理。

## 5. 权威输入

| 优先级 | 名称 | 路径/位置 | 版本或提交标识 |
|---|---|---|---|
| 1 | D01 公共契约与错误模型正文（统一基座） | `docs/task-packages/D01/common-contract.md` | v1.0 已通过（2026-09-15，`accept` 提交） |
| 2 | 开源后端 Agent 化接入规范 | `docs/开源后端Agent化接入规范.md` | 2026-09-07 定稿版 |
| 3 | ERPNext-MCP 改造 PRD | `docs/ERPNext-MCP改造PRD.md` | 2026-09-12-r1 |
| 4 | MCP 改造任务包总则 | `docs/MCP改造任务包总则.md` | v1.1（以对应 Freeze Manifest 为准） |
| 5 | MCP 改造封闭任务包模板 | `docs/任务包模板.md` | v1.0（以对应 Freeze Manifest 为准） |
| 6 | MCP 改造任务包登记表 | `docs/任务包登记表.md` | v1.0 字段结构基线；任务行受控更新 |
| 7 | 实施区与验收区边界 | `docs/实施区与验收区边界.md` | v1.1（升版 2026-09-15，依据 CHG-20260915-001） |
| 8 | B01 主数据接口事实记录 | `docs/task-packages/B01/interface-facts.md` | v1.0 已封存（2026-09-14） |
| 9 | B02 销售链路接口事实记录 | `docs/task-packages/B02/interface-facts.md` | v1.0 已封存（2026-09-14，含 F7 原位重冻） |
| 10 | B03 采购链路接口事实记录 | `docs/task-packages/B03/interface-facts.md` | v1.0 已封存（2026-09-15） |
| 11 | B04 库存、事务与回滚接口事实记录 | `docs/task-packages/B04/interface-facts.md` | v1.0 已封存（2026-09-15） |
| 12 | B05 幂等可实现性调研结论 | `docs/task-packages/B05/idempotency-research.md` | v1.0 已封存（2026-09-15，§10 接入方确认有效） |
| 13 | B05 封存记录与下游影响（§18.3 权威结论） | `docs/task-packages/B05/task.md` §18.3 | v1.0 已封存（2026-09-15） |
| 14 | C01a 盲生成业务验收场景 | `docs/task-packages/C01a/task.md`（仅版本/完成标识） | v1.0 已封存（2026-09-15）；**不读取候选正文** |
| 15 | MCP 协议版本文档 / MCP SDK 源码语义 | 由 B05 §1 钉定 | MCP 2025-11-25；`@modelcontextprotocol/sdk` v1.29.0（B05 已复测钉定） |
| — | E02 实现契约（**对齐参照，非上游**） | `docs/task-packages/E02/implementation-contract.md` | v1.0（E02 已封存；仅作 D02 契约口径与 E02 实现能力的对齐参照） |

> **C01a 仅作版本门槛**：D02 只确认 C01a 已完成及其版本标识，不得读取 C01a 题目正文、隐藏数据或终态断言（总则 §13）。C01a 候选落 `D:\second-acceptance\candidates\C01a\`，对本包实施主体不可读。
>
> **E02 为对齐点而非上游**（总则 §13、D01 task §1/§16）：D02 为 D01 契约口径与 E02 实现能力的对齐点。D02 冻结各 tool 的幂等/断言/批次契约时，以 D01 公共契约 + B05 §18.3 为权威口径，并参照 E02 `implementation-contract.md` 核对「契约口径是否可实现」。E02 已独立验收通过并封存（实现契约冻结）；若 E02 实现能力与 D01 契约口径/B05 幂等边界漂移，须走变更控制（总则 §12），不得在 D02 内静默调整。

## 6. 授权范围与所有权

### 6.1 可读取范围

- `docs/` 中的规范、PRD、总则、模板、登记表、实施区与验收区边界及公开治理记录；
- `docs/task-packages/D01/common-contract.md` 及 D01 公开证据（公共契约基座）；
- `docs/task-packages/B01/`、`B02/`、`B03/`、`B04/` 的 interface-facts.md 与公开证据（逐 tool 接口事实）；
- `docs/task-packages/B05/idempotency-research.md`、task.md §18.3 及公开证据（幂等边界）；
- `docs/task-packages/E02/implementation-contract.md`（对齐参照，非上游）；
- `docs/task-packages/C01a/task.md`、`evidence-manifest.md`、Freeze Manifest（**仅读取版本与完成标识，不读取候选正文/初始态/断言**）；
- 本包目录 `docs/task-packages/D02/`；
- 不读取 C01a 隐藏候选（`D:\second-acceptance\candidates\C01a\`）或任何正式验收材料（`D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 等）；
- 不读取或调用 ERPNext 后端（数据库、REST API、bench、站点数据均不在读取范围内）。

### 6.2 写入集

| 路径/对象 | 允许动作 | Owner | 是否共享 | 协调规则 |
|---|---|---|---|---|
| `docs/task-packages/D02/` | 新增和维护 D02 任务包、业务 tool 契约正文（`tool-contract.md`）与 Evidence Manifest | gjg | 否 | 状态变化必须追加记录，不覆盖历史 |
| `docs/任务包登记表.md` 的 D02 行 | 更新 D02 版本、状态、角色、路径与证据位置 | gjg | 是 | 仅更新 D02 行；其他任务行实质变化另走相应任务或变更流程 |
| `docs/task-records/freeze-manifests/D02-v1.0.md` | 冻结时登记 D02 冻结清单与哈希 | gjg | 否 | 哈希针对冻结文件计算，不写回被哈希文件 |
| `docs/task-records/changes/`、`returns/` | 保存 D02 变更或退回记录（如发生） | gjg | 是 | 使用稳定编号和独立文件 |

### 6.3 系统、接口、数据与环境权限

| 权限类别 | 允许范围/对象 | 允许动作 | 明确禁止 | 是否可改变状态 | 不适用理由/审批与证据 |
|---|---|---|---|---|---|
| 系统、接口与命令 | 本机只读文件访问（Read/Grep/Glob/Bash 只读命令）、计算哈希、文本与 Markdown 结构检查 | 读、文本检查、哈希计算 | 禁止调用 ERPNext 任何接口或命令；禁止调用任何 MCP server 或生产服务；禁止 `git push`、历史改写 | 否 | D02 为纯文档契约设计，无后端交互 |
| 数据与凭证类型 | 不适用 | 不适用 | 不得记录或输出凭据值、完整认证头 | 否 | 不接触后端数据或凭据 |
| 数据库状态 | 不适用 | 不适用 | 禁止连接或改变任何数据库（含 ERPNext 站点库） | 否 | 契约设计不落库、不读库 |
| 依赖安装 | 不适用 | 不适用 | 禁止安装依赖、禁止改变项目根依赖或后端运行环境 | 否 | 无依赖需求 |
| 运行环境与配置 | 不适用 | 不适用 | 禁止修改 `frappe_docker` 工作树、ERPNext 容器/站点或任何后端配置 | 否 | 无环境变更 |
| 外部网络与服务 | 不适用 | 禁止 | 禁止外部网络调用与远程可达性探测 | 否 | 全部权威输入为本地文档 |

## 7. 禁止事项

- 不得修改上游规范、冻结 PRD、冻结总则、D01 冻结公共契约和冻结验收题；
- 不得扩大对象、tool 或权限范围；不得新增、删除、合并或拆分 tool（忠实 PRD §3.3 的 26 个）；
- 不得改变 PRD §4.1 的档位归属（全自动/人确认/只出 plan 分组不得改动）；
- 不得新增通用 CRUD 或任意代码执行面；
- 不得绕过 server 侧确认，不得依赖客户端权限配置实现「确认」；
- 不得让失败路径静默成功；
- 不得输出密钥、密码、完整认证头、完整堆栈或未授权业务数据；
- 不得为通过验收而改变冻结题目或改变上游冻结结论；
- 不得读取 C01a 题目正文、隐藏数据或终态断言（只记录版本/完成标识）；读取过隐藏验收材料的会话不得参与本包实现；
- 不得接入或改变 ERPNext 后端（数据库、REST API、bench、站点数据）；
- 不得反向放宽 D01 公共契约口径或 B05 冻结的幂等边界（窗口期 create 300s / confirm·cancel 60s 不得放宽；指纹规则不得改变）；
- 不得在契约中绑定具体传输层字段（`id`/`progressToken`/`claudecode/toolUseId` 等不得作幂等或契约依据，规范 §9.3、B05 §18.3）；
- 不得预设 E02/E/F 包的实现手法（D02 只冻结「契约口径」，不冻结「怎么做」）；
- 不得将 D02 状态误作 E01、C01b、F 包实现或项目完成状态。

## 8. 工作项

| 编号 | 工作项 | 交付物/完成断言 |
|---|---|---|
| W01 | 冻结读类 tool 契约（#1–#5、#26） | 6 个读 tool 的 name/description/schema/annotation/错误/批次可见性契约逐项冻结，忠实 PRD §3.3/§3.4 与 D01 公共契约 |
| W02 | 冻结主数据 tool 契约（#6–#12，B01） | 7 个主数据 tool 的契约逐项冻结，落地 B01 F1–F4（重名、`modified`、Item Price 区间、删除引用）与 PRD §5.1/§5.2 |
| W03 | 冻结销售链路 tool 契约（#13–#15、#21–#22，B02） | 5 个销售 tool 的契约逐项冻结，落地 B02 F1–F7（series 编号、confirm 版本断言、cancel 端点、前态、超发、显式 rate 副作用）与 PRD §5.1/§5.2 |
| W04 | 冻结采购链路 tool 契约（#16–#20，B03） | 5 个采购 tool 的契约逐项冻结，落地 B03 F1–F9（schedule_date、超收、GL 持久化、cancel 冲回≠物理删除）与 PRD §5.1/§5.2 |
| W05 | 冻结库存链路 tool 契约（#23–#25，B04） | 3 个库存 tool 的契约逐项冻结，落地 B04 F1–F11（`frappe.client.submit` 端点、同仓校验、覆盖基线、估值率、只出 plan）与 PRD §5.1/§5.2 |
| W06 | 汇总核对 26 个 tool 契约与对齐点 | 产出 `tool-contract.md`，逐 tool 覆盖第 9 节全部结构项；与 D01 公共契约、B05 §18.3、E02 实现能力逐项对齐核对；核对完成定义与不变量，形成 Evidence Manifest |

## 9. 输入输出契约

D02 不提供可调用的业务 tool，本节规定《业务 tool 契约》（交付物 CD-2 = `tool-contract.md`）的冻结输出结构——它是 C01b、E01、F01/F02/F04 的权威输入。

### 9.1 每个 tool 契约块的冻结结构

`tool-contract.md` 必须按 PRD §3.3 的 26 个 tool 逐块冻结，每块必须包含并可复核以下九项：

1. **tool 标识与档位**：name（`erpnext_<资源>_<动作>`，与 PRD §3.3 逐字一致）、PRD # 编号、业务动作、类型（读/写/读+方案）、自主度档位（全自动/人确认/只出 plan，忠实 PRD §4.1）；
2. **description**：按「向团队新人介绍」标准写（§8.4），显式写出查询格式、术语定义、资源关系；含相近 tool 消歧文案（PRD §3.4，写明「什么情况下不该用这个、该用哪个」）；声明窄接口边界；参数名无歧义；不含 ERPNext 专有名词（§8.7）；
3. **输入 schema**：必填/可选参数逐项标明；Link 字段引用以语义标识表达（由 server 解析为后端标识，不要求 agent 填内部标识符）；子表仅作父单据嵌套行项目；写 tool MUST 携带 `modified`（乐观版本断言，B01–B04 F2）；
4. **输出 schema**：语义化标识、高信噪比（不含低层技术标识符）、分页/过滤/截断/详略默认值（§8.5）；查询类 tool 提供详略枚举；
5. **annotation**：四布尔显式声明（只读/破坏性/幂等/与外部世界交互=否），`idempotent` 声明与幂等实现一致（§8.1）；
6. **前置断言**：业务状态层断言（schema 校验不计入，§9.4），落地 PRD §5.2 对应 tool 组的断言 + B01–B04 实测结论（如「同名对象不存在」「来源单据已生效」「目标仍为草稿」「源仓可用量充足」等）；
7. **幂等边界**：进指纹参数清单（PRD §5.1 对应 tool 组，稳定排序+归一化，展示性备注不进指纹）、窗口期（create 组 300s / confirm·cancel 组 60s，不得放宽）、confirm/cancel 状态断言兜底（幂等命中=幂等成功）、误合并策略与合法重复表达（业务引用号/窗口期外/改字段，PRD §5.1、B05 §18.3）；
8. **错误转译**：该 tool 可能触发的后端原生错误 → D01 错误模型语义化 code 的转译口径 + 可自纠建议（DuplicateEntryError 409、TimestampMismatchError 417、LinkValidationError 417、OverAllowanceError 417、NegativeStockError 417 等，B01–B04 §6）；
9. **批次行为**：同批变更范围、回滚路径（草稿删除/生效取消/终态不可回滚如实标注）、`batch_status_get` 可见性边界（PRD §5.4）。

> 契约正文一经冻结，成为 C01b、E01、F01/F02/F04 权威输入；修改须走变更控制（总则 §12）。D02 本身不改变 PRD 冻结语义与 D01 公共契约口径。

### 9.2 档位 1 的验收口径

D02 为档位 1（轻量），其正确性由下游 F 包首次使用时验证（总则 §7.1）。本包不设正式验收题，不生成隐藏断言；完成判定为：`tool-contract.md` 覆盖 26 个 tool、每块覆盖 §9.1 全部 9 项、通过第 12 节自检、且 Implementation Reviewer（gjg）记录评审通过。

## 10. 不变量

- 冻结 PRD、规范、总则、模板、登记表结构与边界规则内容不得被 D02 修改；
- 26 个 tool 清单不增不减，name 与 PRD §3.3 逐字一致，档位与 PRD §4.1 一致；
- D01 公共契约只作为统一基座被引用，不得被 D02 反向放宽或改写；
- 幂等边界与 B05 §18.3 一致：窗口期不得放宽、指纹由 server 规范化且 agent 不感知、传输/客户端字段不进指纹；
- 写 tool 必须携带 `modified` 做乐观并发（B01–B04 F2 一致结论）；
- 契约不得绑定具体传输层字段（`id`/`progressToken`/`claudecode/toolUseId` 等）；
- 操作允许清单外对象不得被读或写、引用允许清单对象只可引用不可增删改（D01 公共契约 §7）；
- 人确认操作未经有效 server 侧确认不得写入（规范 §9.7）；
- 后端不可达时写操作不得自动重试（总则 §6.10）；
- 错误不得以成功响应伪装、失败路径不得静默成功（规范 §8.6/§9.5）；
- 不读取 C01a 题目正文、隐藏数据或终态断言；不接入、不改变 ERPNext 后端或任何数据库状态；
- 未经实测/未经上游冻结结论的表述不得写入契约（不得以推测代替结论）。

## 11. 交付物

| 编号 | 交付物 | 存放位置 | 验收方式 |
|---|---|---|---|
| CD-1 | D02 任务包 | `docs/task-packages/D02/task.md` | 按冻结模板检查必备结构 |
| CD-2 | 业务 tool 契约正文 | `docs/task-packages/D02/tool-contract.md` | 覆盖 26 个 tool、每块覆盖 §9.1 全部 9 项，逐项可复核 |
| CD-3 | D02 Evidence Manifest | `docs/task-packages/D02/evidence-manifest.md` | 逐项追溯工作项与完成定义 |
| CD-4 | 更新后的任务包登记表 | `docs/任务包登记表.md` | D02 行与本文件一致，表格结构未改变 |

## 12. 开发自检

| 编号 | 检查方法 | 预期结果 |
|---|---|---|
| S01 | 核对 26 个 tool 清单与 PRD §3.3 一致 | 26 个 tool 不增不减，name 逐字一致，类型/档位与 PRD §3.3/§4.1 一致 |
| S02 | 核对每个 tool 契约块覆盖 §9.1 全部 9 项 | 每块九项齐备，无缺项 |
| S03 | 核对命名规范与 D01 公共契约 §1 一致 | 命名空间/动作后缀/消歧要求与 D01 一致 |
| S04 | 核对 schema 规范与 D01 公共契约 §2 一致 | Link 引用语义表达、嵌套行项目、语义化返回结构齐备 |
| S05 | 核对 annotation 与 D01 公共契约 §3 一致 | 四布尔显式、旁挂后端「与外部世界交互=否」 |
| S06 | 核对错误转译与 D01 公共契约 §4 及 B01–B04 一致 | DuplicateEntryError 409 / TimestampMismatchError 417 等转译口径落地，含可自纠建议 |
| S07 | 核对幂等边界与 B05 §18.3 一致 | 窗口期 create 300s / confirm·cancel 60s 未放宽、指纹规则一致、confirm/cancel 状态断言=幂等成功 |
| S08 | 核对断言/批次口径与 D01 §6、PRD §5.2–§5.4 一致 | 乐观版本断言（写 tool 必带 `modified`）、批次可见性边界齐备 |
| S09 | 核对窄接口与允许清单边界与 D01 §7、PRD §2.3/§5.6 一致 | 清单外不读写、Link 目标受限、子表仅嵌套、最小权限声明齐备 |
| S10 | 核对未读取 C01a 正文/隐藏材料 | 本包证据仅引用 C01a 版本/完成标识，无候选正文痕迹 |

## 13. Evidence Manifest

证据统一维护在 `docs/task-packages/D02/evidence-manifest.md`，本文件不重复记录明细。

## 14. 完成定义

- [x] 全部前置条件已经在冻结后重新验证（D01 已通过；B01–B04、B05 均已封存；C01a 已封存仅版本标识；规范/PRD/总则/模板/登记表/边界规则均已冻结；MCP 2025-11-25 / SDK v1.29.0 由 B05 钉定）；
- [x] 工作项与交付物全部完成（W01–W06；CD-1 任务包、CD-2 tool-contract.md、CD-3 Evidence Manifest、CD-4 登记表 D02 行）；
- [x] 契约输出结构与完成定义未被擅自改变（tool-contract.md 覆盖 §9.1 全部 9 项 × 26 个 tool）；
- [x] 适用不变量均有正式证据（Evidence Manifest EV-D02-001..011）；
- [x] 冻结后正式开发自检通过（S01–S10 全部通过）；
- [x] Evidence Manifest 完整且正式证据可独立复核（逐项「上游条款 → 契约条款」对应）；
- [x] 未修改禁止范围（未读取 C01a 候选、未接入 ERPNext、未触碰 frozen/ 快照）；
- [x] 剩余限制和风险已记录（见 §16 与 tool-contract.md §7）；
- [x] Implementation Reviewer 记录评审通过（档位 1 不强制独立验收，正确性由下游 F 包首次使用时验证）。

## 15. 停止与升级条件

继承《MCP 改造任务包总则》第 6.15 节。另有以下 D02 条件时，停止受影响工作并转为「待澄清」：

- 权威输入互相冲突（如 PRD §5.1 与 B05 §18.3 窗口期/指纹口径不一致，或 B01–B04 接口事实与 PRD §5.2 断言冲突）；
- D01 公共契约与 PRD 逐 tool 需求无法调和，导致某 tool 契约无法确定性冻结；
- E02 实现能力与 D01 契约口径/B05 幂等边界无法对齐（如 E02 实现契约表明某口径不可实现），且无法仅靠契约口径调整解决；
- 需要接入 ERPNext 后端、数据库或任何外部服务才能完成契约冻结；
- 需要修改冻结规范、PRD、总则、模板、登记表结构或边界规则；
- 需要新增、删除、合并或拆分 tool，或改变 PRD §4.1 档位归属；
- 需要读取 C01a 题目正文、隐藏数据或终态断言才能完成本包。

报告必须包含阻断事实、影响范围、已完成的安全检查以及需要谁作出什么决定。

## 16. 风险、假设与待决事项

- **档位 1 验收边界**：D02 不设正式验收题、不强制独立验收，其正确性由下游 F 包首次使用时验证（总则 §7.1）。这要求 F 包实施时逐 tool 核对契约与实际 tool 契合度，发现契约缺失/歧义即回退 D02 升版；
- **幂等边界依赖 B05 冻结值**：窗口期 300s/60s、指纹规则、confirm/cancel 状态断言均来自 B05 §18.3 已封存结论，D02 只落地为逐 tool 契约口径、不得反向放宽；若 E02 实现时发现该口径不可行，须走变更控制（总则 §12）；
- **乐观版本断言为跨 tool 硬口径**：B01–B04 实测一致结论「写 tool 必须携带 `modified` 做乐观并发，否则无并发保护」将作为逐 tool 契约的 MUST 级口径写入；cancel 的版本保护是否施加由 D02 逐 tool 明确（B02 F3/B03 F3/B04 F3：标准 cancel 端点不接受 `modified`）；
- **显式 rate 写副作用**：SO/PO create 携带显式非零 `rate` 会写 Item Price 主数据（B02 F7/B03 F7），D02 须在 #13/#16 契约中明确「create 是否允许携带 rate、该副作用的台账归属与回滚」；
- **采购/库存链路的删除/回滚边界**：PR/STE/SR 已取消不可物理删除（GL/SLE 持久化，B03 F9/B04 F10），D02 须在契约中如实声明「不承诺删除已生效单据」；
- **C01a 隔离**：D02 只确认 C01a 完成及版本标识，不得读取候选正文/初始态/断言；C01a 候选落验收区，对本包实施主体不可读（边界 §3、总则 §13）；
- **E02 对齐点兜底**：D02 的幂等/断言/批次契约口径以 D01 公共契约 + B05 §18.3 为权威，并参照 E02 实现能力对齐；E02 已封存（实现契约冻结），D02 冻结时逐 tool 核对 E02 实现能力与契约口径对齐为兜底——必要时走变更控制，不在 D02 内静默调整。

## 17. 评审与状态记录

| 时间 | 原状态 | 新状态 | 操作人 | 依据/说明 |
|---|---|---|---|---|
| 2026-09-16 | 规划中 | 草拟 | Claude（D02 起草上下文） | 依据总则 §5 与登记表 D02 行，创建完整任务包文件并指定 Owner gjg；档位 1（轻量）契约设计包；必备结构完整，待 gjg 评审冻结 |
| 2026-09-16 | 草拟 | 待评审 | Claude（D02 起草上下文） | 必备结构完整，提交 gjg 评审 |
| 2026-09-16 | 待评审 | 已冻结 | gjg | 评审通过，无阻断问题；批准 D02 v1.0 冻结。评审中已修正两处：① §2 第 8 项错误转译 DuplicatedEntryError → DuplicateEntryError（与 §9.1 第 8 项、S06 拼写一致）；② §5 E02 对齐参照状态由「待验收」更新为「已封存」（E02 已独立验收通过并封存，见 E02 acceptance-record.md），§5 注释与 §16 对齐点兜底同步更新。尚未实施或验收 |
| 2026-09-16 | 已冻结 | 实施中 | Claude（D02 独立实施上下文） | 全部强制前置条件经重新验证成立；产出 CD-2 `tool-contract.md`（覆盖 §9.1 全部 9 项 × 26 个 tool，逐块九项齐备）并完成 W01–W06；未读取 C01a 候选、未接入 ERPNext、未触碰 frozen/ 快照 |
| 2026-09-16 | 实施中 | 待验收 | Claude（D02 独立实施上下文） | 交付物 CD-1..CD-4 全部完成；开发自检 S01–S10 全部通过；Evidence Manifest 已回填实际证据（EV-D02-001..011）；幂等边界与 B05 §18.3 一致（窗口期 create 300s / confirm·cancel 60s 未放宽）；`tool-contract.md` §7 记录 update/价格窗口期归入 create 组 300s 的 D02 确定口径及理由；未修改禁止范围；待 gjg（Implementation Reviewer）记录评审通过 |
| 2026-09-16 | 待验收 | 已通过 | gjg（Implementation Reviewer） | 档位 1 评审通过（以评审记录替代独立验收）：26 个 tool 契约块 × 9 项齐备、name/类型/档位与 PRD §3.3/§4.1 逐字一致；幂等窗口期 create 300s / confirm·cancel 60s 与 B05 §18.3 一致未放宽；指纹规则、confirm/cancel 状态断言=幂等成功与 D01 §5、B05 §18.3 一致；错误转译与 D01 §4 一致；乐观版本断言（写 tool 必带 `modified`）与 B01–B04 F2 一致；E02 对齐点核对无漂移；自检 S01–S10 通过、Evidence Manifest 可独立复核。正确性由下游 F 包首次使用时验证 |
