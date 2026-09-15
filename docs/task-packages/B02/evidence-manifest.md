# B02 Evidence Manifest

> 当前状态：B02 v1.0 已进入实施完成（待验收）。下列 `EV-B02-*` 为按冻结自检方法 S01—S08 重新执行后登记的正式证据。公开脱敏证据落盘于 `docs/task-packages/B02/evidence/`；敏感原始输出受控于 `D:\second-acceptance\evidence\`（本清单登记脱敏引用）。

## 1. 证据映射（已执行）

| 证据编号 | 对应工作项/自检 | 实际命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-B02-001 | W01、S01 环境与凭据 | `docker compose ps`；`curl get_logged_user`；`bench list-apps`；引用对象列表；dump→写探针→restore 往返 | 实例可达、版本符合、凭据有效、快照可重置 | 九容器 Up；HTTP 200 Administrator；frappe 15.120.1/erpnext 15.121.2；Company gjg、Warehouse 5、Item Group 6、Customer Group 5、Territory 3、Price List 2；dump→restore 探针回归后清除 | `evidence/W01-env-20260914.txt` | 已完成 |
| EV-B02-002 | W02、S02 SO create | `curl` create（B02-PROBE 前置）及无效引用/数量 | 命名、引用校验、草稿、子表均有记录 | naming_series `SAL-ORD-.YYYY.-`；customer/item→404 DoesNotExistError、warehouse/company/currency/price list→417 LinkValidationError；缺 customer→417 MandatoryError；空 items→500 TypeError；qty=0/-5→417；子表嵌套成功；显式非零 rate→自动创建 Item Price（补测 2026-09-15，见 F7） | `evidence/W02-sales-order-create-20260914.txt` | 已完成 |
| EV-B02-003 | W03、S03 SO confirm | `curl` run_method:submit / frappe.client.submit（陈旧/正确 modified） | 状态漂移、版本断言 | 0→1、status To Deliver and Bill、modified 变化；陈旧 modified→417 TimestampMismatchError 未提交；正确 modified→200；已生效再 confirm→200 静默 no-op | `evidence/W03-sales-order-confirm-20260914.txt` | 已完成 |
| EV-B02-004 | W04、S04 SO cancel | `curl` run_method:cancel / frappe.client.save | 合法前态、下游约束、冲回、版本断言 | 1→2 Cancelled；草稿→417 DocstatusTransitionError；已取消→417 ValidationError；下游已确认 DN→417 LinkExistsError；删已生效→417、删草稿/已取消→202；版本断言须走 save 等价路径 | `evidence/W04-sales-order-cancel-20260914.txt` | 已完成 |
| EV-B02-005 | W05、S05 DN create | `curl` make_delivery_note + insert | 来源已生效校验、未完成量、子表 | naming_series `MAT-DN-.YYYY.-`；mapper 来源草稿→417 ValidationError "docstatus=1"；草稿 qty>未完成量不校验（confirm 才触发）；子表 against_sales_order/so_detail 嵌套 | `evidence/W05-delivery-note-create-20260914.txt` | 已完成 |
| EV-B02-006 | W06、S06 DN confirm | `curl` run_method:submit / frappe.client.submit | 状态漂移、版本断言、剩余可发量、库存 | 非库存物料 0→1 To Bill；超发→417 OverAllowanceError；库存不足→417 NegativeStockError；陈旧 modified→417 TimestampMismatchError | `evidence/W06-delivery-note-confirm-20260914.txt` | 已完成 |
| EV-B02-007 | W07、S07 原子性/失败不静默/清理 | 单请求事务观察 + 失败后终态 + 清理 + LIKE 清查 | 单次原子、失败不静默、零残留 | 单事务（check_if_latest→validate→落库同 _save）；失败后 modified/docstatus 不变；除 submit 已生效静默 200 外均结构化 4xx；清理 12 对象全 202，REST+DB 八类 `B02-PROBE-%` 均 0 | `evidence/W07-atomicity-cleanup-20260914.txt` | 已完成 |
| EV-B02-008 | W08、S08 接口事实记录 | 汇总 W01—W07 形成 D04 | 覆盖 §9 全部 9 项 | 覆盖 9 项 + 6 条交叉结论（F1–F6） | `docs/task-packages/B02/interface-facts.md` | 已完成 |

## 2. 正式证据记录要求（已逐条满足）

完整命令均为 `curl -X <方法> http://localhost:8080/api/resource/<Doctype>[/<name>]` 或 `http://localhost:8080/api/method/<whitelisted_method>` 形式，`Authorization: token <REDACTED>`，逐场景参数见各证据文件场景表；原始输出（响应体 + HTTP 状态码）落盘于对应 `evidence/W<编号>-*.txt`。

| 证据编号 | 执行者 | 时间（UTC+8） | 环境 | 退出码 | 原始输出 SHA-256 | 脱敏说明 |
|---|---|---|---|---|---|---|
| EV-B02-001 | Claude（B02 实施上下文） | 2026-09-14 23:19（快照重置实测 23:32） | Windows 11 / Git Bash；Docker 29.7.2；ERPNext 15.121.2 | 0 | `2c4aa2f62367c285158bd574f16ace24e392f90765c05b151f9d7288792e74ee` | 认证头/凭据已 REDACTED |
| EV-B02-002 | 同上 | 2026-09-14 23:20（补测 2026-09-15） | 同上 | 0 | `3029bd7f3069230a31676a0d234a7399a0f0113c743a9d1c650ac76544242a86` | 同上 |
| EV-B02-003 | 同上 | 2026-09-14 23:23 | 同上 | 0 | `5fa96ea97d6f2ddced84fa0dd18e6f4458ae77eea39fc7c7c3faf4e24e986970` | 同上 |
| EV-B02-004 | 同上 | 2026-09-14 23:26 | 同上 | 0 | `52ce08929c53ebd1160e7188dc239b957bb1f8652a89e789139f8d2e09a07502` | 同上 |
| EV-B02-005 | 同上 | 2026-09-14 23:29 | 同上 | 0 | `5043947e1f4b33362bd74d5256ffeeb0c273e8607de77a7efd0ea5a3de931261` | 同上 |
| EV-B02-006 | 同上 | 2026-09-14 23:30 | 同上 | 0 | `ffcbd867b2ebbd5465c43063ba5ac4fe79453078a2db7744fb508178c17b7356` | 同上 |
| EV-B02-007 | 同上 | 2026-09-14 23:31–23:33 | 同上 | 0 | `a4edae3f7bae8bb20c5f1dc59ff82a7fdb45d6eecd56eb34ea30d7808a68b7f3` | 同上 |
| EV-B02-008 | 同上 | 2026-09-14 23:34（补录 F7 于 2026-09-15） | 同上 | 0 | `f0672a0b419ed0bd79ee914f0aee506d2c88cae92398fd19fef689506f82ef59` | 接口事实记录，无凭据 |

## 3. 敏感信息与受控位置

- B02 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Token）；本清单与公开证据已 REDACTED，不含凭据值、完整认证头、完整堆栈。
- 敏感原始输出（含凭据痕迹的 REST 响应、数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），本清单登记脱敏引用（总则 §15.1）。
- 合成对象统一 `B02-PROBE-` 标识；单据 name 为 naming_series 连续编号（SAL-ORD-/MAT-DN-），合成标识经交易对手/物料承载；四类对象（Customer/Item/Sales Order/Delivery Note）清理后零残留（W07 清查记录，REST+DB 八类 0）。
- 本地开发默认凭据仅限本地验收环境；迁移共享/生产环境必须更换（§16）。
