# 业务 tool 契约（tool-contract）

> **文档性质**：D02 交付物 CD-2，《业务 tool 契约》正文。它是 C01b、E01、F01/F02/F04 实施与验收的权威输入，逐 tool 冻结 PRD §3.3 #1–#26 的 name/description/schema/annotation/前置断言/幂等边界/错误转译/批次行为，全部以 D01 公共契约（`common-contract.md`）为统一基座。
> **版本**：v1.0（D02 实施产出，待 Implementation Reviewer 评审通过；档位 1 轻量，正确性由下游 F 包首次使用时验证）。
> **上游依据**：D01 `common-contract.md` v1.0（已通过，统一基座，下文「D01 §x」）；《开源后端 Agent 化接入规范》2026-09-07 定稿版（下文「规范 §x」）；《ERPNext-MCP 改造 PRD》2026-09-12-r1（下文「PRD §x」）；B01–B04 interface-facts v1.0（均已封存，下文「B0x Fn」）；B05 v1.0（已封存，`idempotency-research.md` 与 `task.md` §18.3，下文「B05 §x」）；E02 `implementation-contract.md` v1.0（已封存，对齐参照，非上游）。
> **约束性等级**：MUST / MUST NOT / SHOULD / SHOULD NOT / MAY 沿用规范 §0.1 口径。无标注段落为说明性文字。

---

## 0. 阅读约定与基座

1. 本契约是 26 个业务 tool 的**逐 tool 冻结口径**。凡跨 tool 共享的契约层（命名规范、公共 schema 形状、annotation 语义、公共错误模型、幂等公共规则、前置/事后/批次公共口径、窄接口与允许清单边界），一律以 D01 `common-contract.md` 为统一基座引用，本契约不重复定义、不反向放宽。
2. 每 tool 契约块按 D02 task §9.1 九项结构逐项落地，编号 1–9 与 §9.1 一一对应；读 tool 的「幂等边界」「前置断言（写状态）」「批次回滚」项如实标注「不适用」及理由，不省略、不空置。
3. 本契约只冻结「契约口径（做什么）」，不冻结「实现手法（怎么做）」（E02/F 包职责）；但确认 E02 实现能力与契约口径可对齐（见第 7 章）。
4. **`modified` 乐观版本断言逐 tool 语义（D01 §6.3 第 4 条）**：凡**针对既有对象**的修改/状态流转（update、价格修改、confirm、cancel）MUST 携带 `modified` 做乐观并发（B01–B04 F2 一致结论：提供则校验、省略则不校验）；凡 **create 新建对象**无既有版本，不携带 `modified`，其并发保护由幂等指纹承担。这一区分是 B01–B04 F2 实测结论（F2 仅针对既有对象的 update/confirm/cancel/save）的正确落地，不构成对「写 tool 乐观并发」硬口径的放宽。
5. **cancel 版本保护逐 tool 明确（D02 task §16）**：标准 cancel 端点不接受 `modified`（B02 F3/B03 F3/B04 F3），#15/#18 cancel MUST 经 `frappe.client.save`（docstatus=2 + modified）等价路径施加版本保护，不得以「端点不支持」为由放弃版本断言。

---

## 1. 26 个 tool 总表（忠实 PRD §3.3 / §4.1，不增不减）

| PRD # | name | 业务动作 | 类型 | 档位 | 契约块 |
|---|---|---|---|---|---|
| 1 | `erpnext_document_search` | 按业务条件检索单据与主数据 | 读 | — | §2.1 |
| 2 | `erpnext_document_get` | 查看单据/主数据详情与当前状态 | 读 | — | §2.2 |
| 3 | `erpnext_stock_level_query` | 查物料各仓库实际/可用/预留量 | 读 | — | §2.3 |
| 4 | `erpnext_stock_ledger_query` | 查库存出入库流水 | 读 | — | §2.4 |
| 5 | `erpnext_supplier_search` | 检索供应商 | 读 | — | §2.5 |
| 6 | `erpnext_customer_create` | 登记新客户 | 写 | 人确认 | §3.1 |
| 7 | `erpnext_customer_update` | 修改既有客户信息 | 写 | 人确认 | §3.2 |
| 8 | `erpnext_supplier_create` | 登记新供应商 | 写 | 人确认 | §3.3 |
| 9 | `erpnext_supplier_update` | 修改既有供应商信息 | 写 | 人确认 | §3.4 |
| 10 | `erpnext_item_create` | 登记新物料 | 写 | 人确认 | §3.5 |
| 11 | `erpnext_item_update` | 修改既有物料信息 | 写 | 人确认 | §3.6 |
| 12 | `erpnext_item_price_set` | 设置物料售价（含生效期） | 写 | 人确认 | §3.7 |
| 13 | `erpnext_sales_order_create` | 创建销售订单草稿 | 写 | 全自动 | §4.1 |
| 14 | `erpnext_sales_order_confirm` | 生效销售订单 | 写 | 人确认 | §4.2 |
| 15 | `erpnext_sales_order_cancel` | 取消已生效销售订单 | 写 | 人确认 | §4.3 |
| 16 | `erpnext_purchase_order_create` | 创建采购订单草稿 | 写 | 全自动 | §5.1 |
| 17 | `erpnext_purchase_order_confirm` | 生效采购订单 | 写 | 人确认 | §5.2 |
| 18 | `erpnext_purchase_order_cancel` | 取消已生效采购订单 | 写 | 人确认 | §5.3 |
| 19 | `erpnext_purchase_receipt_create` | 按采购订单生成收货草稿 | 写 | 全自动 | §5.4 |
| 20 | `erpnext_purchase_receipt_confirm` | 收货入库生效 | 写 | 人确认 | §5.5 |
| 21 | `erpnext_delivery_note_create` | 按销售订单生成发货草稿 | 写 | 全自动 | §4.4 |
| 22 | `erpnext_delivery_note_confirm` | 发货出库生效 | 写 | 人确认 | §4.5 |
| 23 | `erpnext_stock_transfer_create` | 创建仓库间调拨草稿 | 写 | 全自动 | §6.1 |
| 24 | `erpnext_stock_transfer_confirm` | 调拨生效 | 写 | 人确认 | §6.2 |
| 25 | `erpnext_stock_reconciliation_plan` | 生成盘点调整方案（不改数据） | 读+方案 | 只出 plan | §6.3 |
| 26 | `erpnext_batch_status_get` | 按批次标识查询批次状态、涉及对象及回滚结果 | 读 | — | §2.6 |

> **对象范围总约束（D01 §7）**：上表所有 tool 的可读/可写目标仅限操作允许清单（Customer、Supplier、Item、Item Price、Sales Order、Purchase Order、Purchase Receipt、Delivery Note、Stock Entry、Stock Reconciliation、Bin、Stock Ledger Entry）与其声明能力；Link 字段目标仅限引用允许清单（Company、Warehouse、Price List、Currency、Customer Group、Supplier Group、Territory、Item Group、Unit of Measure）。清单外对象 MUST NOT 读写，引用清单对象只可引用不可增删改。子表（Items 等）仅作父单据嵌套行项目读写，不视为独立操作对象。

---

## 2. 读类 tool 契约（#1–#5、#26）

> 读类 tool 通性：readOnly=true、无写前置断言、无批次写入、只读天然幂等。各 tool 的差异在对象范围与查询语义，逐块冻结如下。

### 2.1 `erpnext_document_search`（PRD #1）

1. **tool 标识与档位**：name `erpnext_document_search`；PRD #1；业务动作「按业务条件检索单据与主数据」；类型「读」；档位「—」（读）。
2. **description**（向团队新人介绍）：按业务条件在一类单据或主数据对象中检索匹配记录，返回分页、可过滤、可截断的结果列表。查询对象限于操作允许清单中的单据与主数据（客户、物料、物料价格、销售订单、采购订单、采购收货单、销售发货单、库存调拨、库存盘点），不含供应商、库存余量与库存流水。**消歧**：供应商检索必须用 `erpnext_supplier_search`（本 tool 不接受供应商为目标对象）；查实物库存用 `erpnext_stock_level_query`，查出入库流水用 `erpnext_stock_ledger_query`，查单个对象详情用 `erpnext_document_get`。**窄接口边界**：只读；不接受任意对象类型或任意字段名；对象类型限定为上述九类。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `object_type` | 枚举 | 必填 | 目标对象类型：`customer`/`item`/`item_price`/`sales_order`/`purchase_order`/`purchase_receipt`/`delivery_note`/`stock_entry`/`stock_reconciliation`（不含 supplier/bin/stock_ledger_entry） |
   | `filters` | 对象 | 可选 | 按该对象类型的业务字段过滤（如名称包含、状态、日期区间、分类）；不接受任意字段名，仅限该对象的可检索字段 |
   | `page` / `page_size` | 整数 | 可选 | 分页；`page_size` 缺省取合理默认值并有上限，超出触发截断 + 分页提示 |
   | `detail` | 枚举 | 可选 | 详略：`summary`（简略，默认）/ `detail`（详细） |
