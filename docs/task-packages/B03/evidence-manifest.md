# B03 Evidence Manifest

> 当前状态：B03 v1.0 已冻结并**已实施**（2026-09-15），下列 `EV-B03-*` 已按冻结自检方法 S01—S08 逐项执行并回填实际值、原始输出位置与状态。公开脱敏证据落盘于 `docs/task-packages/B03/evidence/`；敏感原始输出（数据库查询结果）受控于 `D:\second-acceptance\evidence\`（本清单登记脱敏引用）。

## 1. 证据映射（实施回填）

| 证据编号 | 对应工作项/自检 | 计划命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-B03-001 | W01、S01 环境与凭据 | `docker compose ps`；`curl get_logged_user`；`bench list-apps`；引用对象列表（含 Supplier Group / buying Price List）；dump→写探针→restore 往返 | 实例可达、版本符合（frappe 15.120.1 / erpnext 15.121.2）、凭据有效、快照可重置；Supplier Group 与 `Standard Buying` 价格表就位 | 实例可达；frappe 15.120.1 / erpnext 15.121.2；get_logged_user=Administrator；Company gjg/CNY；Standard Buying(buying=1)+Standard Selling；Distributor(is_group=0) 可作 supplier_group；快照可重置（restore→Administrator） | `evidence/W01-env-20260915.txt` | 已执行 |
| EV-B03-002 | W02、S02 PO create | `curl` create（`B03-PROBE-` 前置）及无效引用/数量/空 items | 命名、引用校验、草稿状态、子表行项目均有记录 | name=PUR-ORD-2026-00001（series PUR-ORD-.YYYY.-）；草稿 docstatus=0；缺 schedule_date→417；supplier/item 无效→404；company/PL/warehouse/currency→417；qty=0→InvalidQtyError 417、qty<0→ValidationError 417（Grand Total）、空 items→TypeError 500；显式 rate=10→自动建 Item Price(Standard Buying) | `evidence/W02-*-20260915-*.txt` | 已执行 |
| EV-B03-003 | W03、S03 PO confirm | `curl` run_method:submit / frappe.client.submit（陈旧/正确 modified） | 状态漂移 0→1、modified 变化、陈旧 modified 版本断言、关键业务状态校验 | docstatus 0→1、status To Receive and Bill、modified 变化；陈旧 modified→TimestampMismatchError 417 无部分写入；已生效再 submit→200 静默 no-op | `evidence/W03-po-confirm-20260915-104931.txt` | 已执行 |
| EV-B03-004 | W04、S04 PO cancel | `curl` run_method:cancel / frappe.client.save | 合法前态、下游约束、冲回行为、陈旧 modified 版本断言 | 草稿 cancel→DocstatusTransitionError 417；陈旧 modified(save docstatus=2)→TimestampMismatchError 417；已生效 cancel→1→2；已取消 cancel→ValidationError 417；有下游 PR cancel→LinkExistsError 417；PO 无库存冲回 | `evidence/W04-po-cancel-20260915-105303.txt`、`W07-atomicity-cleanup-20260915-105946.txt` | 已执行 |
| EV-B03-005 | W05、S05 PR create | `curl` 按来源采购订单生成收货草稿 + insert | 来源订单已生效校验、未完成量校验、子表行项目、草稿状态 | make_purchase_receipt(PO)→草稿 dict（qty=来源未完成量）；insert→MAT-PRE-2026-00001（series MAT-PRE-.YYYY.-）；来源草稿→417 docstatus=1；超收 qty 6>5 草稿创建成功（不校验） | `evidence/W05-pr-create-20260915-105646.txt`、`W05-pr-create2-20260915-105807.txt` | 已执行 |
| EV-B03-006 | W06、S06 PR confirm | `curl` run_method:submit / frappe.client.submit | 状态漂移、陈旧 modified 版本断言、剩余可收数量、收货入库 → 库存增加（Stock Ledger Entry + Bin） | docstatus 0→1、status To Bill；陈旧 modified→TimestampMismatchError 417；超收 confirm→OverAllowanceError 417；收货入库 Bin 0→5、SLE +5、GL Entry 4 条 | `evidence/W06-pr-confirm-20260915-105839.txt` | 已执行 |
| EV-B03-007 | W07、S07 原子性/失败不静默/清理 | 单请求事务观察 + 失败后终态 + 清理 + LIKE 清查 | create/confirm/cancel 单次原子；失败不静默成功；`B03-PROBE-` 对象与收货入库库存测试后零残留 | 陈旧 modified 无部分写入（docstatus/库存不变）佐证单事务；错误均结构化 4xx/5xx（唯二例外 F4/F6）；PR cancel 冲回库存（Bin 5→0、SLE +5/-5 cancelled、GL cancelled）；cancelled PR/PO 不可 REST DELETE（LinkExistsError）；快照恢复归零 | `evidence/W07-atomicity-cleanup-20260915-105946.txt`、`W07-reset-verify-20260915.txt` | 已执行 |
| EV-B03-008 | W08、S08 接口事实记录 | 汇总 W01—W07 形成 D04 | 覆盖 §9 全部 9 项，逐对象逐项可复核 | `interface-facts.md` 覆盖 §9 全部 9 项，逐对象逐项实测（F1–F9 结论速览 + §2 逐对象事实 + §6 错误表） | `interface-facts.md` | 已执行 |

## 2. 正式证据记录要求

实施已逐项执行并回填「实际值」「原始输出位置」「状态」，执行者=Claude（B03 独立实施上下文）、时间=2026-09-15（UTC+8）、环境=`erpnext.local`（ERPNext 15.121.2 / Frappe 15.120.1）、认证 `Authorization: token <REDACTED>`。原始输出（响应体 + HTTP 状态码）落盘于 `evidence/W<编号>-*.txt`；含完整堆栈的 `exc` 字段在公开证据中已截断脱敏（只保留 exception/exc_type），完整堆栈不入公开实施区。

完整命令为 `curl -X <方法> http://localhost:8080/api/resource/<Doctype>[/<name>]` 或 `http://localhost:8080/api/method/<whitelisted_method>` 形式，`Authorization: token <REDACTED>`，逐场景参数见各证据文件；confirm/cancel 版本断言与状态机测试经 `frappe.client.submit`/`frappe.client.save` 全量 doc 路径（Python 脚本）执行。

## 3. 敏感信息与受控位置

- B03 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Token）；本清单与公开证据均 REDACTED，不含凭据值、完整认证头、完整堆栈。
- 敏感原始输出（含凭据痕迹的 REST 响应、数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），本清单登记脱敏引用（总则 §15.1）。本包 REST 响应为业务数据、无凭据值；数据库只读查询（Stock Ledger Entry/GL Entry/Bin 等）结果属敏感，仅在本清单与公开证据中以脱敏摘要呈现，原始行集受控于验收区。
- 合成对象统一 `B03-PROBE-` 标识；单据 name 为 naming_series 连续编号（PUR-ORD-/MAT-PRE-，**不含** B03-PROBE 字样，合成标识经 supplier/item 承载）；清理主键以 `supplier=B03-PROBE-SUP-001` / `item_code=B03-PROBE-ITEM-001` 定位。
- 清理结论：Supplier/Item/PO/PR/SLE/GL/Item Price 七类 `B03-PROBE-` 相关对象经快照恢复后零残留（cancelled PR 因 GL Entry 持久化不可 REST DELETE，故走快照恢复路径，见 interface-facts F9）。
- 本地开发默认凭据仅限本地验收环境；迁移共享/生产环境必须更换（§16）。
