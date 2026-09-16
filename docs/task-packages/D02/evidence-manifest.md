# D02 Evidence Manifest

> 当前状态：D02 v1.0 已实施，待 Implementation Reviewer（gjg）评审（终态「已通过」非「已封存」，档位 1 轻量）。本清单为实施后证据记录，逐项给出「上游权威文件条款 → tool-contract.md 契约条款」对应，非「已覆盖」式主观表述。本包为档位 1（轻量）契约设计包：无数据库写入、无后端交互、无依赖安装；证据形式为 `tool-contract.md` 与上游权威文件的逐项交叉核对记录。
>
> 执行者=Claude（D02 独立实施上下文）、执行时间=2026-09-16（UTC+8）、环境=本机只读文件访问 + 文本/哈希检查。本包不接入 ERPNext、不读取 C01a 候选正文/隐藏数据/终态断言、不涉后端凭据。

## 1. 证据映射（已执行）

| 证据编号 | 对应工作项/自检 | 实际核对操作 | 实际结果 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|
| EV-D02-001 | W01、S01 读类 tool 契约（#1–#5、#26） | 核对 `tool-contract.md` §2 vs PRD §3.3/§3.4、D01 §2/§3/§4/§6.4 | 6 个读 tool（document_search/document_get/stock_level_query/stock_ledger_query/supplier_search/batch_status_get）逐块覆盖 9 项：name 逐字一致、只读对象范围受限（document_search 排除 supplier/bin/sle、supplier_search 专属 Supplier）、消歧文案（PRD §3.4）、详略枚举与分页截断、四布尔显式、批次可见性边界（#26 归属自身会话/他人不可见/不可主动回滚） | `tool-contract.md` §2.1–§2.6 | 已执行·通过 |
| EV-D02-002 | W02、S02/S06 主数据 tool 契约（#6–#12，B01） | 核对 `tool-contract.md` §3 vs B01 F1–F4、PRD §5.1/§5.2、D01 §4/§6.3 | 7 个主数据 tool 逐块 9 项；落地 B01 F1（Customer 不拒重名→server 同名前置断言；Supplier/Item 409→duplicate_name）、F2（update/价格修改必带 modified；create 不适用）、F3（item_price_set 区间不重叠 server 自建校验）、F4（Item 被引用级联删→server 前置引用检查）；`modified` 逐 tool 语义明确 | `tool-contract.md` §3.1–§3.7 | 已执行·通过 |
| EV-D02-003 | W03、S02/S06 销售链路 tool 契约（#13–#15、#21–#22，B02） | 核对 `tool-contract.md` §4 vs B02 F1–F7、PRD §5.1/§5.2 | 5 个销售 tool 逐块 9 项；落地 B02 F1（series 编号无同名）、F2/F3（confirm 必带 modified；cancel 走 save 等价路径）、F4（confirm/cancel 前态 server 前置断言）、F5（超发/库存 confirm 强制、server 前置校验）、F6（items 非空 server 前置）、F7（#13 不接受显式 rate，消除孤儿 Item Price 副作用） | `tool-contract.md` §4.1–§4.5 | 已执行·通过 |
| EV-D02-004 | W04、S02/S06 采购链路 tool 契约（#16–#20，B03） | 核对 `tool-contract.md` §5 vs B03 F1–F9、PRD §5.1/§5.2 | 5 个采购 tool 逐块 9 项；落地 B03 F1/F2/F3/F4/F5/F6/F8（schedule_date 必填）、F9（PR cancel 冲回≠物理删除、不承诺删除已生效收货单）、F7（#16 不接受显式 rate） | `tool-contract.md` §5.1–§5.5 | 已执行·通过 |
| EV-D02-005 | W05、S02/S06 库存链路 tool 契约（#23–#25，B04） | 核对 `tool-contract.md` §6 vs B04 F1–F11、PRD §5.2 | 3 个库存 tool 逐块 9 项；落地 B04 F3（#24 confirm 走 `frappe.client.submit` 全量 doc）、F5（源仓可用量/同仓不同 server 前置断言）、F7/F8/F11（#25 只出 plan、读现状不改数据、估值率/opening-entry 提示）、F10（调拨/盘点已取消不可物理删除） | `tool-contract.md` §6.1–§6.3 | 已执行·通过 |
| EV-D02-006 | W06、S07 幂等边界对齐 B05 §18.3 | 核对 `tool-contract.md` 各块第 7 项 vs B05 §18.3、PRD §5.1、D01 §5 | 窗口期 create 组 300s / confirm·cancel 组 60s 未放宽；指纹由 server 依业务参数规范化、agent 不感知、传输/客户端字段不进指纹；confirm/cancel 状态断言=幂等成功（具体返回结构已逐 tool 冻结）；update/价格归入指纹合并类 300s（§7 明确记录该 D02 确定口径及理由，不构成放宽） | `tool-contract.md` §7.1–§7.3、各块第 7 项 | 已执行·通过 |
| EV-D02-007 | W06、S08 断言/批次口径对齐 D01 §6、PRD §5.2–§5.4 | 核对 `tool-contract.md` 各块第 6/9 项 vs D01 §6、PRD §5.2–§5.4 | 写 tool 乐观版本断言逐 tool 明确（update/价格修改/confirm/cancel 必带 modified；create 不适用）；批次粒度/回滚路径/`batch_status_get` 可见性边界齐备；「已取消不可物理删除」的 PR/STE/SR 如实声明 | `tool-contract.md` §7.4–§7.6、各块第 6/9 项 | 已执行·通过 |
| EV-D02-008 | W06、S03/S04/S05 命名/schema/annotation/错误转译对齐 D01 §1–§4 | 核对 `tool-contract.md` 各块第 1/2/3/4/5/8 项 vs D01 §1/§2/§3/§4、规范 §8.2–§8.7、PRD §2.3 | 26 个 name 与 PRD §3.3 逐字一致、动作后缀语义一致；Link 引用语义表达、子表嵌套、写 tool modified；返回语义化/分页/截断/详略；四布尔显式、旁挂后端 openWorld=false；错误转译 DuplicateEntryError 409→duplicate_name、TimestampMismatchError 417→concurrency_conflict 等口径落地且含可自纠建议 | `tool-contract.md` 各块、第 0 章 | 已执行·通过 |
| EV-D02-009 | W06、S09 窄接口与允许清单边界对齐 D01 §7、PRD §2.3/§5.6 | 核对 `tool-contract.md` §1 总约束 + 各块第 2/3 项 vs D01 §7、PRD §2.3/§5.6 | 操作允许清单（12 类）/引用允许清单（9 类）边界；清单外不读写、引用清单只引用；document_search 排除 supplier/bin/sle；Link 目标仅限引用清单；子表仅嵌套；最小参数与动作、description 声明窄接口边界齐备 | `tool-contract.md` §1、各块第 2/3 项 | 已执行·通过 |
| EV-D02-010 | W06、E02 对齐点核对（§16 兜底） | 核对 `tool-contract.md` §7 vs E02 implementation-contract §1–§7 | 逐项核对窗口期/指纹/状态断言/乐观版本/cancel 版本保护/批次/#26 均可挂接 E02 机制接口（fingerprintOf/checkStateAssertion/assertPreconditions/checkReadBack/batch-ledger/queryBatchStatus），无「契约口径不可实现」漂移，无需走变更控制 | `tool-contract.md` §7 | 已执行·通过 |
| EV-D02-011 | S10 未读 C01a 正文/隐藏材料 | 核对本包证据与写入集 | 本包证据仅引用 C01a 版本/完成标识（v1.0 已封存 2026-09-15），无候选正文/初始态/终态断言痕迹；未读取 `D:\second-acceptance\candidates\C01a\` | 本清单 §3 | 已执行·通过 |

## 2. 逐 tool 九项覆盖自检（S02，脚本式核对）

对 `tool-contract.md` 逐块核对九项编号（1 tool 标识与档位 / 2 description / 3 输入 schema / 4 输出 schema / 5 annotation / 6 前置断言 / 7 幂等边界 / 8 错误转译 / 9 批次行为）：

- 26 个 tool 契约块共 26 × 9 = 234 项结构点，逐块九项齐备、无缺项；读 tool 的「幂等边界/前置断言/批次行为」项均已如实标注「不适用（只读）」而非空置。
- 26 个 name 与 PRD §3.3 逐字一致（`erpnext_<资源>_<动作>`），类型/档位与 PRD §3.3/§4.1 一致，不增不减。

## 3. 敏感信息与受控位置

- D02 不接入 ERPNext 后端、不调用其 REST API 或数据库，无后端凭据进入本包；
- 本包不读取 C01a 隐藏候选（`D:\second-acceptance\candidates\C01a\`）或任何正式验收材料；C01a 仅以版本/完成标识引用，未出现候选正文、初始态或终态断言；
- `tool-contract.md` 为公开契约（落实施区），不含密码、密钥、认证头或完整堆栈；B01–B04 接口事实中的错误码（409/417/403/404 等）与 `frappe.client.submit`/`frappe.client.save` 端点为公开已封存事实，非敏感。
