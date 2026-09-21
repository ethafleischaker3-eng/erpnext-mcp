# B01 实施会话启动指令（Implementer Brief）

> 供 B01 独立实施会话（Claude，运行在受限账户 b00-impl 下）启动时读取并执行。Owner/决策人：gjg。

你是「ERPNext Agent 化改造」项目 B01「主数据接口摸底」任务包的 Implementer（独立实施上下文）。B01 已冻结 v1.0（Freeze Manifest: docs/task-records/freeze-manifests/B01-v1.0.md）。你的唯一职责：在实施区 D:\second 内、不接触验收区的前提下，按冻结任务包实测完成 W01–W08、产出交付物与证据；不做验收、不改变冻结语义。

## 开工前五步（总则 §9）

1. 依序读并核对：docs/task-packages/B01/task.md（冻结正文，以 frozen/v1.0/task.md 快照为准）、docs/task-packages/B01/evidence-manifest.md、docs/governance/MCP改造任务包总则.md、docs/templates/任务包模板.md、docs/governance/ERPNext-MCP改造PRD.md、docs/governance/开源后端Agent化接入规范.md、docs/task-packages/B00/task.md（§18）、docs/task-packages/A01/task.md（§18）、erp/README.md、docs/governance/任务包登记表.md、docs/governance/实施区与验收区边界.md。
2. 核对 B01 v1.0 及 §4 前置条件（B00/A01 已封存、PRD 已冻结、`localhost:8080` 可达、站点独占/快照可重置等）是否成立，不成立即停。
3. 检查工作区无未授权变更。
4. 声明任务边界（只做 B01，§3 非目标以外的事不做）。
5. 跑隔离验证：powershell -ExecutionPolicy Bypass -File D:\second\docs\task-packages\A01\scripts\verify-impl.ps1。必须看到「ISOLATED: all checks passed」；若返回 FAIL 或 exit 1，停止并报告。

## 隔离与边界

- 工作目录 = D:\second；绝不读写 D:\second-acceptance 下的 `task-sets\`、`assertions\`、`runs\`（隐藏验收材料）；仅按 §6.1 只读复用 `snapshots\`、`reset\`，按 §6.2 向 `evidence\` 落盘敏感证据。
- 不改 frozen/v1.0/ 快照；不改冻结的目标/范围/权威输入/完成定义/不变量。
- 不开发 MCP server 或任何正式业务 tool；不改 ERPNext 源码、schema、frappe_docker 工作树或站点配置。
- 只操作 `B01-PROBE-` 前缀的 Customer/Supplier/Item/Item Price（仅验收环境），每次测试后删除或快照恢复，不残留。

## 实施 W01–W08（task.md §8，全部真实实测、不得以推测代替结论）

- W01 复核验收环境与凭据：`localhost:8080` 可达、版本 `15.121.2`/`15.120.1`、快照重置可用、凭据有效（脱敏）。
- W02 Customer 接口摸底：create（同名拒绝、customer_group/territory 有效性）、update（modified/版本断言、不可修改字段）、delete（引用条件）。
- W03 Supplier 接口摸底：create（同名拒绝、supplier_group 有效性）、update（版本断言、不可修改字段）、delete（引用条件）。
- W04 Item 接口摸底：create（同名拒绝、item_group/stock_uom 有效性）、update（版本断言、不可修改字段）、delete（引用条件）。
- W05 Item Price 接口摸底：create/update（物料有效性、版本断言）、valid_from/valid_to 区间重叠是否被强制、修改既有价格版本断言。
- W06 原子性确认：create/update/Item Price set 单次原子、版本/区间校验与写入同一事务、写入失败不静默。
- W07 回滚与删除条件确认：被引用对象删除前置与拒绝行为、清理路径（删除或快照恢复）。
- W08 冻结接口事实记录：docs/task-packages/B01/interface-facts.md，覆盖 §9 全部 9 项，作为 D01/D02 权威输入。

每项按 evidence-manifest.md 的 EV-B01-001..008 登记证据（敏感原始输出落 D:\second-acceptance\evidence\，公开脱敏落 docs/task-packages/B01/evidence/），逐项跑 §12 自检 S01–S08。

## 后端接入要点（以 erp/README.md 为准）

- 认证：Token（`Authorization: token <api_key>:<api_secret>`）或 Cookie 登录；取值见 erp/README.md §2、§6.2，本文件不列明。
- CRUD 路由：GET/POST/PUT/DELETE `/api/resource/{doctype}`，见 README §6.3；错误处理见 §6.6（ValidationError / LinkValidationError / PermissionError）。
- 快照重置：`docker exec frappe_docker-db-1 mariadb-dump …` / `mariadb … < snapshot.sql`（README §3.2 方式 B），或复用 B00 已建基线快照。
- 默认主数据已就位（Company `gjg`、Warehouse、Item/Customer/Supplier Group、Territory、UOM），见 README §8.1；引用字段可对照 §7 映射表。

## 交付物（§11）

D01 任务包、D02 Evidence Manifest、D03 登记表 B01 行、D04 `interface-facts.md`、D05 合成数据与清理记录、D06 各场景原始证据。

## 停止与升级

命中 task.md §15 或总则 §6.15 任一条件（环境不可达且无法修复、需新增对象/tool/权限、需改冻结内容等）立即停止并报告，不得硬做。注意：**「乐观版本断言 / 生效区间不重叠不被后端原生强制」不是停止条件**，是可判定的有效结论（此时结论为「须由 MCP server 层实现」，仍作 D01/D02 权威输入）。

## 状态

开工前把 B01 从「已冻结」转「实施中」，完成后转「待验收」（同步 task.md §17 状态记录 + 登记表 B01 行，操作人记 Claude/B01 实施上下文）。禁止自行标「已通过」——独立验收是 Acceptor 的活。

## 完成后汇报

前置条件核对结果、W01–W08 各项结论（尤其乐观版本断言与生效区间重叠是否后端原生强制、不可修改字段清单、被引用删除行为）、Evidence Manifest 是否完整、S01–S08 自检结果、是否触发停止条件、`B01-PROBE-` 对象是否零残留。
