# F04 独立验收记录（D08）

> 文档性质：F04 v1.0 档位 3（完整）独立验收记录。Acceptor=gjg，独立于 Implementer（Claude，F04 独立实施上下文）。
> 验收方式：档位 3 独立验收以「公开契约口径（D02 §3/§6 / D01 / E01 / E02）+ 后端终态/接口实测」为准，Acceptor 逐 tool 核对实现与冻结契约、独立重跑自检、并补做真实后端接口冒烟（Implementer 未做真实后端写冒烟，见证据 EV-F04-008 及本记录 §3.7）。
> 边界声明：本次验收**未读取** `D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 的任何文件内容（未进入 C01b 冻结任务集正文/断言）。

## 1. 验收基本信息

| 字段 | 内容 |
|---|---|
| 任务包 | F04 库存与主数据维护（10 个写/只出 plan tool：#6–#12 主数据 + #23–#25 库存） |
| 版本 | v1.0 |
| 档位 | 档位 3（完整）；封存与下游影响记录 + Freeze Manifest 强制单独进行（总则 §7.1） |
| Acceptor | gjg（独立于 Implementer） |
| Acceptance Reviewer | 不适用（F04 为实施任务，正式验收由 G01 集成验收承担；F04 档位 3 独立验收以公开契约 + 后端终态/接口实测为准，不读 C01b 题） |
| 验收日期 | 2026-09-17 |
| 验收结论 | **通过（已封存）** |

## 2. 验收依据

- 冻结定义：`docs/task-packages/F04/task.md` §9（实现口径与挂接口径）、§10（不变量）、§12（自检方法）、§14（完成定义）、§15（停止条件）；
- 冻结快照：`docs/task-packages/F04/frozen/v1.0/task.md`（对比当前 `task.md`，仅状态流转 + §17 追加记录，冻结语义未动，见 §3.1）；
- 权威输入：D02 `tool-contract.md` §3（#6–#12）、§6（#23–#25）逐 tool 冻结口径；D01 `common-contract.md` §1–§7；E01 `permission-matrix.md`/`allowlist.md`/`confirmation-failclosed.md`/`roles.md`；E02 `implementation-contract.md` 与 `lib/`；C01a `object-scope.md`；B01/B04 `interface-facts.md`；F01 `task.md` 与 `server/` 骨架。

## 3. 独立复核结果

### 3.1 冻结完整性

- `diff` 冻结快照 `frozen/v1.0/task.md` 与当前 `task.md`：仅 3 处差异 —— ① 页头状态「已冻结 → 待验收」；② §1 状态「已冻结 → 待验收」；③ §17 追加两条状态记录（已冻结→实施中→待验收）。**冻结的目标/范围/权威输入/完成定义/不变量/禁止事项均未改动**，`frozen/v1.0/` 快照未动，快照哈希 `993d108f…` 与 Freeze Manifest 一致。
- 工作区改动面核对：新增 `server/` 10 写/只出 plan tool 模块 + `elicitation.js` + `write-common.js` + `registry.js` 尾部新增 + `backend.js` 写端点扩展 + `config.js` 锁单/fail-closed + `allowlist.js` 写对象枚举；新增 `docs/task-packages/F04/` 交付物文档（D03/D04/D05/D06）与 `evidence/`、`docs/task-records/freeze-manifests/F04-v1.0.md`。未改动上游规范、PRD、总则、D01/D02 契约、E01/E02 结论、F01 既有 6 读 tool 与 E02 `lib/` 8 模块、C01b 冻结任务集、`frozen/` 快照。

### 3.2 逐 tool 与 D02 §3/§6 核对（name/schema/annotation/错误转译/幂等/前置/事后/批次）

逐 tool 通读 `server/src/tools/` 下 10 个写/只出 plan tool handler，结论：

| tool | 核对结论 |
|---|---|
| #6 `erpnext_customer_create` | name/description/输入 schema（customer_name 必填、customer_group 必填、territory/customer_type/disabled 可选）/annotation（readOnly=false/destructive=true/idempotent=true）/前置断言（同名不存在·B01 F1 server 先查、customer_group 有效且非 is_group=1、territory 有效）/create 组 300s 指纹合并/不带 modified/写后回读/批次（同批=新客户）逐项一致 |
| #7 `erpnext_customer_update` | 必带 modified；前置（存在且启用、modified 一致、分类有效、customer_name 改名不在白名单）；指纹合并类 300s；前镜像+版本恢复批次；一致 |
| #8 `erpnext_supplier_create` / #9 `erpnext_supplier_update` | 同 #6/#7 结构，目标 Supplier、supplier_group 有效；一致 |
| #10 `erpnext_item_create` / #11 `erpnext_item_update` | #10 前置（item_code 同名不存在、item_group/stock_uom 有效）；#11 必带 modified、docstatus 经白名单阻断不可写（B01 F5）；一致 |
| #12 `erpnext_item_price_set` | 新增/修改判定（修改必带 modified）；前置（物料存在启用、价目表有效、生效区间不重叠·B01 F3 server 自建）；修改走 PUT、新增走 POST；写后回读价格语义；一致 |
| #23 `erpnext_stock_transfer_create` | 全自动免确认（仅 L3）、destructive=false（可逆草稿）；前置（stock_entry_type=material_transfer、items 非空 qty>0、源/目仓存在、源仓可用量≥调拨量·B04 F5 server 查 Bin）；create 组 300s；草稿→删除回滚；一致 |
| #24 `erpnext_stock_transfer_confirm` | 人确认、confirm 组 60s 状态断言兜底（命中已生效→already_in_target_state 幂等成功）；必带 modified；前置（草稿+modified 一致、源/目仓不同·B04 F5、源仓可用量仍满足）；经 `frappe.client.submit` 全量 doc（B04 F3）；写后回读 docstatus=1；无 cancel tool；一致 |
| #25 `erpnext_stock_reconciliation_plan` | 只出 plan（readOnly=true、无写入/确认/幂等/批次）；warehouse 有效前置；get_items as-of-time 读现状；输出客观 plan + 风险提示（B04 F7/F8）；一致 |

- annotation 统一 `readOnlyHint/destructiveHint/idempotentHint/openWorldHint` 四布尔显式；读 tool 不夹带写入；#23 destructive=false、#25 readOnly=true 与 D02 一致。

### 3.3 E01 确认/白名单/权限层挂接

- **人确认档 8 tool**（#6–#12、#24）经 `elicitation.requireConfirmation`：accept→写入、decline/cancel→零副作用、客户端未声明 elicitation→fail-closed（零写入，不降级）。#23 全自动仅 L3 免确认；#25 无写入。清单硬编码于 `elicitation.js` `HUMAN_CONFIRM_TOOLS`/`AUTO_TOOLS`。
- **三层拦截白名单**：`allowlist.js` 第二层硬编码 `WRITE_DOCTYPES`（Customer/Supplier/Item/Item Price/Stock Entry）、`WRITE_LINK_TARGETS`（引用允许清单 Customer Group/Supplier Group/Territory/Item Group/UOM/Price List/Warehouse）、`WRITABLE_FIELDS`/`IMMUTABLE_FIELDS`（统一排除 name/creation/owner/docstatus）；第三层能力一致性由各 handler 写前校验。无任意 DocType 字符串、无任意字段名、无清单外对象。
- **fail-closed**：`config.js` `LOCKED_BUSINESS` + `assertWriteEligible`（币种空/售卖价目表数量≠1 → 拒绝写入能力）；`index.js` `initWriteEligibility` 后端查询落地，后端不可达仍 fail-closed。
- **后端调用方**：统一 mcp-service + MCP Business Caller（凭据经环境变量注入，不落代码/实施区文件）。

### 3.4 E02 机制挂接

- **幂等**：`write-common.js` 进程级 `createIdempotencyStore` 单例；create 组/指纹合并类 300s、confirm 组 60s（`lib/idempotency.js` `WINDOW` 冻结值，`assertWindowNotWidened` 拒放宽）；`fingerprintOf` 稳定排序 + 行项目保序。
- **前置断言**：逐 tool async 编排（框架为同步断言，写 tool 用后端查询故手写编排，语义对齐 D01 §6.1 两层拆分：schema 校验不计入业务前置）。
- **事后回读**：写后回读终态逐 tool 手写 + 语义化断言，不一致报 `postcondition_failed`。
- **批次台账**：写后 `recordChange`+`complete`，会话级归属 `callerId(ctx)`；`#26` 可见性沿用 F01 `batch-status-get`（无 rollback 入口）。
- **错误转译**：`lib/errors` 统一形状（isError/code/message/retryable/details）+ `translate.js` 后端原生异常→语义码（PermissionError→permission_denied、DoesNotExistError/LinkValidationError→precondition_failed、DuplicateEntryError→duplicate_name、TimestampMismatchError→concurrency_conflict 等），不裸抛堆栈；幂等命中非错误（idempotent_replay/already_in_target_state）。

