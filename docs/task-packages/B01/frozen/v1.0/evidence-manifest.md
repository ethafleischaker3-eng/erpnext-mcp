# B01 Evidence Manifest

> 当前状态：B01 v1.0 已冻结的正式证据计划。下列 `EV-B01-*` 仅为草案映射，不构成正式实施、自检或验收证据。B01 进入「实施中」后，必须按冻结自检方法重新执行 S01—S08，以 `EV-B01-*` 编号登记正式证据。

## 1. 证据映射（冻结后执行）

| 证据编号 | 对应工作项/自检/完成条件 | 必须记录的实际命令或操作 | 预期值 | 原始输出位置 | 当前状态 |
|---|---|---|---|---|---|
| EV-B01-001 | W01、S01 复核验收环境与凭据 | `curl http://localhost:8080` 可达性；`bench --site erpnext.local list-apps` 版本；快照重置可用复核；登录/Token 有效性（脱敏） | `erpnext.local` 独占非生产可销毁；版本符合 `15.121.2`/`15.120.1`；快照可重置；凭据有效 | `evidence/W01-env-<时间戳>.txt` | 待实施 |
| EV-B01-002 | W02、S02 Customer 接口摸底 | `curl` Customer create/update/delete（`B01-PROBE-` 前缀）；同名 create、customer_group/territory 无效、modified/版本断言、不可修改字段、引用删除 | 同名拒绝、引用字段校验、版本断言、不可修改字段、引用删除条件均有实测记录与报错形式 | `evidence/W02-customer-<时间戳>.txt` | 待实施 |
| EV-B01-003 | W03、S03 Supplier 接口摸底 | `curl` Supplier create/update/delete（`B01-PROBE-` 前缀）；同名 create、supplier_group 无效、版本断言、不可修改字段、引用删除 | 同上，逐项有实测记录 | `evidence/W03-supplier-<时间戳>.txt` | 待实施 |
| EV-B01-004 | W04、S04 Item 接口摸底 | `curl` Item create/update/delete（`B01-PROBE-` 前缀）；同名 create、item_group/stock_uom 无效、版本断言、不可修改字段、引用删除 | 同名/UOM/分类校验、版本断言、不可修改字段、引用删除条件均有实测记录 | `evidence/W04-item-<时间戳>.txt` | 待实施 |
| EV-B01-005 | W05、S05 Item Price 接口摸底 | `curl` Item Price create/update（`B01-PROBE-` 物料）；物料有效性、版本断言、valid_from/valid_to 区间重叠、修改既有价格版本断言 | 生效区间不重叠是否强制、版本断言均有实测记录 | `evidence/W05-item-price-<时间戳>.txt` | 待实施 |
| EV-B01-006 | W06、S06 原子性确认 | 实测主数据 create/update/Item Price set 是否单次原子完成；版本/区间校验与写入是否同一事务（PRD §5.5）；写入失败是否被正确报告 | 单次原子完成；失败不静默成功 | `evidence/W06-atomicity-<时间戳>.txt` | 待实施 |
| EV-B01-007 | W07、S07 回滚与删除条件确认 | 实测被引用主数据对象的删除前置与拒绝行为；确认 create 后清理路径（删除或快照恢复） | 被引用删除被拒；`B01-PROBE-` 对象测试后零残留 | `evidence/W07-delete-cleanup-<时间戳>.txt` | 待实施 |
| EV-B01-008 | W08、S08 冻结接口事实记录 | 汇总 W01—W07 形成接口事实记录（D04），覆盖第 9 节全部 9 项 | 覆盖 §9 全部 9 项，逐对象逐项可复核 | `docs/task-packages/B01/interface-facts.md` | 待实施 |

## 2. 正式证据记录要求

每条 `EV-B01-*` 必须在执行后补齐：执行者、精确到秒且含时区的时间、操作系统与 shell 版本、完整命令或可复现人工步骤、退出码、预期值、实际值、原始输出位置、原始输出 SHA-256、关联的 B01 冻结版本/哈希及脱敏说明。只有结论而无原始输出的记录不得标记为成功。

合成对象统一使用 `B01-PROBE-` 前缀；每次测试后的清理终态（删除或快照恢复）必须逐场景记录命令与终态，纳入本清单（不变量「零残留」）。

## 3. 敏感信息与受控位置

- B01 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Cookie、Token）与本地默认凭据，属敏感证据；
- 敏感原始证据（数据库查询结果、含凭据痕迹的 REST 响应）统一落盘于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），并在本清单登记脱敏引用（总则 §15.1）；
- 公开脱敏证据（去除凭据/认证头/敏感字段后的结论与响应摘要）落盘于 `docs/task-packages/B01/evidence/`；
- 不得记录或输出凭据值、完整认证头、完整堆栈；本地开发默认凭据仅限本地验收环境，迁移共享/生产环境必须更换（§16）。
