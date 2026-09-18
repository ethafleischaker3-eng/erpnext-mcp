# G01 Evidence Manifest

> 本文件为 G01 的 Evidence Manifest（公开，落实施区 `docs/task-packages/G01/`），逐项追溯 W01–W06 与交付物 CD-1..CD-6。逐题逐轮运行记录（含题目 prompt、tool 调用序列、后端终态 dump、终态核对、次数统计）落验收区 `D:\second-acceptance\runs\`，本文件仅记录位置、哈希与脱敏结论，不包含隐藏题目全文/精确断言原文。

## 1. 交付物位置与哈希

| 交付物 | 位置 | SHA-256 | 属性 |
|---|---|---|---|
| CD-1 G01 任务包 | `docs/task-packages/G01/task.md` | 冻结快照 `frozen/v1.0/task.md` 哈希 `6af33ab1591063aaed5155f0377ea9632643fdebdf5c5b33b36592c93e2cb1c9`（实施期已按冻结规则追加状态与证据，当前正文哈希随状态更新变化） | 公开 |
| CD-2 集成验收报告 | `docs/task-packages/G01/acceptance-report.md` | 见下 | 公开（不含题目全文/精确断言） |
| CD-3 验收运行记录 | `D:\second-acceptance\runs\G01-R{r}-{T}.json`（30 份，r∈{1,2}, T∈{T01..T15}，最终修复后基线） | 逐份见 runs/ | 隐藏（对实施主体 Deny） |
| CD-4 归责/退回记录 | `docs/task-records/returns/RTN-20260918-G01-001.md` | `6af153aa4aa91290860068bfe069b7077bdbab01d2e8d1d401210823fba26fca` | 公开（脱敏） |
| CD-5 Evidence Manifest | 本文件 | — | 公开 |
| CD-6 Freeze Manifest | `docs/task-records/freeze-manifests/G01-v1.0.md` | 见冻结清单 | 公开 |
| 执行工具（非交付物） | `erp/g01-acceptance.js` | `2cb00d2ded557e0272cae9409f12cbc57a58d5af13254a2f9228894365c61a1a` | 公开（无凭据） |
| 执行工具（非交付物） | `erp/g01-seed.py` | `aa4c256830e38c7c2cbb8d81f85720946b65c303fdeccaf2bf28a1113d474db5` | 公开（无凭据） |

## 2. 证据清单

| 证据编号 | 对应项 | 执行者/时间 | 命令/操作 | 状态 | 结果摘要 |
|---|---|---|---|---|---|
| EV-G01-001 | W01 前置核对 | Claude（G01 验收区）/ 2026-09-18 | 检查 §4 全部前置 | 通过 | E01/F01/F02/F04/C01b/D01/D02/B01–B05 均已完成；后端容器 up；A01 L3 成立；干净快照 clean-post-E01.sql 可恢复 |
| EV-G01-002 | W01 隔离自证（icacls） | 2026-09-18 | `icacls` 只读核查验收区目录 | 通过 | task-sets/assertions/snapshots/runs/reset/candidates 对 `b00-impl`、`c01a-blind`、盲 SID `(OI)(CI)(N)` Deny；当前用户（Administrators）F |
| EV-G01-003 | W02 版本基线 | 2026-09-18 | 记录 git commit / node / 容器 / 快照 | 通过 | 首轮 server `f858337`，修复后 `c6b4273`；Node v24.19.0；ERPNext v15.121.2；快照 clean-post-E01.sql |
| EV-G01-004 | W02 写能力门控 | 2026-09-18 | 后端查 Company.gjg.default_currency + Price List selling=1 | 通过 | `CNY` + 恰 1 条 `Standard Selling`；MCP server `write_eligibility ok=true` |
| EV-G01-005 | W02 26 tool 就绪 | 2026-09-18 | MCP server `tools/list` | 通过 | 26 tool 全注册 |
| EV-G01-006 | W03 逐题实跑 | 2026-09-18 | `node erp/g01-acceptance.js --round 1/2` | **30/30 通过** | 首轮 15 题两轮 T09 失败；修复后复跑 15 题 × 2 轮全过 |
| EV-G01-007 | W03 后端终态核对 | 2026-09-18 | 直接后端 GET 核对 SO/DN/PO/PR/STE/Bin/SLE | 通过 | 每题断言字段逐项核对，客观可复算（字段级 dump 落 runs/） |
| EV-G01-008 | W03 次数核算 | 2026-09-18 | 比对 C01b 冻结上限 | 通过 | 30 题次调用/自纠均未超限 |
| EV-G01-009 | W04 失败归责 | 2026-09-18 | T09 归责 + 修复闭环 | 通过（已闭环） | 实现缺陷 → F04 #23（RTN-20260918-G01-001）；F04 修复（c6b4273）+ G01 复跑通过 |
| EV-G01-010 | W05 覆盖/指标 | 2026-09-18 | 核对 26 tool 覆盖 + PRD 指标 | 通过 | 写 19/19、读 6/6、plan 1/1；失败五类各 ≥1；销售/采购多步各 1 |

## 3. 完成定义核对（§15）

| 完成定义项 | 状态 |
|---|---|
| 全部前置条件已验证（含验收区隔离自证） | ✅ EV-G01-001/002 |
| 15 题连续两轮全部执行，每题有终态核对 + 次数记录 | ✅ 30 份 runs/ 记录 |
| 连续两轮全部通过（15 题全过） | ✅ 15 题 × 2 轮全过（修复后最终基线） |
| 失败已按 §8.3 归责并触发退回，无定向修复 | ✅ T09 → F04（RTN-20260918-G01-001）已闭环 |
| 覆盖核对达标（26 tool / 失败五类 / 销售采购多步） | ✅ EV-G01-010 |
| 验收报告 / Evidence / Freeze Manifest 完整可追溯 | ✅ CD-2/CD-5 + 冻结清单 |
| 未修改禁止范围（server/契约/任务集/权限未被 G01 修改） | ✅ server/ 由 F04 独立上下文修复，G01 未改 |
| 剩余限制与风险已记录 | ✅ 见 §4 |
| 满足项目完成门槛（总则 §16.4） | ✅ 冻结任务集连续两轮全过、失败路径 100% 通过、所有阻断关闭 |

## 4. 剩余限制与风险

- **受题污染约束**：本验收会话已读 C01b 任务集正文/断言，不得参与或定向修复 server 实现；T09 修复由独立 F04 上下文执行，本会话仅复跑。
- **被测 agent 形态**：G01 以程序化 harness（`erp/g01-acceptance.js`）忠实驱动 26 tool 执行 15 题自然语言任务（含 T11/T12/T13 自纠路径、T14/T15 边界拒绝、L3 elicitation auto-accept），逐题终态以真实后端核对；harness 为确定性执行工具，不改变冻结任务语义。
- 无剩余阻断项。

## 5. 状态

G01 v1.0 验收执行完成：首轮发现 T09 实现缺陷（F04 #23），经独立 F04 上下文修复（提交 `c6b4273`）后，G01 复跑 15 题 × 2 轮共 30 题次**全部通过**。**G01 判定通过**，满足完成定义 §15 与项目完成门槛（总则 §16.4）。结论为真实运行验证，未以 agent 自评替代；失败未静默、未重跑掩盖、未定向修复。
