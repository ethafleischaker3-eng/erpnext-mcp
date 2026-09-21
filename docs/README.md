# 项目推进侧文档导航

> 本目录是 ERPNext-MCP 改造项目的**推进/治理侧**唯一入口：给推进、评审、验收本项目的人看。
> 使用/运行本系统（起 Docker、接 MCP server、换机部署）请走仓库根 [README](../README.md) 与 `server/`、`erp/` 下的 README。

## 目录分工

| 目录 | 放什么 | 性质 |
|---|---|---|
| `governance/` | PRD、接入规范、总则、实施/验收区边界、任务包登记表、治理变更记录 | 规范与权威记录，修订型 |
| `templates/` | 任务包模板、变更记录模板、退回记录模板 | 怎么写，修订型 |
| `plans/` | 一期评估、二期规划 | 阶段规划，随阶段演进 |
| `task-packages/` | 各任务包（task.md + 产出 + 证据 + frozen 快照） | 产出，追加型 |
| `task-records/` | 冻结清单、变更记录、退回记录 | 治理记录，追加型 |

## 按「想找什么」索引

**治理规范（规则是什么）**

| 要找 | 位置 |
|---|---|
| 这次做什么（业务范围/tool 分级/验收阈值） | `governance/ERPNext-MCP改造PRD.md` |
| 怎么算接对（通用方法） | `governance/开源后端Agent化接入规范.md` |
| 怎么治理（任务包/冻结/角色隔离/仪式档位） | `governance/MCP改造任务包总则.md` |
| 实施区与验收区怎么隔离、路径冻结规则 | `governance/实施区与验收区边界.md` |
| 所有任务包一览（编号/状态/上游/位置） | `governance/任务包登记表.md` |
| 治理变更历史 | `governance/changes/` |

**模板（怎么写）**

| 要找 | 位置 |
|---|---|
| 任务包怎么写 | `templates/任务包模板.md` |
| 变更记录怎么写 | `templates/任务包变更记录模板.md` |
| 退回记录怎么写 | `templates/任务包退回记录模板.md` |

**功能 → 任务包（实现/契约/验收都按任务 ID 归档，这里做映射）**

| 功能 | 任务包 | 关键产物 |
|---|---|---|
| L3 server 侧确认能力验证 | `task-packages/A01/` | 验证记录、实现者 runbook |
| 主数据接口摸底（客户/供应商/物料/价格） | `task-packages/B01/` | interface-facts.md |
| 销售链路（销售订单/发货单） | `task-packages/B02/` | interface-facts.md |
| 采购链路（采购订单/收货单） | `task-packages/B03/` | interface-facts.md |
| 库存调拨/盘点与回滚 | `task-packages/B04/` | interface-facts.md |
| 幂等可实现性 | `task-packages/B05/` | idempotency-research.md |
| 26 tool 契约（读/写/确认/幂等） | `task-packages/D02/` | tool-contract.md |
| 公共契约与错误模型 | `task-packages/D01/` | common-contract.md |
| 权限矩阵/允许清单/角色/确认 fail-closed | `task-packages/E01/` | permission-matrix、allowlist、roles |
| 幂等/前置断言/批次台账实现 | `task-packages/E02/` | lib/ 8 模块、implementation-contract |
| 6 个读 tool 实现 | `task-packages/F01/` | acceptance-record |
| 销售/采购 10 个写 tool 实现 | `task-packages/F02/` | acceptance-record |
| 库存/主数据 10 个写+plan tool 实现 | `task-packages/F04/` | acceptance-record |
| 完整集成验收（15 题 30/30） | `task-packages/G01/` | acceptance-report.md |
| 符合性声明/交付物汇总/项目完成 | `task-packages/H01/` | compliance-statement、deliverables-summary |

**记录（追溯）**

| 要找 | 位置 |
|---|---|
| 各任务包冻结清单（Reviewer/决策/SHA-256） | `task-records/freeze-manifests/` |
| 冻结后任务包变更记录 | `task-records/changes/` |
| 验收退回记录 | `task-records/returns/` |

**规划（下一步做什么）**

| 要找 | 位置 |
|---|---|
| 一期改造评估 | `plans/erpnext-mcp-evaluation.md` |
| 二期落地规划 | `plans/erpnext-mcp-phase2-plan.md` |

## 约定

- 任务包「现行版」在 `task-packages/<ID>/`；「冻结快照」在 `task-packages/<ID>/frozen/` 与 `task-records/freeze-manifests/`，冻结件不改。
- 治理/模板文档的「现行版」在本目录对应子目录；其冻结元数据（含 SHA-256）在 `task-records/freeze-manifests/`，冻结元数据与冻结件中的旧路径仅作历史记录。
- 不得在本目录保存密码、密钥、完整认证头、未脱敏日志或正式验收隐藏材料（总则 §15.1）。
