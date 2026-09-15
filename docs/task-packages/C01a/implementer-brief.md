# C01a 盲出题会话启动指令（Implementer Brief）

> 供 C01a 盲出题实施会话（Claude，运行在受限账户 `c01a-blind` 下）启动时读取并执行。Owner/决策人：gjg。
> 本简报只讲「怎么开工」，不含任何 B01–B05 结论、PRD 内容、MCP 契约或 server 实现；你的权威任务定义在 `docs/task-packages/C01a/task.md`。

你是「ERPNext Agent 化改造」项目 C01a「盲生成业务验收场景」任务包的 Implementer（盲出题上下文）。C01a 已冻结 v1.0。你的唯一职责：在**不接触** PRD 全文、B01–B05 接口结论、MCP 契约、server 实现或既有验收断言的前提下，仅依据 ERPNext 数据模型/源码 + 规范第 8 章 + Owner 下发的对象范围边界名单，盲生成销售/采购多步业务验收场景候选。

## 开工前（按序）

1. 先读 `docs/task-packages/C01a/task.md`（冻结正文，以 `frozen/v1.0/task.md` 快照为准）——这是你的权威任务定义，覆盖 §8 工作项 W01–W06、§9 三段式骨架格式契约、§10 不变量、§14 完成定义、§15 停止条件。
2. 核对 §4 前置条件已满足（尤其 `object-scope.md` 已下发、隔离 ACL 已建立）。
3. 做 W01 负向自证：你以 `c01a-blind` 身份尝试读取下列路径，必须**全部得到 ACCESS_DENIED（读不到）**：
   - `docs/task-packages/B01/`、`B02/`、`B03/`、`B04/`、`B05/` 下任意文件
   - `docs/ERPNext-MCP改造PRD.md`
   - `docs/task-records/` 下任意文件（B 系列 Freeze Manifest / 变更记录）
   - `D:\second-acceptance\task-sets/`、`assertions/`、`runs/`、`snapshots/` 下任意文件
   - 若任一读到了内容，盲隔离已破，立即停止并上报，不得继续。
4. 确认你可写 `D:\second-acceptance\candidates\C01a\`（写入一个探针文件验证 WRITE_OK 后删除）。

## 允许的输入（仅此）

- `docs/task-packages/C01a/object-scope.md`（对象范围边界名单，你的范围上限）
- `erp/README.md`（ERPNext 数据模型）
- `frappe_docker/`（submodule 源码；版本基线 ERPNext 15.121.2 / Frappe 15.120.1，固定提交见 task.md §4）
- `docs/开源后端Agent化接入规范.md` 第 8 章（tool 设计规范）
- `docs/` 治理文档（总则 / 任务包模板 / 登记表 / 实施区与验收区边界），仅用于本任务包自身起草与自检，**不进入场景生成输入**

## 严禁读（任何情况下）

- `docs/task-packages/B01–B05/` 任何文件（含 interface-facts、task.md、implementer-brief、frozen 快照）
- `docs/ERPNext-MCP改造PRD.md` 全文
- `docs/task-records/`（B 系列 Freeze Manifest / 变更记录）
- 任何 MCP 契约、server 实现代码
- `D:\second-acceptance\` 下 `task-sets/`、`assertions/`、`runs/`、`snapshots/`
- 任何既有验收断言、评分脚本、隐藏初始数据

一旦误读上述内容，本上下文立即作废，停止并上报（总则 §2.5）。

## 产出（W02–W06）

- 场景候选（隐藏）：`D:\second-acceptance\candidates\C01a\`，销售 ≥1 条、采购 ≥1 条，每条三段式（初始数据状态 / 自然语言指令 / 期望终态断言骨架）。
- 治理文档与证据（公开）：`docs/task-packages/C01a/evidence-manifest.md`（W01 盲隔离自证 + 各工作项证据）。
- 三段式与对象范围严格按 task.md §9 / §10 执行，候选对象不得超出 `object-scope.md`；候选不得写死 tool 名、接口路径或引用 B01–B05 结论（task.md §9）。

## 停止与升级

命中 task.md §15 或总则 §6.15（尤其：读到 PRD/B01–B05/MCP 契约/server 实现、`object-scope.md` 未下发、隔离 ACL 未生效、无法生成满足「销售/采购各 ≥1 多步链」的候选）立即停止并上报，不得硬做。

## 状态

开工前把 C01a 从「已冻结」转「实施中」，完成后转「待验收」（同步 task.md §17 状态记录 + 登记表 C01a 行，操作人记 Claude/C01a 盲出题上下文）。禁止自行标「已通过」——独立验收是 Acceptor 的活。

## 完成后汇报

前置条件核对结果、W01 盲隔离自证结果、销售/采购候选各几条及三段式完备性、S01–S04 自检结果（尤其 S04 关键词扫描零 B 系列痕迹 / tool 名 / 档位词 / 接口路径命中）、是否触发停止条件、候选是否落在 `candidates/C01a/` 且未进实施区。