4. **输出 schema**：分页结果集 `{ items: [...], total, page, page_size, truncated }`；每项返回语义化标识 + 该对象的关键可读字段；`truncated=true` 时附「加过滤/分页以收敛」提示；内部标识符解析成语义化表达或有序编号后返回（D01 §2.2）。
5. **annotation**：readOnly=true；destructive=false；idempotent=true（只读天然幂等）；openWorld=false（旁挂后端）。
6. **前置断言**：无写状态断言。schema 校验（object_type 合法、filters 字段属于该对象）失败按 `invalid_argument` 返回，不计入业务状态前置断言（D01 §6.1）。
7. **幂等边界**：不适用（只读，无写入；只读声明与幂等声明已分别显式声明，D01 §3.4）。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | object_type 非法 | `invalid_argument` | 从九类允许对象中指定一个 |
   | filters 含未知字段 | `invalid_argument` | 改用该对象的可检索字段 |
   | 结果集超限 | `result_set_overflow` | 追加过滤、缩小日期区间或翻页 |
   | 越权 | `permission_denied` | 转译列出所需对象读权限，不透出堆栈 |
   | 后端不可达 | `backend_unavailable` | 明确报「后端不可达」，写操作不自动重试（本 tool 只读） |
9. **批次行为**：不适用（只读，不产生批次、无回滚）。

### 2.2 `erpnext_document_get`（PRD #2）

1. **tool 标识与档位**：name `erpnext_document_get`；PRD #2；业务动作「查看单据/主数据详情与当前状态」；类型「读」；档位「—」。
2. **description**：按语义标识（客户名、物料编码、单据编号等业务可读标识）读取单个单据或主数据对象的完整详情与当前状态（含单据状态机当前态）。**消歧**：这是「单个对象详情」，批量检索用 `erpnext_document_search`；查库存余量/流水分别用 `erpnext_stock_level_query`/`erpnext_stock_ledger_query`。**窄接口边界**：只读；目标类型同 #1 的九类对象；子表仅随父单据一并返回，不作为独立目标查询。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `object_type` | 枚举 | 必填 | 同 #1 九类对象 |
   | `object_id` | 字符串 | 必填 | 语义标识（客户名、物料编码、单据编号等）；由 server 解析为后端标识，不要求填内部标识符 |
4. **输出 schema**：单对象详情 + 当前状态（如单据 docstatus 对应状态、`modified` 当前值、状态字段）；语义化标识；无低层技术标识符（D01 §2.2）。
5. **annotation**：readOnly=true；destructive=false；idempotent=true；openWorld=false。
6. **前置断言**：无写状态断言。object_id 不存在按 `precondition_failed`（目标不存在）返回并建议「改用 search 检索或核对标识」。
7. **幂等边界**：不适用（只读）。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 目标不存在（DoesNotExistError 404） | `precondition_failed` | 核对语义标识或先用 `document_search` 定位 |
   | object_type 非法 | `invalid_argument` | 从九类允许对象中指定 |
   | 越权 | `permission_denied` | 转译列出所需读权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」 |
9. **批次行为**：不适用（只读）。

### 2.3 `erpnext_stock_level_query`（PRD #3）

1. **tool 标识与档位**：name `erpnext_stock_level_query`；PRD #3；业务动作「查物料各仓库实际/可用/预留量」；类型「读」；档位「—」。
2. **description**：查询物料在各仓库的实物库存余量（实际量、可用量、预留量）。**消歧**：这是「实物库存余量」查询；查单据/主数据用 `document_search`/`document_get`，查出入库流水用 `stock_ledger_query`。**窄接口边界**：只读；仅读 Bin 库存余量；不写、不调拨。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `item_code` | 字符串 | 可选 | 物料编码；不填返回全部有库存的物料 |
   | `warehouse` | 字符串 | 可选 | 仓库名（Link → 引用允许清单 Warehouse）；不填返回全部仓库 |
   | `page` / `page_size` | 整数 | 可选 | 分页（默认值 + 上限，超出截断） |
   | `detail` | 枚举 | 可选 | `summary`/`detail` |
4. **输出 schema**：按物料 × 仓库返回 actual_qty（实际）、available（可用）、reserved（预留）等余量字段（语义化名称）；分页/截断提示（D01 §2.2）。
5. **annotation**：readOnly=true；destructive=false；idempotent=true；openWorld=false。
6. **前置断言**：无写状态断言；item_code/warehouse 引用不存在按 `precondition_failed` 返回。
7. **幂等边界**：不适用（只读）。
8. **错误转译**：引用不存在（LinkValidationError 417）→ `precondition_failed`；结果集超限 → `result_set_overflow`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：不适用（只读）。

### 2.4 `erpnext_stock_ledger_query`（PRD #4）

1. **tool 标识与档位**：name `erpnext_stock_ledger_query`；PRD #4；业务动作「查库存出入库流水」；类型「读」；档位「—」。
2. **description**：查询库存出入库流水（Stock Ledger），追溯物料的每次入库/出库/调拨/盘点变动及其来源单据。**消歧**：这是「流水」查询；当前余量用 `stock_level_query`；单据/主数据用 `document_search`/`document_get`。**窄接口边界**：只读；仅读 Stock Ledger Entry；不写。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `item_code` | 字符串 | 可选 | 物料编码 |
   | `warehouse` | 字符串 | 可选 | 仓库名 |
   | `from_date` / `to_date` | 日期 | 可选 | 时间区间 |
   | `page` / `page_size` | 整数 | 可选 | 分页（默认值 + 上限） |
   | `detail` | 枚举 | 可选 | `summary`/`detail` |
4. **输出 schema**：流水条目（时间、物料、仓库、变动数量、变动后余量、来源单据语义标识）；**盘点（Stock Reconciliation）的流水以 `qty_after_transaction`=新基线表达、`actual_qty`=0，与收货/调拨的 `actual_qty`=±qty 不同（B04 F7/F6）**，返回时如实呈现、不混淆；分页/截断提示。
5. **annotation**：readOnly=true；destructive=false；idempotent=true；openWorld=false。
6. **前置断言**：无写状态断言；引用不存在按 `precondition_failed`。
7. **幂等边界**：不适用（只读）。
8. **错误转译**：引用不存在 → `precondition_failed`；结果集超限 → `result_set_overflow`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：不适用（只读）。

### 2.5 `erpnext_supplier_search`（PRD #5）

1. **tool 标识与档位**：name `erpnext_supplier_search`；PRD #5；业务动作「检索供应商」；类型「读」；档位「—」。
2. **description**：检索供应商主数据。**消歧（PRD §3.4）**：供应商检索**必须**走本 tool；`erpnext_document_search` 不接受供应商为目标对象（server 侧禁止）。**窄接口边界**：只读；目标仅 Supplier。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `keyword` | 字符串 | 可选 | 供应商名称/编码关键字匹配 |
   | `supplier_group` | 字符串 | 可选 | 供应商分组（Link → Supplier Group） |
   | `page` / `page_size` | 整数 | 可选 | 分页 |
   | `detail` | 枚举 | 可选 | `summary`/`detail` |
4. **输出 schema**：供应商列表（供应商名 + 分组 + 关键可读字段）；分页/截断提示。
5. **annotation**：readOnly=true；destructive=false；idempotent=true；openWorld=false。
6. **前置断言**：无写状态断言；supplier_group 引用不存在按 `precondition_failed`。
7. **幂等边界**：不适用（只读）。
8. **错误转译**：引用不存在（LinkValidationError 417）→ `precondition_failed`；结果集超限 → `result_set_overflow`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：不适用（只读）。

### 2.6 `erpnext_batch_status_get`（PRD #26）

