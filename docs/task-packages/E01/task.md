# E01 权限、允许清单与人工确认

> 文档版本：v1.0；状态：已冻结；Reviewer：gjg；决策人：gjg。
> 依据《MCP 改造任务包总则》v1.1 与《MCP 改造封闭任务包模板》v1.0 起草。

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 编号 | E01 |
| 名称 | 权限、允许清单与人工确认 |
| 版本 | v1.0 |
| 状态 | 已冻结 |
| 创建人 | Claude（E01 起草上下文） |
| Owner | gjg |
| Implementer | Claude（E01 独立实施上下文，与 Acceptor 隔离；不得读取 C01b 冻结任务集正文/断言） |
| Implementation Reviewer | gjg（评审输入与实施方案，不得读取 C01b 冻结任务集正文/隐藏断言） |
| Acceptance Reviewer | 不适用（E01 自身不生成隐藏验收题；独立验收以实测越权/确认/fail-closed 与权限矩阵核对为准） |
| Acceptor | gjg（独立验收，与 Implementer 隔离；可读 C01b 冻结任务集 T11–T15 口径作越权/失败路径验收基准） |
| 创建日期 | 2026-09-16 |
| 冻结日期 | 2026-09-16 |
| 完成日期 | 不适用 |
| 上游任务包 | C01b（已封存，冻结任务集，T14 越权与 T11–T15 失败路径为验收口径）；D02（已通过，26 tool 契约）；D01（已通过，公共契约与错误模型）；B00（已封存，可信调用方身份/权限可行性结论）；A01（已封存，L3 客户端确认能力结论） |
| 下游任务包 | F01（通用查询）、F02（销售与采购闭环）、F04（库存与主数据维护）、G01（完整集成验收） |

> 角色隔离与受题污染（总则 §2.5）：E01 是档位 3（完整）任务，需独立验收。Implementer（Claude E01 实施上下文）依据 D02/D01/PRD/B00 形成权限矩阵与允许清单，**不得读取 C01b 冻结任务集**（`task-sets/`、`assertions/`）的题目正文、初始数据或精确断言——越权/失败路径的客观口径已由 PRD §2.3/§5.6 与 D02 契约充分确定，无需读题即可实施。Acceptor（gjg）独立验收时读 C01b T11–T15 口径，读后即受题污染，不得参与 F01/F02/F04 实现、评审、调参或定向修复。
>
> **档位说明**（总则 §7.1）：E01 为档位 3（完整）——直接管控越权面的安全底座（权限/允许清单/人工确认）。强制环节 = 冻结 → 实施 → 独立验收 → 封存 + 下游影响记录 + Freeze Manifest。

## 2. 目标

依据冻结 D02 26 tool 契约、D01 公共契约与 B00 身份/权限可行性结论，形成并**客观验证**以下安全底座，作为 F01/F02/F04 实施与 G01 验收的权威输入：

1. **正式业务账号/角色**：专用系统账号 + 专用角色（区分管理员运维主体与普通 MCP 调用方主体），权限收敛到允许清单所需最小权限，**不沿用 B00 临时探针权限**；
2. **权限矩阵**：逐 tool 明确其对象访问需求（操作允许对象按 PRD §2.1 声明能力：9 读写 / 2 只读 / 1 只出方案；引用允许对象只读），产出可复核的「tool × 对象 × 权限」矩阵；
3. **两张允许清单**（server 侧强制执行）：操作允许清单 12 类可经授权 tool 访问（读写能力按 PRD §2.1 逐对象：9 读写 / 2 只读 / 1 只出方案），引用允许清单 9 类只可引用不可增删改，清单外对象 MUST NOT 读或写；
4. **人工确认机制**：人确认档写 tool 未经有效 server 侧确认不得写入；确认由 server 侧发起、经客户端展示并由用户裁决，拒绝时不得写入（规范 §9.7）；
5. **fail-closed**：币种/默认价格表 fail-closed（PRD 决议 2）与 L3/L2 降级 fail-closed（PRD 决议 1）兜底；
6. **越权验证**：实测清单外对象读写、引用清单对象增删改、跨调用方批次读取均被拒绝，且转译为 D01 `permission_denied` 可自纠报错。

完成后得到：一份冻结的权限矩阵、两张允许清单的 server 侧落地、正式账号/角色与权限配置、人工确认与 fail-closed 机制规范，以及可复核的越权验证记录。

## 3. 非目标

