# C01a Evidence Manifest · 盲生成业务验收场景（销售/采购多步候选）

> 任务包：C01a v1.0（已冻结 → 实施中 → 待验收）
> 执行主体：Claude（C01a 盲出题上下文），受限账户 `c01a-blind`
> 执行日期：2026-09-15
> 公开性说明：本清单为公开证据（落实施区 `docs/task-packages/C01a/`）。**不含候选正文、初始数据状态、期望终态断言骨架等隐藏验收材料**（该材料仅存于 `D:\second-acceptance\candidates\C01a\`，对实施主体拒绝）；本清单亦不含任何密码、密钥、认证头或凭据值。

## 0. 第 0 步与前置条件核对

| 项 | 结果 |
|---|---|
| 进程身份 | `whoami` = `c01a-blind`（`USERDOMAIN=LAPTOP-DNCTQOH0`）；非 c01a-blind 即停止上报，实际为 c01a-blind |
| 模型连通 | 正常应答 |
| 权威任务定义 | `frozen/v1.0/task.md` 与 `docs/task-packages/C01a/task.md` `diff` **IDENTICAL**；`frozen/v1.0/object-scope.md` 与 `object-scope.md` `diff` **IDENTICAL** |
| §4 前置条件 | 全部标注「已满足」；本会话复核：object-scope.md 已下发（12 操作 + 9 引用）、隔离 ACL 生效（见 EV-C01a-001） |
| 源码版本基线 | `frappe_docker/.env`：`ERPNEXT_VERSION=v15.121.2`；frappe_docker 为部署仓（无 apps/erpnext 应用源码），数据模型事实以 `erp/README.md` 为唯一交接入口 |

## 1. 证据索引

| 证据编号 | 对应项 | 执行者/时间 | 环境与版本 | 命令或操作 | 退出码/状态 | 结果摘要 | 原始输出/提交/快照 | 脱敏说明 |
|---|---|---|---|---|---|---|---|---|
| EV-C01a-001 | W01 / S01 盲隔离负向自证 | Claude/C01a 盲出题上下文，2026-09-15 21:1x | Windows 11（10.0.26200）· Git Bash · ERPNext v15.121.2 / Frappe v15.120.1 | 以 c01a-blind 身份 `cat`/`ls` 探测严禁路径（内容重定向 `/dev/null`，仅取退出码与 stderr） | 全部 `Permission denied`（文件 rc=1、目录 rc=2） | B01–B05 `task.md`（5）READ_DENIED；B01–B05 目录（5）LIST_DENIED；`ERPNext-MCP改造PRD.md` READ_DENIED；`task-records/`（目录 + `freeze-manifests/B04-v1.0.md`）READ_DENIED；`task-sets/assertions/runs/snapshots` 4 哨兵 READ_DENIED | `cat: .../B01/task.md: Permission denied` 等（同类 9+ 条）；`ls: cannot open directory '.../B01': Permission denied` 等（同类 7 条） | 未读取/未记录任何文件内容，仅记录退出码与错误消息 |
| EV-C01a-002 | §4 候选写权限探针 | Claude/C01a 盲出题上下文，2026-09-15 21:1x | 同上 | 写 `D:\second-acceptance\candidates\C01a\write-probe.txt` 后回读并删除 | WRITE_OK（写成功、回读一致、已清理） | candidates/C01a 可写，探针已删除 | `write-probe.txt` 创建/回读/删除均成功 | 探针内容为无意义占位，无敏感信息 |
| EV-C01a-003 | W02 销售/采购链路梳理 | Claude/C01a 盲出题上下文，2026-09-15 | 同上 | 仅据 `erp/README.md` 数据模型 + 规范第 8 章 | 通过 | 销售、采购两条链路梳理完成，不引用任何 B 系列结论 | 见本清单 §2 | 公开数据模型事实，无隐藏内容 |
| EV-C01a-004 | W03 销售场景候选 | Claude/C01a 盲出题上下文，2026-09-15 | 同上 | 写入 `D:\second-acceptance\candidates\C01a\` | 完成 | 销售多步候选 2 条（S01 下单→发货、S02 发货后作废冲回），三段式完备、字段级可判定 | `S01-sales-fulfillment.md`、`S02-sales-void.md`（正文隐藏，不在此展开） | 候选正文/初始态/断言属隐藏材料，仅登记文件名与条数 |
| EV-C01a-005 | W04 采购场景候选 | Claude/C01a 盲出题上下文，2026-09-15 | 同上 | 写入 `D:\second-acceptance\candidates\C01a\` | 完成 | 采购多步候选 2 条（P01 下单→收货、P02 收货后作废冲回），三段式完备、字段级可判定 | `P01-purchase-receipt.md`、`P02-purchase-void.md`（正文隐藏，不在此展开） | 同上 |
| EV-C01a-006 | W05 / S02 / S03 / S04 关键词自检 | Claude/C01a 盲出题上下文，2026-09-15 | 同上 | 逐份核对三段式 + 覆盖核对 + 正则扫描候选目录 | 通过 | 三段式无缺段、断言非主观；销售 ≥1、采购 ≥1；关键词扫描零命中（create/confirm/cancel/submit、全自动/人确认/只出/档位、`/api/`/run_method/frappe.client、幂等/窗口期/乐观/原子/批次/越权/前置断言/事后校验/回滚、MCP/tool） | 扫描命令返回 `No matches found` | 扫描仅为排除 B 系列痕迹/tool 名/档位词/接口路径，不引入隐藏内容 |

## 2. W02 业务链路梳理（仅据数据模型 + 规范第 8 章）

- **销售链路**：客户（Customer，依赖客户组 + 销售区域）与物料（Item，依赖物料组 + 计量单位）与物料价格（Item Price，依赖物料 + 价格表）→ 销售订单（Sales Order，含客户 + 明细行 item_code/qty）→ 生效（提交）→ 销售发货单（Delivery Note，关联销售订单）→ 生效（提交，库存减少）→ 库存余量（Bin）减少、库存流水（Stock Ledger Entry）新增出库记录。
- **采购链路**：供应商（Supplier，依赖供应商组）与物料（Item）→ 采购订单（Purchase Order，含供应商 + 明细行）→ 生效（提交）→ 采购收货单（Purchase Receipt，关联采购订单）→ 生效（提交，库存增加）→ 库存余量（Bin）增加、库存流水（Stock Ledger Entry）新增入库记录。
- **状态机**（数据模型 §4.3）：草稿（docstatus=0，无业务效果）→ 已提交（docstatus=1，生效，写库存流水）→ 已取消（docstatus=2，作废并冲回已生效业务效果）。
- 以上仅来自 `erp/README.md` 与规范第 8 章，未引用 B01–B05 接口结论、MCP 契约或 server 实现。

## 3. 完成定义核对（W06）

| 完成定义 | 结果 |
|---|---|
| 全部前置条件已验证（含隔离 ACL + 负向自证 + 对象名单下发） | ✅（见 EV-C01a-001/002） |
| W01–W06 全部完成 | ✅（见本清单） |
| 销售/采购多步场景候选各 ≥1，三段式完备且可判定 | ✅ 销售 2、采购 2 |
| 候选对象均在 object-scope.md 名单内，无实施侧结论痕迹 | ✅（对象仅用 12 操作 + 9 引用；EV-C01a-006 关键词零命中） |
| 不变量均有证据 | ✅（盲隔离、对象范围、多步链、可判定、不进入实施区均核对） |
| S01–S03 自检通过；S04 由 Implementation Reviewer 核对 | S01–S03 ✅；S04 关键词自检零命中（正式 S04 由 Reviewer 读 B01–B05 对照执行） |
| Evidence Manifest 完整 | ✅（本清单） |
| 未修改禁止范围 | ✅（未读 PRD/B01–B05/MCP 契约/server 实现/既有断言；未建/改 ACL） |
| 剩余限制和风险已记录 | 见 §4 |
| 独立验收通过 | 待 Acceptor（gjg）独立验收，本会话不自标「已通过」 |

## 4. 剩余限制与风险

- 候选为**三段式骨架**，精确终态断言、tool 覆盖映射、初始数据快照与重置脚本由 C01b 补齐（task.md §9）。
- 候选采用 ERPNext v15 标准字段名（`docstatus`、`actual_qty`、`voucher_type` 等）作字段级判定；其中 Bin / Stock Ledger Entry 的字段名来自 ERPNext 数据模型（`erp/README.md` 委托其 DocType schema），未从 B01–B04 接口事实复核，C01b 补齐时需以冻结 D02 契约为准。
- 单一自然人 gjg 兼任 Owner / Implementation Reviewer / Acceptor，读候选后即受题污染，不得参与 D/E/F 实现、调参或定向修复（task.md §16）。
- B05 目录已于本次 W01 一并负向自证（补验），结果 READ_DENIED，与 §4 注「B05 建立后补验」一致。
