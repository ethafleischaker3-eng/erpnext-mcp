# F02 交付物 D05：开发自检记录

> 文档性质：F02 交付物 D05（脱敏）。工作项 W09；对应自检 S01—S24。
> 实现主体：Claude（F02 独立实施上下文）；Owner：gjg；日期：2026-09-17。未读取 C01b 冻结任务集正文/断言。
> 说明：开发自检是 Implementer 的客观核查，**不等于**正式验收（总则 §6.12）；档位 3 独立验收由 Acceptor gjg 完成，Implementer 不自验。

## 1. 自检方法（§12 S01—S13 扩展为 S01—S24）

自检脚本：`server/test/selftest.js`（`node server/test/selftest.js`；Node 内置模块、零外部依赖）。S01–S10 沿用 F01 读 tool 自检（S02/S08/S09 已扩展至 26 tool 口径）；S11–S17 为 F04 写 tool 自检；S18–S24 为 F02 销售/采购写 tool 自检，以内存 mock 后端（含 create/update/submit/save/mapper + 单据 series 命名 + Bin/SLE/主数据查询语义）验证写语义 + 确认/幂等/前置/事后/批次机制；真实后端写调用以 mcp-service token 于运行时注入，本自检不依赖后端写凭据可达性。

## 2. 逐项结果（运行于 2026-09-17）

| 编号 | 检查方法 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|
| S01 | 负向读取 C01b `task-sets/`、`assertions/`、`runs/`、`snapshots/` | ACCESS_DENIED | 本会话为非隔离环境，4 项 FAIL（隔离自证须在 b00-impl 受限账户下经 verify-impl.ps1 得 `ISOLATED: all checks passed`） | 环境性未覆盖（非代码缺陷；本会话未读取验收区任何内容） |
| S02 | 26 tool 逐 tool 与 D02 §2/§3/§4/§5/§6 核对（name/schema/annotation） | 6 读 + 20 写/只出 plan，字段一致 | 26 tool 名称/annotation/九类枚举/写 tool readOnly=false·destructive 正确 | 通过 |
| S03–S07 | 白名单/只读正确性/错误转译/越权/#26 可见性 | 无清单外对象/越界 | 九类映射/引用清单/排除对象/语义化返回/可见性边界 | 通过 |
| S08 | 「不适用」标注 + annotation 分离 | 只读 tool 无夹带写入 | 读 tool 未挂接写机制；26 tool readOnly/idempotent 显式 | 通过 |
| S09 | 写端点口径 | 仅 POST/PUT + submit/save/mapper，无 DELETE | backend.js 含 submit/save/make_delivery_note/make_purchase_receipt、无 DELETE | 通过 |
| S10 | #1 filters 白名单 | 逐对象一致、无越界 | 九类关键字段齐全、无子表 items | 通过 |
| S11–S17 | F04 写 tool 契约/白名单/确认/幂等/前置/事后/批次/fail-closed | 10 tool 机制正确 | 主数据/调拨 10 tool 契约与机制正确（含 S17.3 扩展至 19 写 tool） | 通过 |
| S18 | F02 契约（create 不带 modified/confirm·cancel 必带/消歧/无 rate/schedule_date） | 忠实 D02 §4/§5 | 10 tool name/schema/annotation 逐项一致 | 通过 |
| S19 | F02 可写字段白名单（D03） | 逐对象白名单、无不可改字段 | 10 tool DocType/Link 目标/白名单逐项一致 | 通过 |
| S20 | F02 create 行为（#13） | 草稿创建/幂等/空 items/rate/客户不存在 | 草稿成功、幂等命中、空 items/rate→invalid_argument、客户不存在→precondition_failed | 通过 |
| S21 | F02 confirm 状态断言（#14） | 草稿→已生效/二次 already_in_target_state/陈旧 modified | 生效成功、二次命中幂等成功、陈旧 modified→concurrency_conflict | 通过 |
| S22 | F02 cancel（#15） | 已生效→已取消/二次 already_in_target_state/cancel 草稿拒绝 | 取消成功、二次命中幂等成功、cancel 草稿→precondition_failed | 通过 |
| S23 | F02 mapper create（#19/#21） | 来源未生效拒绝/mapper 草稿/超发拒绝 | 来源未生效→precondition_failed、mapper 草稿成功、超发→precondition_failed | 通过 |
| S24 | F02 确认边界（#14 人确认） | decline→零副作用 | decline→permission_denied 且 docstatus=0 零写入 | 通过 |

**自检合计**：**155 通过 / 4 失败（4 项失败均为 S01 隔离自证的环境性未覆盖）**。S02–S24 全部通过（155 项功能断言）；S01 须在受限账户 b00-impl 下复证。

## 3. server 冒烟（补充证据，非正式验收）

以 `initialize`（声明 elicitation）+ `tools/list` 经 stdio JSON-RPC 调用 server：`initialize` 返回 `capabilities.elicitation` 与 26 tool instructions；`tools/list` 返回 26 tool 定义（6 读 + 20 写/只出 plan），名称与 D02 总表一致。见 `evidence/server-smoke-tools.txt`（如产出）。

