# B04 Evidence Manifest

> 当前状态：B04 v1.0 已冻结并**已实施**（2026-09-15），下列 `EV-B04-*` 已按冻结自检方法 S01—S08 逐项执行并回填实际值、原始输出位置与状态。公开脱敏证据落盘于 `docs/task-packages/B04/evidence/`；敏感原始输出（数据库查询结果）受控于 `D:\second-acceptance\evidence\`（本清单登记脱敏引用）。

## 1. 证据映射（实施回填）

| 证据编号 | 对应工作项/自检 | 计划命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-B04-001 | W01、S01 环境与凭据 | `docker compose ps`；`curl get_logged_user`；`bench list-apps`；引用对象列表（含 Warehouse 5）；dump→写探针→restore 往返 | 实例可达、版本符合（frappe 15.120.1 / erpnext 15.121.2）、凭据有效、快照可重置；源/目标仓就位 | 实例可达；frappe 15.120.1 / erpnext 15.121.2；get_logged_user=Administrator；Company gjg/CNY；Warehouse 5（4 非分组：Stores/Finished Goods/Work In Progress/Goods In Transit + 1 分组 All Warehouses）；Stock Entry Type 含 Material Transfer；Item Group Products/…；UOM Nos/Unit；快照可重置（restore→Administrator） | `evidence/W01-env-20260915.txt` | 已执行 |
| EV-B04-002 | W02、S02 Stock Reconciliation create/confirm/cancel | `curl` create（`B04-PROBE-` 前置）、confirm/cancel（陈旧/正确 modified）及无效引用 | 命名、引用校验、草稿状态、覆盖基线、SLE/GL 产生、无确定性回滚、正向库存就位均有记录 | name=MAT-RECO-2026-00001（series **MAT-RECO-.YYYY.-**，非推测 MAT-REC-）；无 status 字段；纯净实例首笔按 Opening Entry 校验需 Balance Sheet 账户（Temporary Opening - G），否则 OpeningEntryAccountError；warehouse/item/company/purpose/qty 无效引用均 417；confirm 覆盖基线 Bin 0→5、SLE qty_after_transaction=5/actual_qty=0、GL 估值调整；cancel 确定性恢复前基线 3→5（reversal SLE+repost）；已取消 DELETE 拒（LinkExistsError linked GL） | `evidence/W02-sr-20260915.txt`、`W02b-sr-rollback-20260915.txt` | 已执行 |
| EV-B04-003 | W03、S03 Stock Entry create | `curl` create（`B04-PROBE-` 前置）及无效引用/数量/空 items | 命名、源/目标仓引用校验、源仓库存不足校验、草稿状态、子表行项目均有记录 | name=MAT-STE-2026-00001（series MAT-STE-.YYYY.-）；purpose 自动派生 Material Transfer；from/to_warehouse 无效→417、item 无效→417、qty=0→InvalidQtyError、qty<0→ValidationError、空 items→MandatoryError 417；**草稿 create 不校验源仓库存不足与源/目同仓**（qty=100>10、同仓均 200）；stock_entry_type 无效→200 不拒 | `evidence/W03-W05-ste-20260915.txt` | 已执行 |
| EV-B04-004 | W04、S04 Stock Entry confirm | `curl` run_method:submit / frappe.client.submit（陈旧/正确 modified） | 状态漂移 0→1、modified 变化、陈旧 modified 版本断言、源/目标仓校验、调拨库存变动（SLE/Bin） | run_method:submit→403 not whitelisted（须 frappe.client.submit 全量 doc）；docstatus 0→1、modified 变化；陈旧 modified→TimestampMismatchError 417；SLE 源 -4/目标 +4、Bin 源 10→6/目标 0→4、只写 SLE 不写 GL；库存不足 confirm→NegativeStockError 417；源/目同仓 confirm→200 不拒；重提交→200 no-op | `evidence/W03-W05-ste-20260915.txt` | 已执行 |
| EV-B04-005 | W05、S05 Stock Entry cancel | `curl` run_method:cancel / frappe.client.save | 合法前态、下游约束、库存冲回（SLE 冲销/Bin 恢复）、陈旧 modified 版本断言 | 草稿 cancel→DocstatusTransitionError；已生效 cancel→docstatus 1→2、库存冲回（SLE 冲销 is_cancelled=1、Bin 源 6→10/目标 4→0）；已取消 cancel→ValidationError；已取消 DELETE→LinkExistsError（linked Stock Ledger Entry，非 GL）；草稿 DELETE 202 | `evidence/W03-W05-ste-20260915.txt` | 已执行 |
| EV-B04-006 | W06、S06 回滚路径汇总 | 汇总主数据/价格/单据回滚路径（复用 B01 F4 / B02 F7 / B03 F7 / B03 F9）+ 实测 Stock Entry cancel 冲回、SR 无确定性回滚、草稿删除 | 回滚矩阵完整、逐项可复核 | 回滚矩阵见 interface-facts §4：主数据（B01 F4 级联/B03 F9 disable）、价格（B02 F7/B03 F7 孤儿）、单据（SO/PO 可删、PR/SR/STE 不可删）、库存（STE cancel 冲回、SR cancel 恢复前基线，均非物理删除） | `interface-facts.md` §4 | 已执行 |
| EV-B04-007 | W07、S07 原子性/失败不静默/清理 | 单请求事务观察 + 失败后终态 + 清理 + LIKE 清查 | create/confirm/cancel 单次原子；失败不静默成功；`B04-PROBE-` 对象与库存变动测试后零残留 | 陈旧 modified 无部分写入佐证单事务；错误均结构化 4xx/403（例外 F4 重提交 200、F9 stock_entry_type 无效 200）；SR/STE 已取消均不可 REST 删除（GL/SLE 持久化）；快照恢复归零（Item/STE/SR/Item Price/SLE/Bin/GL 七类 count=0） | `evidence/W07-reset-verify-20260915.txt` | 已执行 |
| EV-B04-008 | W08、S08 接口事实记录 | 汇总 W01—W07 形成 D04 | 覆盖 §9 全部 9 项，逐对象逐项可复核 | `interface-facts.md` 覆盖 §9 全部 9 项，逐对象逐项实测（F1–F11 结论速览 + §2 逐对象事实 + §6 错误表 + §3 原子性 + §4 回滚） | `interface-facts.md` | 已执行 |

## 2. 正式证据记录要求

实施已逐项执行并回填「实际值」「原始输出位置」「状态」，执行者=Claude（B04 独立实施上下文）、时间=2026-09-15（UTC+8）、环境=`erpnext.local`（ERPNext 15.121.2 / Frappe 15.120.1）、认证 `Authorization: token <REDACTED>`。原始输出（响应体 + HTTP 状态码）落盘于 `evidence/W<编号>-*.txt`；含完整堆栈的 `exc` 字段在公开证据中已截断脱敏（只保留 exception/exc_type），完整堆栈不入公开实施区。

完整命令为 `curl -X <方法> http://localhost:8080/api/resource/<Doctype>[/<name>]` 或 `http://localhost:8080/api/method/<whitelisted_method>` 形式，`Authorization: token <REDACTED>`；confirm/cancel 版本断言与状态机测试经 `frappe.client.submit`/`frappe.client.cancel`/`frappe.client.save` 全量 doc 路径（Python 脚本）执行。实测方法复用 B01/B02/B03 已冻结事实，不重复摸底主数据/销售/采购链路。

