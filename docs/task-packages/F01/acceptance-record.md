# F01 独立验收记录（D08）

> 文档性质：F01 v1.0 档位 2（标准）独立验收记录。Acceptor=gjg，独立于 Implementer（Claude，F01 独立实施上下文）。
> 验收方式：F01 为只读能力，不接触正式验收题、隐藏数据或终态断言；验收以「公开契约口径（D02 §2 / D01 / E01 / E02）+ 后端终态/接口实测」为准，Acceptor 逐 tool 核对实现与冻结契约，并独立重跑自检（非采信实施侧自证）。
> 边界声明：本次验收**未读取** `D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 的任何文件内容（仅 ls 目录名核对隔离目录存在，未进入正文）。

## 1. 验收基本信息

| 字段 | 内容 |
|---|---|
| 任务包 | F01 通用查询能力（6 个只读 tool） |
| 版本 | v1.0 |
| 档位 | 档位 2（标准）；终态「已通过」，封存不强制单独进行（封存与下游影响记录并入 P00 总控或直接下游 F04，总则 §7.1） |
| Acceptor | gjg（独立于 Implementer） |
| Acceptance Reviewer | 不适用（F01 不接触正式验收题、隐藏数据或终态断言） |
| 验收日期 | 2026-09-16 |
| 验收结论 | **通过** |

## 2. 验收依据

- 冻结定义：`docs/task-packages/F01/task.md` §9（实现口径与挂接口径）、§10（不变量）、§14（完成定义）、§15（停止条件）；
- 冻结快照：`docs/task-packages/F01/frozen/v1.0/task.md`（对比当前 `task.md`，仅追加状态记录与实施期验证回填，冻结语义未动，见 §3.1）；
- 权威输入：D02 `tool-contract.md` §2.1–§2.6（6 读 tool 冻结口径）、D01 `common-contract.md` §1–§7、E01 `permission-matrix.md`/`allowlist.md`、E02 `implementation-contract.md` 与 `lib/`、C01a `object-scope.md`、B01–B04 `interface-facts.md`。

## 3. 独立复核结果

### 3.1 冻结完整性

- `diff` 冻结快照 `frozen/v1.0/task.md` 与当前 `task.md`：仅 3 处差异 —— ① 页头状态「已冻结 → 待验收」（状态流转）；② §4 前置第 9/10 条「待实施前验证 → 已验证」（实施期回填）；③ §17 追加两条状态记录（已冻结→实施中→待验收）。**冻结的目标/范围/权威输入/完成定义/不变量/禁止事项均未改动**，`frozen/v1.0/` 快照未动。
- 工作区改动面核对：新增 `server/`（骨架 + lib 8 模块 + 6 读 tool + 白名单/错误转译）、新增 `docs/task-packages/F01/` 五份交付物文档与 `evidence/`；修改 `docs/task-packages/F01/task.md`（状态记录）与 `docs/governance/任务包登记表.md` F01 行。未改动上游规范、PRD、总则、D01/D02 契约、E01/E02 结论、C01b 冻结任务集、`frozen/` 快照。

### 3.2 逐 tool 与 D02 §2 核对（name / schema / annotation / 错误转译 / 批次行为）

| tool | 核对结论 | 证据 |
|---|---|---|
| #1 `erpnext_document_search` | name/description/输入 schema（object_type 九类、filters 仅该对象可检索字段、page/page_size、detail）/输出 `{items,total,page,page_size,truncated}`/annotation/错误码（invalid_argument·result_set_overflow·permission_denied·backend_unavailable）逐项一致 | `server/src/tools/document-search.js` + `allowlist.js`；S02/S03/S04/S06/S10 |
| #2 `erpnext_document_get` | object_type 同九类、object_id 语义标识、404→precondition_failed、输出含状态与 modified、无低层标识符；一致 | `document-get.js`；S04.4/S04.5 |
| #3 `erpnext_stock_level_query` | 目标 Bin、item_code/warehouse、LinkValidationError 417→precondition_failed、actual/available/reserved 语义化；一致 | `stock-level-query.js`；S04.6 |
| #4 `erpnext_stock_ledger_query` | 目标 SLE、item_code/warehouse/from_date/to_date、流水语义化（change_qty/balance_qty/source_document，SR 以 qty_after_transaction=新基线如实呈现）；一致 | `stock-ledger-query.js`；S04.7 |
| #5 `erpnext_supplier_search` | 目标仅 Supplier（无 object_type）、keyword/supplier_group、supplier_group 417→precondition_failed；一致 | `supplier-search.js`；S04.8 |
| #26 `erpnext_batch_status_get` | batch_id 可选、无后端 DocType、可见性边界（归属可查/他人 permission_denied/管理员全量/不可回滚）、batch_not_found；一致 | `batch-status-get.js` + `lib/batch-status.js`；S07 |

- annotation 统一 `readOnlyHint=true`/`destructiveHint=false`/`idempotentHint=true`/`openWorldHint=false`，readOnly 与 idempotent 分别显式声明（D01 §3.4）。

### 3.3 E01 白名单层挂接

- `object_type` 硬编码九类（`OBJECT_TYPE_TO_DOCTYPE`，排除 supplier/bin/stock_ledger_entry）；#3/#4/#5 目标对象硬编码 Bin/SLE/Supplier；引用允许清单九类 + Link 字段目标枚举（Warehouse/Supplier Group）；`FILTER_FIELDS` 逐对象可检索字段白名单（交付物 D03）；框架残余 Contact/Address/User 由 object_type 枚举切断（E01 §18.4）。**无清单外对象、无任意 DocType、无任意字段名** —— 与 E01 permission-matrix/allowlist 一致。

### 3.4 E02 机制挂接

- 错误转译挂接 `lib/errors` 统一错误形状（`isError/code/message/retryable/details`），后端原生异常 → 语义化 code（PermissionError→permission_denied、DoesNotExistError/LinkValidationError→precondition_failed 等），不裸抛堆栈/后端原生异常名；失败路径不静默成功。
- #26 挂接 `queryBatchStatus`，可见性边界正确、无 rollback 入口；批次归属为会话级、内存不落库（E02 §5.5/B00 身份结论），`adminResolver` 缺省 `isAdmin=false`（未接后端判定，如实记录为残余限制）。
- 6 读 tool 均无写入，幂等/前置（写状态）/事后校验/批次写入四项机制「不适用」，未挂接 `fingerprintOf`/`createIdempotencyStore`/`assertPreconditions`/`checkReadBack`/`createBatchLedger`（S08 静态核对零命中）。

### 3.5 只读口径（后端终态/接口实测）

- 后端客户端仅 `GET /api/resource/{doctype}` 与 `GET /api/method/frappe.client.get_count`，全 `server/` 源码无 POST/PUT/DELETE/run_method/submit/cancel（S09.2 静态扫描 + 人工通读 `backend.js`/`index.js`/6 tool handler）。
- 真实后端只读冒烟（evidence-manifest EV-F01-008 / dev-selftest §3）：`initialize`+`tools/list` 返回 6 tool；空基线下检索/余量/流水/供应商/批次均返回语义化空结果；`document_get` 不存在对象→`precondition_failed`；`document_search(object_type=supplier)`→`invalid_argument`。全 GET、未改数据库状态。正式后端调用方为 mcp-service + MCP Business Caller（凭据经环境变量注入，不入代码/不入实施区文件）。

### 3.6 自检独立重跑

| 检查 | 独立重跑结果 |
|---|---|
| `node server/test/selftest.js`（S01—S10） | S02–S10 全过（71 项）；S01 隔离 4 项在 Acceptor 账户下按预期不成立（见下） |

- **S01 说明（非缺陷）**：S01 是「Implementer 会话对 C01b `task-sets/`/`assertions/`/`runs/`/`snapshots/` 负向读取须 ACCESS_DENIED」的**负向自证**。本次验收以 Acceptor（gjg）账户运行，`D:\second-acceptance` 对 Acceptor 按设计可读，故「读取被拒」断言正确地**不成立**，4 项报 FAIL —— 这恰好证明隔离是**账户级**、仅在受限 Implementer 账户（b00-impl）下生效。Implementer 捕获证据 `evidence/selftest-S01-S10.txt` 显示 S01 在 b00-impl 下 4/4 PASS、合计 75/75，与账户隔离结论一致。
- 其余 S02–S10（71 项）在 Acceptor 账户下独立重跑全部通过，与实施侧证据一致，非采信实施侧自证。

## 4. 完成定义（§14）逐项判定

| 完成定义 | 判定 |
|---|---|
| 全部前置条件已经验证（含隔离自证） | 通过（§4 前置 9/10 已回填已验证；隔离自证见 §3.6） |
| 工作项与交付物全部完成 | 通过（W01–W10；D01–D08） |
| 6 读 tool 与 D02 §2 / D01 §1–§7 / E01 permission-matrix/allowlist 逐项一致，无清单外对象、无越界读写 | 通过（§3.2–§3.4） |
| 白名单枚举硬编码、E01 白名单层与 E02 机制挂接正确；#1 filters 白名单与 D02 §2.1 口径一致 | 通过（§3.3、D03、S10） |
| 只读不变量均有证据（未改数据库状态、无写入、无批次、无回滚） | 通过（§3.5、S08/S09） |
| 开发自检通过（S01–S10） | 通过（75/75，实施侧证据 + Acceptor 独立重跑 S02–S10） |
| Evidence Manifest 完整且可逐项追溯 | 通过（EV-F01-001–008，映射 W02–W09/S01–S10） |
| 未修改禁止范围（未读 C01b、未实现写 tool、未扩大范围） | 通过（§3.1、S08/S09；未读 C01b 正文） |
| 剩余限制和风险已记录 | 通过（dev-selftest §4：会话级归属/管理员判定未接后端/框架残余白名单兜底/本包只读无批次） |
| 独立验收通过（档位 2） | 通过（本记录） |

## 5. 发现项（非阻断）

- **S01 在 Acceptor 账户下不成立**：见 §3.6 说明，属账户级隔离的预期表现，非缺陷。若需在 Acceptor 账户下复现 75/75，应改用受限账户（b00-impl）运行 selftest；实施侧已留存该账户下的 75/75 证据。
- **`#3` 可用量字段命名**：`stock-level-query.js` 将 `Bin.projected_qty` 映射为 `available_qty`（可用量），D02 §2.3 输出口径为「actual_qty（实际）/available（可用）/reserved（预留）等余量字段（语义化名称）」。该命名在 D02「语义化名称」授权范围内，`detail` 模式保留 `projected_qty` 原始字段，不混淆；建议 F04 接入时如需精确「可售量」口径再核对 B04 冻结事实。**不构成验收阻断。**
- **`page_size` 上限截断未显式附提示**：`common.js` `paginate()` 计算 `clamped` 标志但各 handler 未将「请求 page_size 超上限已被截断」作为独立 hint 返回（结果集 `truncated=true` 时的「翻页/收敛」提示已正确返回）。D02 §2.1 的「超出触发截断 + 分页提示」指向结果集截断（已满足），page_size 钳制本身属合理归一化，且返回值 `page_size` 已反映钳制后数值。**不构成验收阻断。**

## 6. 结论

F01 v1.0 的 6 个只读 tool（`server/` 骨架 + 迁入 E02 `lib/` 8 模块 + E01 白名单层挂接 + E02 机制挂接）与 D02 §2.1–§2.6、D01 §1–§7、E01 permission-matrix/allowlist 逐项一致，无清单外对象、无越界读写、无夹带写入、无通用 CRUD 或任意代码执行面；只读不变量有证据支撑；冻结快照完整；自检独立重跑与实施侧证据一致；未读 C01b 冻结任务集正文/断言、未实现写 tool、未扩大范围。§14 完成定义全部满足，未触发 §15 停止条件。

**Acceptor（gjg）独立验收通过（档位 2，终态「已通过」）。**

> 封存与下游影响记录：按总则 §7.1，F01 档位 2「封存不强制单独进行」，本次不单独封存，封存与下游影响记录（`server/` 骨架 + 6 读 tool + 白名单层为 F04 直接下游提供查询底座，F04/F02 须复用 `server/` 骨架、入口/注册表只增不改、以 mcp-service 为后端调用方）并入 P00 总控或直接下游 F04；`task.md` §18 保持预留，不在此回填。
