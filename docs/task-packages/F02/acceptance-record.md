# F02 独立验收记录（Acceptor gjg · 档位 3）

> 文档性质：F02 交付物 D08，档位 3 独立验收记录（Acceptor 独立于 Implementer，不采信实施侧自证，自行重跑）。
> 版本：v1.0；验收日期：2026-09-17；Acceptor：gjg。
> 验收依据：公开契约（D02 §4/§5、D01、E01 permission-matrix/allowlist/roles/confirmation-failclosed、E02 implementation-contract）+ 后端终态/接口实测；不读 C01b 冻结任务集正文/断言/初始数据/评分细节。
> 隔离声明：本验收会话未读取 `D:\second-acceptance\task-sets\`、`assertions\`、`runs\`、`snapshots\` 的任何文件内容（仅 selftest.js 的 S01 隔离自证调用了 `fs.readdirSync` 做目录列举以判 ACCESS_DENIED，未进入文件正文）。

---

## 1. 结论

**独立验收通过（档位 3，无阻断项）**。F02 的 10 个销售/采购写 tool（#13–#22）与 D02 §4/§5 契约、D01 §1–§7、E01 权限/白名单/确认/fail-closed、E02 幂等/前置/事后/批次机制逐项一致；无清单外对象、无越界读写、无机制绕过、无反向放宽。可进入封存（回填 task.md §18 + Freeze Manifest）。

验收覆盖：冻结完整性、静态核对（10 tool 逐项）、白名单/确认/fail-closed、独立重跑 selftest、独立重跑真实后端冒烟、越权拒绝、两处变更终态核实，共 7 项，全部通过。

---

## 2. 逐项验收结果

| # | 验收项 | 方法 | 结果 |
|---|---|---|---|
| 1 | 冻结完整性 | `sha256sum docs/task-packages/F02/frozen/v1.0/task.md` 与 Freeze Manifest F02-v1.0 核对 | ✅ 一致（`7dbe78357890ecde724d415f19807f1e7e88ecf80fd011a38c6111435a733c63`） |
| 2 | 静态核对（10 tool） | 逐行审读 `server/src/tools/{sales-order,purchase-order,purchase-receipt,delivery-note}-*.js` + `allowlist.js`/`backend.js`/`elicitation.js`/`write-common.js`/`registry.js`/`lib/*`，对照 D02 §4/§5 | ✅ 无漂移、无反向放宽（详见 §3） |
| 3 | 白名单/确认/fail-closed | 静态 + selftest S24 + realsmoke | ✅ 人确认档 6 tool 未经确认零写入；全自动档 4 tool 仅 L3；币种/价格表 fail-closed；Account/Cost Center 仅 read+select |
| 4 | 独立重跑自检 | `node server/test/selftest.js` | ✅ 155 通过 / 4 失败（4 项均为 S01 隔离自证，非受限环境环境性，见 §4） |
| 5 | 独立重跑真实后端冒烟 | `node server/test/realsmoke.js`（mcp-service token 驱动） | ✅ 13 通过 / 0 失败（覆盖 #13–#22 全链路，见 §4） |
| 6 | 越权拒绝 | 经 mcp-service token 直连后端 REST 写/删 | ✅ 12/12 全 403 `PermissionError`（含认证自证 200，见 §4） |
| 7 | 两处变更终态核实 | ① DB 查 `tabDocPerm`；② 审读 `server/index.js` | ✅ ① `MCP Business Caller` DocPerm=23，Account/Cost Center read=1 select=1 write=0；② 应答路由读 `msg.result.action` |

---

## 3. 静态核对要点（10 tool 逐项）

### 3.1 name / schema / annotation

10 个 tool 的 name 与 D02 §1 总表逐字一致；输入 schema 逐项核对：

- **#13/#16（create，全自动）**：必填 `customer`/`supplier` + `items[]`（行 `item_code`+`qty>0`+`warehouse` 可选）；#16 额外必填 `schedule_date`（B03 F8）。schema **无 `rate` 字段**（消除 B02 F7/B03 F7 孤儿 Item Price 副作用），**无 `modified`**（新建草稿无既有版本）。
- **#14/#15/#17/#18/#20/#22（confirm/cancel，人确认）**：必填 `*_id` + `modified`（乐观并发令牌）；仅状态流转，无新增可写字段。
- **#19/#21（mapper create，全自动）**：必填来源单据编号（`purchase_order_id`/`sales_order_id`），`items[]` 可选（缺省取来源未完成量），`posting_date` 可选；无 `modified`。
- annotation 四布尔全部显式声明：confirm/cancel 组 `destructiveHint=true`，create 组 `destructiveHint=false`；全部 `readOnlyHint=false`、`idempotentHint=true`、`openWorldHint=false`。

### 3.2 错误码 / 幂等窗口 / 前置断言 / 事后回读 / 批次

- **错误转译**：`translate.js` 映射 `PermissionError→permission_denied`、`DoesNotExistError/LinkValidationError/ValidationError/DocstatusTransitionError/LinkExistsError/OverAllowanceError/NegativeStockError→precondition_failed`、`TimestampMismatchError→concurrency_conflict`、`MandatoryError/InvalidQtyError/NonNegativeError/CannotChangeConstantError→invalid_argument`，统一形状 `isError/code/message/retryable/details`。✅
- **幂等窗口**：`lib/idempotency.js` `WINDOW={create:300,'confirm/cancel':60}`，`assertWindowNotWidened` 拒绝放宽。✅
- **confirm/cancel 状态断言兜底**：`checkStateAssertion` 命中「已在目标状态」返回 `idempotentAlreadyInTargetState`（幂等成功，非通用错误），10 tool 已挂接。✅
- **前置断言**：create 组（客户/供应商/物料存在且启用、items 非空、schedule_date 提供）；mapper 组（来源单据 docstatus=1、显式 items 数量 ≤ 来源未完成量）；confirm/cancel 组（状态前态 + modified 一致 + 来源仍生效 + 剩余可发/可收）。✅
- **事后回读**：写后回读终态（草稿 docstatus=0 / 生效 docstatus=1 / 取消 docstatus=2），不一致报 `postcondition_failed`。✅
- **批次**：`createBatch/recordChange/complete`，会话级归属 `callerId(ctx)`；回滚路径 `rollbackPathFor`（draft→delete/submitted→cancel/cancelled→terminal）。✅

### 3.3 白名单/确认/fail-closed

- **目标对象硬编码**：`allowlist.WRITE_DOCTYPES` 映射 #13/#14/#15→Sales Order、#16/#17/#18→Purchase Order、#19/#20→Purchase Receipt、#21/#22→Delivery Note，无任意 DocType 字符串输入面。✅
- **Link 字段目标硬编码**：`WRITE_LINK_TARGETS` 仅 Customer/Supplier/来源单据；Company/Currency/Price List 为 server 配置锁单。✅
- **可写字段白名单**：`WRITABLE_FIELDS` 逐 tool 枚举；`IMMUTABLE_FIELDS={name,creation,owner,docstatus}`；行项目仅 `item_code/qty/warehouse`，显式 `rate` 在 handler 内二次拦截。✅
- **确认档清单**：`elicitation.HUMAN_CONFIRM_TOOLS` 含 #14/#15/#17/#18/#20/#22（6 个）；`AUTO_TOOLS` 含 #13/#16/#19/#21（4 个）。`requireConfirmation` 仅 `accept` 放行，`decline`/`cancel`/无 sender/客户端不支持 → `permission_denied` 零写入。✅
- **writeGate**：写 tool 统一门控——币种/价格表 fail-closed + 客户端未声明 elicitation 全量 fail-closed（含全自动档）。✅

### 3.4 后端写端点口径

- #14/#17/#20/#22 经 `frappe.client.submit`（全量 doc）；#15/#18 经 `frappe.client.save`（docstatus=2+modified）；#19/#21 经 mapper（`make_purchase_receipt`/`make_delivery_note`）+ POST 插入草稿；#13/#16 经 POST `/api/resource/...`。无 DELETE、无 `run_method:submit`、无 `frappe.client.cancel`。✅

---

## 4. 独立重跑关键输出

### 4.1 selftest.js

```
结果：155 通过 / 4 失败
失败项（4）均 S01 隔离自证负向读取 ACCESS_DENIED：
  - S01.task-sets / S01.assertions / S01.runs / S01.snapshots
```

4 项失败均为 S01 隔离自证——本验收会话为非受限环境（非 b00-impl 受限账户），`fs.readdirSync` 未返回 `EACCES/EPERM`，属**环境性**（与 task.md §12 注、dev-selftest.md S01 记录一致，非功能/代码缺陷）。S02–S24 共 155 项功能断言全部通过（含 F02 新增 S18 契约、S19 白名单、S20 create、S21 confirm、S22 cancel、S23 mapper、S24 确认边界）。

### 4.2 realsmoke.js（真实后端，mcp-service token）

```
引用数据：CustomerGroup=Commercial ItemGroup=Consumable Warehouse=Finished Goods - G UOM=Unit
PASS 前置主数据 Customer/Supplier/Item 就绪 :: cust=200 supp=200 item=200
PASS server initialize 返回 elicitation 能力
PASS 写入能力判定完成（币种/价格表 fail-closed 通过） :: true reason=null
PASS tools/list 返回 26 tool :: count=26
PASS #13 sales_order_create 草稿 :: name=SAL-ORD-2026-00006 status=Draft
PASS #14 sales_order_confirm 生效（docstatus=1） :: status=Submitted
PASS #15 sales_order_cancel 取消终态（docstatus=2、status=Cancelled）
PASS #16 purchase_order_create 草稿（schedule_date 必填） :: name=PUR-ORD-2026-00006
PASS #21 delivery_note_create 发货草稿（mapper） :: name=MAT-DN-2026-00003 items=1
PASS #19 purchase_receipt_create 收货草稿（mapper） :: name=MAT-PRE-2026-00003
PASS #20 purchase_receipt_confirm 入库生效（docstatus=1） :: status=Completed
PASS #22 delivery_note_confirm 出库生效（docstatus=1） :: status=To Bill
PASS #18 purchase_order_cancel 正向（docstatus=2、status=Cancelled）
真实后端写冒烟结果：13 通过 / 0 失败
```

覆盖 #13–#22 全链路：naming_series 连续编号、`frappe.client.submit`、`frappe.client.save`(docstatus=2) 取消、mapper、elicitation（#14/#15/#18/#20/#22 人确认 auto-accept 不再挂起，验证 CHG-20260917-F04-001 生效）、#20 入库 GL/SLE/库存、#22 出库。**#17 `purchase_order_confirm` 被 #19（来源须已生效）与 #18（po2 须先确认）隐含覆盖**，10 tool 全部经真实后端实测。

### 4.3 越权拒绝（经 mcp-service token 直连后端 REST）

```
认证自证 get_logged_user status=200（应200）
认证自证 Customer 读 status=200（应200）
PASS(403) 清单外对象写 Sales Invoice (财务)  :: exc=PermissionError
PASS(403) 清单外对象写 Journal Entry (财务) :: exc=PermissionError
PASS(403) 清单外对象写 User                :: exc=PermissionError
PASS(403) 引用对象增 Warehouse              :: exc=PermissionError
PASS(403) 引用对象增 Currency               :: exc=PermissionError
PASS(403) 引用对象改 Company gjg            :: exc=PermissionError
PASS(403) 引用对象删 Price List             :: exc=PermissionError
PASS(403) 只读对象写 Bin                    :: exc=PermissionError
PASS(403) 只读对象写 Stock Ledger Entry     :: exc=PermissionError
PASS(403) Account 写 (财务只读依赖)         :: exc=PermissionError
PASS(403) Cost Center 写 (财务只读依赖)     :: exc=PermissionError
PASS(403) 操作对象越权写 Supplier Group     :: exc=PermissionError
合计: 12 通过 / 0 失败
```

清单外对象写、引用对象增删改、只读对象写、Account/Cost Center 写，全部由后端原生 `PermissionError`(403) 拒绝（→ server 侧转译 `permission_denied`），认证自证确认请求确实以 mcp-service 身份发出（非未认证 403）。

### 4.4 两处变更终态核实

① **后端 `MCP Business Caller` DocPerm = 23**（`tabDocPerm` where `role='MCP Business Caller'`）：

| DocType | read | write | create | submit | cancel | select |
|---|---|---|---|---|---|---|
| Account | 1 | 0 | 0 | 0 | 0 | **1** |
| Cost Center | 1 | 0 | 0 | 0 | 0 | **1** |
| （其余 21：操作 12 + 引用 9） | 与 permission-matrix §3 逐项一致 | — | — | — | — | — |

Account/Cost Center 仅 `read=1, select=1`，`write/create/submit/cancel/delete` 全 0（CHG-20260917-E01-001 生效，21→23）。

② **`server/index.js` elicitation 应答路由**（CHG-20260917-F04-001）：`handleMessage` default 分支读 `msg.result.action`（非 `params.result.action`）：

```javascript
if (pendingElicitations.has(id) && msg && msg.result) {
  const action = msg.result.action || 'cancel';
  ...
}
```

---

## 5. 发现项

### 5.1 观察项（非阻断）

1. **S01 隔离自证环境性未覆盖**：本验收会话为非受限环境，S01 四项 FAIL 属环境性；隔离复证归 Owner（b00-impl 受限账户经 verify-impl.ps1 得 `ISOLATED: all checks passed`）。与 dev-selftest.md / evidence-manifest.md 记录一致，非代码缺陷。

2. **后端存在历史冒烟残留，与 evidence-manifest「已按快照恢复归零」表述不完全一致**：DB 中仍有 `F02RT-CUST/SUPP/ITEM` 主数据（16:27 创建）及多轮 realsmoke 事务单据（SAL-ORD-2026-00001…00007、PUR-ORD-2026-00001…00007、MAT-PRE-2026-00001…00003、MAT-DN-2026-00001…00003，含 Draft/Submitted/Cancelled/Completed 各态）。本次独立重跑又新增 SAL-ORD-2026-00006/00007、PUR-ORD-2026-00006/00007、MAT-PRE-2026-00003、MAT-DN-2026-00003 及其 GL/SLE/Bin 变动。**性质**：这是 F02 §18.3 / B03 F9 已声明的「冒烟残留以快照恢复归零（运营动作，归 Owner/管理员）」，非 F02 代码缺陷（realsmoke 本身声明不物理删除，因 mcp-service 无 delete DocPerm）；但 evidence-manifest §4「F02RT- 残留已按快照恢复归零」的表述与实际 DB 状态不符，属**证据记录准确性**问题，建议 Owner 以快照恢复归零并校正该表述。

3. **confirm/cancel 版本断言为「读后比对 + 提交全量 doc」**：server 侧读取当前 `modified` 与入参比对后，将全量 doc 交 `frappe.client.submit`/`frappe.client.save`，由后端 `check_if_latest` 提供第二道版本校验（B02 F2/B03 F2「提供则校验」）。存在读-写间 TOCTOU 窗口，但最终版本一致性由后端提交事务兜底，realsmoke 已验证真实 happy path、mock 已验证陈旧 modified → `concurrency_conflict`（S21.4/S22）。与 D02 §0 第 4/5 条、alignment-check.md §1 一致，非缺陷。

4. **task.md §17 状态记录滞后**：当前 task.md §17 末条为「待验收（发现阻断）」，反映的是 Account 读权限缺口的**历史**阻断（已由 CHG-20260917-E01-001 解除、realsmoke 复测 13/13 通过）。建议封存时在 §17 追加一条「阻断解除 → 独立验收通过」的状态记录。

### 5.2 阻断项

无。

---

## 6. 封存建议

- 全部通过、无阻断 → 结论「**独立验收通过**」，可进入封存（档位 3 强制）。
- 封存前建议（非阻断）：① Owner 以快照恢复将后端冒烟残留归零并校正 evidence-manifest §4 表述；② task.md §17 追加「阻断解除 → 独立验收通过」状态记录；③ Freeze Manifest F02-v1.0.md 登记实施期产出 SHA-256 并回填 task.md §18 封存记录。
- 本验收会话未执行数据库快照恢复（重置共享后端数据不在验收授权范围内，且属 §18.3 归 Owner/管理员的运营动作）；基线快照已存 `%TEMP%\f02-acceptance-baseline.sql`，供 Owner 恢复参考。

---

## 7. 验收方式声明

- 未读取 C01b 冻结任务集正文、断言、初始数据、评分细节；未采信 Implementer 自证结论（selftest/realsmoke 均独立重跑）；未参与 F02 实现、评审、调参或定向修复。
- 后端凭据（mcp-service token）仅经 `docker exec` 读入内存驱动测试，未打印、未落盘。
- 后端为本地 `localhost:8080`，测试只读与受控写均在本地验收环境内完成。