### 3.5 后端写端点落地（B01/B04 冻结事实）

- `backend.js` 写端点仅 `POST /api/resource/{doctype}`、`PUT /api/resource/{doctype}/{name}`、`POST /api/method/frappe.client.submit`（#24 全量 doc，非 name 串）、`GET /api/method/…get_items`（#25 读现状）；**无 DELETE、无 `run_method:submit`、无 `frappe.client.cancel`**（草稿删除回滚/已生效调拨取消归管理员运维，mcp-service 无 delete DocPerm）。后端不可达不自动重试写（返回 `backend_unavailable`，无 retry 循环）。

### 3.6 自检独立重跑

| 检查 | 独立重跑结果 |
|---|---|
| `node server/test/selftest.js`（S01–S17） | **118 通过 / 4 失败**（退出码 1）；4 失败项均为 S01 隔离负向自证 |

- **S01 说明（非缺陷）**：S01 是「Implementer 会话对 C01b `task-sets/`/`assertions/`/`runs/`/`snapshots/` 负向读取须 ACCESS_DENIED」的负向自证。本次验收以 Acceptor（gjg）账户运行，`D:\second-acceptance` 对 Acceptor 按设计可读，故「读取被拒」断言正确地**不成立**，4 项报 FAIL —— 与 F01 验收记录 §3.6 完全同构，证明隔离是**账户级**、仅在受限 Implementer 账户（b00-impl）下生效。
- 其余 **S02–S17（118 项）在 Acceptor 账户下独立重跑全部通过**，与实施侧「120/120」证据一致（差异仅为 S01 的账户隔离表现），非采信实施侧自证。
- 注：自检从冻结 §12 的 S01–S12 **扩展**为 S01–S17（增补 S11–S17 写 tool 契约/白名单/确认/幂等/前置/事后/fail-closed 检查）。属增补性扩展，S01–S12 冻结检查项仍全过，非放宽。

