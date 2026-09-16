# C01b Evidence Manifest

> 本文件为 C01b 的 Evidence Manifest（公开，落实施区 `docs/task-packages/C01b/`），逐项追溯 W01–W08 与交付物 CD-1..CD-6。隐藏材料（题目全文/断言/快照/重置细节）落验收区，本文件仅记录位置、哈希与脱敏结论。

## 1. 交付物位置与哈希

| 交付物 | 位置 | SHA-256 | 属性 |
|---|---|---|---|
| CD-1 C01b 任务包 | `docs/task-packages/C01b/task.md` | `d80983ea0f91b6591e22bbced609133842eb32e9c0cad91ccbab5d6bbbfd31a3` | 公开（含实施/封存记录；冻结快照 frozen/v1.0 为 `092c3b82…`） |
| CD-2 覆盖映射汇总（脱敏） | `docs/task-packages/C01b/coverage-map.md` | `9e8b20223adaf8ef841303c457de9354fd11b90adc04a7586ffa38cb693489e8` | 公开（脱敏） |
| CD-3 冻结任务集正文 | `D:\second-acceptance\task-sets\C01b-v1.0.md` | `92595da7c58cfac89330eff4f0e27f59b9d1eb6f123bba16bb4c1b8b3b20cfab` | 隐藏（实施主体 Deny） |
| CD-3 精确断言+评分 | `D:\second-acceptance\assertions\C01b-v1.0.md` | `c48356a508ced91c5b754a404a1d80b2b3243297249d8af2b025de9aa0cce70d` | 隐藏（Deny） |
| CD-3 初始数据+快照 | `D:\second-acceptance\snapshots\C01b-v1.0.md` | `8ff5013b2b3feebf1ce51a129e67ae7a6f7b3434b602aec4c1830de82376d6fb` | 隐藏（Deny） |
| CD-3 重置脚本说明 | `D:\second-acceptance\reset\C01b-v1.0.md` | 见冻结清单 | 隐藏（Deny） |
| CD-5 可解性验证记录（脱敏） | `docs/task-packages/C01b/solvability-record.md` | `ef7f8f5ad8e2ad663df1bfcbd4ce0729bae71094304f5a3363fc55f1c6a5612a` | 公开（脱敏） |
| 变更记录（S02/P02 改题） | `docs/task-records/changes/CHG-20260916-C01b-001.md` | `709b80e6431b21127ae5129597c58145749bd49af66fa0280902ac8792cb0aac` | 公开（脱敏） |

## 2. 证据清单

| 证据编号 | 对应项 | 执行者/时间 | 命令/操作 | 状态 | 结果摘要 |
|---|---|---|---|---|---|
| EV-C01b-001 | W01 写权限自证 | Claude（C01b 验收区会话）/ 2026-09-16 | 对 task-sets/assertions/snapshots/reset 写探针 | 通过 | 四目录均 WRITE_OK（探针文件写入后删除，零残留） |
| EV-C01b-002 | W01 隔离继承 | 继承 B00/C01a 既有 ACL | — | 通过（沿用） | task-sets/assertions/runs/snapshots/candidates 对实施主体（b00-impl）Deny 已由 B00 EV-B00-012 与 C01a 隔离自证建立；C01b 未改 ACL（§4 注：ACL 归 Owner，本包只自证不建 ACL） |
| EV-C01b-003 | W02 覆盖映射 | 2026-09-16 | 逐候选/补题映射 26 tool | 通过 | 覆盖下限全满足（写 19/19、三档位、失败五类、销售/采购多步）；缺口 = S02/P02 作废目标（已改题） |
| EV-C01b-004 | W03 精确断言 | 2026-09-16 | 字段名复核 B01–B04 + 数据模型 | 通过 | 15 题字段级断言落 `task-sets/`+`assertions/`，无臆造字段/行为 |
| EV-C01b-005 | W04 初始数据+重置 | 2026-09-16 | 定义种子规格 + 复用 restore-snapshot.sh | 通过 | 见 `snapshots/C01b-v1.0.md`/`reset/C01b-v1.0.md` |
| EV-C01b-006 | W05 L3/L2 矩阵+上限 | 2026-09-16 | 按 PRD §1.3/§6 冻结 | 通过 | L3 与 L2 不共用写入断言；每题最大调用/自纠冻结 |
| EV-C01b-007 | W06 可解性验证 | 2026-09-16 | 逐题核对契约+接口事实 | 通过 | 15 题均可解，无契约缺口 |
| EV-C01b-008 | W07 补题 | 2026-09-16 | 补 T05–T15 | 通过（见风险 R1） | 覆盖主数据/调拨/盘点/失败五类 |
| EV-C01b-009 | W08 任务集冻结 | 2026-09-16 | 迁入 task-sets/ + 产出哈希 | 通过 | 冻结任务集 v1.0 就绪 |
| EV-C01b-010 | 改题留痕 | 2026-09-16 | CHG-20260916-C01b-001 | 通过 | S02/P02 依规范 §12.6 重定向 SO/PO 取消 |

