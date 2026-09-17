# F01 交付物 D04：对齐核对记录

> 文档性质：F01 交付物 D04（脱敏）。工作项 W08；对应自检 S02/S03/S05/S06/S08。
> 实现主体：Claude（F01 独立实施上下文）；Owner：gjg；日期：2026-09-16。未读取 C01b 冻结任务集正文/断言。
> 核对范围：6 个读 tool 与 D02 `tool-contract.md` §2、D01 `common-contract.md` §1–§7、E01 `permission-matrix.md`/`allowlist.md` 逐项一致，无清单外对象、无越界读写。

## 1. 逐 tool 与 D02 §2 核对（name / schema / annotation / 错误码 / 批次行为）

| 核对项 | D02 §2 冻结口径 | F01 实现落点 | 结论 |
|---|---|---|---|
| #1 name/动作/类型 | `erpnext_document_search` · 检索 · 读 | `server/src/tools/document-search.js` | 一致 |
| #1 object_type 九类（排除 supplier/bin/sle） | §2.1 输入 schema | `allowlist.OBJECT_TYPES`（九类，硬编码） | 一致 |
| #1 filters 仅该对象可检索字段 | §2.1 | `allowlist.FILTER_FIELDS`（D03） | 一致 |
| #1 输出 `{items,total,page,page_size,truncated}` | §2.1 输出 schema | document-search handler | 一致 |
| #1 错误码 invalid_argument / result_set_overflow / permission_denied / backend_unavailable | §2.1 第 8 项 | translate.js + handler | 一致 |
| #2 name/schema（object_type + object_id） | §2.2 | document-get.js | 一致 |
| #2 目标不存在(404)→precondition_failed | §2.2 第 8 项 | translate `DoesNotExistError`→`precondition_failed` | 一致 |
| #3 目标 Bin、item_code/warehouse 语义引用 | §2.3 | stock-level-query.js（`STOCK_LEVEL_DOCTYPE=Bin`） | 一致 |
| #3 引用不存在(LinkValidationError 417)→precondition_failed | §2.3 第 8 项 | translate `LinkValidationError`→`precondition_failed` | 一致 |
| #4 目标 SLE、日期区间、SR 流水 actual_qty=0/qty_after_transaction=新基线 | §2.4（B04 F7/F6） | stock-ledger-query.js（如实呈现 change_qty/balance_qty） | 一致 |
| #5 目标仅 Supplier、supplier_group 引用 | §2.5 | supplier-search.js（无 object_type；`SUPPLIER_DOCTYPE`） | 一致 |
| #26 无后端业务对象、batch_id 可选、可见性边界 | §2.6 | batch-status-get.js（挂接 E02 `queryBatchStatus`） | 一致 |
| #26 批次不存在→batch_not_found、非归属→permission_denied | §2.6 第 8 项 | E02 `queryBatchStatus` 既有语义 | 一致 |
| annotation 统一 readOnly/destructive/idempotent/openWorld | §2 各块第 5 项 | 6 tool `annotations`（readOnlyHint=true 等） | 一致 |
| readOnly 与 idempotent 分别显式声明 | D01 §3.4 | 6 tool 均显式 `readOnlyHint` + `idempotentHint` | 一致 |

## 2. 与 D01 §1–§7 核对

| D01 条款 | 口径 | F01 落点 | 结论 |
|---|---|---|---|
| §1 命名空间 + 动作后缀 + 消歧 | `erpnext_<资源>_<动作>`、相近 tool 消歧入 description | 6 tool name 与 description 消歧文案 | 一致 |
| §2.1 参数必填/可选显式、禁止任意字段名 | server 校验 | object_type/filters/object_id 校验 | 一致 |
| §2.2 语义化标识、无低层标识符、分页/截断/详略 | 返回值裁剪 | projectFields + SYSTEM_FIELDS 剥离 + 分页/详略 | 一致 |
| §3.1 四 annotation 全部显式声明 | 不依赖协议默认值 | 6 tool 显式 | 一致 |
| §3.4 幂等声明与实现对应（只读天然幂等，分别声明） | 只读 tool | readOnlyHint 与 idempotentHint 分别声明，无写幂等机制挂接 | 一致 |
| §4.1 统一错误形状（isError/code/message/retryable/details） | 不裸抛堆栈 | translate.js + lib/errors | 一致 |
| §4.2 错误分类枚举 code 映射 | 语义化 code | NATIVE_EXC_CODE/HTTP_CODE | 一致 |
| §5 幂等边界（窗口期/指纹） | 只读不适用 | 未挂接（D02 §2 第 7 项「不适用」） | 一致 |
| §6.1/6.2 前置/事后两层拆分（schema 不计入） | 只读无写状态断言 | 未挂接（D02 §2 第 6 项「无写状态断言」） | 一致 |
| §6.4 批次台账可见性（普通不读他人、管理员全量） | #26 | batch-status-get 挂接 queryBatchStatus | 一致 |
| §7 窄接口/允许清单（清单外 MUST NOT 读写、引用只引用） | server 强制 | allowlist 三层拦截 | 一致 |

## 3. 与 E01 permission-matrix / allowlist 核对

| E01 条款 | F01 落点 | 结论 |
|---|---|---|
| 读 tool 目标对象：9 读对象（#1/#2）+ Bin（#3）+ SLE（#4）+ Supplier（#5）+ 无（#26） | `OBJECT_TYPES`/`STOCK_LEVEL_DOCTYPE`/`STOCK_LEDGER_DOCTYPE`/`SUPPLIER_DOCTYPE` | 一致 |
| document_search 排除 Supplier/Bin/SLE | `EXCLUDED_OBJECT_TYPES` + object_type 枚举 | 一致 |
| 引用对象九类只读、Link 目标硬编码 | `REFERENCE_ALLOWLIST`/`LINK_TARGETS` | 一致 |
| 三层拦截第二层（对象类型枚举）+ 第三层（能力一致性） | allowlist 硬编码 + handler 校验 | 一致 |
| 后端经 mcp-service + MCP Business Caller 只读调用 | config 自环境变量注入 token；backend 仅 GET | 一致 |
| 框架残余 Contact/Address/User 兜底（§18.4） | object_type 枚举不含 contact/address/user | 一致 |

## 4. 结论

- 6 个读 tool 与 D02 §2 逐项一致，无反向放宽、无清单外对象、无越界读写、无新增通用 CRUD 或任意代码执行面。
- 白名单枚举硬编码、错误转译挂接统一错误形状、#26 可见性边界正确。
- 未触发 §15 停止条件；无需新增对象/tool/权限/依赖。