1. **tool 标识与档位**：name `erpnext_batch_status_get`；PRD #26；业务动作「按批次标识查询批次状态、涉及对象及回滚结果」；类型「读」；档位「—」。
2. **description**：查询一次 `tools/call` 对应批次的执行状态、涉及对象（对象类型/标识/动作/前后态/回滚路径）与回滚结果。这是 server 元数据查询 tool（查询 MCP 侧批次台账，非 ERPNext 业务对象）。**消歧**：查业务对象用 `document_search`/`document_get`；本 tool 只查批次台账。**窄接口边界**：只读；不可主动回滚；只返回归属自身可信调用方身份（会话级）的批次；他人批次不可见。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `batch_id` | 字符串 | 可选 | 批次标识；不填返回归属自身会话的批次列表 |
4. **输出 schema**：批次标识、状态、创建时间、涉及对象（objectType/objectName/action/beforeState/afterState/rollbackPath）、回滚结果（rollbackEntries/rollbackReason）、批次依赖（E02 §6 查询语义；语义化返回）。
5. **annotation**：readOnly=true；destructive=false；idempotent=true（只读）；openWorld=false。
6. **前置断言**：无写状态断言。批次不存在 → `batch_not_found`；非归属批次 → `permission_denied`（不泄露他人批次参数/涉及单据/回滚信息，D01 §6.4）。
7. **幂等边界**：不适用（只读）。
8. **错误转译**：
   | 场景 | code | 自纠建议 |
   |---|---|---|
   | 批次不存在 | `batch_not_found` | 核对批次标识或列出归属自身会话的批次 |
   | 非归属批次 | `permission_denied` | 只能查询归属自身可信调用方身份的批次 |
9. **批次行为**：只读可见性边界（D01 §6.4）：归属自身会话的批次可查；他人批次不可见（`permission_denied`）；管理员（后端 Role/DocPerm 判定）可查全量；**不可主动回滚**，无 rollback 入口。

---

## 3. 主数据 tool 契约（#6–#12，B01）

> 主数据通性：档位「人确认」（未经有效 server 侧确认不得写入，规范 §9.7）；destructive=true（动主数据，全系统引用源，PRD §4.1②）；幂等经指纹合并。`modified` 语义：#7/#9/#11 及 #12 修改既有价时 MUST 携带，create（#6/#8/#10）与 #12 新增价时不携带。

### 3.1 `erpnext_customer_create`（PRD #6）

1. **tool 标识与档位**：name `erpnext_customer_create`；PRD #6；业务动作「登记新客户」；类型「写」；档位「人确认」。
2. **description**：登记一个新客户。**消歧（PRD §3.4）**：同名客户不存在时才用本 tool 创建；已存在必须走 `erpnext_customer_update`，本 tool 会报错并指回 update。**窄接口边界**：只写 Customer 的登记字段；不隐式创建或修改 Contact、Address（PRD §2.3）；引用字段目标仅限引用允许清单。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `customer_name` | 字符串 | 必填 | 客户名称（作为语义标识） |
   | `customer_group` | Link | 必填 | 客户分组（引用允许清单 Customer Group，且不得指向分组节点 is_group=1） |
   | `territory` | Link | 可选 | 区域（引用允许清单 Territory） |
   | 其他分类/联系字段 | — | 可选 | 仅限 Customer 的可写登记字段 |
   | `modified` | — | 不适用 | 新建对象无既有版本 |
4. **输出 schema**：创建成功的客户语义标识 + 关键字段；幂等命中返回首次结果 + `idempotent_replay: true`。
5. **annotation**：readOnly=false；destructive=true；idempotent=true；openWorld=false。
6. **前置断言**（业务状态层，schema 校验不计入）：
   - **同名客户不存在**（server 先查 `customer_name` 不存在；不得依赖后端——Customer 后端不拒绝重名、自动改名 `X - 1`，B01 F1）；
   - `customer_group` 有效且为分组（非 is_group=1 的分组节点，B01 §2.1）；
   - `territory` 有效（若提供）。
7. **幂等边界**：进指纹 = 对象类型 + 按稳定顺序归一化的全部业务有效输入（customer_name、customer_group、territory 及其他影响落库终态的允许字段）；不进指纹 = 不影响业务终态的展示性备注。窗口期 **300s**（create 组，B05 §18.3 第 3 条，不得放宽）。误合并策略：窗口期内同参数命中 → 返回首次结果 +「重复请求已按幂等合并」；残余风险经 `batch_status_get` 暴露。合法重复表达：不同 customer_name（进指纹）/ 窗口期外 / 显式改变任一进指纹字段。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 同名客户（后端自动改名，B01 F1） | `precondition_failed`（server 前置断言拦截） | 已存在 → 走 `customer_update` |
   | customer_group/territory 无效（LinkValidationError 417） | `precondition_failed` | 指定存在的客户分组/区域 |
   | 分组指向分组节点（ValidationError 417） | `precondition_failed` | 选择非分组叶子分组 |
   | 参数缺失/格式错误 | `invalid_argument` | 指出缺失/非法参数 |
   | 越权 | `permission_denied` | 转译列出所需写权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次 create 产生的新客户。回滚路径：仅在目标未被其他对象引用且后端允许时删除（B01 §4）；已被引用或删除会破坏完整性时标记「不可自动回滚」转管理员处置。`batch_status_get` 可见。

### 3.2 `erpnext_customer_update`（PRD #7）

1. **tool 标识与档位**：name `erpnext_customer_update`；PRD #7；业务动作「修改既有客户信息」；类型「写」；档位「人确认」。
2. **description**：修改既有客户的可改字段。**消歧**：目标不存在或需新建走 `erpnext_customer_create`；本 tool 只改既有对象。**窄接口边界**：只写本次变更的允许字段；`name`/创建时间/创建人（系统常量）不可改（B01 §5）。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `customer_id` | 字符串 | 必填 | 客户语义标识（客户名） |
   | `modified` | 字符串 | 必填 | 当前版本令牌（乐观并发，B01 F2） |
   | `customer_group` / `territory` 等可改字段 | — | 可选 | 仅本次变更的允许字段；未提供字段不改 |
4. **输出 schema**：更新后的客户语义标识 + 变更后关键字段；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=true；idempotent=true；openWorld=false。
6. **前置断言**：目标存在且启用；预期 `modified` 与当前值一致（版本断言）；名称唯一性、分类字段有效、不可修改字段受限（name/creation/owner 不可改）；版本断言与写入同一后端事务或等价原子方法（B01 §3）。
7. **幂等边界**：进指纹 = 对象标识 + 按稳定顺序归一化的字段名及目标值；不进指纹 = 未变更字段。窗口期 **300s**（指纹合并类，同 create 组；见第 0 章第 4 条与 §7 对齐说明）。误合并策略与合法重复表达同 create 组（字段名/目标值不同即不同指纹）。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 目标不存在（DoesNotExistError 404） | `precondition_failed` | 核对标识或先 `document_get` |
   | 版本陈旧（TimestampMismatchError 417） | `concurrency_conflict` | 重读后重试（重取当前 `modified`） |
   | 名称唯一性/分类无效（LinkValidationError 417） | `precondition_failed` | 指定存在的分组/区域 |
   | 改常量字段（CannotChangeConstantError 417） | `invalid_argument` | 移除不可改字段 |
   | 参数缺失/格式错误 | `invalid_argument` | 指出缺失/非法参数 |
   | 越权 | `permission_denied` | 转译列出所需写权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次 update。回滚路径：写入前保存允许变更字段的前镜像、对象版本与关联状态；回滚仅在当前版本仍与本批写后版本一致时恢复前镜像；发现后续修改不得覆盖，转管理员处置（PRD §5.4）。`batch_status_get` 可见。

### 3.3 `erpnext_supplier_create`（PRD #8）

1. **tool 标识与档位**：name `erpnext_supplier_create`；PRD #8；业务动作「登记新供应商」；类型「写」；档位「人确认」。
2. **description**：登记一个新供应商。**消歧**：同名供应商不存在才 create；已存在走 `erpnext_supplier_update`。**窄接口边界**：只写 Supplier 登记字段；不隐式创建/修改 Contact、Address。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `supplier_name` | 字符串 | 必填 | 供应商名称（语义标识） |
   | `supplier_group` | Link | 必填 | 供应商分组（引用允许清单 Supplier Group） |
   | 其他分类/联系字段 | — | 可选 | 仅限 Supplier 可写登记字段 |
   | `modified` | — | 不适用 | 新建对象无既有版本 |
4. **输出 schema**：供应商语义标识 + 关键字段；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=true；idempotent=true；openWorld=false。
6. **前置断言**：同名供应商不存在（server 先查；后端拒绝重名 `DuplicateEntryError` 409，B01 F1，server 前置断言以给出可自纠报错而非依赖后端）；`supplier_group` 有效。
7. **幂等边界**：进指纹 = 对象类型 + 全部业务有效输入（supplier_name、supplier_group 及影响终态的允许字段）；窗口期 **300s**；误合并/合法重复表达同 #6。
8. **错误转译**：同名供应商（DuplicateEntryError 409）→ `duplicate_name`（create 报错并指向 update）；`supplier_group` 无效（LinkValidationError 417）→ `precondition_failed`；参数缺失 → `invalid_argument`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：同批 = 本次 create。回滚路径：未引用才删除；被引用则「不可自动回滚」转管理员（PRD §5.4）。`batch_status_get` 可见。

