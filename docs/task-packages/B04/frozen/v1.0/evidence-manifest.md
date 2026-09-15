# B04 Evidence Manifest

> 当前状态：B04 v1.0 已冻结，尚未实施。下列 `EV-B04-*` 为按冻结自检方法 S01—S08 预登记的**证据计划**，实施时逐项执行并回填实际值、原始输出位置与状态。公开脱敏证据将落盘于 `docs/task-packages/B04/evidence/`；敏感原始输出受控于 `D:\second-acceptance\evidence\`（本清单登记脱敏引用）。

## 1. 证据映射（计划）

| 证据编号 | 对应工作项/自检 | 计划命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-B04-001 | W01、S01 环境与凭据 | `docker compose ps`；`curl get_logged_user`；`bench list-apps`；引用对象列表（含 Warehouse 5）；dump→写探针→restore 往返 | 实例可达、版本符合（frappe 15.120.1 / erpnext 15.121.2）、凭据有效、快照可重置；源/目标仓就位 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B04-002 | W02、S02 Stock Reconciliation create/confirm/cancel | `curl` create（`B04-PROBE-` 前置）、confirm/cancel（陈旧/正确 modified）及无效引用 | 命名、引用校验、草稿状态、覆盖基线、SLE/GL 产生、无确定性回滚、正向库存就位均有记录 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B04-003 | W03、S03 Stock Entry create | `curl` create（`B04-PROBE-` 前置）及无效引用/数量/空 items | 命名、源/目标仓引用校验、源仓库存不足校验、草稿状态、子表行项目均有记录 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B04-004 | W04、S04 Stock Entry confirm | `curl` run_method:submit / frappe.client.submit（陈旧/正确 modified） | 状态漂移 0→1、modified 变化、陈旧 modified 版本断言、源/目标仓校验、调拨库存变动（SLE/Bin） | 待实施回填 | 待实施回填 | 未执行 |
| EV-B04-005 | W05、S05 Stock Entry cancel | `curl` run_method:cancel / frappe.client.save | 合法前态、下游约束、库存冲回（SLE 冲销/Bin 恢复）、陈旧 modified 版本断言 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B04-006 | W06、S06 回滚路径汇总 | 汇总主数据/价格/单据回滚路径（复用 B01 F4 / B02 F7 / B03 F7 / B03 F9）+ 实测 Stock Entry cancel 冲回、SR 无确定性回滚、草稿删除 | 回滚矩阵完整、逐项可复核 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B04-007 | W07、S07 原子性/失败不静默/清理 | 单请求事务观察 + 失败后终态 + 清理 + LIKE 清查 | create/confirm/cancel 单次原子；失败不静默成功；`B04-PROBE-` 对象与库存变动测试后零残留 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B04-008 | W08、S08 接口事实记录 | 汇总 W01—W07 形成 D04 | 覆盖 §9 全部 9 项，逐对象逐项可复核 | 待实施回填 | 待实施回填 | 未执行 |

## 2. 正式证据记录要求

实施时逐项执行并回填「实际值」「原始输出位置」「状态」，并同步登记以下字段：执行者（B04 独立实施上下文）、时间（UTC+8）、环境、退出码、原始输出 SHA-256、脱敏说明。

完整命令为 `curl -X <方法> http://localhost:8080/api/resource/<Doctype>[/<name>]` 或 `http://localhost:8080/api/method/<whitelisted_method>` 形式，`Authorization: token <REDACTED>`，逐场景参数见各证据文件场景表；原始输出（响应体 + HTTP 状态码）落盘于对应 `evidence/W<编号>-*.txt`。

## 3. 敏感信息与受控位置

- B04 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Token）；本清单与公开证据须 REDACTED，不含凭据值、完整认证头、完整堆栈。
- 敏感原始输出（含凭据痕迹的 REST 响应、数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），本清单登记脱敏引用（总则 §15.1）。
- 合成对象统一 `B04-PROBE-` 标识；单据 name 为 naming_series 连续编号（MAT-STE-/MAT-REC-），合成标识经物料承载；Item/Stock Entry/Stock Reconciliation 三类对象清理后零残留，含 confirm 产生的库存与流水（SLE/GL/Bin）经 cancel 冲回或快照恢复归零。
- 本地开发默认凭据仅限本地验收环境；迁移共享/生产环境必须更换（§16）。
