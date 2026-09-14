# B01 主数据接口事实记录（Interface Facts）

> 冻结输出：B01 v1.0（已冻结，2026-09-14）。本记录是 D01/D02 业务 tool 契约（#6–#12 主数据 tool）的权威输入，逐对象逐项实测，非推测。
> 实测环境：`erpnext.local`（ERPNext 15.121.2 / Frappe 15.120.1），Token 认证 `Administrator`，2026-09-14 实施完成。
> 认证与凭据值不入本记录；原始脱敏证据见 `docs/task-packages/B01/evidence/`，敏感原始输出受控于 `D:\second-acceptance\evidence\`（Evidence Manifest 登记）。

## 0. 结论速览（对 D01/D02 的权威输入）

| # | 事实 | 结论 | 对 MCP server 的直接影响 |
|---|---|---|---|
| F1 | 名称唯一性 | **Customer 不拒绝重名（自动改名 `X - 1`）；Supplier/Item 拒绝（`DuplicateEntryError` 409）** | server 必须统一实现「同名对象不存在」前置断言，不得依赖后端 |
| F2 | 乐观版本断言 | `modified` 字段是**可选**并发令牌：提供则校验（陈旧→`TimestampMismatchError` 417），省略则**不校验** | server 写 tool 必须始终携带当前 `modified`，否则无并发保护 |
| F3 | Item Price 生效区间 | **区间重叠不被拒绝、不自动调整** | server 必须自行实现 `valid_from`/`valid_upto` 区间不重叠校验 |
| F4 | 删除行为 | 未引用删除 202；**Item 被 Item Price 引用时删除不拒绝，级联删除 Item Price** | server 删除/回滚不得依赖后端「拒绝引用删除」；须自行前置检查引用 |
| F5 | docstatus | 普通 update **可改写 docstatus**（绕过状态机）；主数据恒 docstatus=0，无业务风险 | 交易单据（B02–B04）须注意；主数据可忽略 |

## 1. 通用接口与认证

- Base URL `http://localhost:8080`；认证 `Authorization: token <api_key>:<api_secret>`（Cookie 登录亦可，见 erp/README.md）。
- 通用 CRUD 路由（Frappe `v1.py`）：`GET/POST /api/resource/{doctype}`、`GET/PUT/DELETE /api/resource/{doctype}/{name}`。
- 成功创建/读取返回 `{"data":{...}}`；删除返回 `{"data":"ok"}`（HTTP 202）；失败返回 `{"exception","exc_type","exc","_server_messages"}`，HTTP 状态码按异常类型区分（见 §6）。

## 2. 逐对象接口事实

### 2.1 Customer

| 项 | 实测结果 |
|---|---|
| 创建 | `POST /api/resource/Customer`，HTTP 200；`name` 取自 `customer_name`（未走 naming_series） |
| 名称唯一性 | **不拒绝**：同名 `customer_name` 再创建 → HTTP 200，`name` 自动改为 `B01-PROBE-CUST-001 - 1`（服务端提示「Changed customer name to ... already exists」），`customer_name` 保持重复 |
| customer_group 校验 | 无效值 → `LinkValidationError: Could not find Customer Group: X`（HTTP 417）；指向分组 `is_group=1` → `ValidationError: Cannot select a Group type Customer Group`（HTTP 417） |
| territory 校验 | 无效值 → `LinkValidationError: Could not find Territory: X`（HTTP 417） |
| 版本断言 | `modified` 陈旧 → `TimestampMismatchError`（HTTP 417）；匹配 → 200；省略 → 200 不校验 |
| 不可修改字段 | `creation`→`CannotChangeConstantError`（Created On）；`owner`→`CannotChangeConstantError`（Created By）；`name` 改写导致重解析失败（404） |
| 删除 | 未引用 → HTTP 202 `{"data":"ok"}`；被引用场景 B01 范围内无上游单据（交易单据归 B02），见 §4 |

### 2.2 Supplier

| 项 | 实测结果 |
|---|---|
| 创建 | `POST /api/resource/Supplier`，HTTP 200；`name` 取自 `supplier_name` |
| 名称唯一性 | **拒绝**：同名再创建 → `DuplicateEntryError: ('Supplier','B01-PROBE-SUP-001', IntegrityError 1062 Duplicate entry ... PRIMARY)`（HTTP 409） |
| supplier_group 校验 | 无效值 → `LinkValidationError: Could not find Supplier Group: X`（HTTP 417） |
| 版本断言 | `modified` 陈旧 → `TimestampMismatchError`（HTTP 417）；匹配/省略 → 200（实测） |
| 不可修改字段 | `creation`→`CannotChangeConstantError`（Created On，417）；`owner`→`CannotChangeConstantError`（Created By，417）；`name` 改写→`DoesNotExistError`（404，重解析失败）（均实测） |
| 删除 | 未引用 → HTTP 202 |

### 2.3 Item