### 3.4 `erpnext_supplier_update`（PRD #9）

1. **tool 标识与档位**：name `erpnext_supplier_update`；PRD #9；业务动作「修改既有供应商信息」；类型「写」；档位「人确认」。
2. **description**：修改既有供应商可改字段。**消歧**：目标不存在/新建走 `supplier_create`。**窄接口边界**：只写本次变更允许字段；name/创建时间/创建人不可改。
3. **输入 schema**：`supplier_id`（必填，语义标识）、`modified`（必填）、可改字段（可选，仅本次变更）。
4. **输出 schema**：更新后语义标识 + 关键字段；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=true；idempotent=true；openWorld=false。
6. **前置断言**：目标存在且启用；预期 `modified` 一致；名称唯一性、分类字段有效、不可改字段受限；版本断言与写入同事务（B01 §3）。
7. **幂等边界**：进指纹 = 对象标识 + 字段名及目标值；窗口期 **300s**；误合并/合法重复同 #7。
8. **错误转译**：同 #7（目标不存在→`precondition_failed`；TimestampMismatchError 417→`concurrency_conflict`；LinkValidationError 417→`precondition_failed`；CannotChangeConstantError 417→`invalid_argument`；DuplicateEntryError 409（改名为已有名）→`duplicate_name`；越权→`permission_denied`；后端不可达→`backend_unavailable`）。
9. **批次行为**：同 #7（前镜像 + 版本一致才恢复）。

### 3.5 `erpnext_item_create`（PRD #10）

1. **tool 标识与档位**：name `erpnext_item_create`；PRD #10；业务动作「登记新物料」；类型「写」；档位「人确认」。
2. **description**：登记一个新物料。**消歧**：同名物料编码不存在才 create；已存在走 `erpnext_item_update`。**窄接口边界**：只写 Item 登记字段；不隐式创建/修改物料价格（价格走 `item_price_set`）。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `item_code` | 字符串 | 必填 | 物料编码（语义标识） |
   | `item_name` | 字符串 | 可选 | 物料名称（缺省取 item_code，B01 §2.3） |
   | `item_group` | Link | 必填 | 物料分组（引用允许清单 Item Group） |
   | `stock_uom` | Link | 必填 | 计量单位（引用允许清单 Unit of Measure） |
   | 其他登记字段 | — | 可选 | 仅限 Item 可写登记字段 |
   | `modified` | — | 不适用 | 新建对象无既有版本 |
4. **输出 schema**：物料语义标识 + 关键字段（含自动生成的默认仓库/计量单位）；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=true；idempotent=true；openWorld=false。
6. **前置断言**：同名 `item_code` 不存在（后端拒绝重名 `DuplicateEntryError` 409，B01 F1，server 前置断言）；`item_group` 有效；`stock_uom` 有效。
7. **幂等边界**：进指纹 = 对象类型 + 全部业务有效输入（item_code、item_name、item_group、stock_uom 及影响终态的允许字段）；窗口期 **300s**；误合并/合法重复同 #6。
8. **错误转译**：同名物料（DuplicateEntryError 409）→ `duplicate_name`；item_group/stock_uom 无效（LinkValidationError 417）→ `precondition_failed`；参数缺失 → `invalid_argument`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：同批 = 本次 create。回滚路径：未引用才删除；**Item 被 Item Price 引用时删除不拒绝、级联删除 Item Price（B01 F4）**，故 server 删除/回滚须自行前置引用检查，不依赖后端拒绝；被交易单据引用则「不可自动回滚」转管理员。`batch_status_get` 可见。

### 3.6 `erpnext_item_update`（PRD #11）

1. **tool 标识与档位**：name `erpnext_item_update`；PRD #11；业务动作「修改既有物料信息」；类型「写」；档位「人确认」。
2. **description**：修改既有物料可改字段。**消歧**：目标不存在/新建走 `item_create`。**窄接口边界**：只写本次变更允许字段；name/创建时间/创建人不可改。
3. **输入 schema**：`item_id`（必填，物料编码语义标识）、`modified`（必填）、可改字段（可选，仅本次变更）。
4. **输出 schema**：更新后语义标识 + 关键字段；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=true；idempotent=true；openWorld=false。
6. **前置断言**：目标存在且启用；预期 `modified` 一致；名称唯一性、分类字段有效、不可改字段受限（`docstatus` 不得被 update 改写，B01 F5）；版本断言与写入同事务。
7. **幂等边界**：进指纹 = 对象标识 + 字段名及目标值；窗口期 **300s**；误合并/合法重复同 #7。
8. **错误转译**：目标不存在 → `precondition_failed`；TimestampMismatchError 417 → `concurrency_conflict`；item_group/stock_uom 无效 → `precondition_failed`；DuplicateEntryError 409（改名为已有编码）→ `duplicate_name`；CannotChangeConstantError 417 → `invalid_argument`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：同 #7（前镜像 + 版本一致才恢复）。

### 3.7 `erpnext_item_price_set`（PRD #12）

1. **tool 标识与档位**：name `erpnext_item_price_set`；PRD #12；业务动作「设置物料售价（含生效期）」；类型「写」；档位「人确认」。
2. **description**：为物料在指定价目表设置（新增或修改）售价及其生效区间。**消歧**：这是维护「物料价格主数据」的专用 tool；新建物料走 `item_create`，建销售/采购订单走 `sales_order_create`/`purchase_order_create`（其单价由价格表解析，不在此改价）。**窄接口边界**：只写 Item Price；目标物料必须存在于操作允许清单。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `item_code` | Link | 必填 | 物料编码（操作允许清单 Item） |
   | `price_list` | Link | 必填 | 价目表（引用允许清单 Price List） |
   | `price_list_rate` | 数值 | 必填 | 价格 |
   | `valid_from` / `valid_upto` | 日期 | 可选 | 生效区间 |
   | `selling` / `buying` | 布尔 | 可选 | 销售价/采购价标记 |
   | `modified` | 字符串 | 条件必填 | 修改既有价格时必填（新增价格时不适用，B01 §2.4） |
4. **输出 schema**：价格语义标识（物料 + 价目表 + 生效区间）+ 关键字段；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=true；idempotent=true；openWorld=false。
6. **前置断言**：目标物料存在且启用；修改既有价格时预期 `modified` 一致；**价格生效区间不与既有区间重叠**（后端不校验、不自动调整，B01 F3，须 server 自建校验）；版本与区间校验与写入具备同一事务或等价原子保证。
7. **幂等边界**：进指纹 = 对象标识（item_code + price_list + 生效区间）+ 字段名及目标值（price_list_rate 等）；窗口期 **300s**（指纹合并类）；误合并/合法重复：同物料同价目表不同生效区间即不同指纹（合法重复），区间重叠被前置断言拦截。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 物料无效（LinkValidationError 417） | `precondition_failed` | 指定存在的物料 |
   | 版本陈旧（TimestampMismatchError 417） | `concurrency_conflict` | 重读后重试 |
   | 区间重叠 | `precondition_failed`（server 校验） | 调整生效区间使其与既有区间不重叠 |
   | 参数缺失/格式错误 | `invalid_argument` | 指出缺失/非法参数 |
   | 越权 | `permission_denied` | 转译列出所需写权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次价格新增或修改。回滚路径：区分新增与修改/覆盖——新增价在未产生冲突引用且后端允许时删除；修改/覆盖保存原价格、币种、价目表及生效区间前镜像并按版本恢复（PRD §5.4）。`batch_status_get` 可见。

---

## 4. 销售链路 tool 契约（#13–#15、#21–#22，B02）

### 4.1 `erpnext_sales_order_create`（PRD #13）

