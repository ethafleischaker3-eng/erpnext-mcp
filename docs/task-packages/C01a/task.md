# C01a 盲生成业务验收场景（销售/采购多步候选）

> 文档版本：v1.0；状态：已冻结；Reviewer：gjg；决策人：gjg。
> 依据《MCP 改造任务包总则》v1.0 与《MCP 改造封闭任务包模板》v1.0 起草。

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 编号 | C01a |
| 名称 | 盲生成业务验收场景（销售/采购多步候选） |
| 版本 | v1.0 |
| 状态 | 已冻结 |
| 创建人 | gjg |
| Owner | gjg |
| Implementer | Claude（C01a 盲出题上下文，隔离实例；不得读取 PRD 全文、B01–B05 接口结论、MCP 契约或 server 实现） |
| Implementation Reviewer | gjg（不得接触候选正文/初始态/断言；需能读 B01–B05 结论以核 S04 零 B 系列痕迹） |
| Acceptance Reviewer | 不适用（候选尚未冻结；覆盖审查/可解性验证归 C01b） |
| Acceptor | gjg（独立验收，与盲出题上下文隔离） |
| 创建日期 | 2026-09-15 |
| 冻结日期 | 2026-09-15 |
| 完成日期 | 不适用 |
| 上游任务包 | B00（仅环境与源码版本就绪门槛，已封存 v1.0） |
| 下游任务包 | C01b（覆盖映射与任务集最终冻结）、D01/D02（仅见版本标识） |

> 角色隔离：Implementer（盲出题上下文）与 Acceptor（gjg）为不同执行实例。Implementer 必须满足「会话上下文 + 工作目录权限隔离」且未读过 B01–B05 结论；否则不得进入待评审。
>
> Implementation Reviewer 与 Acceptor 兼任的边界：总则 §6.1 仅明确允许 Implementation Reviewer 兼任 Owner，未允许其兼任 Acceptor。本包为出题包、风险可控，但须写清：Implementation Reviewer 只评审「输入与实施方案」（范围、隔离、格式契约），**不接触候选正文/初始态/断言**；gjg 以 Acceptor 身份独立验收时，读候选后即受题污染，不得参与 D/E/F 实现、调参或定向修复（总则 §2.5）。

## 2. 目标

在**不接触** B01–B05 接口结论、MCP 契约、server 实现或既有验收断言的前提下，仅依据 ERPNext 源码/数据模型与《开源后端 Agent 化接入规范》第 8 章，盲生成「销售/采购多步业务验收场景」候选，供 C01b 冻结验收矩阵、G01 集成验收使用。完成后得到：

- 至少 1 条完整销售多步业务场景候选、至少 1 条完整采购多步业务场景候选；
- 每道候选具备三段式骨架（初始态 / 自然语言指令 / 期望终态断言骨架）；
- 候选与实施侧结论无耦合（独立于 B01–B05、D 系列契约与任何 server 实现）。

## 3. 非目标

- 不冻结验收矩阵、不执行 tool 覆盖映射、不做可解性验证（归 C01b）；
- 不生成精确终态断言、评分脚本或隐藏初始数据快照（归 C01b/G01）；
- 不读取 B01–B05 接口结论、任何 MCP 契约、server 实现或既有验收断言；
- 不实现、不评审任何 tool 或契约；
- 不引入对象范围边界名单之外的对象。

## 4. 前置条件

