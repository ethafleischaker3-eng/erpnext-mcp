# B01 Evidence Manifest

> 当前状态：B01 v1.0 已进入实施完成（待验收）。下列 `EV-B01-*` 为按冻结自检方法 S01—S08 重新执行后登记的正式证据。公开脱敏证据落盘于 `docs/task-packages/B01/evidence/`；敏感原始输出受控于 `D:\second-acceptance\evidence\`（本清单登记脱敏引用）。

## 1. 证据映射（已执行）

| 证据编号 | 对应工作项/自检 | 实际命令或操作 | 预期值 | 实际值 | 原始输出位置 | 状态 |
|---|---|---|---|---|---|---|
| EV-B01-001 | W01、S01 环境与凭据 | `docker compose ps`；`curl get_logged_user`；`bench list-apps`；`mariadb-dump`→写探针→`mariadb` restore | 实例可达、版本符合、凭据有效、快照可重置 | 九容器 Up；HTTP 200；frappe 15.120.1 / erpnext 15.121.2；Administrator；dump 8,474,160 字节→restore 后探针 404 | `evidence/W01-env-20260914.txt` | 已完成 |
| EV-B01-002 | W02、S02 Customer | `curl` create/update/delete（B01-PROBE-） | 同名拒绝、引用字段校验、版本断言、不可修改字段、删除条件 | 同名**不拒绝**（自动改名）；无效 group/territory→417；modified 陈旧→417；creation/owner 常量；删除 202 | `evidence/W02-customer-20260914.txt` | 已完成 |
| EV-B01-003 | W03、S03 Supplier | `curl` create/update/delete | 同名拒绝、supplier_group 校验、版本断言、不可修改字段 | 同名→**409 DuplicateEntryError**；无效 group→417；modified 陈旧→417；creation/owner 常量→417；name→404；删除 202（均实测） | `evidence/W03-supplier-20260914.txt` | 已完成 |
| EV-B01-004 | W04、S04 Item | `curl` create/update/delete | 同名/UOM/分类校验、版本断言、不可修改字段 | 同名→409；无效 group/uom→417；docstatus 可被 update 改写；owner 常量；删除 202 | `evidence/W04-item-20260914.txt` | 已完成 |
| EV-B01-005 | W05、S05 Item Price | `curl` create/update、区间重叠 | 区间重叠是否强制、版本断言 | 重叠**不拒绝不调整**；modified 陈旧→417 | `evidence/W05-item-price-20260914.txt` | 已完成 |
| EV-B01-006 | W06、S06 原子性 | 单请求事务观察 + 失败路径抽查 | 单次原子、失败不静默 | 单事务；版本校验在 save 内；全失败 4xx 结构化异常 | `evidence/W06-atomicity-20260914.txt` | 已完成 |
| EV-B01-007 | W07、S07 删除与清理 | `curl` delete + 逐类 LIKE 清查 | 引用删除行为、零残留 | 未引用 202；Item 被引用删除级联 Item Price；四类零残留 | `evidence/W07-delete-cleanup-20260914.txt` | 已完成 |
| EV-B01-008 | W08、S08 接口事实记录 | 汇总 W01—W07 形成 D04 | 覆盖 §9 全部 9 项 | 覆盖 9 项 + 5 条交叉结论（F1–F5） | `docs/task-packages/B01/interface-facts.md` | 已完成 |

## 2. 正式证据记录要求（已逐条满足）

完整命令均为 `curl -X <方法> http://localhost:8080/api/resource/<Doctype>[/<name>] -H "Authorization: token <REDACTED>" -H "Content-Type: application/json" -d '<JSON>'` 形式，逐场景参数见各证据文件场景表；原始输出（响应体 + HTTP 状态码）落盘于对应 `evidence/W<编号>-*.txt`。

| 证据编号 | 执行者 | 时间（UTC+8） | 环境 | 退出码 | 原始输出 SHA-256 | 脱敏说明 |
|---|---|---|---|---|---|---|
| EV-B01-001 | Claude（B01 实施上下文） | 2026-09-14 21:57:24（快照重置实测 22:33:10） | Windows 11 / Git Bash；Docker 29.7.2；ERPNext 15.121.2 | 0 | `5424f8243d619dbe5b9ceda40e46926fd07c26bcea2800bc9f607c20493f6b00` | 认证头/凭据已 REDACTED |
| EV-B01-002 | 同上 | 2026-09-14 21:57:24 | 同上 | 0 | `2dfaff45db7abe8fcffd9d79c88dafb1feb929bef8d127a558458f25545cf027` | 同上 |
| EV-B01-003 | 同上 | 2026-09-14 22:02:40（补测 22:32:44） | 同上 | 0 | `b4952d850c4e195f829a34e8cee671992ec7b82eac4b3805316741738edac3c1` | 同上 |
| EV-B01-004 | 同上 | 2026-09-14 22:05:39 | 同上 | 0 | `174e847bb4293170781d6c18239d5caa59403132cab3c41a9ab5878ed23f2695` | 同上 |
| EV-B01-005 | 同上 | 2026-09-14 22:06:07 | 同上 | 0 | `e527577e92df7ba4cbd5afe953ffc85ac763673cbf9137e7498f6c970aa6e0a3` | 同上 |
| EV-B01-006 | 同上 | 2026-09-14 22:02:23 | 同上 | 0 | `1281770368e28cecc5a2a9a94e8a432cc403ca742ece79042f7eeca6895aa38a` | 同上 |
| EV-B01-007 | 同上 | 2026-09-14 22:08:36 | 同上 | 0 | `3cb8ea0d61777fe9af83ef622d3ac83acdfae6a49a57bb5b055f737962a38431` | 同上 |
| EV-B01-008 | 同上 | 2026-09-14 22:10:00 | 同上 | 0 | `0a2fb9a43c1f03a7919aeb8d25da6d6e7a850579fdc3771fdc51cefe5127e7de` | 接口事实记录，无凭据 |

## 3. 敏感信息与受控位置

- B01 直接调用 ERPNext 后端 REST API 与数据库查询，原始输出可能含凭据痕迹（认证头、Token）；本清单与公开证据已 REDACTED，不含凭据值、完整认证头、完整堆栈。
- 敏感原始输出（含凭据痕迹的 REST 响应、数据库查询结果）受控于 `D:\second-acceptance\evidence\`（Owner=gjg，访问主体=验收侧，保留至项目交付），本清单登记脱敏引用（总则 §15.1）。
- 合成对象统一 `B01-PROBE-` 前缀；四类对象（Customer/Supplier/Item/Item Price）清理后零残留（W07 清查记录）。
- 本地开发默认凭据仅限本地验收环境；迁移共享/生产环境必须更换（§16）。
