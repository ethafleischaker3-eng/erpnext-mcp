# H01 Evidence Manifest（CD-5）

> 文档性质：H01 交付物 CD-5，《Evidence Manifest》。逐项追溯 W01–W06 与交付物 CD-1..CD-6。
> 任务包：H01 v1.0（已冻结）；实施主体：Claude（H01 交付上下文）；Owner：gjg；日期：2026-09-18。
> 本包为档位 1 交付任务包：证据为「只读核对 + 引用」类（前置核对、指标/档位核对、引用追溯、git 只读核查、无隐藏材料泄露扫描），不涉及后端/数据库/运行环境操作，不记录凭据。上游逐题逐轮运行记录落验收区 `D:\second-acceptance\runs\`（H01 不读取，仅引用位置与 G01 已脱敏结论）。

## 1. 交付物位置与哈希

| 交付物 | 位置 | SHA-256 | 属性 |
|---|---|---|---|
| CD-1 符合性声明 | `docs/task-packages/H01/compliance-statement.md` | `bf780af705b1a537d428b513c57a969bc253a70bd57f7d07c6c7530d5c68d56c` | 公开（脱敏） |
| CD-2 项目交付物汇总 | `docs/task-packages/H01/deliverables-summary.md` | `c15bcbf78090c19cc67e7902b9fd65c98e056bd03fcdd02239af709032e9b4c0` | 公开（脱敏） |
| CD-3 项目完成判定 | `docs/task-packages/H01/project-completion.md` | `2e4ffe94b4077af383cd251aae3f67e99e6c4ad425ffec35fb141e31584626bd` | 公开（脱敏） |
| CD-4 H01 任务包 | `docs/task-packages/H01/task.md` | 冻结快照 `frozen/v1.0/task.md` 哈希 `4bbad7491a8406bfc0926ac3613a6ef3969cc54844c1127c1c124491775ca0a7`（实施期按冻结规则追加状态后当前哈希变化，比对以快照为准） | 公开 |
| CD-5 Evidence Manifest | 本文件 | — | 公开 |
| CD-6 Freeze Manifest | `docs/task-records/freeze-manifests/H01-v1.0.md` | 见该文件冻结清单 | 公开 |

## 2. 证据清单

| 证据编号 | 对应项 | 执行者/时间 | 命令/操作 | 状态 | 结果摘要 |
|---|---|---|---|---|---|
| EV-H01-001 | W01 前置核对（G01 封存 + 全上游包终态 + 权威输入齐备） | Claude（H01 交付上下文）/ 2026-09-18 | 只读核对 `docs/task-packages/G01/acceptance-report.md`、`docs/task-packages/G01/task.md` §19、`docs/task-records/returns/RTN-20260918-G01-001.md`、登记表各行、H01 Freeze Manifest | 通过 | G01 v1.0 已封存（验收通过，30/30）；上游 A01/B00/B01–B05/C01a/C01b/D01/D02/E01(v1.1)/E02/F01/F02/F04 均已封存或通过；P00 v1.1 已封存；权威输入齐备 |
| EV-H01-002 | W02 指标核对（PRD §6） | Claude（H01 交付上下文）/ 2026-09-18 | 只读核对 G01 `acceptance-report.md` §1/§3/§4 与 PRD §6 | 通过 | 连续两轮 100%（≥90%）；失败路径 T11–T15 100%；销售/采购多步链通过；26 tool 覆盖 19 写/6 读/1 plan；调用/自纠未超限（详见 `project-completion.md` §3） |
| EV-H01-003 | W02 26 tool 档位归属核对 | Claude（H01 交付上下文）/ 2026-09-18 | `grep -cE "^\| [0-9]+ \|"` 统计 D02 §1 总表 | 通过 | 26 tool；读 6 / 全自动 5 / 人确认 14 / 只出 plan 1，与 D02 §1 逐 tool 一致（详见 `compliance-statement.md` §2） |
| EV-H01-004 | W03 符合性声明 SHOULD 逐条核对 | Claude（H01 交付上下文）/ 2026-09-18 | `grep -nE "SHOULD|最好满足"` 枚举规范 SHOULD 级条款 | 通过 | 8 条（含 §6.1 两条「最好满足」）；7 遵守 / 1 不适用（§13.2）/ 0 偏离（详见 `compliance-statement.md` §3） |
| EV-H01-005 | W04 交付物汇总七类追溯 | Claude（H01 交付上下文）/ 2026-09-18 | 只读核对 E01/E02/D02/G01/A01/B 包/F 包交付物文件存在性与版本 | 通过 | 验证记录/权限矩阵/部署运维/回滚手册/验收报告/已知限制/二期事项七类均可追溯（详见 `deliverables-summary.md`） |
| EV-H01-006 | W05 项目完成判定（§16.4 四项） | Claude（H01 交付上下文）/ 2026-09-18 | 只读核对总则 §16.4 与 G01 结论 | 通过 | 四项全部满足，项目可标记完成（详见 `project-completion.md`） |
| EV-H01-007 | S07 未修改禁止范围 | Claude（H01 交付上下文）/ 2026-09-18 | `git status --short` | 通过 | 仅新增 H01 交付物（compliance-statement/deliverables-summary/project-completion/evidence-manifest）；登记表 H01 行与 P00 §19 待 W06 更新；未改 server/契约/权限/任务集 |
| EV-H01-008 | S08 无隐藏材料泄露 | Claude（H01 交付上下文）/ 2026-09-18 | 实施期自检（H01 交付物仅引用 G01 脱敏结论与公开材料，未含 C01b 题目全文/精确断言） | 通过 | 零命中；H01 未读取 C01b 任务集正文/断言、未读取 `runs/` 原始序列（授权范围 §6.1） |
| EV-H01-009 | W06 归档与登记（登记表 H01 行 / P00 §19 / Freeze+Evidence） | Claude（H01 交付上下文）/ 2026-09-18 | 更新登记表 H01 行、P00 task.md 追加 §19、产出本 Manifest | 通过 | 见「登记与归档」小节；登记表 H01 行状态「已冻结」→「待验收」（档位 1，实施完成后交由 Implementation Reviewer 记录「已通过」），P00 §19 项目完成标记落地 |

## 3. 登记与归档（W06 落实）

- **登记表 H01 行**：`docs/governance/任务包登记表.md` H01 行状态「已冻结」→「待验收」，备注追加「档位 1 以 Implementation Reviewer 评审记录替代独立验收；CD-1/2/3/5 交付物与实施记录回填」（档位 1 实施完成后即交由 Implementation Reviewer 记录「已通过」）。
- **P00 项目完成标记**：`docs/task-packages/P00/task.md` 追加 §19「项目完成标记」（不改 `frozen/v1.1/` 快照）。
- **Freeze Manifest**：`docs/task-records/freeze-manifests/H01-v1.0.md`（冻结时产物，记录输入版本与完成定义，非封存环节）。
- **H01 task.md 完成记录**：`docs/task-packages/H01/task.md` §17/§18 追加实施与完成记录。

## 4. 完成定义核对（H01 task §14）

| 完成定义项 | 状态 |
|---|---|
| 全部前置条件已验证（W01） | ✅ EV-H01-001 |
| 26 tool 档位清单完整且与 D02 一致（W02） | ✅ EV-H01-003 |
| 符合性声明四项齐全、无静默跳过（W03） | ✅ EV-H01-004 / `compliance-statement.md` |
| 项目交付物汇总七类齐备（W04） | ✅ EV-H01-005 / `deliverables-summary.md` |
| 项目完成判定 §16.4 四项全部满足（W05） | ✅ EV-H01-006 / `project-completion.md` |
| 登记表 H01 行、P00 项目完成标记、Freeze+Evidence 完整（W06） | ✅ EV-H01-009 |
| 未修改禁止范围 | ✅ EV-H01-007 |
| 剩余限制与风险已记录 | ✅ `deliverables-summary.md` §6 |
| 项目达到完成门槛 §16.4 | ✅ `project-completion.md` |

## 5. 剩余限制与风险

- **档位 1 验收边界**：不设正式验收题、不强制独立验收，正确性以「声明与上游冻结结论/证据客观一致」判定（Implementation Reviewer 评审替代独立验收）。
- **受题污染规避**：H01 不读取 C01b 冻结任务集正文/精确断言、不读取验收区 `runs/` 原始序列；全部结论引用 G01 已脱敏结论与公开材料（H01 task §6.1）。
- **无凭据输出**：本包证据不记录密码/密钥/完整认证头（E01 凭据值仅在验收区 evidence，脱敏引用）。
