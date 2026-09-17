# F01 交付物 D05：开发自检记录

> 文档性质：F01 交付物 D05（脱敏）。工作项 W09；对应自检 S01—S10。
> 实现主体：Claude（F01 独立实施上下文）；Owner：gjg；日期：2026-09-16。未读取 C01b 冻结任务集正文/断言。
> 说明：开发自检是 Implementer 的客观核查，**不等于**正式验收（总则 §6.12）；档位 2 独立验收由 Acceptor gjg 完成，Implementer 不自验。

## 1. 自检方法（§12 S01—S10）

自检脚本：`server/test/selftest.js`（`node server/test/selftest.js`；Node v24.19.0，零外部依赖）。S04/S06 以内存 mock 后端验证只读语义与越权拒绝；另附真实后端只读冒烟（本机 `localhost:8080`，无业务数据空基线）。

## 2. 逐项结果（运行于 2026-09-16）

| 编号 | 检查方法 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|
| S01 | Implementer 会话负向读取 C01b `task-sets/`、`assertions/`、`runs/`、`snapshots/` 哨兵 | ACCESS_DENIED | 4/4 EACCES/EPERM（隔离生效） | 通过 |
| S02 | 6 读 tool 逐 tool 与 D02 §2 核对（name/schema/annotation/错误码/批次行为） | 逐项一致、无漂移、无反向放宽 | 6 tool 名称/九类枚举/annotation/错误码/批次行为逐项一致 | 通过 |
| S03 | 白名单枚举核对（九类、#5 仅 Supplier、#3/#4 Bin/SLE、#26 无 DocType） | 无清单外对象、无任意 DocType | 九类映射/引用清单/Link 目标/排除 supplier·bin·sle/不含 Contact·Address·User 均一致 | 通过 |
| S04 | 只读正确性（语义化、分页/截断） | 返回值语义化、无低层标识符 | mock 后端 8 项：检索/详情/余量/流水/供应商/不存在→precondition_failed 均正确 | 通过 |
| S05 | 错误转译（invalid_argument/precondition_failed/result_set_overflow/permission_denied/batch_not_found/backend_unavailable） | 可自纠 message + retryable 正确 | 原生异常→语义化 code 映射正确、统一错误形状、自纠 message、backend_unavailable | 通过 |
| S06 | 越权拒绝（清单外对象、引用增删改、跨会话批次） | 全 403→permission_denied / 清单外→invalid_argument | supplier/bin/sle/contact/user/sales_invoice→invalid_argument；未知字段→invalid_argument；跨会话批次→permission_denied | 通过 |
| S07 | #26 可见性边界（归属可查/他人不可见/管理员全量/不可回滚） | 边界正确、无 rollback 入口 | 归属可查、他人 permission_denied、管理员全量、batch_not_found、查询只读不变状态 | 通过 |
| S08 | 幂等/前置/事后/批次「不适用」标注 | 无漏标、无夹带写入 | 5 读 tool 未挂接写机制；#26 仅挂 queryBatchStatus 无 rollback；readOnly/idempotent 分别显式 | 通过 |
| S09 | Evidence Manifest 完整性 + 只读口径 | 证据齐全、可追溯；未改数据库状态 | Manifest 存在；server 源码仅 GET、无 POST/PUT/DELETE/run_method/submit/cancel | 通过 |
| S10 | #1 filters 白名单与 D02 §2.1、B01–B04 核对 | 无未知/越界字段、逐对象一致 | 九类逐对象关键字段齐全、不含子表 items、不含 supplier/bin/sle | 通过 |

**自检合计**：75 通过 / 0 失败（`node server/test/selftest.js` 退出码 0）。

## 3. 真实后端只读冒烟（补充证据，非正式验收）

以只读 token 注入环境变量，经 MCP 协议直接调用 server（本机后端为空基线，无业务数据）：

| 调用 | 实际结果 | 结论 |
|---|---|---|
| `initialize` + `tools/list` | 返回 6 tool 定义（name/schema/annotations 正确） | 通过 |
| `document_search(object_type=customer)` | `{items:[],total:0,page:1,page_size:50,truncated:false}` | 通过 |
| `supplier_search()` / `stock_level_query()` | 空结果、形状正确 | 通过 |
| `batch_status_get()` | `{batches:[]}`（本包只读、无写入批次） | 通过 |
| `document_get(customer, "NOPE-123")` | `precondition_failed`「目标不存在：请核对语义标识，或先用 erpnext_document_search 定位」 | 通过 |
| `document_search(object_type=supplier)` | `invalid_argument`「object_type 非法…请从九类允许对象中指定一个」 | 通过 |

> 注：正式后端调用方为 `mcp-service` + `MCP Business Caller`（token 存后端容器 `/tmp/mcp_token.txt`，本会话无 docker CLI 不可取用）；上述冒烟以本机只读 token 验证 server 到后端的只读管线正确，未改变任何数据库状态（全 GET、空基线）。

## 4. 剩余限制与风险（如实记录）

1. **#26 会话级归属**：批次归属为会话级身份、内存不落库（E02 §5.5/B00 身份结论）；普通调用方跨会话「查询自身旧批次」不支持，如实呈现。
2. **管理员可查全量未接后端判定**：`adminResolver` 钩子缺省 `isAdmin=false`（E02 §8.3），F01 未接后端 Role/DocPerm 判定；管理员全量查询能力待 F04/F02 或后续接入后端身份后按需提供。
3. **框架级残余 Contact/Address/User**：由 MCP tool 层白名单（`object_type` 硬编码九类枚举不含三者）兜底（E01 §18.4 已决断）；后端原生不拒绝，属框架级变更控制范围。
4. **本包只读、无写入批次**：#26 在 F01 内无批可查（无写 tool 产生批次），批次台账为 F04/F02 写 tool 接入后才有数据。

## 5. 未触发停止条件

- D02/D01/E01/E02 权威输入未冲突；ERPNext 实际行为与 B01–B04 冻结事实一致（只读字段名核对通过）。
- 未新增对象/tool/权限/依赖；必需对象均在允许清单；#1 filters 白名单确定性取得（B01–B04 + 只读 DocType meta 核对）。
- 未读取 C01b 冻结任务集正文/断言；未改变 D02 契约。
