# B02 Evidence Manifest

> 当前状态：B02 v1.0 已冻结的正式证据计划。下列 `EV-B02-*` 仅为草案映射，不构成正式实施、自检或验收证据。B02 进入「实施中」后，必须按冻结自检方法重新执行 S01—S08，以 `EV-B02-*` 编号登记正式证据。

## 1. 证据映射（冻结后执行）

| 证据编号 | 对应工作项/自检/完成条件 | 必须记录的实际命令或操作 | 预期值 | 原始输出位置 | 当前状态 |
|---|---|---|---|---|---|
| EV-B02-001 | W01、S01 复核验收环境与凭据 | `curl http://localhost:8080` 可达性；`bench --site erpnext.local list-apps` 版本；快照重置可用复核；登录/Token 有效性（脱敏） | `erpnext.local` 独占非生产可销毁；版本符合 `15.121.2`/`15.120.1`；快照可重置；凭据有效 | `evidence/W01-env-<时间戳>.txt` | 待实施 |
| EV-B02-002 | W02、S02 Sales Order create 摸底 | `curl` Sales Order create（`B02-PROBE-` 前置 Customer/Item）；naming_series、customer/item/price list 无效、草稿 docstatus、子表行项目嵌套 | 命名自动编号、引用字段校验、草稿状态、子表行项目均有实测记录与报错形式 | `evidence/W02-sales-order-create-<时间戳>.txt` | 待实施 |
| EV-B02-003 | W03、S03 Sales Order confirm 摸底 | `curl` Sales Order confirm（docstatus 0→1）；陈旧 modified 版本断言、交易对手/物料/日期/价格关键状态校验 | 状态漂移、版本断言、关键业务状态校验均有实测记录 | `evidence/W03-sales-order-confirm-<时间戳>.txt` | 待实施 |
| EV-B02-004 | W04、S04 Sales Order cancel 摸底 | `curl` Sales Order cancel（已生效→已取消）；合法前态、下游单据约束、冲回行为、陈旧 modified 版本断言 | 合法前态、下游约束、冲回行为、版本断言均有实测记录 | `evidence/W04-sales-order-cancel-<时间戳>.txt` | 待实施 |
| EV-B02-005 | W05、S05 Delivery Note create 摸底 | `curl` Delivery Note create（按来源销售订单）；来源订单已生效校验、行数量不超过未完成量、子表行项目 | 来源订单校验、未完成量校验、子表行项目均有实测记录 | `evidence/W05-delivery-note-create-<时间戳>.txt` | 待实施 |
| EV-B02-006 | W06、S06 Delivery Note confirm 摸底 | `curl` Delivery Note confirm；陈旧 modified 版本断言、来源行剩余可发数量、可用库存充足/仓库有效（负向库存不足 + 非库存物料正向） | 状态漂移、版本断言、剩余可发数量、库存/仓库校验均有实测记录 | `evidence/W06-delivery-note-confirm-<时间戳>.txt` | 待实施 |
| EV-B02-007 | W07、S07 原子性/失败不静默与清理确认 | 实测 create/confirm/cancel 是否单次原子完成；confirm 状态校验与提交同一事务；失败不静默；`B02-PROBE-` 对象零残留 | 单次原子完成；失败不静默成功；零残留 | `evidence/W07-atomicity-cleanup-<时间戳>.txt` | 待实施 |
| EV-B02-008 | W08、S08 冻结接口事实记录 | 汇总 W01—W07 形成接口事实记录（D04），覆盖第 9 节全部 9 项 | 覆盖 §9 全部 9 项，逐对象逐项可复核 | `docs/task-packages/B02/interface-facts.md` | 待实施 |

## 2. 正式证据记录要求

每条 `EV-B02-*` 必须在执行后补齐：执行者、精确到秒且含时区的时间、操作系统与 shell 版本、完整命令或可复现人工步骤、退出码、预期值、实际值、原始输出位置、原始输出 SHA-256、关联的 B02 冻结版本/哈希及脱敏说明。只有结论而无原始输出的记录不得标记为成功。

合成对象统一使用 `B02-PROBE-` 标识（单据 name 为 naming_series 自动编号，合成标识经交易对手/物料承载）；以每次 create 返回的 `name` 列表作清理主键，并注意清理顺序（已确认 SO 存在下游 DN 时先删 DN、再 cancel→delete SO）。每次测试后的清理终态（删除或快照恢复）必须逐场景记录命令与终态，纳入本清单（不变量「零残留」）。

## 3. 敏感信息与受控位置

- B02 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Cookie、Token）与本地默认凭据，属敏感证据；
- 敏感原始证据（数据库查询结果、含凭据痕迹的 REST 响应）统一落盘于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），并在本清单登记脱敏引用（总则 §15.1）；
- 公开脱敏证据（去除凭据/认证头/敏感字段后的结论与响应摘要）落盘于 `docs/task-packages/B02/evidence/`；
- 不得记录或输出凭据值、完整认证头、完整堆栈；本地开发默认凭据仅限本地验收环境，迁移共享/生产环境必须更换（§16）。