1. **tool 标识与档位**：name `erpnext_sales_order_create`；PRD #13；业务动作「创建销售订单草稿」；类型「写」；档位「全自动」。
2. **description**：创建一张销售订单草稿（无业务效果，不生效）。**消歧（PRD §3.4）**：create 只产生草稿、无业务效果；要生效必须走 `erpnext_sales_order_confirm`。**窄接口边界**：只写 Sales Order 草稿及其嵌套行项目；不隐式创建/修改客户、物料或价格主数据；**不接受显式 `rate`**（单价由冻结的销售价格表 Standard Selling 解析——见下注）。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `customer` | Link | 必填 | 客户（操作允许清单 Customer，语义标识客户名） |
   | `items` | 行项目数组 | 必填 | 每行 `item_code`（必填）、`qty`（必填，>0）、`warehouse`（可选，缺省默认仓） |
   | `transaction_date` / `delivery_date` | 日期 | 可选 | 交易/交付日期 |
   | `modified` | — | 不适用 | 新建草稿无既有版本 |
   | 公司/币种/价格表 | — | server 配置 | 锁单 `gjg` / CNY / Standard Selling（PRD 决议 2），不暴露为参数 |
4. **输出 schema**：销售订单草稿语义标识（单据编号）+ 关键字段（客户、行项目、金额、草稿状态）；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=false（可逆草稿，可删）；idempotent=true；openWorld=false。
6. **前置断言**（业务状态层）：客户启用；行内物料存在且启用；单价可解析（价格表或显式传入——本契约按「价格表解析」落地）；`items` 非空（B02 F6 后端空 items 为 TypeError 500 未优雅，server 须前置校验）。
7. **幂等边界**：进指纹 = 实际生效的公司、币种、价格表 + 交易对手 + 要求日期 + 按稳定顺序归一化的行项目（物料、数量、单位、仓库等全部影响终态字段；行项目顺序有业务含义、保持原顺序，E02 §1.1）；不进指纹 = 展示性备注 + 传输/客户端字段。窗口期 **300s**。误合并策略与合法重复表达（业务引用号可选增强：客户采购单号作为可选业务字段进指纹）同 create 组。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | customer/item 无效（DoesNotExistError 404） | `precondition_failed` | 指定存在的客户/物料 |
   | 引用字段无效（LinkValidationError 417） | `precondition_failed` | 指定存在的仓库/价目表 |
   | 数量非法（InvalidQtyError/NonNegativeError 417） | `invalid_argument` | 数量必须 >0 |
   | items 空（TypeError 500，server 前置拦截） | `invalid_argument` | 提供非空行项目 |
   | 参数缺失（MandatoryError 417） | `invalid_argument` | 提供缺失必填参数 |
   | 越权 | `permission_denied` | 转译列出所需写权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次创建的销售订单草稿。回滚路径：草稿 → 删除（B02 §4）。**本契约不接受显式 `rate`，故不产生 Item Price 写副作用（B02 F7）**——这是保持全自动档推导依据「②草稿创建仅引用主数据」成立的口径（D02 task §16）。

### 4.2 `erpnext_sales_order_confirm`（PRD #14）

1. **tool 标识与档位**：name `erpnext_sales_order_confirm`；PRD #14；业务动作「生效销售订单」；类型「写」；档位「人确认」。
2. **description**：将销售订单草稿生效（触发真实业务效果）。**消歧**：create 只产草稿；本 tool 才使单据进入已生效。**窄接口边界**：只做状态流转（草稿→已生效），不新增/修改行项目。
3. **输入 schema**：`sales_order_id`（必填，单据编号语义标识）、`modified`（必填，乐观并发）。
4. **输出 schema**：生效后的单据编号 + 状态；幂等命中（已在目标状态）返回幂等成功。
5. **annotation**：readOnly=false；destructive=true（生效不可逆，流水不可擦除）；idempotent=true（状态断言兜底）；openWorld=false。
6. **前置断言**：目标仍为草稿且 `modified` 符合预期；交易对手、物料、日期、价格及后端要求的关键业务状态仍有效（PRD §5.2）；版本断言与提交同一后端事务（B02 §3）。
7. **幂等边界**：进指纹 = 目标单据编号 + 动作；窗口期 **60s**（confirm/cancel 组）。**状态断言兜底**：confirm 仅接受草稿状态；命中「目标单据已在目标状态」时返回幂等成功（`idempotent_replay: true`、`already_in_target_state: true`），MUST NOT 返回通用前置断言错误（B05 §18.3 第 5 条、D01 §4.3）。无合法重复业务（同一单据不可合法二次 confirm）。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 版本陈旧（TimestampMismatchError 417） | `concurrency_conflict` | 重读后重试 |
   | 非草稿且非已生效（DocstatusTransitionError/ValidationError 417） | `precondition_failed` | 返回当前状态 + 建议动作 |
   | 业务状态失效（ValidationError 417） | `precondition_failed` | 返回当前状态 + 建议动作 |
   | 目标不存在（DoesNotExistError 404） | `precondition_failed` | 核对单据编号 |
   | 越权 | `permission_denied` | 转译列出所需权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次状态流转。回滚路径：已生效 → 后端原生取消（经 `sales_order_cancel`）；无下游时取消后可按草稿删除路径回滚。`batch_status_get` 可见。

### 4.3 `erpnext_sales_order_cancel`（PRD #15）

1. **tool 标识与档位**：name `erpnext_sales_order_cancel`；PRD #15；业务动作「取消已生效销售订单」；类型「写」；档位「人确认」。
2. **description**：取消一张已生效销售订单（作废，冲减预留/库存）。**消歧**：只取消「已生效」单据；草稿应删除而非取消。**窄接口边界**：只做状态流转（已生效→已取消）；不新增行项目。
3. **输入 schema**：`sales_order_id`（必填）、`modified`（必填，经 `frappe.client.save`(docstatus=2+modified) 等价路径施加版本保护，B02 F3）。
4. **输出 schema**：取消后的单据编号 + 状态；幂等命中（已在目标状态）返回幂等成功。
5. **annotation**：readOnly=false；destructive=true（作废已生效单据）；idempotent=true（状态断言兜底）；openWorld=false。
6. **前置断言**：目标仍为已生效且预期 `modified` 符合当前值；执行时重新校验无未取消的下游单据（存在已确认 DN → 拒绝）；状态、版本和下游约束校验与取消处于同一后端事务（PRD §5.2、B02 §2.1）。
7. **幂等边界**：进指纹 = 目标单据编号 + 动作；窗口期 **60s**；**状态断言兜底**：cancel 仅接受已生效状态；命中「已在已取消状态」返回幂等成功，MUST NOT 返回通用错误。无合法重复业务。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 版本陈旧（TimestampMismatchError 417） | `concurrency_conflict` | 重读后重试 |
   | 草稿/已取消（DocstatusTransitionError/ValidationError 417） | `precondition_failed` | 返回当前状态 + 建议动作 |
   | 存在未取消下游 DN（LinkExistsError 417） | `precondition_failed` | 先取消/删除下游发货单 |
   | 越权 | `permission_denied` | 转译列出所需权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次取消。回滚路径：已取消 → 终态不可回滚，台账如实标注（D01 §6.4）；本 tool 本身即「业务取消」入口，无对应反向 tool。

### 4.4 `erpnext_delivery_note_create`（PRD #21）

1. **tool 标识与档位**：name `erpnext_delivery_note_create`；PRD #21；业务动作「按销售订单生成发货草稿」；类型「写」；档位「全自动」。
2. **description**：按已生效销售订单生成销售发货单草稿（无业务效果）。**消歧**：create 只产草稿；发货出库生效走 `erpnext_delivery_note_confirm`。**窄接口边界**：只写 Delivery Note 草稿及嵌套行项目；不隐式创建/修改客户/物料/价格。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `sales_order_id` | Link | 必填 | 来源销售订单（须已生效，语义标识单据编号） |
   | `items` | 行项目数组 | 可选 | 可指定行与数量；缺省取来源单据未完成量（每行 item_code、qty、warehouse） |
   | `posting_date` | 日期 | 可选 | 过账日期 |
   | `modified` | — | 不适用 | 新建草稿无既有版本 |
4. **输出 schema**：发货单草稿语义标识 + 关键字段（来源订单、行项目、草稿状态）；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=false（可逆草稿）；idempotent=true；openWorld=false。
6. **前置断言**：来源销售订单已生效（docstatus=1，B02 §2.2）；行数量不超过来源单据未完成量（草稿创建后端不校验超发、confirm 才触发，B02 F5，server 前置校验给可自纠报错）；`items` 非空（若显式提供）。
7. **幂等边界**：进指纹 = 实际生效的公司、币种 + 来源单据及来源行 + 要求日期 + 行项目（物料、数量、单位、仓库等影响终态字段）；窗口期 **300s**。误合并/合法重复同 create 组。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 来源订单非生效（ValidationError 417） | `precondition_failed` | 先 `sales_order_confirm` |
   | 来源订单不存在（DoesNotExistError 404） | `precondition_failed` | 核对单据编号 |
   | 超发（OverAllowanceError 417，server 前置拦截） | `precondition_failed` | 减量或分批发货 |
   | 参数缺失/格式错误 | `invalid_argument` | 指出缺失/非法参数 |
   | 越权 | `permission_denied` | 转译列出所需权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次创建的发货单草稿。回滚路径：草稿 → 删除（B02 §4）。无 cancel tool（其取消走管理员运维异常回滚，PRD 已决议 #8）。