## 3. 敏感信息与受控位置

- B04 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Token）；本清单与公开证据均 REDACTED，不含凭据值、完整认证头、完整堆栈。
- 敏感原始输出（含凭据痕迹的 REST 响应、数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），本清单登记脱敏引用（总则 §15.1）。本包 REST 响应为业务数据、无凭据值；数据库只读查询（Stock Ledger Entry/GL Entry/Bin 等）结果属敏感，仅在本清单与公开证据中以脱敏摘要呈现，原始行集受控于验收区。
- 合成对象统一 `B04-PROBE-` 标识；单据 name 为 naming_series 连续编号（MAT-STE-/MAT-RECO-，**不含** B04-PROBE 字样，合成标识经物料承载）；清理主键以 `item_code=B04-PROBE-SR-ITEM-001` / `B04-PROBE-STE-ITEM-001` 定位。
- 清理结论：Item/Stock Entry/Stock Reconciliation/Item Price/SLE/GL/Bin 七类 `B04-PROBE-` 相关对象经快照恢复后零残留（cancelled SR 因 GL Entry、cancelled STE 因 Stock Ledger Entry 持久化不可 REST DELETE，故走快照恢复路径，见 interface-facts F10）。
- 本地开发默认凭据仅限本地验收环境；迁移共享/生产环境必须更换（§16）。