### 3.7 真实后端接口实测（Acceptor 补做）

Implementer 证据（`evidence-manifest.md` §3、`dev-selftest.md` §4.3）明确「未对真实后端执行写冒烟（无写凭据），写后端调用以内存 mock 验证机制」。Acceptor 以 mcp-service 凭据（容器 `/tmp/mcp_token.txt`，运行时注入，未打印凭据值）对真实后端 `localhost:8080` 补做接口冒烟：

| 检查 | 实际结果 | 结论 |
|---|---|---|
| mcp-service 认证（`frappe.auth.get_logged_user`） | 200，返回 `mcp-service@erpnext.local` | 通过 |
| fail-closed 前置（Company/gjg.default_currency 非空） | 200，default_currency=CNY | 通过 |
| fail-closed 前置（selling 且 enabled 价格表数量=1） | 200，count=1 | 通过 |
| Customer 真实创建（POST，mcp-service） | 200，落地并回读 customer_name 一致 | 通过 |
| 错误转译（无效 customer_group → LinkValidationError 417） | 417，与 translate 表一致（→precondition_failed） | 通过 |
| 越权拒绝（mcp-service DELETE Customer） | 403（无 delete DocPerm，E01 §3 最小权限） | 通过 |
| 重名行为（重复 customer_name POST） | 200（后端不拒 Customer 重名，**确认 B01 F1**） | 通过（印证 server 前置查重必要且正确） |

- 实测确认 B01 F1「Customer 后端不拒重名」→ `customer_create` 的 server 侧 `getCount` 前置查重是必要的、口径正确的。

复验阶段补齐剩余写 tool 真实后端冒烟（mcp-service 写、Administrator 清理；造库存经 Material Receipt 带 `basic_rate` + submit）：