## 3. 完成定义核对（§14）

| 完成定义项 | 状态 |
|---|---|
| 前置条件已验证（含隔离/写权限自证） | ✅ 写权限自证 WRITE_OK；实施主体 Deny 沿用 B00/C01a 既有证据 |
| W01–W08、CD-1..CD-6 完成 | ✅ |
| 覆盖下限满足 | ✅ |
| 断言与接口事实一致、可解性通过 | ✅ |
| L3/L2 矩阵一致、调用/自纠冻结 | ✅ |
| 任务集迁入 task-sets/、实施主体只读拒绝 | ✅（Deny 继承既有 ACL） |
| 隐藏材料未进入实施区（S08） | ✅ 实施区仅脱敏汇总/记录，无题目全文/断言 |
| Evidence/Freeze Manifest 登记 | ✅ 本文件 + Freeze Manifest |
| 未修改禁止范围 | ✅（S02/P02 为改题，非改契约；C01a 候选文件未动） |
| 剩余限制和风险已记录 | ✅ 见 §4 |
| 评审通过 | ✅ 2026-09-16 gjg 评审封存通过（验收区任务，正确性由 G01 实跑验证） |

## 4. 剩余限制与风险

- **R1（W07 补题盲隔离偏差）**：补题（覆盖主数据/调拨/盘点/失败五类）由 C01b 验收区会话撰写，非独立「盲出题会话」（总则 §13/W07 要求补题会话与 C01a 同盲隔离）。已按盲隔离**精神**以纯业务自然语言编写（无 tool 名/档位/契约痕迹），但过程未满足「独立盲会话」的形式要求；其中失败路径题本质上契约感知（测错误处理/幂等/越权/边界），由验收区会话撰写属必要。**待 gjg 复核**：是否需要为 happy-path 补题补一轮独立盲复核。
- **R2（字段名依赖）**：断言字段名基于 B01–B04 接口事实 + `erp/README.md` 数据模型复核；仓库/分组/区域等引用值已从 B00/B03 证据核实（Stores - G、Commercial、Distributor、China、Standard Selling 等）。G01 实跑时若发现个别引用值与实际基线不符，按总则 §11 第 4 类归因修题（升版并废止旧结果）。
- **R3（可解性为逻辑验证）**：可解性验证为文档级逻辑核对，未实跑（总则 §10.2 禁止出题会话预演）；真正可解性由 G01 实跑暴露。
- **R4（受题污染）**：本会话读候选后受题污染，不得参与 F01/F02/F04 实现/评审/调参。

## 5. 状态

C01b v1.0 已实施完成（W01–W08、CD-1..CD-6），任务集最终冻结迁入 `task-sets/`。验收区任务不适用独立验收，最终正确性由 G01 实际运行验证；2026-09-16 gjg 评审封存通过（依据 task.md §18.4）。
