# H01 符合性声明（CD-1）

> 文档性质：H01 交付物 CD-1，《符合性声明》正文。依据《开源后端 Agent 化接入规范》2026-09-07 定稿版 §3.5 起草；其正确性以「声明与上游冻结结论/证据客观一致」判定（H01 档位 1，Implementation Reviewer 评审替代独立验收）。
> 任务包：H01 v1.0（已冻结）；实施主体：Claude（H01 交付上下文）；Owner：gjg；日期：2026-09-18。
> 本声明只引用上游已冻结/已封存事实，不自评拔高、不静默跳过。

---

## 1. 符合性等级

| 项 | 结论 |
|---|---|
| 符合性等级 | **L3（自主写入）** |
| 判定依据 | 存在处于「全自动」档的写操作 tool（#13/#16/#19/#21/#23 共 5 个草稿创建 tool），按规范 §3.2「等级由实际启用的最高档位决定」即为 L3 |
| 等级成立前提 | A01 v1.0 已确认 L3 成立（客户端 Claude Code 2.1.263 / MCP 2025-11-25 声明并处理 `elicitation`，`docs/task-packages/A01/verification-record.md` §2.10 接入方 gjg 签署）；G01 v1.0 已按 L3 真实终态验收通过（15 题 × 连续两轮 30/30 全过） |
| 降级条件 | 若未来客户端能力变化（不再支持 server 侧确认），须重走 A01 门槛并重新验收，本次接入降为 L2 受限形态（PRD §1.3）；H01 不承担该判定（H01 task §16） |

## 2. 实际启用的档位清单与每个写操作 tool 的档位归属

实际启用三个档位：**全自动（5）/ 人确认（14）/ 只出 plan（1）**；读 tool（6）无档位。26 个 tool 的档位归属忠实 D02 `tool-contract.md` §1 总表，不增不减。

### 2.1 读类 tool（6，无档位）

| # | tool | 类型 |
|---|---|---|
| 1 | `erpnext_document_search` | 读 |
| 2 | `erpnext_document_get` | 读 |
| 3 | `erpnext_stock_level_query` | 读 |
| 4 | `erpnext_stock_ledger_query` | 读 |
| 5 | `erpnext_supplier_search` | 读 |
| 26 | `erpnext_batch_status_get` | 读（server 批次台账元数据） |

### 2.2 写操作 tool（20 = 全自动 5 + 人确认 14 + 只出 plan 1）

| # | tool | 档位 |
|---|---|---|
| 13 | `erpnext_sales_order_create` | 全自动 |
| 16 | `erpnext_purchase_order_create` | 全自动 |
| 19 | `erpnext_purchase_receipt_create` | 全自动 |
| 21 | `erpnext_delivery_note_create` | 全自动 |
| 23 | `erpnext_stock_transfer_create` | 全自动 |
| 6 | `erpnext_customer_create` | 人确认 |
| 7 | `erpnext_customer_update` | 人确认 |
| 8 | `erpnext_supplier_create` | 人确认 |
| 9 | `erpnext_supplier_update` | 人确认 |
| 10 | `erpnext_item_create` | 人确认 |
| 11 | `erpnext_item_update` | 人确认 |
| 12 | `erpnext_item_price_set` | 人确认 |
| 14 | `erpnext_sales_order_confirm` | 人确认 |
| 15 | `erpnext_sales_order_cancel` | 人确认 |
| 17 | `erpnext_purchase_order_confirm` | 人确认 |
| 18 | `erpnext_purchase_order_cancel` | 人确认 |
| 20 | `erpnext_purchase_receipt_confirm` | 人确认 |
| 22 | `erpnext_delivery_note_confirm` | 人确认 |
| 24 | `erpnext_stock_transfer_confirm` | 人确认 |
| 25 | `erpnext_stock_reconciliation_plan` | 只出 plan（无写入） |

> 计数核对：读 6 + 全自动 5 + 人确认 14 + 只出 plan 1 = 26，与 D02 §1 总表逐 tool 一致（S02）。

### 2.3 档位判定依据摘要（规范 §10.2 三条推导，忠实 PRD §4.1）

- **全自动**（草稿创建 #13/#16/#19/#21/#23）：① 可逆（草稿可删/批次回滚）② 仅引用主数据、不产生主数据变更 ③ 建单结果可写可执行断言——三条全满足。
- **人确认**（生效 #14/#17/#20/#22/#24、取消 #15/#18、主数据 #6–#12）：生效/取消冲回产生不可擦除流水、主数据为全系统引用源，任一不满足 → 降为人确认。
- **只出 plan**（#25 盘点）：「正确库存」是系统外事实，③ 客观判定标准不满足 + ① 覆盖库存基线不可逆 → 只出 plan。

## 3. 每一条 SHOULD 级条款的遵守情况