| 检查 | 实际结果 | 结论 |
|---|---|---|
| #8 Supplier create / #10 Item create / #12 Item Price set | 200，落地并回读一致 | 通过 |
| #23 调拨草稿（Material Transfer，源仓有库存后） | 200，草稿 docstatus=0 | 通过 |
| #24 `frappe.client.submit` 全量 doc（B04 F3） | 200，回读 docstatus=1 | 通过 |
| #24 SLE 源仓 -10 / 目标仓 +10（B04 F6） | SLE 两行 actual_qty=-10/+10 | 通过 |
| #25 `get_items`（posting_date/time+company 齐备） | 200，返回现状 | 通过 |
| #25 默认路径（省略 posting_date/time → Bin 读现状） | 200，Bin 行返回（修复后） | 通过 |
| 已提交 STE REST DELETE | 417（**确认 B04 F10**，须快照恢复归零） | 通过（印证） |

- 测试残留：`F04ACC-*` 客户与 `F04RT-*` 物料/STE 均经 Administrator 删除或 `frappe.client.cancel` 反转库存效应；已取消 STE/SLE 因 B04 F10 无法 REST 删除，属预期，零残留以快照恢复（见 §6 运营事项）为准。

## 4. 完成定义（§14）逐项判定

| 完成定义 | 判定 |
|---|---|
| 全部前置条件已验证（含隔离自证、登记表 F04 行上游依赖补 F01） | 通过（§4 前置已回填；隔离自证见 §3.6） |
| 工作项与交付物全部完成（W01–W10；D01–D08） | 通过（D01–D08 均产出；D08 本记录结论「通过」） |
| 10 tool 与 D02 §3/§6、D01、E01、E02 逐项一致，无清单外对象/越界读写/机制绕过 | 通过（§3.2–§3.4 静态核对） |
| 人确认档 8 tool 未经有效确认零写入；幂等窗口期不放宽；写后回读终态；批次可见性正确 | 通过（静态 + S13/S14/S16 独立重跑） |
| 可写字段白名单（D03）与 D02 §3/§6 逐 tool 口径一致 | 通过（D03 + allowlist.js + S12） |
| 写操作不变量均有证据（写前确认/写后回读/后端不可达不重试/不承诺删除已生效调拨/盘点单据/测试后快照归零） | 通过（机制实现 + §3.7 真实后端 10 tool 全覆盖实测；快照归零见 §6 运营事项） |
| 开发自检通过（S01–S12） | 通过（S01–S17 独立重跑 S02–S17 全过；S01 账户级隔离说明见 §3.6） |
| Evidence Manifest 完整且可逐项追溯 | 通过（EV-F04-001–008；但 EV-F04-008 自述 mock 验证、非真实后端） |
| 未修改禁止范围 | 通过（§3.1；未读 C01b、未实现 #13–#22、未改 F01 6 读 tool 与 E02 lib/） |
| 剩余限制和风险已记录 | 通过（dev-selftest §4） |
| 独立验收通过（档位 3），封存与下游影响记录完成 | **通过（本记录，档位 3 独立验收通过；封存 + 下游影响记录 + Freeze Manifest 待回填 `task.md` §18，见 §6）** |

## 5. 发现项

### 5.1 首轮阻断项（已整改并复验通过）

1. **index.js 残留 F01「只读 6 tool」口径**：`server/index.js` 头注（原「F01 … 6 个只读 tool / 本 server 不提供任何写端点」）与未知 tool 错误文案（原「仅提供 6 个只读 tool」）已改为 16 tool 口径（6 读 + 10 写/只出 plan）。**已修复，复验通过。**
2. **档位 3「后端终态/接口实测」覆盖不完整**：Acceptor 以 mcp-service 凭据对真实后端补做全覆盖写冒烟（见 §3.7），#8/#10/#12 create、#23 调拨草稿、#24 `frappe.client.submit` 全量 doc（docstatus=1 + SLE 源 -10/目 +10）、#25 get_items 均实测通过。**已补齐，复验通过。**

### 5.2 复验新增阻断项（已修复）

