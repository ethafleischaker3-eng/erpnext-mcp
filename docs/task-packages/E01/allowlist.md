# E01 两张允许清单落地说明（allowlist）

> 文档性质：E01 交付物 D03，操作允许清单（12 类）与引用允许清单（9 类）的 server 侧强制落地说明。成员忠实 PRD §2.3 / C01a `object-scope.md`；「server 侧强制拦截」的口径按 D01 §7 / PRD §2.3 落地。
> 版本：v1.1（v1.0 实施产出；CHG-20260917-E01-001 补 Account/Cost Center 只读 DocPerm，21→23）。实现主体：Claude（E01 独立实施上下文）；未读取 C01b 冻结任务集正文/断言。

---

## 1. 两张清单成员（忠实 PRD §2.3，不增不减）

### 1.1 操作允许清单（12 类）

| # | 业务对象 | ERPNext DocType | 声明能力（PRD §2.1） | 访问方式 |
|---|---|---|---|---|
| 1 | 客户 | Customer | 读写 | 经 #6/#7 写、#1/#2 读 |
| 2 | 供应商 | Supplier | 读写 | 经 #8/#9 写、#5 读 |
| 3 | 物料 | Item | 读写 | 经 #10/#11 写、#1/#2 读 |
| 4 | 物料价格 | Item Price | 读写 | 经 #12 写、#1/#2 读 |
| 5 | 销售订单 | Sales Order | 读写 | 经 #13/#14/#15 写、#1/#2 读 |
| 6 | 采购订单 | Purchase Order | 读写 | 经 #16/#17/#18 写、#1/#2 读 |
| 7 | 采购收货单 | Purchase Receipt | 读写 | 经 #19/#20 写、#1/#2 读 |
| 8 | 销售发货单 | Delivery Note | 读写 | 经 #21/#22 写、#1/#2 读 |
| 9 | 库存调拨 | Stock Entry | 读写 | 经 #23/#24 写、#1/#2 读 |
| 10 | 库存盘点 | Stock Reconciliation | 只出方案 | 经 #1/#2 读、#25 只出 plan（不写） |
| 11 | 库存余量 | Bin | 只读 | 经 #3 读、#25 读现状 |
| 12 | 库存流水 | Stock Ledger Entry | 只读 | 经 #4 读、#25 读现状 |

### 1.2 引用允许清单（9 类，只读，仅引用）

| # | 业务对象 | ERPNext DocType | 访问方式 |
|---|---|---|---|
| 1 | 公司 | Company | 只读引用（server 配置锁单 gjg） |
| 2 | 仓库 | Warehouse | 只读引用（Link 字段目标） |
| 3 | 价目表 | Price List | 只读引用（server 配置 Standard Selling/Standard Buying） |
| 4 | 币种 | Currency | 只读引用（server 配置 CNY） |
| 5 | 客户分组 | Customer Group | 只读引用 |
| 6 | 供应商分组 | Supplier Group | 只读引用 |
| 7 | 销售区域 | Territory | 只读引用 |
| 8 | 物料分组 | Item Group | 只读引用 |
| 9 | 计量单位 | UOM | 只读引用（DocType 实名为 `UOM`） |

---

## 2. 清单边界规则（不变量）

1. **操作允许清单外对象 MUST NOT 读或写**：用户/角色/设置、财务（销售发票/收付款/凭证/总账）、制造（BOM/工单/生产计划）、CRM、HR、项目、资产、网站内容、Contact、Address 等，不得作为任何 tool 的目标对象、对象类型字段、可写字段或 Link 字段目标类型，也不得被 tool 隐式创建/修改/删除。
2. **引用允许清单只可引用、不可经 MCP 增删改**：9 类引用对象只作为业务 tool 的参数引用（前置断言校验、单据 Link 字段），由 server 配置或后端预置；不允许经 MCP 直接 create/update/delete/confirm/cancel。
3. **子表仅作父单据嵌套**：Sales Order Item、Purchase Order Item、Purchase Receipt Item、Delivery Note Item、Stock Entry Detail、Stock Reconciliation Item 等仅作父单据嵌套行项目读写，不视为独立操作对象，不得作 `target_object` 独立查询或修改。
4. **禁止任意字段名/DocType**：server 不得接受任意字段名或任意 DocType；可写字段与 Link 字段允许目标已由 D02 逐 tool 冻结。
5. 两张清单变更均走 PRD 变更流程并重新验收（PRD §2.3）；本落地说明不反向放宽。

