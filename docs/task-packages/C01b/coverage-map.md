# C01b 覆盖映射汇总（脱敏）

> 本文件为 C01b W02 交付物 CD-2 的**脱敏汇总**（tool 维度计数），不含题目正文、初始数据、精确断言或评分细节。覆盖映射明细（题目→tool）随冻结任务集落 `D:\second-acceptance\task-sets\`，对实施主体 Deny。
> 依据：D02 `tool-contract.md` v1.0（26 tool）、PRD §1.3、规范 §12.3 覆盖下限。

## 1. 覆盖口径与结果

冻结任务集共 **15 题**（T01–T15）。下表为「每个 tool 被覆盖的题数」汇总。

| PRD # | tool | 类型 | 档位 | 覆盖题数 |
|---|---|---|---|---|
| 1 | erpnext_document_search | 读 | — | 2 |
| 2 | erpnext_document_get | 读 | — | 2 |
| 3 | erpnext_stock_level_query | 读 | — | 2 |
| 4 | erpnext_stock_ledger_query | 读 | — | 2 |
| 5 | erpnext_supplier_search | 读 | — | 2 |
| 6 | erpnext_customer_create | 写 | 人确认 | 2 |
| 7 | erpnext_customer_update | 写 | 人确认 | 1 |
| 8 | erpnext_supplier_create | 写 | 人确认 | 1 |
| 9 | erpnext_supplier_update | 写 | 人确认 | 1 |
| 10 | erpnext_item_create | 写 | 人确认 | 1 |
| 11 | erpnext_item_update | 写 | 人确认 | 1 |
| 12 | erpnext_item_price_set | 写 | 人确认 | 1 |
| 13 | erpnext_sales_order_create | 写 | 全自动 | 3 |
| 14 | erpnext_sales_order_confirm | 写 | 人确认 | 3 |
| 15 | erpnext_sales_order_cancel | 写 | 人确认 | 1 |
| 16 | erpnext_purchase_order_create | 写 | 全自动 | 2 |
| 17 | erpnext_purchase_order_confirm | 写 | 人确认 | 2 |
| 18 | erpnext_purchase_order_cancel | 写 | 人确认 | 1 |
| 19 | erpnext_purchase_receipt_create | 写 | 全自动 | 1 |
| 20 | erpnext_purchase_receipt_confirm | 写 | 人确认 | 1 |
| 21 | erpnext_delivery_note_create | 写 | 全自动 | 2 |
| 22 | erpnext_delivery_note_confirm | 写 | 人确认 | 2 |
| 23 | erpnext_stock_transfer_create | 写 | 全自动 | 1 |
| 24 | erpnext_stock_transfer_confirm | 写 | 人确认 | 1 |
| 25 | erpnext_stock_reconciliation_plan | 读+方案 | 只出 plan | 1 |
| 26 | erpnext_batch_status_get | 读 | — | 1 |

## 2. 覆盖下限核对（S03）

| 下限要求（§9 / 规范 §12.3 / PRD §1.3） | 结果 |
|---|---|
| 每个写操作 tool ≥1 题（19 个写 tool #6–#24） | ✅ 全部 ≥1 |
| 三个启用档位各 ≥1（全自动 / 人确认 / 只出 plan） | ✅ 全自动 5 tool、人确认 14 tool、只出 plan #25 各 ≥1 |
| 失败路径五类各 ≥1（参数缺失 / 前置断言不通过 / 幂等冲突 / 越权 / 声明与实现不一致） | ✅ 各 1 题 |
| 完整销售多步链 ≥1 | ✅ 1 |
| 完整采购多步链 ≥1 | ✅ 1 |
| 只读 tool（#1–#5、#26）不设下限（SHOULD 覆盖） | ✅ 全部覆盖 |
| L2 受限形态：每个原写能力 ≥1 道 plan/零写入题 + 覆盖只出 plan 档 | ✅ 见 L3/L2 验收矩阵 |

## 3. 覆盖缺口清单（W02 识别）

1. **C01a 候选 S02/P02 的「作废/冲回」目标无法映射**（需 delivery_note_cancel / purchase_receipt_cancel，D02 未冻结）：已按规范 §12.6 改题重定向为「取消销售订单 / 取消采购订单」（见 `docs/task-records/changes/CHG-20260916-C01b-001.md`），无契约缺口。
2. 其余写 tool、档位与失败路径缺口：由 W07 补题补齐（T05–T15）。

## 4. 结论

覆盖映射无契约缺口，覆盖下限全部满足。冻结任务集覆盖 D02 全部 26 tool（写 tool 19/19、读 tool 6/6、只出 plan 1/1），失败路径五类与销售/采购多步链各齐备。
