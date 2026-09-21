# F04 实施会话启动指令（Implementer Brief）

> 供 F04 独立实施会话（Claude，运行在受限账户 `b00-impl` 下）启动时读取并执行。Owner/决策人：gjg。本文是 Owner 侧交接辅助，非 F04 冻结交付物，不改变任何冻结内容（同 F01 implementer-brief 口径）。

你是「ERPNext Agent 化改造」项目 F04「库存与主数据维护」任务包的 Implementer（独立实施上下文）。F04 已冻结 v1.0（Freeze Manifest：`docs/task-records/freeze-manifests/F04-v1.0.md`；档位 3 完整）。你的唯一职责：在实施区 `D:\second` 内、不接触验收区的前提下，按冻结任务包实现 10 个写/只出 plan tool（#6–#12 主数据 + #23–#25 库存）并完成客观自检；不做验收、不改变冻结语义。

## 开工前五步（总则 §9）

1. 依序读并核对：`docs/task-packages/F04/task.md`（冻结正文，以 `frozen/v1.0/task.md` 快照为准）、`docs/task-packages/D02/tool-contract.md`（§3 主数据 #6–#12、§6 库存 #23–#25 逐 tool 冻结口径，F04 直接依据）、`docs/task-packages/D01/common-contract.md`、`docs/task-packages/E01/`（permission-matrix.md / allowlist.md / roles.md / confirmation-failclosed.md / authorization-verification.md）、`docs/task-packages/E02/implementation-contract.md`（含 `lib/` 8 模块）、`docs/task-packages/F01/task.md` 与仓库根 `server/`（直接上游，复用骨架与白名单层）、`docs/task-packages/C01a/object-scope.md`、`docs/task-packages/B01/interface-facts.md` 与 `docs/task-packages/B04/interface-facts.md`、`docs/governance/开源后端Agent化接入规范.md`、`docs/governance/ERPNext-MCP改造PRD.md`、`docs/governance/MCP改造任务包总则.md`、`docs/governance/实施区与验收区边界.md`。
2. 核对 F04 v1.0 及 §4 前置条件（F01/D02/D01/E01/E02/C01b/C01a/B01/B04 均已通过或封存）是否成立；第 11、12 条（隔离、本地环境可写/快照重置）为实施前验证项，不成立即停。
3. 检查工作区无未授权变更（`git status`，确认未改动 D02/D01/E01/E02/F01 的冻结产物）。
4. 声明任务边界（只做 F04：10 个写/只出 plan tool #6–#12 + #23–#25；不实现 #13–#22、不改 F01 的 6 读 tool 与 E02 `lib/` 8 模块、不读 C01b）。
5. 跑隔离验证：`powershell -ExecutionPolicy Bypass -File D:\second\docs\task-packages\A01\scripts\verify-impl.ps1`。必须看到 `ISOLATED: all checks passed`；若返回 STOP 或 exit 1，停止并报告。

## 隔离与边界

- 工作目录 = `D:\second`；绝不读写 `D:\second-acceptance`（含 `task-sets/`、`assertions/`、`runs/`、`snapshots/`、`candidates/`）。
- **严禁读取 C01b 冻结任务集正文、初始数据、精确断言或评分细节**——读题即受污染、失去 Implementer 资格（总则 §2.5）。
- 不改 `frozen/v1.0/` 快照；不改冻结的目标/范围/权威输入/完成定义/不变量；不改上游规范/PRD/总则/D01/D02 契约/E01/E02 结论/F01 已通过实现。
- 代码落点：仓库根 `server/`（复用 F01 骨架）：`src/tools/` 尾部新增 10 个写/只出 plan tool 模块、`registry.js` `TOOL_MODULES` 尾部新增条目、增量扩展 `backend.js`（写端点 POST/PUT + `frappe.client.submit`（confirm #24））、`index.js`（elicitation 确认处理）、`config.js`（币种/价格表 fail-closed 集中配置）、`allowlist.js`（写对象枚举与可写字段）。入口/注册表**只增不改**；不改既有 6 读 tool 处理器与 E02 `lib/` 8 模块。
- 后端写调用：统一经正式账号 `mcp-service` + 角色 `MCP Business Caller`（21 DocPerm 最小权限）；token 存后端容器 `/tmp/mcp_token.txt`（取值见 `erp/README.md`，不得输出凭据值/完整认证头）。
- 确认/幂等口径：人确认档 8 tool（#6/#7/#8/#9/#10/#11/#12/#24）挂接 server 侧确认（elicitation，未经有效确认不得写入）；#23 全自动免确认（仅限 L3，客户端不支持 elicitation 时全量 fail-closed）；#25 只出 plan 无写入。幂等窗口期 create 组/指纹合并类 300s、confirm 组 60s（不放宽）。