---

## 3. server 侧强制拦截点（三层）

清单在 **server 侧强制执行**，三层拦截互不依赖、缺一即 fail-closed：

### 3.1 第一层：后端 DocPerm（最小权限，主防线）

- 正式角色 `MCP Business Caller` 仅对 23 个 DocType 授予最小 DocPerm：§1 两张清单 21 个（操作 12 + 引用 9）+ 框架级只读依赖 2 个（Account、Cost Center）（见 `permission-matrix.md` §3、`roles.md`）。Account / Cost Center 仅授 `read` + `select`，供销售/采购交易单据行项目 `income_account`/`expense_account`/`cost_center` Link 解析（Frappe `db.get_value` 解析账号走 `select`）；不升为两张允许清单成员、不可经 MCP 增删改、不可作 tool 目标对象（CHG-20260917-E01-001）。
- 清单外对象（除 Account/Cost Center 框架级只读依赖外）在后端**无任何 DocPerm**，任何读写由后端原生 `PermissionError`(403) 拒绝。
- 引用对象仅授予 `read`，后端原生拒绝 create/update/delete（越权验证见 `authorization-verification.md`）。
- 只读对象（Bin、Stock Ledger Entry）仅 `read`；Stock Reconciliation 仅 `read`（无写 tool）。

### 3.2 第二层：MCP tool 目标对象白名单（对象类型枚举硬约束）

- 每个 tool 的 `object_type` / 目标对象为**硬编码枚举**（如 `document_search` 仅九类，排除 supplier/bin/sle），不接受任意 DocType 字符串。
- 每个 tool 的 Link 字段目标类型为硬编码枚举，仅限 §1.2 引用清单。
- 可写字段为逐 tool 冻结的白名单（D02 各块输入 schema），不接受任意字段名。

### 3.3 第三层：对象能力与动作档位一致性校验

- server 在解析 tool 调用后、执行后端写前，校验「目标对象 × 动作」落在其声明能力内（9 读写 / 2 只读 / 1 只出方案），越能力即返回 `permission_denied` 或 `invalid_argument`。
- 引用对象出现在任何非引用位置（create/update/delete/confirm/cancel 目标）即拒绝。

---

## 4. 清单外/越界转译口径

越权一律由后端原生权限拒绝，tool 转译为 D01 §4.2 `permission_denied` 可自纠报错，不透出堆栈：

| 后端原生/场景 | code | 自纠建议 |
|---|---|---|
| 清单外对象读写（PermissionError 403） | `permission_denied` | 转译列出所需对象读/写权限，指明对象不在允许清单 |
| 引用清单对象增删改（PermissionError 403 / 无 create/write 权限） | `permission_denied` | 指明引用对象只可引用、不可增删改 |
| 只读对象写（无 write 权限） | `permission_denied` | 指明该对象只读、无写 tool |
| 未知 DocType / 未知字段名 | `invalid_argument` | 指出合法对象类型/字段范围 |

---

## 5. 落地位置与证据

- 文档落地（脱敏）：本文件；角色 DocPerm 定义见 `roles.md`；越权实测见 `authorization-verification.md`。
- 原始证据（脱敏前原始输出）落 `D:\second-acceptance\evidence\`，脱敏后引用登记入 `evidence-manifest.md`。
