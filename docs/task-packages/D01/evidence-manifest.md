# D01 Evidence Manifest

> 当前状态：D01 v1.0 已实施并通过评审（终态「已通过」）；自检 S01—S09 全部通过（2026-09-15）；Implementation Reviewer（gjg）已记录评审通过（2026-09-15，档位 1 以评审记录替代独立验收，正确性由下游 D02 首次使用时验证）。本清单为实施后证据记录，逐项给出「上游权威文件条款 → 公共契约正文条款」对应，非「已覆盖」式主观表述。本包为档位 1（轻量）契约设计包：无数据库写入、无后端交互、无依赖安装；证据形式为公共契约正文（`common-contract.md`）与上游权威文件的逐项交叉核对记录。
>
> 执行者=Claude（D01 独立实施上下文）、执行时间=2026-09-15（UTC+8）、环境=本机只读文件访问 + 文本/哈希检查。本包不接入 ERPNext、不读取 C01a 候选、不涉后端凭据。

## 1. 证据映射（已执行）

| 证据编号 | 对应工作项/自检 | 实际核对操作 | 实际结果 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|
| EV-D01-001 | W01、S01 命名与 tool 标识规范 | 核对 `common-contract.md` §1 vs PRD §3.2/§3.3、规范 §8.2/§8.3 | §1 记录命名空间 `erpnext_<资源>_<动作>`、动作后缀语义（create=草稿/confirm=生效/cancel=取消/plan=只出方案/search·get·query=读，自 PRD §3.3 归纳）、消歧要求（规范 §8.3）、命名可调项边界（调前缀/后缀不动语义）；不硬编码单个 tool 名 | `common-contract.md` §1；S08 扫描零命中 | 已执行·通过 |
| EV-D01-002 | W02、S02 公共 schema 规范 | 核对 `common-contract.md` §2 vs 规范 §8.4/§8.5 | 参数通用形状（必填标识、嵌套行项目、Link 引用以语义标识表达由 server 解析为后端标识）、返回结构通用形状（语义化、高信噪比、分页/过滤/截断/详略默认值）齐备 | `common-contract.md` §2.1/§2.2 | 已执行·通过 |
| EV-D01-003 | W03、S03 annotation 规范 | 核对 `common-contract.md` §3 vs 规范 §8.1 | 四布尔显式声明、对外声明/对内执法分离、旁挂后端「与外部世界交互=否」、`idempotent` 与幂等实现对应关系齐备 | `common-contract.md` §3 | 已执行·通过 |
| EV-D01-004 | W04、S04 公共错误模型 | 核对 `common-contract.md` §4 vs PRD §7 错误响应场景 + B01–B04 §6 错误事实 | 8 类错误分类 + 统一响应形状（isError/code/message/retryable/details）+ 透出边界；DuplicateEntryError 409 / TimestampMismatchError 417 等转译口径落地；幂等命中列为特殊成功（非错误）；批次查询/异常回滚/确认降级等非错误口径已排除（§4 范围边界） | `common-contract.md` §4 | 已执行·通过 |
| EV-D01-005 | W05、S05 幂等边界契约 | 核对 `common-contract.md` §5 vs B05 §18.3、PRD §5.1、规范 §9.3 | 窗口期 create 300s / confirm·cancel 60s 未放宽；指纹由 server 依业务参数规范化、agent 不感知、传输/客户端字段不进指纹、同参同指纹异载异指纹；误合并策略；confirm/cancel 状态断言=幂等成功（具体返回结构留 D02，未越界冻结） | `common-contract.md` §5 | 已执行·通过 |
| EV-D01-006 | W06、S06 断言/校验/批次公共口径 | 核对 `common-contract.md` §6 vs 规范 §9.4/§9.5/§9.6、PRD §5.2–§5.4、B01–B04 §3 事务/版本结论 | 前置断言两层拆分（schema vs 业务状态）、事后校验两层拆分（返回值形状 vs 写后回读终态）、乐观版本断言（写 tool 必须携带 `modified`）、批次台账公共口径（一次调用一批次、同批变更、回滚路径、batch_status_get 可见性边界）齐备 | `common-contract.md` §6 | 已执行·通过 |
| EV-D01-007 | W07、S07 窄接口与允许清单边界 | 核对 `common-contract.md` §7 vs 规范 §9.6、PRD §2.3/§5.6 | 操作允许清单（12 类）与引用允许清单（9 类）边界、清单外 MUST NOT 读写、引用清单只引用不可增删改、Link 目标仅限引用清单、禁止任意字段名/DocType、子表仅嵌套、最小参数与权限声明齐备 | `common-contract.md` §7 | 已执行·通过 |
| EV-D01-008 | W08、S08 不含具体 tool 业务语义 | 全文扫描 `common-contract.md` 两个模式 | 零命中（无 #1–#26 逐 tool 的 name/description/schema/断言） | 扫描命令与输出见 §2 | 已执行·通过 |
| EV-D01-009 | S09 未读 C01a 正文/隐藏材料 | 核对本包证据与写入集 | 本包证据仅引用 C01a 版本/完成标识，无候选正文/初始态/终态断言痕迹；未读取 `D:\second-acceptance\candidates\C01a\` | 本清单 §3 | 已执行·通过 |

## 2. S08 全文扫描命令与输出

执行命令（本机只读文件访问）：

```bash
cd docs/task-packages/D01

# 模式一：具体 tool 名模式（erpnext_<资源>_<动作> 的具象化）
grep -nE 'erpnext_[a-z_]+_(create|update|confirm|cancel|plan|set|search|get|query)' common-contract.md

# 模式二：PRD §3.3 全部 26 个 tool 名逐一枚举
grep -nE 'erpnext_(document_search|document_get|stock_level_query|stock_ledger_query|supplier_search|customer_create|customer_update|supplier_create|supplier_update|item_create|item_update|item_price_set|sales_order_create|sales_order_confirm|sales_order_cancel|purchase_order_create|purchase_order_confirm|purchase_order_cancel|purchase_receipt_create|purchase_receipt_confirm|delivery_note_create|delivery_note_confirm|stock_transfer_create|stock_transfer_confirm|stock_reconciliation_plan|batch_status_get)' common-contract.md
```

实际输出：两命令均无匹配（`exit=1`，零命中）。即 `common-contract.md` 全文不含任何 #1–#26 具体 tool 的 name/description/schema/断言。

## 3. 敏感信息与受控位置

- D01 不接入 ERPNext 后端、不调用其 REST API 或数据库，无后端凭据进入本包；
- 本包不读取 C01a 隐藏候选（`D:\second-acceptance\candidates\C01a\`）或任何正式验收材料；C01a 仅以版本/完成标识引用，未出现候选正文、初始态或终态断言；
- 公共契约正文 `common-contract.md` 为公开契约（落实施区），不含密码、密钥、认证头或完整堆栈；B01–B04 接口事实中的错误码（409/417/403/404 等）为公开事实，非敏感。