## 4. 剩余限制与风险（如实记录）

1. **#15/#18 cancel 经 `frappe.client.save` 等价路径**：真实后端 `frappe.client.save(docstatus=2+modified)` 的取消行为（status 是否置 Cancelled、下游 LinkExistsError 是否在该事务触发）待 Acceptor 以 mcp-service token 实测；本包 mock 模拟 docstatus 2→ 终态 + 版本断言。
2. **#19/#21 mapper 返回形状**：`make_delivery_note`/`make_purchase_receipt` 真实返回 `{message: dict}` vs `{data: dict}`，本包 `backend` 对 message/data 双兼容，未实测真实形状；mapper 草稿 dict 的 items 字段（against_sales_order/so_detail/purchase_order/purchase_order_item）结构以 B02/B03 §2.2 为准。
3. **#20/#22 confirm 超发/超收与库存校验**：后端在 confirm 强制（OverAllowanceError/NegativeStockError 417，B02/B03 F5）；server 前置校验覆盖来源剩余可发/可收（超发/超收），库存不足由后端转译 `precondition_failed`（translate.js 已映射 NegativeStockError）。
4. **#20 收货入库产生 GL Entry（B03 F9）**：PR confirm 写 Bin/SLE/GL，cancel 后不可 REST DELETE；server 不承诺删除已生效/已取消收货单，零残留以快照恢复为准。
5. **真实后端写冒烟已通过（`server/test/realsmoke.js`，2026-09-17）**：以 mcp-service token 驱动真实 server 对真实后端跑通 10 个销售/采购写 tool（#13–#22）**13/13 通过**，覆盖 naming_series、`frappe.client.submit`、`frappe.client.save`(docstatus=2) 取消、mapper、elicitation、PR/DN 生效的 GL/SLE/库存。期间发现并修复三处真实问题：① E01 Account/Cost Center 只读权限缺口（CHG-20260917-E01-001，21→23 DocPerm，补 `read`+`select`）；② F04 elicitation 应答路由 bug（CHG-20260917-F04-001）；③ realsmoke 测试数据补 warehouse + delivery_date。详见 §4.1。
6. **快照恢复归零**：真实写冒烟产生的 `F02RT-` 残留与 SAL/PUR/MAT 单据按快照恢复归零（测试前快照、测试后还原，mariadb-dump/mariadb 方式 B）。
7. **会话级批次归属**：批次归属为会话级、内存不落库（E02 §5.5/B00 身份结论）；普通调用方跨会话查旧批次不支持。

### 4.1 真实后端写冒烟结果（13/13 通过，2026-09-17）

以 mcp-service token 驱动真实 server 对真实后端执行写冒烟（`server/test/realsmoke.js`），最终 13/13 通过：

| 项 | 结果 | 说明 |
|---|---|---|
| initialize/elicitation、币种价格表 fail-closed、tools/list 26 | ✓ 通过 | 写入能力判定 `ok=true`（币种/价格表 fail-closed 通过） |
| 前置主数据 Customer/Supplier/Item 创建 | ✓ 通过 | HTTP 200（幂等：已存在则复用） |
| #13/#16 建草稿（naming_series） | ✓ 通过 | `SAL-ORD-`/`PUR-ORD-` 连续编号 |
| #14/#17 submit（`frappe.client.submit`） | ✓ 通过 | `docstatus=1`、`status=Submitted` |
| #15/#18 cancel（`frappe.client.save` docstatus=2） | ✓ 通过 | `docstatus=2`、`status=Cancelled` |
| #19/#21 mapper（`make_purchase_receipt`/`make_delivery_note`） | ✓ 通过 | 草稿 dict + `MAT-PRE-`/`MAT-DN-` 编号 |
| #20 PR 生效（GL/SLE/入库） | ✓ 通过 | `docstatus=1`、`status=Completed`（+库存） |
| #22 DN 生效（出库/负库存校验） | ✓ 通过 | `docstatus=1`、`status=To Bill`（-库存） |
| elicitation 人确认（auto-accept） | ✓ 通过 | accept→写入、路由正确（CHG-20260917-F04-001 修复后） |

> **结论**：真实后端写冒烟**通过**。期间修复三处真实问题——① E01 Account/Cost Center 只读权限缺口（CHG-20260917-E01-001）；② F04 elicitation 应答路由 bug（CHG-20260917-F04-001）；③ realsmoke 测试数据补 warehouse + delivery_date。

## 5. 停止与升级（如实记录）

- **曾触发后解除（Account 读权限缺口）**：真实后端写冒烟曾因 mcp-service 建销售/采购单据被 403 拒绝（Account 读权限缺失）命中 F02 §15 停止条件；经 Owner 批准 CHG-20260917-E01-001（补 Account/Cost Center `read`+`select`，21→23）后解除，realsmoke 复测 13/13 通过。非 F02 代码缺陷。
- 未读取 C01b 冻结任务集正文/断言；未改变 D02 契约；F01/F04 `server/` 骨架可复用（入口/注册表只增不改，E02 `lib/` 8 模块未改动；F04 elicitation 应答路由 bug 经 CHG-20260917-F04-001 修正）。