| 项 | 实测结果 |
|---|---|
| 创建 | `POST /api/resource/Item`，HTTP 200；`name`=`item_code`，`item_name` 自动取 `item_code`；自动生成 `item_defaults`（company=`gjg`、default_warehouse=`Stores - G`）与 `uoms` |
| 名称唯一性 | **拒绝**：同名 `item_code` 再创建 → `DuplicateEntryError`（HTTP 409，IntegrityError 1062） |
| item_group 校验 | 无效值 → `LinkValidationError: Could not find Item Group: X`（HTTP 417） |
| stock_uom 校验 | 无效值 → `LinkValidationError: Could not find Default Unit of Measure: X`（HTTP 417） |
| 版本断言 | `modified` 陈旧 → `TimestampMismatchError`（417）；匹配/省略 → 200 |
| 不可修改字段 | `creation`/`owner` 常量（CannotChangeConstantError）；`name` 不可改；**`docstatus` 可被普通 update 改写**（PUT `{"docstatus":1}` → HTTP 200，实际值变 1，未走提交流） |
| 删除 | 未引用 → 202；**被 Item Price 引用 → 202 且级联删除全部 Item Price**（见 §4） |

### 2.4 Item Price

| 项 | 实测结果 |
|---|---|
| 创建 | `POST /api/resource/Item Price`，HTTP 200；`name` 为自动哈希（非 `item_code`），无「同名」概念；必填 `item_code`/`price_list`/`price_list_rate`；`selling`/`currency`（=CNY）可设 |
| 生效区间重叠 | **不拒绝、不自动调整**：同 `item_code`+`price_list` 下创建 `valid_from` 落在既有区间内的新价 → HTTP 200，两条并存，旧价 `valid_upto` 不变 |
| 版本断言 | `modified` 陈旧 → `TimestampMismatchError`（417） |
| 物料有效性 | `item_code` 无效 → `LinkValidationError`（417，Frappe Link 校验） |

## 3. 原子性结论（PRD §5.5）

- 主数据 create/update/Item Price set 均为**单次 REST 请求 → Frappe 单次 `insert()`/`save()`**，落在同一后端事务内，无 MCP 层「先查后写」的跨请求窗口。
- 乐观版本断言（`check_if_latest`）在 `_save()` 内执行，与写入同一事务：`modified` 不匹配时**写入不发生**（`TimestampMismatchError`，无部分写入）。
- Item Price 的区间校验后端**不存在**，故「区间校验与写入同事务」由 MCP server 自建（F3）。
- 写入失败均正确报告，**无静默成功**（见 §6）。

## 4. 回滚与删除条件（PRD §5.4）

- 未引用主数据对象：`DELETE /api/resource/{doctype}/{name}` → HTTP 202，物理删除（GET 后 404）。
- **Item 被 Item Price 引用时：删除不拒绝，级联删除 Item Price**（实测 Item 下有 2 条 Item Price，删 Item 后三者全 404）。即后端对「引用删除」走级联而非拒绝。
- Customer/Supplier 的引用删除：引用源为交易单据（Sales/Purchase Order，B02/B03 范围），B01 范围内无上游单据可造引用，未实测；但 Item→Item Price 已证后端删除不主动拒绝引用（F4），MCP server 删除/回滚须自行前置引用检查。
- 清理路径：合成对象经 REST DELETE 物理删除 + 逐类清查（`name`/`item_code` LIKE `B01-PROBE-%`）确认零残留；快照恢复为备用路径（B00 已建立，W01 复核可用）。

## 5. 不可修改字段汇总（update 语义）

| 字段 | 行为 | 证据 |
|---|---|---|
| `name` | 不可改（改写导致重解析/404） | PUT `{"name":...}` → DoesNotExistError |
| `creation`（Created On） | 常量，`CannotChangeConstantError`（417） | PUT `{"creation":...}` |
| `owner`（Created By） | 常量，`CannotChangeConstantError`（417） | PUT `{"owner":...}` |
| `modified` | 版本令牌：提供则校验，省略则跳过 | 陈旧→TimestampMismatchError |
| `docstatus` | **可被 update 改写**（主数据无业务影响） | PUT `{"docstatus":1}` → 200 |

## 6. 错误类型与 HTTP 状态码（失败不静默）

| 异常 | HTTP | 场景 |
|---|---|---|
| `LinkValidationError` | 417 | 引用字段指向不存在对象（customer_group/territory/supplier_group/item_group/stock_uom） |
| `ValidationError` | 417 | 业务校验（如 Customer Group 选到分组） |
| `TimestampMismatchError` | 417 | 乐观版本断言失败（`modified` 不匹配） |
| `DuplicateEntryError` | 409 | Supplier/Item 同名创建（唯一主键冲突） |
| `CannotChangeConstantError` | 417 | 改常量字段（creation/owner） |
| `DoesNotExistError` | 404 | 目标不存在（读/改/删不存在对象） |

所有失败路径均返回结构化 `exception`/`exc_type` + 服务端消息，不出现静默成功。

## 7. 对 D01/D02 契约冻结的输入要点

1. `erpnext_customer_create` 不能依赖后端拒绝重名——须 server 侧先查「同名 customer_name 不存在」（F1）。
2. `customer_update`/`supplier_update`/`item_update`/`item_price_set` 的前置断言必须携带 `modified` 做乐观并发，后端仅在提供 `modified` 时才校验（F2）。
3. `item_price_set` 的「区间不重叠」必须由 server 实现（F3）。
4. 删除/回滚前置检查不能依赖后端拒绝引用（F4）。
5. 以上结论写入 PRD 或成为 D01/D02 权威输入时走变更控制；本记录本身不改 PRD 冻结语义。
