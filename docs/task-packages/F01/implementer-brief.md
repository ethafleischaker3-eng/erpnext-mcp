# F01 实施会话启动指令（Implementer Brief）

> 供 F01 独立实施会话（Claude，运行在受限账户 `b00-impl` 下）启动时读取并执行。Owner/决策人：gjg。本文是 Owner 侧交接辅助，非 F01 冻结交付物，不改变任何冻结内容（同 A01 runbook/brief 口径）。

你是「ERPNext Agent 化改造」项目 F01「通用查询能力」任务包的 Implementer（独立实施上下文）。F01 已冻结 v1.0（Freeze Manifest：`docs/task-records/freeze-manifests/F01-v1.0.md`）。你的唯一职责：在实施区 `D:\second` 内、不接触验收区的前提下，按冻结任务包实现 6 个读 tool 并完成客观自检；不做验收、不改变冻结语义。

## 开工前五步（总则 §9）

1. 依序读并核对：`docs/task-packages/F01/task.md`（冻结正文，以 `frozen/v1.0/task.md` 快照为准）、`docs/task-packages/D02/tool-contract.md`（§2 六项读 tool 逐 tool 冻结口径，F01 直接依据）、`docs/task-packages/D01/common-contract.md`、`docs/task-packages/E01/`（permission-matrix.md / allowlist.md / roles.md / confirmation-failclosed.md / authorization-verification.md）、`docs/task-packages/E02/implementation-contract.md`（含 `lib/` 8 模块）、`docs/task-packages/C01a/object-scope.md`、`docs/task-packages/B01/interface-facts.md` 与 `B02/`、`B03/`、`B04/`、`docs/governance/开源后端Agent化接入规范.md`、`docs/governance/ERPNext-MCP改造PRD.md`、`docs/governance/MCP改造任务包总则.md`、`docs/governance/实施区与验收区边界.md`。
2. 核对 F01 v1.0 及 §4 前置条件（D02/D01/E01/E02/C01b/B01–B04 均已通过或封存）是否成立；第 9、10 条（隔离、本地环境可读）为实施前验证项，不成立即停。
3. 检查工作区无未授权变更。
4. 声明任务边界（只做 F01，§3 非目标以外的事不做：不实现写 tool、不实现 #25、不读 C01b）。
5. 跑隔离验证：`powershell -ExecutionPolicy Bypass -File D:\second\docs\task-packages\A01\scripts\verify-impl.ps1`。必须看到 `ISOLATED: all checks passed`；若返回 FAIL 或 exit 1，停止并报告。

## 隔离与边界

- 工作目录 = `D:\second`；绝不读写 `D:\second-acceptance`（含 `task-sets/`、`assertions/`、`runs/`、`snapshots/`、`candidates/`）。
- **严禁读取 C01b 冻结任务集正文、初始数据、精确断言或评分细节**——读题即受污染、失去 Implementer 资格（总则 §2.5）。
- 不改 `frozen/v1.0/` 快照；不改冻结的目标/范围/权威输入/完成定义/不变量；不改上游规范/PRD/总则/D01/D02 契约/E01/E02 结论。
- 代码落点（已裁定）：仓库根 `server/`（入口/注册表只增不改）；迁入 E02 `lib/` 8 模块；E02 原 `lib/` 保留为机制参考不动。
- 后端只读调用：统一经正式账号 `mcp-service` + 角色 `MCP Business Caller`；token 存后端容器 `/tmp/mcp_token.txt`（取值见 `erp/README.md`，不得输出凭据值/完整认证头）。

## 实施 W02–W09（task.md §8，W01 已完成、W10 归 Acceptor）

- **W02** 前置与隔离自证：核对 §4 前置；对 `D:\second-acceptance\task-sets\`、`assertions\`（及 `runs\`、`snapshots\`）负向读取须 ACCESS_DENIED，留只读证据入 Evidence Manifest。
- **W03** 实现 #1/#2/#3/#4/#5 读 tool 契约层（name/description/schema/annotation/错误转译），忠实 D02 §2.1–§2.5。
- **W04** 实现 #26 `erpnext_batch_status_get`：挂接 E02 `queryBatchStatus`，可见性边界（归属自身会话可查/他人不可见/管理员可查全量/不可主动回滚），对齐 E02 §6 + D02 §2.6。
- **W05** 确认并固定 #1 `filters` 可检索字段白名单：从 B01–B04 interface-facts + ERPNext DocType 字段确认逐对象精确清单（交付物 D03），与 D02 §2.1 口径核对；无法确定性取得按 §15 升级。
- **W06** 挂接 E01 白名单层（三层拦截第二层：`object_type` 硬编码九类、Link 字段目标枚举、#5 Supplier 独占）；后端经 mcp-service + MCP Business Caller 只读调用。
- **W07** 挂接 E02 机制：错误转译挂接统一错误形状；只读 tool 幂等/前置（写状态）/事后校验/批次写入标注「不适用」及理由。
- **W08** D02/D01/E01 对齐核对：逐 tool 与 D02 §2、D01 §1–§7、E01 permission-matrix/allowlist 一致，无清单外对象、无越界读写。
- **W09** 开发自检 S01–S10 + 回填 Evidence Manifest，提交待验收。

每项按 §11 交付物与 §12 自检逐项落地；原始证据脱敏后登记入 `docs/task-packages/F01/evidence-manifest.md`。6 个读 tool 的 annotation 统一为 `readOnly=true`/`destructive=false`/`idempotent=true`/`openWorld=false`，readOnly 与 idempotent 分别显式声明（D01 §3.4）。

## 交付物（§11）

D01 任务包（已冻结）、D02 `server/` 实现（骨架 + 迁入 E02 `lib/` 8 模块 + 6 读 tool + 白名单/机制挂接）、D03 #1 filters 白名单清单、D04 对齐核对记录、D05 开发自检记录、D06 Evidence Manifest、D07 登记表 F01 行（冻结时已更新，实施/验收期随状态追加）、D08 独立验收记录（归 Acceptor，不产出）。

## 停止与升级

命中 task.md §15 或总则 §6.15 任一条件（D02/D01/E01/E02 权威输入互相冲突、需要新增对象/tool/权限才能完成、必需对象不在允许清单、无法确定性取得 #1 filters 白名单、需读 C01b 才能完成、需改 D02 契约等）立即停止并报告，不得硬做。

## 状态

开工前把 F01 从「已冻结」转「实施中」，完成后转「待验收」（同步 task.md §17 状态记录 + 登记表 F01 行，操作人记 Claude/F01 实施上下文）。**禁止自行标「已通过」**——档位 2 独立验收是 Acceptor（gjg）的活，你不自验。

## 完成后汇报

前置条件核对结果、W02–W09 各项结论（6 个读 tool 是否与 D02 §2 逐项一致、白名单/机制挂接是否正确）、Evidence Manifest 是否完整、S01–S10 自检结果、是否触发停止条件、剩余限制与风险（尤其 #26 会话级归属与跨会话查旧批次不支持、框架级残余 Contact/Address/User 白名单兜底）。