### 4.5 `erpnext_delivery_note_confirm`（PRD #22）

1. **tool 标识与档位**：name `erpnext_delivery_note_confirm`；PRD #22；业务动作「发货出库生效」；类型「写」；档位「人确认」。
2. **description**：将销售发货单草稿生效（真实发货出库、扣减库存）。**消歧**：create 只产草稿；本 tool 才出库。**窄接口边界**：只做状态流转（草稿→已生效）。
3. **输入 schema**：`delivery_note_id`（必填）、`modified`（必填）。
4. **输出 schema**：生效后的发货单编号 + 状态；幂等命中返回幂等成功。
5. **annotation**：readOnly=false；destructive=true（出库不可逆）；idempotent=true（状态断言兜底）；openWorld=false。
6. **前置断言**：目标仍为草稿且版本符合预期；来源订单仍已生效，来源行与剩余可发数量仍满足本次发货；**可用库存充足**；仓库有效（PRD §5.2）；超发与库存校验由后端在 confirm 强制（B02 F5），server 前置校验给出可自纠报错；版本断言与提交同事务。
7. **幂等边界**：进指纹 = 目标单据编号 + 动作；窗口期 **60s**；状态断言兜底（confirm 仅草稿，命中已在目标状态 → 幂等成功）。无合法重复业务。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 版本陈旧（TimestampMismatchError 417） | `concurrency_conflict` | 重读后重试 |
   | 超发（OverAllowanceError 417） | `precondition_failed` | 返回缺口数量，减量或分批 |
   | 库存不足（NegativeStockError 417） | `precondition_failed` | 返回缺口数量与可用量，减量或换仓 |
   | 来源订单失效 | `precondition_failed` | 返回当前状态 + 建议动作 |
   | 非草稿且非已生效 | `precondition_failed` | 返回当前状态 + 建议动作 |
   | 越权 | `permission_denied` | 转译列出所需权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次出库状态流转（含库存/SLE 变动）。回滚路径：已生效 → 后端原生取消（无对应 cancel tool，走管理员运维异常回滚，PRD 已决议 #8）；不承诺删除已生效发货单。`batch_status_get` 可见。

---

## 5. 采购链路 tool 契约（#16–#20，B03）

### 5.1 `erpnext_purchase_order_create`（PRD #16）

1. **tool 标识与档位**：name `erpnext_purchase_order_create`；PRD #16；业务动作「创建采购订单草稿」；类型「写」；档位「全自动」。
2. **description**：创建一张采购订单草稿（无业务效果）。**消歧**：create 只产草稿；生效走 `erpnext_purchase_order_confirm`。**窄接口边界**：只写 Purchase Order 草稿及嵌套行项目；**不接受显式 `rate`**（单价由 Standard Buying 价格表解析——同 #13 口径，消除 B03 F7 孤儿 Item Price 副作用）。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `supplier` | Link | 必填 | 供应商（语义标识供应商名） |
   | `schedule_date` | 日期 | 必填 | 要求日期（PO 特有必填，B03 F8） |
   | `items` | 行项目数组 | 必填 | 每行 `item_code`、`qty`（>0）、`warehouse`（可选） |
   | `modified` | — | 不适用 | 新建草稿无既有版本 |
   | 公司/币种/价格表 | — | server 配置 | `gjg` / CNY / Standard Buying（PRD 决议 2） |
4. **输出 schema**：采购订单草稿语义标识 + 关键字段；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=false（可逆草稿）；idempotent=true；openWorld=false。
6. **前置断言**：供应商启用；行内物料存在且启用；单价可解析；`items` 非空、数量非负（B03 F6）；`schedule_date` 提供（或 server 默认填充）。
7. **幂等边界**：进指纹 = 实际生效的公司、币种、价格表 + 交易对手 + 要求日期 + 行项目（物料、数量、单位、仓库等影响终态字段）；窗口期 **300s**；误合并/合法重复（业务引用号可选：供应商单号）同 create 组。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | supplier/item 无效（DoesNotExistError 404） | `precondition_failed` | 指定存在的供应商/物料 |
   | 缺 schedule_date（ValidationError 417） | `invalid_argument` | 提供要求日期 |
   | 数量非法（InvalidQtyError/ValidationError 417） | `invalid_argument` | 数量必须 >0 |
   | items 空（TypeError 500，server 前置拦截） | `invalid_argument` | 提供非空行项目 |
   | 越权 | `permission_denied` | 转译列出所需权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次采购订单草稿。回滚路径：草稿 → 删除。**不接受显式 `rate`，无 Item Price 写副作用（B03 F7）**（D02 task §16 口径）。

### 5.2 `erpnext_purchase_order_confirm`（PRD #17）

1. **tool 标识与档位**：name `erpnext_purchase_order_confirm`；PRD #17；业务动作「生效采购订单」；类型「写」；档位「人确认」。
2. **description**：将采购订单草稿生效。**消歧**：create 只产草稿；本 tool 才生效。**窄接口边界**：只做状态流转（草稿→已生效）。
3. **输入 schema**：`purchase_order_id`（必填）、`modified`（必填）。
4. **输出 schema**：生效后单据编号 + 状态；幂等命中返回幂等成功。
5. **annotation**：readOnly=false；destructive=true；idempotent=true（状态断言兜底）；openWorld=false。
6. **前置断言**：目标仍为草稿且 `modified` 符合预期；交易对手、物料、日期、价格及后端要求关键状态仍有效；版本断言与提交同事务（B03 §3）。
7. **幂等边界**：进指纹 = 目标单据编号 + 动作；窗口期 **60s**；状态断言兜底（confirm 仅草稿，命中已在目标状态 → 幂等成功）。无合法重复业务。
8. **错误转译**：版本陈旧 → `concurrency_conflict`；非草稿且非已生效（DocstatusTransitionError/ValidationError）→ `precondition_failed`；业务状态失效 → `precondition_failed`；目标不存在 → `precondition_failed`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：同批 = 本次状态流转。回滚路径：已生效 → 后端原生取消（`purchase_order_cancel`）。`batch_status_get` 可见。

### 5.3 `erpnext_purchase_order_cancel`（PRD #18）

1. **tool 标识与档位**：name `erpnext_purchase_order_cancel`；PRD #18；业务动作「取消已生效采购订单」；类型「写」；档位「人确认」。
2. **description**：取消一张已生效采购订单（作废）。**消歧**：只取消「已生效」；草稿应删除。**窄接口边界**：只做状态流转（已生效→已取消）。
3. **输入 schema**：`purchase_order_id`（必填）、`modified`（必填，经 `frappe.client.save`(docstatus=2+modified) 等价路径，B03 F3）。
4. **输出 schema**：取消后单据编号 + 状态；幂等命中返回幂等成功。
5. **annotation**：readOnly=false；destructive=true；idempotent=true（状态断言兜底）；openWorld=false。
6. **前置断言**：目标仍为已生效且预期 `modified` 一致；无未取消的下游单据（存在已确认 PR → 拒绝，B03 §2.1）；状态、版本、下游约束校验与取消同事务。
7. **幂等边界**：进指纹 = 目标单据编号 + 动作；窗口期 **60s**；状态断言兜底（cancel 仅已生效，命中已在已取消 → 幂等成功）。无合法重复业务。
8. **错误转译**：版本陈旧 → `concurrency_conflict`；草稿/已取消 → `precondition_failed`；存在已确认 PR（LinkExistsError 417）→ `precondition_failed`（先取消/删下游 PR）；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：同批 = 本次取消。回滚路径：已取消 → 终态不可回滚，台账如实标注；本 tool 为「业务取消」入口，无对应反向 tool。

### 5.4 `erpnext_purchase_receipt_create`（PRD #19）

1. **tool 标识与档位**：name `erpnext_purchase_receipt_create`；PRD #19；业务动作「按采购订单生成收货草稿」；类型「写」；档位「全自动」。
2. **description**：按已生效采购订单生成采购收货单草稿（无业务效果）。**消歧**：create 只产草稿；收货入库生效走 `erpnext_purchase_receipt_confirm`。**窄接口边界**：只写 Purchase Receipt 草稿及嵌套行项目。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `purchase_order_id` | Link | 必填 | 来源采购订单（须已生效） |
   | `items` | 行项目数组 | 可选 | 可指定行与数量；缺省取来源未完成量 |
   | `posting_date` | 日期 | 可选 | 过账日期 |
   | `modified` | — | 不适用 | 新建草稿无既有版本 |