- 不实现任何业务 tool、MCP server 业务接入或通用查询能力（F01/F02/F04 职责）；
- 不实现幂等、前置断言、事后校验、批次台账与状态查询（E02 已封存，E01 仅作为对齐参照引用，不重复实现）；
- 不沿用 B00 临时探针权限作为正式业务权限；
- 不扩大操作允许清单（12 类）或引用允许清单（9 类）成员；
- 不修改冻结 PRD、规范、总则、D01 公共契约、D02 tool 契约、B00/A01 结论或 C01b 冻结任务集；
- 不实际运行正式验收（G01 职责）；本包越权验证为 E01 自身安全底座的客观实测，非 G01 集成验收；
- 不把 C01b 冻结任务集正文、初始数据、断言或评分细节反馈给实施区或 F 包；
- 不冻结 F 包的业务实现手法（F 包职责）。

## 4. 前置条件

| 条件 | 验证方式 | 状态 |
|---|---|---|
| C01b v1.0 已封存（冻结任务集，T14 越权 + T11–T15 失败路径口径） | 检查 C01b 登记表行、task.md §18 | 已验证 |
| D02 v1.0 已通过（`tool-contract.md` 冻结 26 tool 契约与档位） | 检查 D02 登记表行 | 已验证 |
| D01 v1.0 已通过（`common-contract.md` 公共契约与错误模型） | 检查 D01 登记表行 | 已验证 |
| B00 v1.0 已封存（可信调用方身份结论 + 权限模型可行性结论） | 检查 B00 登记表行、task.md §18.3 | 已验证 |
| A01 v1.0 已封存（客户端 server 侧确认能力结论 = L3 成立） | 检查 A01 登记表行 | 已验证 |
| 实施区/验收区实际路径已填写、隔离已生效 | 检查边界文档 v1.1 + B00 证据 | 已验证 |
| 本地验收环境可写用户/角色/权限（站点 `erpnext.local` 独占、非生产、可销毁） | 检查 B00 结论与快照重置能力 | 已验证 |
| Owner 已明确、Implementer/Implementation Reviewer/Acceptor 已确定 | 本文件 §1 | 已验证 |
| Implementer 会话对 C01b `task-sets/`、`assertions/` 只读拒绝（负向自证 ACCESS_DENIED） | 负向读取自证 + `icacls` 核查 | 已验证（2026-09-16，Owner 以 `b00-impl` 补跑 `verify-isolation.ps1` 得 ACCESS_DENIED） |

> 任一强制前置不成立，任务不得进入实施中。第 9 条为实施前隔离自证（总则 §16.2 精神）：ACL 归 Owner（复用 B00/C01b 隔离），Implementer 会话只做只读负向自证。

## 5. 权威输入