依据规范 §0.1，SHOULD/SHOULD NOT 为「建议遵守，偏离须在符合性声明中书面说明理由」。逐条结论如下（无偏离）：

| 编号 | 条款位置 | SHOULD 条款内容 | 结论 | 理由/证据 |
|---|---|---|---|---|
| SHOULD-01 | §6.1 前提 | 后端 API 有可读的数据模型文档或源码 | 遵守 | ERPNext 开源，源码与数据模型可读；B01–B04 基于源码/数据模型实测接口事实（`interface-facts.md` 均已封存） |
| SHOULD-02 | §6.1 前提 | 目标客户端支持 server 侧发起的确认机制 | 遵守 | A01 实测 Claude Code 2.1.263 声明并端到端处理 `elicitation`，L3 成立（A01 `verification-record.md`） |
| SHOULD-03 | §8.5 | 返回值上限设参考默认值，实施方可按后端特点调整 | 遵守 | D01/D02 冻结分页 `page_size` 默认值 + 上限 + 截断 + 分页提示（读 tool 逐块「输出 schema」） |
| SHOULD-04 | §8.5 | 返回值可能显著膨胀的查询类 tool 提供详略枚举参数 | 遵守 | 6 读 tool 均提供 `detail` 枚举 `summary`/`detail`（D02 §2） |
| SHOULD-05 | §9.2 档位表 | 前置断言：关键步骤人确认档 SHOULD | 遵守 | 14 个人确认写 tool 均实现业务状态前置断言（PRD §5.2 逐 tool，D02 逐块第 6 项），实现不弱于建议 |
| SHOULD-06 | §9.2 档位表 | 前置断言：只出 plan 档 SHOULD | 遵守 | #25 无写入，前置以 `warehouse` 有效/物料存在轻量校验（D02 §6.3 第 6 项）；写状态断言不适用 |
| SHOULD-07 | §12.3 | 只读 tool 不设下限（SHOULD 覆盖） | 遵守 | G01 覆盖核对：读 6/6 全部实跑且终态正确（G01 `acceptance-report.md` §4） |
| SHOULD-08 | §13.2 | 数据覆盖率 SHOULD 采集 | 不适用 | 仅在涉及数据治理时适用；本次无数据治理（见 §4） |

**偏离条款**：无（与 PRD §0「SHOULD 偏离：无」一致）。

## 4. 判定为「不适用」的条款及理由

| 条款位置 | 内容 | 不适用理由 |
|---|---|---|
| §11 数据治理流程规范（整章） | 数据治理四步流程（schema mapping / 事件流归约 / 主数据归一 / 覆盖率标注） | 本次接入不涉及数据治理：进销存核心域 MCP 封装为「旁挂 MCP server + 独立验收环境」，无历史数据迁移、无主数据归一、无覆盖率标注；验收环境仅使用合成数据（PRD §5.7、PRD §0 决议 7）。按规范 §3.3「涉及治理时 MUST」、§3.5「不适用须书面说明」，本条为显式不适用声明，非裁剪 |
| §13.2 数据覆盖率 | 归一后主数据覆盖业务量的比例指标 | 性质为「SHOULD 采集、非符合性必需、仅在涉及数据治理时适用」；本次无治理，故不采集（与 SHOULD-08 同源） |

> 规范第 6/7/8/9/10/12/13.1 章均为 MUST（本次 L3 全等级适用），不属「不适用」；本次接入全部遵守，无裁剪。

## 5. 引用标准版本核对（规范 §4）

| 引用对象 | 实际版本 | 处理 |
|---|---|---|
| MCP 协议规范 | **2025-11-25**（A01 `initialize.params.protocolVersion` 实测） | 已按接入时协议版本文档核对 §8/§9；annotation 四字段、参数校验、返回值契约、server 侧确认机制均按该版本文档实现 |
| 幂等键相关公开草案 | 仅作参考 | MUST NOT 绑定传输层字段；B05 已实测无透明重试 + 无可信关联信号 → 业务层指纹方案（B05 `idempotency-research.md` §18.3） |
| 公开 MCP 安全实践清单 | 作为依据引用 | §9.6 最小权限、§9.7 确认内容要求按其精神落地（E01 权限矩阵/允许清单/确认 fail-closed），未逐条照搬 |

## 6. 结论

本次接入符合性等级 **L3**；实际启用档位全自动 5 / 人确认 14 / 只出 plan 1（读 6）；SHOULD 级条款 8 条中 7 条遵守、1 条不适用、0 条偏离；「不适用」声明 2 项（§11 数据治理、§13.2 数据覆盖率）均已书面说明理由。本声明与 A01（L3）、D02（26 tool 档位）、E01（权限/确认）、G01（L3 真实终态验收 30/30）等上游冻结结论客观一致，未以 H01 自评拔高或降低。