4. **输出 schema**：收货单草稿语义标识 + 关键字段；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=false（可逆草稿）；idempotent=true；openWorld=false。
6. **前置断言**：来源采购订单已生效（docstatus=1，B03 §2.2）；行数量不超过来源单据未完成量（草稿创建后端不校验超收、confirm 才触发，B03 F5，server 前置校验）；`items` 非空（若显式提供）。
7. **幂等边界**：进指纹 = 实际生效的公司、币种 + 来源单据及来源行 + 要求日期 + 行项目（物料、数量、单位、仓库等影响终态字段）；窗口期 **300s**；误合并/合法重复同 create 组。
8. **错误转译**：来源订单非生效（ValidationError 417）→ `precondition_failed`；来源不存在 → `precondition_failed`；超收（OverAllowanceError 417，server 前置拦截）→ `precondition_failed`（减量）；参数缺失 → `invalid_argument`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：同批 = 本次收货草稿。回滚路径：草稿 → 删除（B03 §4）。**收货入库生效会产生真实库存增加与 GL Entry，且已取消 PR 因 GL/SLE 持久化不可物理删除（B03 F9）——本契约不承诺删除已生效/已取消收货单，零残留以快照恢复为准**（D02 task §16）。

### 5.5 `erpnext_purchase_receipt_confirm`（PRD #20）

1. **tool 标识与档位**：name `erpnext_purchase_receipt_confirm`；PRD #20；业务动作「收货入库生效」；类型「写」；档位「人确认」。
2. **description**：将采购收货单草稿生效（真实收货入库、增加库存并产生流水/记账）。**消歧**：create 只产草稿；本 tool 才入库。**窄接口边界**：只做状态流转（草稿→已生效）。
3. **输入 schema**：`purchase_receipt_id`（必填）、`modified`（必填）。
4. **输出 schema**：生效后收货单编号 + 状态；幂等命中返回幂等成功。
5. **annotation**：readOnly=false；destructive=true（入库不可逆，产生 GL/SLE）；idempotent=true（状态断言兜底）；openWorld=false。
6. **前置断言**：目标仍为草稿且版本符合预期；来源订单仍已生效，来源行与剩余可收数量仍满足本次收货；仓库有效（PRD §5.2）；超收校验由后端 confirm 强制（OverAllowanceError，B03 F5），server 前置校验给出可自纠报错；版本断言与提交同事务。
7. **幂等边界**：进指纹 = 目标单据编号 + 动作；窗口期 **60s**；状态断言兜底（confirm 仅草稿，命中已在目标状态 → 幂等成功）。无合法重复业务。
8. **错误转译**：版本陈旧 → `concurrency_conflict`；超收（OverAllowanceError 417）→ `precondition_failed`（返回缺口数量）；来源订单失效 → `precondition_failed`；非草稿且非已生效 → `precondition_failed`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：同批 = 本次入库（含 Bin/SLE/GL 变动）。回滚路径：已生效 → 后端原生取消（无对应 cancel tool，走管理员运维异常回滚，PRD 已决议 #8）；**已取消 PR 因 GL 持久化不可物理删除（B03 F9），不承诺删除已生效收货单**。`batch_status_get` 可见。

---

## 6. 库存链路 tool 契约（#23–#25，B04）

### 6.1 `erpnext_stock_transfer_create`（PRD #23）

1. **tool 标识与档位**：name `erpnext_stock_transfer_create`；PRD #23；业务动作「创建仓库间调拨草稿」；类型「写」；档位「全自动」。
2. **description**：创建一张仓库间调拨（Material Transfer）草稿。**消歧（PRD §3.4）**：已知源/目标仓库的移动用本 tool；账实对齐（盘点）用 `erpnext_stock_reconciliation_plan`。**窄接口边界**：只写 Stock Entry（Material Transfer）草稿及嵌套行项目；不隐式创建/修改物料。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `stock_entry_type` | 枚举 | 必填 | 固定 `material_transfer`（server 校验，后端不强制，B04 F9） |
   | `from_warehouse` | Link | 必填 | 源仓库（引用允许清单 Warehouse） |
   | `to_warehouse` | Link | 必填 | 目标仓库（引用允许清单 Warehouse） |
   | `items` | 行项目数组 | 必填 | 每行 `item_code`、`qty`（>0） |
   | `posting_date` | 日期 | 可选 | 过账日期 |
   | `modified` | — | 不适用 | 新建草稿无既有版本 |
4. **输出 schema**：调拨草稿语义标识 + 关键字段（源/目标仓、行项目、草稿状态）；幂等命中返回首次结果。
5. **annotation**：readOnly=false；destructive=false（可逆草稿）；idempotent=true；openWorld=false。
6. **前置断言**：`stock_entry_type` 有效；`items` 非空、数量非负；**源仓各物料可用量 ≥ 调拨量**（后端草稿创建不校验源仓库存不足，B04 F5，server 前置断言，PRD §5.2 #23）；源/目标仓存在。
7. **幂等边界**：进指纹 = 实际生效的公司 + 源仓、目标仓 + 行项目（物料、数量、单位等影响终态字段）+ 过账日期；窗口期 **300s**；误合并/合法重复同 create 组。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | from/to_warehouse 无效（LinkValidationError 417） | `precondition_failed` | 指定存在的仓库 |
   | item_code 无效（ValidationError 417） | `precondition_failed` | 指定存在的库存物料 |
   | 数量非法（InvalidQtyError/ValidationError 417） | `invalid_argument` | 数量必须 >0 |
   | 源仓可用量不足（server 前置拦截） | `precondition_failed` | 返回缺口数量与可用量，减量或换仓 |
   | stock_entry_type 非法（server 前置拦截） | `invalid_argument` | 指定 `material_transfer` |
   | 越权 | `permission_denied` | 转译列出所需权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次调拨草稿。回滚路径：草稿 → 删除（B04 §4）。**调拨无 cancel tool，其取消走管理员运维异常回滚；已生效 STE 因 SLE 持久化不可物理删除（B04 F10），不承诺删除已生效调拨单**。

### 6.2 `erpnext_stock_transfer_confirm`（PRD #24）

1. **tool 标识与档位**：name `erpnext_stock_transfer_confirm`；PRD #24；业务动作「调拨生效」；类型「写」；档位「人确认」。
2. **description**：将调拨草稿生效（真实移动库存：源仓减、目标仓增）。**消歧**：create 只产草稿；本 tool 才移动库存。**窄接口边界**：只做状态流转（草稿→已生效）。
3. **输入 schema**：`stock_entry_id`（必填）、`modified`（必填）。**实现口径约束（B04 F3）**：须经 `frappe.client.submit`（全量 doc）生效，不得走资源端点 `run_method:submit`（403 PermissionError 非 whitelisted）。
4. **输出 schema**：生效后调拨单编号 + 状态；幂等命中返回幂等成功。
5. **annotation**：readOnly=false；destructive=true（库存移动不可逆）；idempotent=true（状态断言兜底）；openWorld=false。
6. **前置断言**：目标仍为草稿且版本符合预期；**源/目标仓仍有效且不同**（后端不强制同仓校验，B04 F5，server 前置断言）；**源仓可用库存仍满足调拨数量**（后端 confirm 才校验 NegativeStockError，B04 F5，server 前置断言）；版本断言与提交同事务（B04 §3）。
7. **幂等边界**：进指纹 = 目标单据编号 + 动作；窗口期 **60s**；状态断言兜底（confirm 仅草稿，命中已在目标状态 → 幂等成功）。无合法重复业务。
8. **错误转译**：
   | 后端原生/场景 | code | 自纠建议 |
   |---|---|---|
   | 版本陈旧（TimestampMismatchError 417） | `concurrency_conflict` | 重读后重试 |
   | 库存不足（NegativeStockError 417） | `precondition_failed` | 返回缺口数量与可用量，减量或换仓 |
   | 源/目标同仓（server 前置拦截） | `precondition_failed` | 指定不同源/目标仓 |
   | 非草稿且非已生效（DocstatusTransitionError/ValidationError） | `precondition_failed` | 返回当前状态 + 建议动作 |
   | 越权 | `permission_denied` | 转译列出所需权限 |
   | 后端不可达 | `backend_unavailable` | 报「后端不可达」，写不自动重试 |