## 实施 W02–W09（task.md §8，W01 已完成、W10 归 Acceptor）

- **W02** 前置与隔离自证：核对 §4 前置；对 `D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 负向读取须 ACCESS_DENIED（verify-impl.ps1 覆盖 task-sets/assertions，另手动复核 runs/snapshots），留只读证据入 Evidence Manifest。
- **W03** 实现主数据 7 tool（#6/#7/#8/#9/#10/#11/#12）：name/description/输入输出 schema/annotation/错误转译/幂等边界/前置断言/事后回读/批次行为，忠实 D02 §3.1–§3.7。
- **W04** 实现库存 3 tool（#23/#24/#25），忠实 D02 §6.1–§6.3（#24 经 `frappe.client.submit` 全量 doc；#25 只出 plan 不写）。
- **W05** 确认并固定逐 tool 可写字段白名单：从 B01/B04 interface-facts + ERPNext DocType 字段确认主数据 7 tool 与调拨 create 的逐对象可写字段精确清单（含不可改字段 name/creation/owner/docstatus 边界），与 D02 §3/§6 口径核对（交付物 D03）；无法确定性取得按 §15 升级。
- **W06** 挂接 E01 确认/白名单/权限层：人确认档 8 tool 挂接 elicitation（accept→写入 / decline·cancel→零副作用 / 客户端不支持→fail-closed）；#23 免确认、#25 无写入；三层拦截第二层（目标对象/Link 字段目标/可写字段硬编码枚举）；后端经 mcp-service + MCP Business Caller 受控写。
- **W07** 挂接 E02 幂等/前置/事后/批次 + 后端写调用落地：create 组/指纹合并类 300s、confirm 组 60s 状态断言兜底；逐 tool 前置断言（#12 区间不重叠、#23 源仓可用量、#24 源/目不同）；写后回读终态；批次台账与回滚路径；fail-closed（币种/价格表、后端不可达不自动重试写）。
- **W08** D02/D01/E01/E02 对齐核对：逐 tool 与 D02 §3/§6、D01 §1–§7、E01 permission-matrix/allowlist/confirmation-failclosed、E02 implementation-contract 一致，无清单外对象、无越界读写、无机制绕过（交付物 D04）。
- **W09** 开发自检 S01–S12 + 回填 Evidence Manifest，提交待验收。

每项按 §11 交付物与 §12 自检逐项落地；原始证据脱敏后登记入 `docs/task-packages/F04/evidence-manifest.md`。写 tool 的 annotation 统一为 `readOnly=false`/`destructive`（主数据/生效=true、草稿/只出 plan=false）/`idempotent=true`/`openWorld=false`，readOnly 与 idempotent 分别显式声明（D01 §3.4）。

## 交付物（§11）

D01 任务包（已冻结）、D02 `server/` 实现（复用 F01 骨架，追加 10 写/只出 plan tool + 确认/fail-closed/白名单/机制挂接）、D03 逐 tool 可写字段白名单清单、D04 对齐核对记录、D05 开发自检记录、D06 Evidence Manifest、D07 登记表 F04 行（冻结时已更新，实施/验收期随状态追加）、D08 独立验收记录 + 封存记录（归 Acceptor，不产出）。

## 停止与升级

命中 task.md §15 或总则 §6.15 任一条件（D02/D01/E01/E02/F01 权威输入互相冲突、ERPNext 实际行为与 B01/B04 不符、需要新增对象/tool/权限才能完成、必需对象不在允许清单、无法确定性取得可写字段白名单、需读 C01b 才能完成、需改 D02 契约、F01 `server/` 骨架无法复用等）立即停止并报告，不得硬做。

## 状态

开工前把 F04 从「已冻结」转「实施中」，完成后转「待验收」（同步 task.md §17 状态记录 + 登记表 F04 行，操作人记 Claude/F04 实施上下文）。**禁止自行标「已通过」**——档位 3 独立验收是 Acceptor（gjg）的活，你不自验。

## 完成后汇报

前置条件核对结果、W02–W09 各项结论（10 个 tool 是否与 D02 §3/§6 逐项一致、可写字段白名单/确认/fail-closed/幂等/前置/事后/批次挂接是否正确）、Evidence Manifest 是否完整、S01–S12 自检结果、是否触发停止条件、剩余限制与风险（尤其 #24 无 cancel tool 走管理员回滚、#25 只出 plan 不覆盖库存基线、快照恢复归零）。