3. **#25 `posting_date`/`posting_time` 默认值缺陷**：D02 §6.3 将二者定义为可选，但后端 `get_items` 的 `posting_date`/`posting_time` 为无默认值位置参数（B04 F11），省略时 #25 默认路径经 `get_items` 透传 undefined → 后端 500 TypeError → `backend_unavailable`，即 #25 在缺省参数下失败。**修复**：`stock-reconciliation-plan.js` 在 `posting_date`+`posting_time` 齐备时走 `get_items`（as-of-time），缺省时改走 Bin 读现状（D02 §6.3「Bin/SLE 或 get_items」授权）；`backend.getItems` 注释同步注明该位置参数约束。**已修复，复验通过**（自检 118 项 + mcp-service 实测 Bin 读 200）。

### 5.3 非阻断提示项

1. **`/tmp/mcp_token.txt` 含「token 」前缀**：容器内 token 文件为 `token <api_key>:<api_secret>`（37 字符），而 `config.js`/`backend.js` 期望分离的 `ERP_API_KEY`/`ERP_API_SECRET` 并拼 `'token '+key+':'+secret`。部署注入 env 时须剥离「token 」前缀并按 `:` 拆 key/secret，否则双前缀 → 403。此为 F01 既有部署口径（F01 只读已用同一凭据），非 F04 代码缺陷，但应在运行说明中明确注入方式。
2. **自检扩展 S01–S12 → S01–S17**：属增补写 tool 检查，S01–S12 冻结项仍全过，非放宽；建议后续 Freeze Manifest 或登记表注记「自检覆盖 S01–S17」。
3. **测试残留清理**：Acceptor 冒烟产生的 `F04ACC-*` 客户与 `F04RT-*` 物料/STE 已删除或 `frappe.client.cancel` 反转库存效应；已取消 STE/SLE 因 B04 F10 无法 REST 删除，属预期，零残留以快照恢复归零（见 §6 运营事项）。

## 6. 结论

F04 v1.0 的 10 个写/只出 plan tool 实现**忠实于 D02 §3/§6 契约与 D01/E01/E02 冻结口径**：逐 tool name/schema/annotation/错误转译/幂等窗口/前置断言/事后回读/批次行为一致，确认层（8 人确认 tool + #23 全自动 L3 + #25 只出 plan + fail-closed）、白名单层（目标对象/Link 目标/可写字段硬编码枚举）、机制层（300s/60s 幂等、写后回读、会话级批次、后端不可达不重试）与后端写端点（POST/PUT/submit 全量 doc、无 DELETE/run_method）均正确落地；冻结快照完整；自检独立重跑 S02–S17 全过；Acceptor 真实后端冒烟 10 tool 全覆盖（认证/fail-closed/主数据 create/#23 草稿/#24 submit + SLE/#25 get_items 与 Bin 回退/错误转译/越权拒绝），并印证 B01 F1、B04 F3/F6/F10。未读 C01b 冻结任务集正文/断言、未实现 #13–#22、未改 F01 既有 6 读 tool 与 E02 `lib/`。

**Acceptor（gjg）独立验收结论：通过（已封存）。** 首轮两项阻断项（index.js 文案、后端实测覆盖）与复验新增的 #25 默认值缺陷均已整改并复验通过；10 个写/只出 plan tool 经静态核对 + 独立重跑自检（S02–S17 118 项）+ 真实后端全接口实测全部达标，无清单外对象、无越界读写、无机制绕过、无反向放宽。封存 + 下游影响记录见 `task.md` §18，实施期产出哈希见 Freeze Manifest F04-v1.0.md。

> 封存与下游影响记录：按总则 §7.1，F04 档位 3 封存 + 下游影响记录 + Freeze Manifest 强制单独进行。封存时须回填 `task.md` §18 下游影响记录（F04 为 F02 提供 10 写/只出 plan tool 与复用骨架：入口/注册表只增不改、串行追加 #13–#22、以 mcp-service 为后端调用方、挂接 E01 确认/E02 机制），并在 Freeze Manifest 登记实施期产出哈希。封存前的运营事项：① 补一张 post-E01 快照后以快照恢复归零（现快照为 pre-E01，直接恢复会清掉 mcp-service 账号/角色）；② 验收冒烟产生的已取消 STE/SLE 与 `F04RT-` 物料因 B04 F10 无法 REST 删除，属预期，待快照恢复归零。