9. **批次行为**：同批 = 本次调拨（源减目增，SLE/Bin 变动，不写 GL，B04 F6）。回滚路径：已生效 → 后端原生取消（无 cancel tool，走管理员运维异常回滚，PRD 已决议 #8）；已取消 STE 因 SLE 持久化不可物理删除（B04 F10）。`batch_status_get` 可见。

### 6.3 `erpnext_stock_reconciliation_plan`（PRD #25）

1. **tool 标识与档位**：name `erpnext_stock_reconciliation_plan`；PRD #25；业务动作「生成盘点调整方案（不改数据）」；类型「读+方案」；档位「只出 plan」。
2. **description**：读取仓库当前库存现状，产出库存盘点调整方案（拟调整的物料、仓库、数量、估值率与执行顺序、风险提示），**不写任何数据**。**消歧（PRD §3.4）**：账实对齐（盘点）用本 tool；已知源/目标仓库的确定性移动用 `erpnext_stock_transfer_create`。**窄接口边界**：只读现状（Bin/SLE 或 `get_items` as-of-time，B04 F11）；不提交、不改数据、不产生盘点单据。
3. **输入 schema**：
   | 参数 | 类型 | 必填 | 说明 |
   |---|---|---|---|
   | `warehouse` | Link | 必填 | 盘点仓库 |
   | `item_code` | 字符串 | 可选 | 限定物料（缺省返回仓库内全部物料现状） |
   | `posting_date` / `posting_time` | 日期/时间 | 可选 | as-of-time 读取时点 |
4. **输出 schema**：客观 plan（PRD §1.3 客观断言口径）：拟执行动作、目标业务对象（物料/仓库）、关键字段与数量（current_qty/valuation_rate/建议 qty）、执行顺序、前置条件、确认/风险提示（含新物料无估值率的 `valuation_rate` 提示、纯净实例首笔 opening-entry 账户要求，B04 F7/F8）。只读现状 + 方案，无写入。
5. **annotation**：readOnly=true（不写入）；destructive=false；idempotent=true（只读）；openWorld=false。
6. **前置断言**：无写状态断言。`warehouse` 有效；物料存在。
7. **幂等边界**：不适用（不写入，只读+方案）。
8. **错误转译**：warehouse 无效（LinkValidationError 417）→ `precondition_failed`；物料无效 → `precondition_failed`；越权 → `permission_denied`；后端不可达 → `backend_unavailable`。
9. **批次行为**：不适用（不写入、无批次、无回滚）。**「正确库存」为系统外事实，本 tool 只出 plan、不提交**（PRD §4.1 盘点组③ 不满足客观判定 → 只出 plan）；盘点实际提交（若后续 F04 需）须提供估值率且按 opening-entry 门槛处理，属 F 包实现范围，非本契约写入。

---

## 7. 对齐点核对（D01 / B05 / E02）

D02 task §2/§5/§16 要求：以 D01 公共契约 + B05 §18.3 为权威口径，参照 E02 `implementation-contract.md` 核对「契约口径是否可实现」。核对结论如下（可复核，无漂移、无静默调整）：

1. **幂等窗口期**：本契约 create 组（含主数据 create #6/#8/#10、草稿 create #13/#16/#19/#21/#23、主数据 update/价格 #7/#9/#11/#12）一律 300s；confirm/cancel 组（#14/#15/#17/#18/#20/#22/#24）一律 60s——与 B05 §18.3 第 3 条、E02 §1.2 一致，未放宽。
   > **update/价格窗口期归属说明（D02 确定口径）**：PRD §5.1 将「主数据 update/价格（#7/#9/#11/#12）」单列为一行（进指纹=对象标识+字段名及目标值），B05 §6 冻结值仅枚举「create 组」与「confirm/cancel 组」、未单列 update/价格。D02 按 B05 §4 分叉决策的机制二分（指纹合并类 vs 状态断言类）将 update/价格归入**指纹合并类（同 create 组，300s）**——其无状态断言、与 create 同为「server 依业务参数指纹合并」机制，故窗口期取 create 组值；此归属不改变任何冻结边界（300s 不构成放宽），具体由 F 包实施时逐 tool 核对，若有异议走变更控制（总则 §12）。
2. **指纹规则**：本契约逐 tool 进指纹参数忠实 PRD §5.1；传输/客户端字段（`id`/`progressToken`/`claudecode/toolUseId` 等）一律不进指纹、不暴露幂等键——与 B05 §18.3 第 2/4 条、E02 §1.1 一致。
3. **confirm/cancel 状态断言 = 幂等成功**：本契约 confirm 仅草稿、cancel 仅已生效，命中返回 `idempotent_replay: true` + `already_in_target_state: true` 幂等成功，非通用错误——与 B05 §18.3 第 5 条、D01 §4.3、E02 §2 一致（E02 §2 第 3 条已声明具体返回结构由 D02 冻结，本契约 §4.2/§4.3/§5.2/§5.3/§5.5/§6.2 已逐 tool 冻结）。
4. **乐观版本断言**：写 tool（update/价格修改/confirm/cancel）必带 `modified`；create 新对象不携带（见第 0 章第 4 条）——与 D01 §6.3、B01–B04 F2 一致，未放宽「乐观并发」硬口径。
5. **cancel 版本保护**：#15/#18 经 `frappe.client.save`(docstatus=2+modified) 等价路径施加——与 B02 F3/B03 F3 已封存事实一致；#24 confirm 经 `frappe.client.submit` 全量 doc——与 B04 F3 一致；E02 前置/事后/幂等框架（`assertPreconditions`/`checkReadBack`/`fingerprintOf`/`checkStateAssertion`）均可挂接本契约逐 tool 断言，无不可实现项。
6. **批次台账与 #26**：本契约批次粒度/回滚路径/`batch_status_get` 可见性边界与 D01 §6.4、E02 §5/§6 一致；「已取消不可物理删除」的 PR/STE/SR 如实声明「不承诺删除」，与 B03 F9/B04 F10 一致。
7. **显式 rate 副作用（D02 task §16）**：本契约 #13/#16 不接受显式 `rate`（单价由冻结价格表解析），从契约层消除 B02 F7/B03 F7 的孤儿 Item Price 写副作用，保持全自动档「②仅引用主数据」前提成立；若业务确需自定义单价，先经 #12 `item_price_set`（人确认）维护价格表。
8. **E02 对齐点兜底**：E02 已封存（实现契约冻结），本契约逐 tool 核对其机制（§7.1–§7.7 引用）可对齐，无「契约口径不可实现」的漂移；无需走变更控制。

---

## 附：权威输入 → 契约条款对照（可复核索引）

| 权威输入 | 条款/事实 | 本契约落点 |
|---|---|---|
| PRD §3.3 | 26 个 tool 清单、name、业务动作、类型 | §1 总表 |
| PRD §4.1 | 档位归属（全自动/人确认/只出 plan） | §1 总表、各块第 1 项 |
| PRD §3.4 | 相近 tool 消歧 | 各块第 2 项 |
| PRD §5.1 | 幂等指纹参数范围、窗口期、状态断言兜底 | 各块第 7 项、§7 |
| PRD §5.2 | 前置断言业务状态 | 各块第 6 项 |
| PRD §5.3/§5.4 | 事后校验、批次粒度、回滚路径、#26 可见性 | 各块第 9 项 |
| PRD §2.3/§5.6 | 两张允许清单、子表嵌套、Link 目标受限 | §1 总约束、各块第 2/3 项 |
| D01 §1–§7 | 命名/schema/annotation/错误模型/幂等/断言/批次/窄接口公共口径 | 第 0 章、各块逐项 |
| B01 F1–F4 | 重名、`modified` 可选令牌、区间重叠、删除级联 | §3（#6–#12） |
| B02 F1–F7 | series 编号、confirm/cancel 版本、cancel 端点、前态、超发/库存、空 items、rate 副作用 | §4（#13–#15、#21–#22） |
| B03 F1–F9 | 同上（采购）、schedule_date、超收、GL 持久化、cancel 冲回≠删除 | §5（#16–#20） |
| B04 F1–F11 | submit 端点、同仓校验、覆盖基线、估值率、只出 plan、SLE 持久化 | §6（#23–#25） |
| B05 §18.3 / idempotency-research §4/§6/§7/§8 | 无透明重试、无可信信号、窗口期 300s/60s、指纹不可覆盖、两类验收方法 | 各块第 7 项、§7 |
| E02 §1–§7 | 机制接口可挂接、窗口期/指纹/状态断言/批次查询语义 | §7 |