| 条件 | 验证方式 | 状态 |
|---|---|---|
| P00 已封存，治理基线（总则/模板/登记表/边界）就绪 | 核对 P00 登记表状态=已封存 | 已满足 |
| B00 已封存，环境/源码版本/身份/权限/币种价格表/隔离 ACL 就绪 | 核对 B00 登记表状态=已封存 v1.0 + EV-B00-012 | 已满足 |
| 实施区/验收区实际路径已填写并经 Owner 确认（D:\second / D:\second-acceptance） | 核对边界生效条件 + B00 EV-B00-008/012 | 已满足 |
| 源码版本基线冻结：ERPNext 15.121.2 / Frappe 15.120.1；frappe_docker submodule 提交 a0c52135d4d41c4b8acf7adfdfc5bbcba46dd4d0 | 核对 .env ERPNEXT_VERSION + B00 EV-B00-001 | 已满足 |
| 数据模型交接文档 erp/README.md 可用 | 文件存在 | 已满足 |
| Owner 已建立对盲出题主体的只读拒绝 ACL：`docs/task-packages/B0[1-5]/`、`docs/task-records/`、PRD 全文 `docs/ERPNext-MCP改造PRD.md` 与验收区隐藏目录 task-sets/assertions/runs/snapshots | Owner 以管理员运行隔离脚本 + `icacls` 校验（出题会话无权建 ACL） | 已满足（setup/verify-c01a-isolation.ps1：B01–B04 + PRD + task-records + 4 隐藏哨兵均 READ_DENIED） |
| Owner 已建立对实施主体的只读拒绝 ACL：验收区隐藏目录 task-sets/assertions/runs/snapshots 与新增 candidates/ | Owner 以管理员运行隔离脚本 + `icacls` 校验 | 已满足（candidates/ 对 b00-impl Deny 已建立） |
| Owner 已授予盲出题主体对 `D:\second-acceptance\candidates\C01a\` 的写权限（自身产物） | Owner 以管理员建立 ACL | 已满足（verify 写探针 WRITE_OK） |
| Owner 已下发对象范围边界名单（Owner 前置交付，非本包写入集；三列：对象名 / 类别[操作允许·引用允许] / 读写性质[读写·只读]；忠实抽取自 PRD §2；路径 `docs/task-packages/C01a/object-scope.md`） | 名单文件存在 | 已满足（object-scope.md 已产出，12 操作 + 9 引用） |
| 盲出题主体负向读取自证：读 B0[1-5]/ 中已存在的目录（当前 B01–B04；B05 目录建立后补验）、PRD 全文与 task-records 及验收区隐藏目录 task-sets/assertions/runs/snapshots 哨兵均返回 ACCESS_DENIED | Owner 以管理员运行 verify-c01a-isolation.ps1；盲出题会话以 W01 复核 | 已满足（verify-c01a-isolation.ps1：B01–B04 + PRD + B04 冻结清单 + 4 隐藏哨兵全 READ_DENIED） |

> 注：`B0[1-5]/` 只读拒绝已建立（2026-09-15，覆盖 B01–B04；B05 建立后补验）。ACL 的**建立**归 Owner/管理员（复用 B00 的 setup-isolation 做法），盲出题主体**只做只读负向自证**，不得执行 icacls /deny 等写权限命令（见 §6.3）。

## 5. 权威输入

| 优先级 | 名称 | 路径/位置 | 版本或提交标识 |
|---|---|---|---|
| 1 | 开源后端 Agent 化接入规范 第 8 章（tool 设计规范） | docs/开源后端Agent化接入规范.md | 2026-09-07 定稿版 |
| 2 | ERPNext 数据模型（DocType、状态机、单据流转、对象↔API 映射） | erp/README.md | 2026-09-11 |
| 3 | frappe_docker 源码（部署形态与版本基线） | frappe_docker/（submodule） | 提交 a0c52135d4d41c4b8acf7adfdfc5bbcba46dd4d0；ERPNEXT_VERSION=v15.121.2 |
| 4 | 冻结源码版本基线 | 同上 .env + B00 EV-B00-001/008 | ERPNext 15.121.2 / Frappe 15.120.1 / MariaDB 11.8.9 |
| 5 | B00 冻结事实（环境/身份/权限/币种价格表，仅作启动门槛） | docs/task-packages/B00/（frozen/v1.0、evidence-manifest.md） | v1.0 已封存 |
| 6 | 对象范围边界名单（三列：对象名 / 类别[操作允许·引用允许] / 读写性质[读写·只读]） | `docs/task-packages/C01a/object-scope.md`（Owner 前置交付，从 PRD §2 忠实抽取，不含 tool 名/档位/幂等断言口径） | 随 C01a 冻结 |
| 7 | 本总则、任务包模板、登记表、实施区与验收区边界（治理约束，仅用于任务包起草与自检） | docs/ | v1.0 已冻结 |

> 场景生成（出题会话）只允许使用优先级 1–4 的输入 + 优先级 6 的对象名单作为范围边界；优先级 5（B00）仅作环境与源码版本就绪的启动门槛（总则 §13），不进入场景生成输入；优先级 7 仅用于任务包自身起草与自检。
>
> **PRD 不进入出题会话的场景生成输入**：PRD §3.3（tool 清单）与 §4（档位推导）属实施侧结论，读之即破坏盲隔离（总则 §13、规范 §12.1）。出题会话所需的对象范围由 Owner 从 PRD §2 忠实抽取三列名单下发（对象名 / 类别 / 读写性质），不给 PRD 全文。
>
> **名单的忠实性与来源追踪**：名单只准是 PRD §2.1「读写」列 + §2.3 清单的忠实子集，不含 tool 名、幂等/断言机制口径及档位类实施侧结论；随 C01a Freeze Manifest 记内容哈希 + 来源「PRD §2, 2026-09-12-r1」；PRD §2 若变，名单重抽、C01a 升版。读写性质由 Owner 归一为「读写/只读」两态，归一映射与理由随 Freeze Manifest 记录，不在本包正文展开。

## 6. 授权范围与所有权

### 6.1 可读取范围

- 可读：实施区 `frappe_docker/`（submodule 源码与 .env 版本基线）、`erp/README.md`（数据模型）、`docs/开源后端Agent化接入规范.md` 第 8 章、`docs/` 治理文档（总则/任务包模板/登记表/实施区与验收区边界）、Owner 下发的对象范围边界名单（`docs/task-packages/C01a/object-scope.md`）；`docs/task-packages/B00/` 仅核对封存状态（v1.0）作启动门槛，不读取其事实作场景生成输入。
- 严禁读：`docs/task-packages/B0[1-5]/` 任何文件（尤其各 interface-facts.md、task.md、implementer-brief.md）；**PRD 全文**（`docs/ERPNext-MCP改造PRD.md`）；`docs/task-records/` 任何文件（尤其各 B 系列 Freeze Manifest 与变更记录）；任何 MCP 契约或 server 实现；验收区隐藏目录 `task-sets/`、`assertions/`、`runs/`、`snapshots/` 的任何文件。
- 本包产物 `candidates/`（验收区）为出题会话自身的写入/回读空间，不属于上述严禁读；其对「实施主体」的只读拒绝由 Owner 建立（见 §4）。
- 一旦读到上述严禁内容，本上下文立即作废，停止并上报。

### 6.2 写入集

| 路径/对象 | 允许动作 | Owner | 是否共享 | 协调规则 |
|---|---|---|---|---|
| `docs/task-packages/C01a/task.md` | 创建/更新（治理文档，实施区） | gjg | 否 | 不适用 |
| `docs/task-packages/C01a/evidence-manifest.md` | 创建/更新（公开证据，实施区） | gjg | 否 | 不适用 |
| `D:\second-acceptance\candidates\C01a\` | 创建/回读（自检）（隐藏候选，验收区） | gjg | 否 | C01b 只读，冻结后迁入 task-sets/ |

> 治理文档（task.md、evidence-manifest.md）落实施区 `docs/task-packages/C01a/`，与 B00/B01 同构（总则 §15.1）；仅候选正文/初始态/断言属「正式验收隐藏材料」，落验收区 `candidates/`（边界 §3）。candidates/ 对实施主体的只读拒绝 ACL 由 Owner 建立（见前置条件），出题会话仅写入、不建 ACL。
>
> 路径约定已冻结：验收区目录清单（task-sets/assertions/runs/snapshots/reset/evidence + candidates/）已由边界文档 v1.1 §3.1 冻结（CHG-20260915-001）；本包 candidates/ 路径与访问属性以该清单为准。

### 6.3 系统、接口、数据与环境权限

| 权限类别 | 允许范围/对象 | 允许动作 | 明确禁止 | 是否可改变状态 | 不适用理由/审批与证据 |
|---|---|---|---|---|---|
| 系统、接口与命令 | 只读文件访问（Read/Glob/Grep/Bash 只读命令、icacls 只读核查） | 读 | 不调用 ERPNext 写接口、不执行任何写命令（含 icacls /grant、/deny、/remove 等改权限命令）、不建立/修改 ACL | 否 | 出题任务无需后端交互；ACL 建立归 Owner（前置条件） |
| 数据与凭证类型 | 不接触后端数据或凭据 | — | 不得记录或输出凭据值 | 否 | 场景仅基于数据模型，不取真实数据 |
| 数据库状态 | 不适用 | — | 不得连接/变更数据库 | 否 | 出题不落库 |
| 依赖安装 | 不适用 | — | 不得安装依赖 | 否 | 无依赖 |
| 运行环境与配置 | 不适用 | — | 不得修改运行环境 | 否 | 无环境变更 |
| 外部网络与服务 | 不适用 | — | 不得访问外部网络/服务 | 否 | 无外部依赖 |

## 7. 禁止事项

- 不得修改上游规范、冻结 PRD 和冻结验收题；
- 不得扩大对象、tool 或权限范围；
- 不得新增通用 CRUD 或任意代码执行面；
- 不得绕过 server 侧确认；
- 不得让失败路径静默成功；
- 不得输出密钥、密码、完整认证头、完整堆栈或未授权业务数据；
- 不得为通过验收而改变冻结题目；
- 不得将隐藏验收题、初始数据、评分细节或终态断言反馈给实施侧；
- 读取过隐藏验收材料的人员、会话或执行实例不得参与对应实现、实施方案评审、调参或定向修复；
- 本包特有：**不得读取 PRD 全文、B01–B05 结论、MCP 契约、server 实现或既有验收断言**；**不得将候选场景正文、初始态或断言反馈给实施区（D01/D02 仅见版本标识）**；不得为凑覆盖而引入对象范围边界名单之外的对象。

## 8. 工作项

| 编号 | 工作项 | 交付物/完成断言 |
|---|---|---|
| W01 | 以受限账户做负向读取自证（只读）：读 `docs/task-packages/B0[1-5]/` 中已存在的目录（当前 B01–B04；B05 建立后补验）与验收区隐藏目录 task-sets/assertions/runs/snapshots 哨兵，均须返回 ACCESS_DENIED；核对对象范围边界名单已下发 | 隔离自证记录（只读证据），纳入 Evidence Manifest |
| W02 | 仅据数据模型 + 规范第 8 章梳理销售/采购业务链路（销售：Customer/Item/Item Price → Sales Order → Delivery Note → Stock Ledger/Bin；采购：Supplier/Item → Purchase Order → Purchase Receipt → Stock Ledger/Bin） | 链路梳理记录（不引用任何 B 系列结论） |
| W03 | 生成完整销售多步业务场景候选（≥1 条，跨读/写/生效/库存追溯） | 销售场景候选文件（三段式骨架） |
| W04 | 生成完整采购多步业务场景候选（≥1 条，跨读/写/生效/库存追溯） | 采购场景候选文件（三段式骨架） |
| W05 | 对每道候选做自洽性初查（三段式可判定、无实施侧结论、对象均在对象范围边界名单内） | 自洽性初查记录 |
| W06 | 汇总证据清单与完成定义核对 | evidence-manifest.md |

> ACL 的建立不在本包工作项内，归 Owner/管理员的前置条件（见 §4）；出题会话只做 W01 的只读负向自证。

## 9. 输入输出契约

本包不定义 tool 契约（不适用）。场景候选的格式契约如下：

- 每道候选 = 三段式：`初始数据状态`（基于 schema 造合成数据的描述）+ `自然语言指令`（业务任务，不用 ERPNext 专有名词）+ `期望终态断言骨架`。骨架 = 字段级可判定（明确哪些记录的哪些字段应变成什么），不得为自然语言主观描述；但具体值、tool 映射与评分脚本由 C01b 补齐，本包不产出精确终态断言。
- 候选不写死 tool 名称、不写死接口路径、不引用 B01–B05 结论；由 C01b 依据冻结 D02 契约做 tool 覆盖映射与精确断言补齐。

## 10. 不变量

- 盲隔离成立：候选全程不引用 PRD 全文、B01–B05 结论、MCP 契约、server 实现或既有验收断言；
- 候选对象不超出 Owner 下发的对象范围边界名单（操作 12 类 + 引用 9 类）；
- 销售/采购多步链各 ≥1 条，且每条跨多个业务动作；
- 候选可判定（三段式完备，断言非主观）；
- 候选正文、初始态、断言不进入实施区。

## 11. 交付物

| 编号 | 交付物 | 存放位置 | 验收方式 |
|---|---|---|---|
| D01 | 本任务包 task.md（治理文档） | docs/task-packages/C01a/task.md | 结构完整、Owner 已指定 |
| D02 | 销售多步场景候选（隐藏） | D:\second-acceptance\candidates\C01a\ | 三段式完备、≥1 销售链 |
| D03 | 采购多步场景候选（隐藏） | D:\second-acceptance\candidates\C01a\ | 三段式完备、≥1 采购链 |
| D04 | Evidence Manifest（含 W01 盲隔离自证，公开） | docs/task-packages/C01a/evidence-manifest.md | 逐项可追溯 |

## 12. 开发自检

| 编号 | 检查方法 | 预期结果 |
|---|---|---|
| S01 | 以受限账户负向读取 B0[1-5]/ 中已存在目录（当前 B01–B04；B05 建立后补验）与验收区隐藏目录（task-sets/assertions/runs/snapshots）哨兵 | ACCESS_DENIED（盲隔离生效） |
| S02 | 逐道候选核对三段式完整性（初始态/指令/断言骨架） | 无缺段，断言非主观 |
| S03 | 覆盖核对：销售多步链 ≥1、采购多步链 ≥1 | 达标 |
| S04 | Implementation Reviewer 核对（需读 B01–B05 结论与 PRD §3.3 作对照）：扫描候选是否出现 B 系列结论、tool 名、档位词、接口路径、MCP/server 实现痕迹 | 零命中 |

> S01–S03 为盲出题会话自检；S04 需读 B01–B05 与 PRD §3.3 作对照，仅 Implementation Reviewer 可执行，不属盲会话自检。

## 13. Evidence Manifest

| 证据编号 | 对应项 | 执行者/时间 | 环境与版本 | 命令或操作 | 退出码/状态 | 结果摘要 | 原始输出/提交/快照 | 脱敏说明 |
|---|---|---|---|---|---|---|---|---|
| EV-C01a-001 | W01/S01 | 待填写 | 待填写 | 受限账户负向读取哨兵 | 待填写 | 待填写 | 待填写 | 待填写 |

## 14. 完成定义

- [ ] 全部前置条件已经验证（含 Owner 已分别建立「盲出题主体对 B0[1-5]/ 与 task-sets/assertions/runs/snapshots 只读拒绝」及「实施主体对 task-sets/assertions/runs/snapshots 与 candidates/ 只读拒绝」、盲出题主体负向自证通过、对象范围边界名单已下发）；
- [ ] W01–W06 全部完成；
- [ ] 销售/采购多步场景候选各 ≥1 条，三段式完备且可判定；
- [ ] 候选对象均在对象范围边界名单内，无实施侧结论痕迹（含 PRD tool 清单/档位口径）；
- [ ] 不变量均有证据；
- [ ] S01–S03 自检通过，S04（零 B 系列/tool/档位/接口痕迹）由 Implementation Reviewer 核对通过；
- [ ] Evidence Manifest 完整；
- [ ] 未修改禁止范围；
- [ ] 剩余限制和风险已记录；
- [ ] 独立验收通过。

## 15. 停止与升级条件

继承《MCP 改造任务包总则》第 6.15 节；本包特有：

- 一旦读到 PRD 全文、B01–B05 结论、MCP 契约、server 实现或既有验收断言，本上下文立即作废，停止并上报（盲隔离被破坏）；
- Owner 未分别建立「盲出题主体对 B0[1-5]/ 与 task-sets/assertions/runs/snapshots 的只读拒绝」及「实施主体对 task-sets/assertions/runs/snapshots 与 candidates/ 的只读拒绝」、或受限账户负向读取非 ACCESS_DENIED，停止；
- 对象范围边界名单未下发、或场景覆盖无法满足「销售/采购各 ≥1 多步链」、或无法自洽，停止并升级。

## 16. 风险、假设与待决事项

- 风险（已解除）：c01a-blind 对 B0[1-5]（B01–B04）与验收区隐藏目录的 Deny 已建立并经负向自证（B01–B04 + 4 隐藏哨兵全 READ_DENIED）；B05 建立后需补验其 Deny；
- 风险：单一自然人 gjg 兼任 Owner/Implementation Reviewer/Acceptor，读候选后即「受题污染」，不得参与 D/E/F 实现、调参或定向修复——已在 §1 注释写明 Reviewer 只评输入/方案、不碰候选正文；
- 已决：对象范围边界名单 = 三列忠实抽取（对象名 / 类别[操作允许·引用允许] / 读写性质[读写·只读]），来源 PRD §2.1「读写」列 + §2.3 清单，不含 tool 名、幂等/断言机制口径及档位类实施侧结论；读写性质由 Owner 归一为「读写/只读」两态，归一映射与理由随 Freeze Manifest 记录，不在本包正文展开；路径 `docs/task-packages/C01a/object-scope.md`（Owner 前置交付，非本包写入集）；随 C01a Freeze Manifest 记内容哈希 + 来源「PRD §2, 2026-09-12-r1」；PRD §2 若变，名单重抽、C01a 升版；
- 已决：candidates/ 路径 = `D:\second-acceptance\candidates\C01a\`（顶级独立目录，不并入 task-sets/）。理由：候选（前体）与 task-sets/（冻结任务集）是两个生命周期阶段，§6.2「冻结后迁入 task-sets/」已隐含二者并列；且盲出题主体对 task-sets/ 已有 Deny（§4），嵌套会逼出「Deny 子树里的 Allow 覆盖」，比独立目录的「实施主体 Deny + 盲主体 Allow」更脆、更难核查；
- 已决：验收区目录清单（task-sets/assertions/runs/snapshots/reset/evidence + candidates/）已由边界文档 v1.1 §3.1 冻结（CHG-20260915-001）；本包不再保留此项待决。

## 17. 评审与状态记录

| 时间 | 原状态 | 新状态 | 操作人 | 依据/说明 |
|---|---|---|---|---|
| 2026-09-15 | 规划中 | 草拟 | gjg | 已创建完整任务包文件并指定 Owner |
| 2026-09-15 | 草拟 | 草拟 | gjg | v0.2：修正盲隔离（剔除 PRD 可读）、落点拆分（治理文档入实施区、候选入验收区）、W01 拆主体（ACL 归 Owner、盲会话只读自证） |
| 2026-09-15 | 草拟 | 草拟 | gjg | v0.3：B00 恢复为「门槛」非「生成输入」；ACL 按主体拆分（盲出题主体 deny B0[1-5]+task-sets/assertions/runs，实施主体 deny task-sets/assertions/runs+candidates）；负向自证目标剔除 candidates/ |
| 2026-09-15 | 草拟 | 草拟 | gjg | v0.4：§6.2 candidates/ 允许动作补「回读（自检）」；§15 停止条件补实施主体对 candidates/ 只读拒绝；§4 补盲出题主体对 candidates/ 的正向写授权 |
| 2026-09-15 | 草拟 | 草拟 | gjg | v0.5：待决 1 落地为三列忠实抽取名单（对象名/类别/读写性质，来源 PRD §2，路径 object-scope.md，记哈希+来源追踪）；待决 2 的 candidates/ 定死为顶级目录不并入 task-sets/；仅剩「目录名冻结」待决（归边界文档升版） |
| 2026-09-15 | 草拟 | 草拟 | gjg | v0.5 补：验收区隐藏目录枚举统一补入 snapshots/（§4 三条、§6.1 严禁读、§6.2 注、W01、S01、§14、§15）；理由：snapshots/ 为初始数据快照所在，应然=隐藏 |
| 2026-09-15 | 草拟 | 草拟 | gjg | v0.6：§6.2 注与 §16 的「目录名待冻结/待决」改为已决（边界 v1.1 §3.1 已冻结，CHG-20260915-001）；登记表同步 v0.6 |
| 2026-09-15 | 草拟 | 草拟 | gjg | v0.7：Reviewer 约束移回 Implementer（Reviewer 只不碰候选正文、需能读 B 系列以核 S04）；object-scope.md 明确为 Owner 前置交付非本包写入集并标当前阻断；读写性质删「只出方案」态（避免经 §2.1 泄露盘点档位）；§9 补断言骨架边界；负向自证哨兵限定已存在 B 系列目录 |
| 2026-09-15 | 草拟 | 待评审 | gjg | v0.8：object-scope.md 已产出（12 操作 + 9 引用，忠实 PRD §2）；c01a-blind 账户 + B0[1-5]/隐藏区 Deny + candidates/C01a 写授权已建立，负向自证 B01–B04 + 4 隐藏哨兵全 READ_DENIED、candidates/C01a WRITE_OK；§4 前置条件全部转已满足；B01–B03 同步为 B01–B04 |
| 2026-09-15 | 待评审 | 待评审 | gjg | v0.9（评审修正）：移除 §5 注/§16 中「只出方案=只出 plan 档=盘点档位」的档位映射泄露（归一映射改随 Freeze Manifest 记录，盲会话不可见）；S04 改为 Implementation Reviewer 核对并删档位词枚举；§4 负向自证验证方式改 Owner 运行 verify 脚本、W01 降为盲会话复核 |
| 2026-09-15 | 待评审 | 待评审 | gjg | v0.10（盲隔离 ACL 补漏）：核查发现 PRD 全文与 docs/task-records/（B 系列 Freeze Manifest/变更记录）继承 Authenticated Users:F，c01a-blind 可读即泄实施侧结论；§4 盲主体只读拒绝范围补 PRD + task-records，§6.1 严禁读补 task-records；setup/verify 脚本同步补 Deny 与哨兵，待 Owner 重跑 teardown→setup→verify |
| 2026-09-15 | 待评审 | 已冻结 | gjg | v1.0：Implementation Reviewer 复核通过，无阻断；§4 前置条件全部已满足（含 PRD/task-records 补漏后重跑 setup/verify，B01–B04 + PRD + task-records + 4 隐藏哨兵全 READ_DENIED）；冻结产出 C01a v1.0 Freeze Manifest 与 frozen/v1.0 快照（task.md + object-scope.md 哈希随附） |
