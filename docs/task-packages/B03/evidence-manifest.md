# B03 Evidence Manifest

> 当前状态：B03 v1.0 已冻结，尚未实施。下列 `EV-B03-*` 为按冻结自检方法 S01—S08 预登记的**证据计划**，实施时逐项执行并回填实际值、原始输出位置与状态。公开脱敏证据将落盘于 `docs/task-packages/B03/evidence/`；敏感原始输出受控于 `D:\second-acceptance\evidence\`（本清单登记脱敏引用）。

## 1. 证据映射（计划）

| 证据编号 | 对应工作项/自检 | 计划命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-B03-001 | W01、S01 环境与凭据 | `docker compose ps`；`curl get_logged_user`；`bench list-apps`；引用对象列表（含 Supplier Group / buying Price List）；dump→写探针→restore 往返 | 实例可达、版本符合（frappe 15.120.1 / erpnext 15.121.2）、凭据有效、快照可重置；Supplier Group 与 `Standard Buying` 价格表就位情况 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B03-002 | W02、S02 PO create | `curl` create（`B03-PROBE-` 前置）及无效引用/数量/空 items | 命名、引用校验、草稿状态、子表行项目均有记录 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B03-003 | W03、S03 PO confirm | `curl` run_method:submit / frappe.client.submit（陈旧/正确 modified） | 状态漂移 0→1、modified 变化、陈旧 modified 版本断言、关键业务状态校验 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B03-004 | W04、S04 PO cancel | `curl` run_method:cancel / frappe.client.save | 合法前态、下游约束、冲回行为、陈旧 modified 版本断言 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B03-005 | W05、S05 PR create | `curl` 按来源采购订单生成收货草稿 + insert | 来源订单已生效校验、未完成量校验、子表行项目、草稿状态 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B03-006 | W06、S06 PR confirm | `curl` run_method:submit / frappe.client.submit | 状态漂移、陈旧 modified 版本断言、剩余可收数量、收货入库 → 库存增加（Stock Ledger Entry + Bin） | 待实施回填 | 待实施回填 | 未执行 |
| EV-B03-007 | W07、S07 原子性/失败不静默/清理 | 单请求事务观察 + 失败后终态 + 清理 + LIKE 清查 | create/confirm/cancel 单次原子；失败不静默成功；`B03-PROBE-` 对象与收货入库库存测试后零残留 | 待实施回填 | 待实施回填 | 未执行 |
| EV-B03-008 | W08、S08 接口事实记录 | 汇总 W01—W07 形成 D04 | 覆盖 §9 全部 9 项，逐对象逐项可复核 | 待实施回填 | 待实施回填 | 未执行 |

## 2. 正式证据记录要求

实施时逐项执行并回填「实际值」「原始输出位置」「状态」，并同步登记以下字段：执行者（B03 独立实施上下文）、时间（UTC+8）、环境、退出码、原始输出 SHA-256、脱敏说明。

完整命令为 `curl -X <方法> http://localhost:8080/api/resource/<Doctype>[/<name>]` 或 `http://localhost:8080/api/method/<whitelisted_method>` 形式，`Authorization: token <REDACTED>`，逐场景参数见各证据文件场景表；原始输出（响应体 + HTTP 状态码）落盘于对应 `evidence/W<编号>-*.txt`。

## 3. 敏感信息与受控位置

- B03 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Token）；本清单与公开证据须 REDACTED，不含凭据值、完整认证头、完整堆栈。
- 敏感原始输出（含凭据痕迹的 REST 响应、数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），本清单登记脱敏引用（总则 §15.1）。
- 合成对象统一 `B03-PROBE-` 标识；单据 name 为 naming_series 连续编号（PUR-ORD-/MAT-PRE-），合成标识经供应商/物料承载；Supplier/Supplier Group/Item/Purchase Order/Purchase Receipt 五类对象清理后零残留，含 Purchase Receipt confirm 产生的库存经 cancel 冲回或快照恢复归零。
- 本地开发默认凭据仅限本地验收环境；迁移共享/生产环境必须更换（§16）。
