# F04 交付物 D03：逐 tool 可写字段白名单清单

> 文档性质：F04 交付物 D03（脱敏）。工作项 W05；原始证据（只读 DocType meta 查询）受控于验收区，此处为确定性清单。
> 实现主体：Claude（F04 独立实施上下文）；Owner：gjg；日期：2026-09-17。未读取 C01b 冻结任务集正文/断言。
> 权威依据：B01/B04 interface-facts（已封存）+ D02 §3/§6 逐 tool 冻结口径 + D01 §7 窄接口边界 + E01 permission-matrix §1.2 / allowlist §3 三层拦截第二层。
> 确定性来源：主数据 7 tool 目标对象 Customer/Supplier/Item/Item Price 的可写登记/可改字段、调拨 Stock Entry 的可写字段，均自 B01 §2（Customer/Supplier/Item/Item Price 逐对象字段校验）、B04 §2.1（Stock Entry 必填/引用/行项目字段）确定性取得；**未以推测代替结论**，未从上未冻结来源新增字段。

## 1. 白名单总原则

1. **目标对象硬编码**（不允许任意 DocType 字符串）：#6/#7→Customer、#8/#9→Supplier、#10/#11→Item、#12→Item Price、#23/#24→Stock Entry、#25 只读 Bin/SLE。
2. **Link 字段目标硬编码**（仅引用允许清单）：Customer Group/Supplier Group/Territory/Item Group/UOM/Item/Price List/Warehouse。
3. **不可改字段统一禁止**（不接受其作为任何写 tool 的可写字段）：`name`/`creation`/`owner`/`docstatus`（B01 F5：docstatus 可被普通 update 改写，故白名单阻断其作为 update 可写字段）。
4. **create 不携带 modified**（新建对象无既有版本）；**update/价格修改/confirm 必带 modified**（B01/B04 F2 乐观并发令牌）。

## 2. 逐 tool 可写字段清单

| tool | 目标对象 | 可写字段（登记/变更） | Link 字段目标 |
|---|---|---|---|
| #6 `customer_create` | Customer | `customer_name`{必填}、`customer_group`{必填}、`territory`、`customer_type`、`disabled` | Customer Group、Territory |
| #7 `customer_update` | Customer | `customer_group`、`territory`、`customer_type`、`disabled`（name/creation/owner/docstatus 不可改，customer_name 不改名） | Customer Group、Territory |
| #8 `supplier_create` | Supplier | `supplier_name`{必填}、`supplier_group`{必填}、`supplier_type`、`disabled` | Supplier Group |
| #9 `supplier_update` | Supplier | `supplier_group`、`supplier_type`、`disabled` | Supplier Group |
| #10 `item_create` | Item | `item_code`{必填}、`item_name`、`item_group`{必填}、`stock_uom`{必填}、`is_stock_item`、`disabled` | Item Group、UOM |
| #11 `item_update` | Item | `item_name`、`item_group`、`stock_uom`、`is_stock_item`、`disabled` | Item Group、UOM |
| #12 `item_price_set` | Item Price | `item_code`{必填}、`price_list`{必填}、`price_list_rate`{必填}、`valid_from`、`valid_upto`、`selling`、`buying`、`currency`、`modified`{条件必填：修改既有价} | Item（item_code）、Price List |
| #23 `stock_transfer_create` | Stock Entry | `stock_entry_type`{固定 material_transfer}、`from_warehouse`{必填}、`to_warehouse`{必填}、`items[]`{必填，行 item_code/qty>0}、`posting_date` | Warehouse（from/to）、Item（items.item_code） |
| #24 `stock_transfer_confirm` | Stock Entry | `stock_entry_id`{必填}、`modified`{必填}（仅状态流转，无新增可写字段） | — |
| #25 `stock_reconciliation_plan` | Bin/SLE（只读） | 无写入（只出 plan）；`warehouse`{必填}、`item_code`、`posting_date`、`posting_time` 均为读取入参（非可写字段） | Warehouse |

## 3. 不可改字段边界（B01 §5）

| 字段 | 行为 | 处理 |
|---|---|---|
| `name` | 改写导致重解析/404 | 白名单不接受 |
| `creation` | CannotChangeConstantError 417 | 白名单不接受 |
| `owner` | CannotChangeConstantError 417 | 白名单不接受 |
| `docstatus` | 可被 update 改写（B01 F5） | 白名单不接受（update 阻断） |
| `modified` | 版本令牌（provide 则校验，omit 不校验） | create 不带、update/confirm 必带 |

## 4. 与 D02 §3/§6 逐 tool 口径核对

- 逐 tool 必填/可选字段与 D02 §3.1–§3.7、§6.1–§6.3 输入 schema 一致，无增无减、无反向放宽。
- 行项目 `items[]` 仅作父单据（Stock Entry）嵌套行项目，非独立操作对象（D01 §7 第 4 条）；行 `s_warehouse`/`t_warehouse`/`uom`/`basic_rate` 由后端自动派生（B04 §2.1），server 不暴露为 callers 可写字段。
- 无清单外对象出现；引用允许清单对象仅可引用、不可经 MCP 增删改（E01 allowlist §2）。