| 优先级 | 名称 | 路径/位置 | 版本或提交标识 |
|---|---|---|---|
| 1 | 开源后端 Agent 化接入规范 | `docs/开源后端Agent化接入规范.md` | 2026-09-07 定稿版 |
| 2 | ERPNext-MCP 改造 PRD | `docs/ERPNext-MCP改造PRD.md` | 2026-09-12-r1 |
| 3 | MCP 改造任务包总则 | `docs/MCP改造任务包总则.md` | v1.1（升版 2026-09-15） |
| 4 | D02 业务 tool 契约（26 tool 逐 tool 冻结口径） | `docs/task-packages/D02/tool-contract.md` | v1.0 已通过 |
| 5 | D01 公共契约与错误模型（统一基座） | `docs/task-packages/D01/common-contract.md` | v1.0 已通过 |
| 6 | B00 可信调用方身份 + 权限模型可行性结论 | `docs/task-packages/B00/task.md` §18.3、`D:\second-acceptance\evidence\` | v1.0 已封存 |
| 7 | A01 客户端 server 侧确认能力结论（L3 成立） | `docs/task-packages/A01/` | v1.0 已封存 |
| 8 | C01b 冻结任务集（仅越权/失败路径验收口径；Implementer 不可读） | `D:\second-acceptance\task-sets\`、`assertions\` | v1.0 已封存 |
| 9 | C01a 对象范围边界名单（12 操作 + 9 引用） | `docs/task-packages/C01a/object-scope.md` | v1.0 已封存 |
| 10 | 治理约束（模板/登记表/边界） | `docs/` | v1.1 / v1.0 已冻结 |

> 与 C01b 的关系：E01 是**实施区**任务，Implementer 只读第 1–7、9、10 项；第 8 项（C01b 冻结任务集）仅供 Acceptor 独立验收时核对越权/失败路径口径，**不得进入 Implementer 会话**（总则 §13：C01b 产物不得反馈实施区）。

## 6. 授权范围与所有权

### 6.1 可读取范围

- 可读：D02 `tool-contract.md`；D01 `common-contract.md`；C01a `object-scope.md`；B00 task.md §18.3 与脱敏证据；A01 结论；PRD 全文；规范全文；`docs/` 治理文档；本包目录 `docs/task-packages/E01/`；
- 可读（自证用）：验收区隐藏目录 `task-sets/`、`assertions/`、`runs/`、`snapshots/` 的隔离哨兵（负向读取须 ACCESS_DENIED）；
- 严禁读：C01b 冻结任务集正文、精确断言、初始数据、评分细节（`task-sets/C01b-v1.0.md`、`assertions/C01b-v1.0.md` 等）。

### 6.2 写入集

| 路径/对象 | 允许动作 | Owner | 是否共享 | 协调规则 |
|---|---|---|---|---|
| `docs/task-packages/E01/` | 新增和维护 E01 任务包、权限矩阵、允许清单落地、确认/fail-closed 机制规范、越权验证记录（脱敏）、Evidence Manifest | gjg | 否 | 状态变化追加记录，不覆盖历史 |
| 后端验收环境用户/角色/权限 | 创建正式业务系统账号、专用角色与 DocPerm 权限配置（复用/替换 B00 临时探针，先建后验） | gjg | 否 | 仅本地验收环境；每次变更记录命令与终态 |
| `docs/任务包登记表.md` 的 E01 行 | 更新 E01 版本、状态、角色、路径与证据位置 | gjg | 是 | 仅更新 E01 行 |
| `docs/task-records/freeze-manifests/E01-v1.0.md` | 冻结时登记 E01 冻结清单与哈希 | gjg | 否 | 哈希针对冻结文件计算，不写回被哈希文件 |
| `docs/task-records/changes/`、`returns/` | 保存 E01 变更或退回记录（如发生） | gjg | 是 | 稳定编号、独立文件 |

> 后端权限配置的原始证据、账号/角色定义与敏感操作日志不入公开实施区；脱敏后引用登记入 Evidence Manifest（总则 §15.1）。

### 6.3 系统、接口、数据与环境权限

| 权限类别 | 允许范围/对象 | 允许动作 | 明确禁止 | 是否可改变状态 | 不适用理由/审批与证据 |
|---|---|---|---|---|---|
| 系统、接口与命令 | 本地 Docker Compose 生命周期；`docker exec` bench 命令；`curl` 后端 REST API；`mariadb` 只读查询 | 启动/停止容器、执行 bench 命令（建账号/角色/DocPerm、查询权限）、调用受限 API、只读数据库查询 | 禁止调用业务写接口扩大对象范围；禁止修改后端源码；禁止 `git push`、历史改写 | 是，仅本地验收环境后端用户/角色/权限 | 由本包交付物与证据证明 |
| 数据与凭证类型 | 本地开发默认凭据（管理员账号、API Key/Secret，取值见 `erp/README.md`，本文件不列明） | 读取并使用以配置权限 | 不得记录或输出凭据值、完整认证头 | 否 | 仅本地验收环境；证据脱敏 |
| 数据库状态 | 站点库（读 + 建立权限所需的系统表写） | 读；经管理员账号写入用户/角色/DocPerm 系统表 | 禁止改变业务单据/主数据终态（除越权验证所需的受控合成探测） | 是，仅验收环境权限配置 | 每次写/重置记录命令与终态，纳入 Evidence Manifest |
| 依赖安装 | 不适用 | 禁止 | 禁止安装或升级依赖 | 否 | 复用现有环境 |
| 运行环境与配置 | 本地 Docker 容器与 bench 运行时 | 启停容器、执行 bench、配置角色/权限 | 禁止修改 `frappe_docker` 上游工作树 | 是，仅容器生命周期与后端权限 | 由证据证明未改动上游 |
| 外部网络与服务 | 不适用 | 禁止 | 禁止外部网络调用 | 否 | 后端为本地 `localhost:8080` |

## 7. 禁止事项

- 不得修改上游规范、冻结 PRD、总则、D01/D02 契约、B00/A01 结论或 C01b 冻结任务集；
- 不得扩大操作允许清单（12 类）或引用允许清单（9 类）成员，不得新增对象、tool 或权限范围；
- 不得直接沿用 B00 临时探针权限作为正式业务权限；
- 不得新增通用 CRUD 或任意代码执行面；
- 不得绕过 server 侧确认（人确认档写 tool 未经确认不得写入）；
- 不得让失败路径静默成功，错误不得以成功响应伪装；
- 不得输出密钥、密码、完整认证头、完整堆栈或未授权业务数据；
- 不得将 C01b 冻结任务集正文、初始数据、精确断言或评分细节反馈给实施区或 F 包；
- 读取过 C01b 冻结任务集的人员、会话或执行实例不得参与 F01/F02/F04 实现、评审、调参或定向修复；
- 本包特有：不得在验收环境之外（生产/共享环境）创建账号、角色或权限；越权验证只作用于合成探测对象，不得破坏基线主数据。

## 8. 工作项

| 编号 | 工作项 | 交付物/完成断言 |
|---|---|---|
| W01 | 前置与隔离自证：核对 §4 前置；Implementer 会话对 C01b `task-sets/`、`assertions/` 负向读取 ACCESS_DENIED 自证 | 隔离自证记录（只读证据），纳入 Evidence Manifest |
| W02 | 权限矩阵推导：从 D02 逐 tool 契约提取对象访问需求，产出「tool × 对象 × 读/写」矩阵初稿（操作允许 12 类按 §2.1 读写列、引用允许 9 类只读、清单外无权限） | `permission-matrix.md`（权限矩阵） |
| W03 | 正式账号/角色落地：专用系统账号 + 专用角色（区分管理员运维 vs 普通 MCP 调用方），DocPerm 收敛到允许清单最小权限，替换 B00 临时探针 | 正式账号/角色定义 + 权限配置（验收环境） |
| W04 | 两张允许清单落地：操作允许清单 12 类可经授权 tool 访问（读写能力按 PRD §2.1 逐对象）、引用允许清单 9 类只读、清单外 MUST NOT 读写，server 侧强制执行 | 允许清单落地说明（含 server 侧拦截点） |
| W05 | 人工确认机制：人确认档写 tool 未经有效 server 侧确认不得写入；确认请求 server 发起、客户端展示、用户裁决，拒绝即不写入 | 确认机制规范（对齐 A01 L3 结论） |
| W06 | fail-closed：币种/默认价格表 fail-closed（PRD 决议 2）+ 客户端不支持确认时写 tool 全量降级 fail-closed（PRD 决议 1） | fail-closed 规范 |
| W07 | 越权验证：清单外对象读写被后端原生拒绝、引用清单对象增删改被拒、普通调用方读他人批次被拒，且转译 `permission_denied` 可自纠报错 | 越权验证记录（脱敏） |
| W08 | 对齐核对与自检（Implementer）：权限矩阵/允许清单/确认/fail-closed 与 D02 契约、D01 §7 对齐；Evidence Manifest 回填 | 对齐核对记录 + Evidence Manifest |
| W09 | C01b T11–T15 口径对齐核对（Acceptor）：独立验收时核对越权/失败路径口径与 C01b 冻结任务集一致（Implementer 不读题） | 验收侧对齐核对记录（随 §18 验收记录，Implementer 不可见） |

## 9. 输入输出契约

E01 不定义可调用业务 tool 契约（不适用）。本节规定 E01 输出作为 F01/F02/F04 与 G01 权威输入的结构口径：

1. **权限矩阵**（`permission-matrix.md`）：逐 tool（#1–#26）列出其目标对象（操作允许/引用允许）、所需权限（读/写/只出方案）与后端 DocType；反向逐对象（12 操作 + 9 引用）列出哪些 tool 以何种权限访问。矩阵必须与 D02 各 tool 窄接口边界逐项一致，不得出现清单外对象；
2. **两张允许清单**：操作允许清单成员 = 12 类（Customer、Supplier、Item、Item Price、Sales Order、Purchase Order、Purchase Receipt、Delivery Note、Stock Entry、Stock Reconciliation、Bin、Stock Ledger Entry）；引用允许清单成员 = 9 类（Company、Warehouse、Price List、Currency、Customer Group、Supplier Group、Territory、Item Group、Unit of Measure）。清单外 MUST NOT 读写，引用清单只可引用不可增删改（PRD §2.3、D01 §7）；
3. **正式账号/角色**：专用系统账号 + 专用角色，权限收敛到「各操作允许对象按其声明能力所需读写 + 引用允许对象读」，不授予用户/角色/设置与两张清单外对象任何权限（PRD §5.6）；管理员运维主体与普通 MCP 调用方主体分离（B00 身份结论）；
4. **人工确认**：人确认档写 tool 未经有效 server 侧确认不得写入；确认由 server 侧发起、客户端完整展示拟写动作后由用户裁决，拒绝/不支持即 fail-closed（规范 §9.7、A01 L3 结论）；
5. **fail-closed**：`gjg.default_currency` 为空或 `selling=1 且 enabled=1` 价格表数量 ≠ 1 时拒绝初始化写入能力（只读可用）；客户端不支持确认时全部写 tool（含全自动草稿创建）拒绝写入、仅返回 plan 或可自纠错误（PRD 决议 1/2）。

## 10. 不变量

- 两张允许清单之外的对象不可被操作或引用；引用允许清单对象只可引用、不可经 MCP 增删改（总则 §6.10、D01 §8）；
- 人确认操作未经有效 server 侧确认不得写入（规范 §9.7）；
- 正式业务权限不沿用 B00 临时探针权限（总则 §13）；
- 权限矩阵与 D02 逐 tool 契约、D01 §7 完全一致，无清单外对象、无越界读写；
- 越权一律由后端原生权限拒绝并转译为 `permission_denied` 可自纠报错，不透出堆栈（D01 §4.2）；
- 普通调用方不得读取其他调用方的批次信息（总则 §6.10、D01 §6.4）；
- fail-closed 条件命中时必须拒绝写入，不得静默选用或任选其一（PRD 决议 2）；
- 后端不可达时不得自动重试写操作；错误不得以成功响应伪装；
- 未经上游冻结结论的字段/行为表述不得写入权限矩阵或机制规范（不以推测代替结论）。

## 11. 交付物

| 编号 | 交付物 | 存放位置 | 验收方式 |
|---|---|---|---|
| D01 | E01 任务包 | `docs/task-packages/E01/task.md` | 结构完整、Owner 已指定 |
| D02 | 权限矩阵 | `docs/task-packages/E01/permission-matrix.md` | 逐 tool 逐对象可复核，与 D02/D01 一致 |
| D03 | 两张允许清单落地说明 | `docs/task-packages/E01/allowlist.md`（脱敏；配置/证据落 `D:\second-acceptance\evidence\`） | 12+9 成员、清单外拒绝可复核 |
| D04 | 正式账号/角色与权限配置 | `docs/task-packages/E01/roles.md`（脱敏）+ 验收环境实际配置 | 权限收敛最小、不沿用临时探针 |
| D05 | 人工确认与 fail-closed 机制规范 | `docs/task-packages/E01/confirmation-failclosed.md` | 对齐 A01 L3 结论与 PRD 决议 1/2 |
| D06 | 越权验证记录 | `docs/task-packages/E01/authorization-verification.md`（脱敏）+ 原始证据 `D:\second-acceptance\evidence\` | 越权拒绝实测可复核 |
| D07 | Evidence Manifest | `docs/task-packages/E01/evidence-manifest.md` | 逐项可追溯 |
| D08 | 更新后的登记表 | `docs/任务包登记表.md` | E01 行与本文件一致 |

## 12. 开发自检

| 编号 | 检查方法 | 预期结果 |
|---|---|---|
| S01 | Implementer 会话负向读取 C01b `task-sets/`、`assertions/` 哨兵 | ACCESS_DENIED（隔离生效） |
| S02 | 权限矩阵逐 tool 与 D02 契约窄接口边界核对 | 无清单外对象、无越界读写、逐项一致 |
| S03 | 允许清单成员核对（12 操作 + 9 引用，忠实 PRD §2.3） | 无遗漏、无多列 |
| S04 | 正式角色权限收敛核对（各对象按其声明能力读写 + 引用对象读，无清单外授权） | 最小权限、无超额授权 |
| S05 | 人确认档写 tool 未确认不写入（拒绝/不支持时 fail-closed） | 无未确认写入 |
| S06 | 币种/价格表 fail-closed 条件命中时拒绝初始化写入 | fail-closed 生效，只读可用 |
| S07 | 越权实测：清单外对象读写、引用对象增删改、跨调用方批次读取均拒绝并转译 `permission_denied` | 越权全拒绝、报错可自纠 |
| S08 | 权限矩阵/允许清单/确认/fail-closed 与 C01b T11–T15 口径对齐（Acceptor 核对，Implementer 不读题） | 与冻结口径一致 |

## 13. Evidence Manifest

证据统一维护在 `docs/task-packages/E01/evidence-manifest.md`，本文件不重复记录明细。

## 14. 完成定义

- [x] 全部前置条件已验证（含 Implementer 会话隔离自证）；
- [x] 工作项与交付物全部完成（W01–W09；D01–D08）；
- [x] 权限矩阵与 D02 契约、D01 §7 逐项一致，无清单外对象；
- [x] 两张允许清单成员忠实 PRD §2.3（12 操作 + 9 引用），清单外 MUST NOT 读写；
- [x] 正式账号/角色权限收敛最小，不沿用 B00 临时探针权限；
- [x] 人工确认与 fail-closed 对齐 A01 L3 结论与 PRD 决议 1/2；
- [x] 越权验证通过（清单外/引用增删改均拒绝；跨调用方批次读取属 MCP server 侧，见 §18.1 说明）；
- [x] 隐藏材料未进入实施区，未修改禁止范围；
- [x] Evidence Manifest 完整、Freeze Manifest 已登记；
- [x] 剩余限制和风险已记录；
- [x] 独立验收通过（档位 3）。

## 15. 停止与升级条件

继承《MCP 改造任务包总则》第 6.15 节。本包特有：

- 后端权限模型无法按调用方粒度配置正式最小权限，或无法区分管理员/普通调用方（停止）；
- 无法满足两张允许清单的 server 侧强制拦截（清单外对象可被读写，停止）；
- 越权验证发现清单外对象可被访问、或引用对象可被增删改（停止并修复权限配置）；
- 客户端 server 侧确认能力结论与 A01 冻结结论不符，需改变 L3/L2 形态（停止并升级）；
- 需要新增对象、tool、权限或外部依赖（停止并升级）；
- 权限矩阵与 D02 契约冲突，需改变 D02 契约（停止并回 D02 走变更控制，不得在 E01 内静默调整）。

报告必须包含阻断事实、影响范围、已完成的安全检查以及需要谁作出什么决定。

## 16. 风险、假设与待决事项

- **受题污染**：单一自然人 gjg 兼任 Owner / Implementation Reviewer / Acceptor；Acceptor 读 C01b T11–T15 后受题污染，不得参与 F 包实现/评审/调参。Implementation Reviewer 仅评输入与方案、不读 C01b 冻结任务集（§1 已写明）；
- **权限底座与业务实现解耦**：E01 只形成并验证权限/允许清单/确认/fail-closed 底座，不绑定 F 包实现手法；F 包接入时须逐 tool 挂接本底座（总则 §16.3）；
- **B00 临时探针替换**：E01 以正式账号/角色替换 B00 临时探针权限；替换前须先验证正式角色可用、再收窄/移除临时探针（先建后验，避免破坏验收环境）；
- **确认机制的客户端依赖**：人工确认以 A01 冻结的 L3 结论为前提；若 G01 运行时客户端能力核查结果变化，激活形态（L3/L2）由运行时决定，E01 只提供 fail-closed 兜底（PRD §1.3）；
- **待决**：正式账号/角色的命名与 DocPerm 粒度（按 DocType 级还是按 tool 级）待 Implementation Reviewer 评审确认；倾向 DocType 级 + 角色收敛，权限矩阵保留 tool 级映射供 F 包接线。

## 17. 评审与状态记录

| 时间 | 原状态 | 新状态 | 操作人 | 依据/说明 |
|---|---|---|---|---|
| 2026-09-16 | 规划中 | 草拟 | Claude（E01 起草上下文） | 依据总则 §5 与登记表 E01 行，创建完整任务包并指定 Owner gjg；档位 3（完整）；前置 C01b/D02/D01/B00/A01 均已完成；待 gjg 评审冻结 |
| 2026-09-16 | 草拟 | 待评审 | Claude（E01 起草上下文） | 必备结构完整，提交 gjg 评审 |
| 2026-09-16 | 待评审 | 已冻结 | gjg | 评审通过，无阻断问题；批准 E01 v1.0 冻结。评审中已修正三处：① §2 目标 2/3 与 W04 将笼统「操作允许清单 12 类读写」改为「按 PRD §2.1 声明能力：9 读写 / 2 只读 / 1 只出方案」「可经授权 tool 访问」，避免对只读对象（Bin、Stock Ledger Entry）与只出方案对象（Stock Reconciliation）超额授权；② 工作项拆分：W08 仅对齐 D02 契约 + D01 §7（Implementer），新增 W09 将 C01b T11–T15 口径对齐归 Acceptor（Implementer 不读题，与 S08/§1 一致）；③ 交付物 D06 越权验证记录钉死文件名 `authorization-verification.md`。尚未实施或验收 |
| 2026-09-16 | 已冻结 | 实施中 | Claude（E01 独立实施上下文） | 依据 D02/D01/C01a/PRD/规范/B00 §18.3/A01 完成 W02–W08：产出 `permission-matrix.md`、`allowlist.md`、`roles.md`、`confirmation-failclosed.md`、`authorization-verification.md`、`evidence-manifest.md`；后端落地专用角色 `MCP Business Caller`（21 DocType DocPerm）+ 账号 `mcp-service`；越权验证通过（清单外业务对象/引用增删改/只读写均 403），并如实记录框架级残余（User 自读、Contact/Address 自建自读的「All」角色 if_owner + dynamic_links，MCP tool 层白名单兜底）。未读 C01b 冻结任务集正文/断言 |
| 2026-09-16 | 实施中 | 待验收 | Claude（E01 独立实施上下文） | 全部交付物与证据已提交；W01 隔离自证已由 Owner 以 `b00-impl` 补跑 `verify-isolation.ps1` 得 ACCESS_DENIED，前置条件第 9 条「已验证」；W09（C01b T11–T15 口径对齐）归 Acceptor。待 gjg 独立验收（档位 3） |
| 2026-09-16 | 待验收 | 已封存 | gjg（Acceptor，独立验收） | 独立验收通过（档位 3）。Acceptor 读 C01b T11–T15 完成 W09/S08 对齐核对（T14 建仓库越权 ↔ 写 Warehouse 403、T15 作废发货单 ↔ DN 无 cancel DocPerm，均一致；T11/T12/T13 属 D02/E02 机制层，E01 底座无冲突）；独立重跑越权/正向用例全通过；验收期修正 `mcp-service` user_type Website→System User（与 roles.md §2 对齐）并复测无回归。详见 §18。读题后受题污染，不再参与 F01/F02/F04 实现/评审/调参 |
| 2026-09-17 | 已封存（v1.0） | 已封存（v1.1，待后端授权+复测） | gjg（Owner） | CHG-20260917-E01-001 批准：`MCP Business Caller` 补 Account/Cost Center 只读 DocPerm（21→23），解除 F02 #13–#22 真实后端写 403 阻断（建销售/采购单据须解析行项目 income_account/expense_account/cost_center，Link 到 Account/Cost Center）。`permission-matrix.md`/`roles.md`/`allowlist.md` 升版 v1.1（Account/Cost Center 仅 `read`，不授写、不升允许清单成员、不作 tool 目标对象）。后端运行时授权 + F02 realsmoke 复测 + 越权复测（Account/Cost Center 仅读不可写）待执行，通过后回填封存 |

## 18. 封存记录与下游影响

### 18.1 封存信息

| 字段 | 内容 |
|---|---|
| 状态 | 已封存 |
| 封存日期 | 2026-09-16 |
| 操作人 | gjg（Acceptor，独立于 Implementer） |
| 档位 | 档位 3（完整），强制独立验收 |
| 结论 | **独立验收通过**。核心安全底座（正式账号/角色、21 DocPerm 最小权限、两张允许清单 server 侧强制、人工确认、fail-closed、越权拒绝）经 Acceptor 独立重跑实测成立，与 D02/D01/C01a/PRD/C01b T11–T15 逐项一致 |
| Freeze Manifest | `docs/task-records/freeze-manifests/E01-v1.0.md`（冻结哈希 `c779bd44…` 已核一致） |

### 18.2 独立验收方式与结果

Acceptor（gjg）不采信实施侧自证，独立完成：

1. **冻结完整性**：`frozen/v1.0/task.md` SHA-256 = `c779bd4436b4b810b16b2def39991e73b967aefb6045d3307603455dd9c4661f`，与 Freeze Manifest 一致；当前 `task.md` 仅追加状态记录、未覆盖冻结语义。
2. **后端终态独立复核（DB 直查 + token 直调）**：
   - `MCP Business Caller` 角色 21 个 DocPerm 与 `roles.md` §3 / `permission-matrix.md` §3 **逐项一致**（9 读写含 SO/PO cancel、PR/DN/SE 无 cancel、2 只读、1 只出方案、9 引用只读；`delete`/`amend` 全 0）；
   - 账号 `mcp-service@erpnext.local` 仅挂 `MCP Business Caller` 一个角色；DocPerm `if_owner=0`；
   - 独立重跑：越权 9 项（读 Role/Sales Invoice、写 User/Sales Invoice、Warehouse 增、Company 改、Currency 删、Bin/SLE 写）全 403；正向读 4 项（Customer/Warehouse/Bin/SLE）全 200；Customer create 200；跨 owner 读（mcp-service 读 admin 建客户）可见。
3. **W09/S08（C01b T11–T15 口径对齐，Acceptor 核对）**：
   - T14 越权（建仓库）↔ `authorization-verification.md` §3.2 写 Warehouse 403 —— 一致（Warehouse 属引用清单，只可引用不可增，后端原生拒绝，agent 得 `permission_denied`）；
   - T15 声明与实现不一致（作废发货单）↔ `roles.md` §1 异常回滚仅管理员 + `permission-matrix.md` §3 Delivery Note 无 cancel DocPerm —— 一致（DN 无 cancel tool 且无 cancel 权限，普通调用方无法作废）；
   - T11 参数缺失 / T12 前置断言 / T13 幂等冲突 —— 属 D02 schema/前置断言、E02/B05 幂等机制层，E01 权限底座与其无冲突（#6 customer_group 引用只读正确、#21 来源 SO 引用正确、#26 无后端对象正确不授 DocPerm）。

### 18.3 验收期修正（user_type）

- 实施期将 `mcp-service` 落地为 `user_type=Website User`，与 `roles.md` §2 声明「System User」不符。Acceptor 独立验收时修正为 `user_type=System User`（`frappe.db.set_value`，未改角色/DocPerm/token），并独立重跑全部用例无回归（越权 9 项仍 403、正向仍 200）。
- 修正副作用如实记录：`User` 列表可见性由「仅自身」放宽为「全量」（Frappe System User 内置 `has_permission` 行为，非角色 DocPerm 授予，仅暴露 name/email 基础字段），由 MCP tool 层白名单兜底，接受为残余风险（`authorization-verification.md` §5 已按 System User 终态改写并附修正说明）。

### 18.4 发现项（非阻断）

1. **跨调用方批次读取未实测**：批次台账为 MCP server 侧状态（非 ERPNext 后端对象），E01 无 MCP server 运行实例、如实不实测（`authorization-verification.md` §4）。属 E02 机制 + D01 §6.4 + F 包接入范围，由 G01 实测闭环；E01 已提供对象级权限基础。
2. **框架级残余（Contact/Address 自建自读、User 列表可读）**：Owner 已决断接受（选项 A），依赖 F 包第二层白名单（`document_search`/`document_get` 硬编码 `object_type` 枚举不含 Contact/Address/User）兜底，F 包实施时须落实该白名单层。
3. **原始证据为脱敏汇总**：`D:\second-acceptance\evidence\E01-raw-*.txt` 为状态码汇总（每方向一行），非完整 HTTP 原始输出；与 `authorization-verification.md` 16 用例逐项一致，Acceptor 已独立重跑复核，结论成立。

### 18.5 对下游任务包的输入（权威结论）

1. **→ F01/F02/F04（通用查询/销售采购闭环/库存主数据维护）**：E01 正式账号 `mcp-service` + 角色 `MCP Business Caller`（21 DocPerm 最小权限）、权限矩阵（`permission-matrix.md`）、两张允许清单（`allowlist.md`）、人工确认与 fail-closed（`confirmation-failclosed.md`）为实施权威输入，须逐 tool 挂接本底座：后端用 `mcp-service` 调用、MCP tool 层白名单（第二层）强制对象类型枚举、人确认档写 tool 经 server 侧确认、币种/价格表与客户端不支持确认时 fail-closed。
2. **→ G01（完整集成验收）**：越权/失败路径客观口径与 C01b T11–T15 对齐（T14 建仓库越权、T15 作废发货单边界），越权一律后端 403 转译 `permission_denied` 可自纠；跨调用方批次隔离由 G01 在 F 包接入后实测闭环。
3. **→ 对齐参照**：与 D01 §7 / D02 26 tool 契约逐项一致，无清单外对象、无越界读写、引用对象只读、最小权限收敛，不沿用 B00 临时探针权限（B00 探针已清理）。

### 18.6 对下游任务包的影响与门槛

1. E01 封存 → **F01/F02/F04 冻结/实施门槛解除**（总则 §13「公共安全底座先于依赖它的业务写 tool」）；F 包须以 `mcp-service` + `MCP Business Caller` 为后端调用方，不得改用 Administrator 或临时探针。
2. F 包须落实 MCP tool 层白名单（第二层拦截）——26 个 tool 的 `object_type`/Link 字段目标硬编码枚举，切断 Contact/Address/User 框架残余的 agent 触达路径；这是 E01 残余风险兜底的前置条件。
3. 人确认档写 tool（#6–#12、#14/#15/#17/#18/#20/#22/#24）未经有效 server 侧确认不得写入；客户端不支持 `elicitation` 时全部写 tool（含全自动草稿创建）fail-closed——由 F 包实现时挂接（E01 已冻结机制规范）。
4. 已知限制不变：`mcp-service` token 仅存后端容器 `/tmp/mcp_token.txt`（供验收验证），F 包接线前须以正式凭证管理方式重发/托管 token；框架级残余（Contact/Address/User）接受为残余风险，若需后端原生拒绝须走框架级变更控制（总则 §12）。
