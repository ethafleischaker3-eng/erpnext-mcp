# F04 交付物 D05：开发自检记录

> 文档性质：F04 交付物 D05（脱敏）。工作项 W09；对应自检 S01—S17。
> 实现主体：Claude（F04 独立实施上下文）；Owner：gjg；日期：2026-09-17。未读取 C01b 冻结任务集正文/断言。
> 说明：开发自检是 Implementer 的客观核查，**不等于**正式验收（总则 §6.12）；档位 3 独立验收由 Acceptor gjg 完成，Implementer 不自验。

## 1. 自检方法（§12 S01—S12 扩展为 S01—S17）

自检脚本：`server/test/selftest.js`（`node server/test/selftest.js`；Node v24.19.0，零外部依赖）。S01–S10 沿用 F01 读 tool 自检（S02/S08/S09 已扩展至 16 tool 口径）；S11–S17 为 F04 写 tool 自检，以内存 mock 后端（含 create/update/submit/getItems + Bin/SLE 查询）验证写语义 + 确认/幂等/前置/事后/批次机制；真实后端写调用以 mcp-service token 于运行时注入，本自检不依赖后端写凭据可达性。

## 2. 逐项结果（运行于 2026-09-17）

| 编号 | 检查方法 | 预期结果 | 实际结果 | 结论 |
|---|---|---|---|---|
| S01 | 负向读取 C01b `task-sets/`、`assertions/`、`runs/`、`snapshots/` | ACCESS_DENIED | 4/4 EACCES/EPERM（隔离生效） | 通过 |
| S02 | 16 tool 逐 tool 与 D02 §2/§3/§6 核对（name/schema/annotation） | 6 读 + 10 写/只出 plan，字段一致 | 16 tool 名称/annotation/九类枚举/写 tool readOnly=false·destructive 正确 | 通过 |
| S03 | 白名单枚举核对（九类 + 引用清单 + 排除对象） | 无清单外对象/任意 DocType | 九类映射/引用清单/Link 目标/排除 supplier·bin·sle/不含 Contact·Address·User | 通过 |
| S04–S07 | 读 tool 只读正确性 + 错误转译 + 越权 + #26 可见性 | 只读语义正确 | 语义化返回/转译正确/越权拒绝/可见性边界 | 通过 |
| S08 | 「不适用」标注 + annotation 分离 | 只读 tool 无夹带写入 | 读 tool 未挂接写机制；16 tool readOnly/idempotent 显式 | 通过 |
| S09 | 写端点口径 | 仅 POST/PUT + submit，无 DELETE/run_method | backend.js 无 DELETE/run_method/cancel | 通过 |
| S10 | #1 filters 白名单 | 逐对象一致、无越界 | 九类关键字段齐全、无子表 items | 通过 |
| S11 | 写 tool 契约（modified 语义/annotation） | create 不带 modified、update/confirm 必带 | #6/#8/#10 不带；#7/#9/#11/#24 必带；#12 条件必带 | 通过 |
| S12 | 可写字段白名单（D03） | 逐对象白名单、无不可改字段 | 5 对象映射/不可改字段排除/Link 目标/白名单逐项 | 通过 |
| S13 | 确认边界 | accept→写、decline/cancel→零副作用、不支持→fail-closed | accept 落库、decline/cancel/不支持均零写入 | 通过 |
| S14 | 幂等 | create/指纹合并 300s 合并、confirm 60s 状态断言 | create 组二次命中 idempotent_replay、confirm 二次 already_in_target_state | 通过 |
| S15 | 前置断言 | 同名/区间不重叠/源仓可用量/源目不同 | duplicate_name/区间重叠/源仓不足/源目同仓均 precondition_failed | 通过 |
| S16 | 事后回读 + #25 只出 plan | 回读终态、#25 无写入无批次 | #24 docstatus=1、#25 无批次、#25 缺省时点走 Bin/提供时点走 getItems | 通过 |
| S17 | 错误转译 + fail-closed + 越权 | 币种 fail-closed、越权拒绝、硬编码对象 | fail-closed permission_denied、docstatus 传入 invalid_argument | 通过 |

**自检合计**：**122 通过 / 0 失败**（`node server/test/selftest.js` 退出码 0）。原始输出见 `evidence/selftest-S01-S17.txt`。

## 3. server 冒烟（补充证据，非正式验收）

以 `initialize`（声明 elicitation）+ `tools/list` 经 stdio JSON-RPC 调用 server：

- `initialize` 返回 `capabilities.elicitation` 与 16 tool instructions；`tools/list` 返回 16 tool 定义，名称与 D02 一致（6 读 + 10 写/只出 plan）。见 `evidence/server-smoke-tools.txt`。

## 4. 剩余限制与风险（如实记录）

1. **#24 无 cancel tool**：已生效调拨异常回滚归管理员运维（不回滚写 tool），不承诺删除已生效/已取消调拨单（B04 F10 SLE 持久化）。
2. **#25 只出 plan**：不覆盖库存基线；盘点提交（估值率/opening-entry 门槛，B04 F7/F8）归 G01 或后续盘点提交范围，非本包写入。
3. **后端 mcp-service 写凭据不可取（本会话无 docker CLI；token 仅存后端容器 `/tmp/mcp_token.txt`，E01 §18.4「供验收验证、F 包接线前须重发托管」）**：10 个写/只出 plan tool 的**真实后端写冒烟未执行**，全程以内存 mock 后端验证机制与工具逻辑；真实写管线待 Acceptor gjg 以 mcp-service token 独立实测。
4. **快照恢复归零**：写操作零残留以快照恢复为最终保障；本自检未对真实后端写（mock 验证）。
5. **Item→Item Price 级联删除（B01 F4）**：server 删除/回滚须自建引用前置检查，本包 create 回滚路径已备注（未引用才删），不依赖后端拒绝。
6. **会话级批次归属**：批次归属为会话级、内存不落库（E02 §5.5/B00 身份结论）；普通调用方跨会话查旧批次不支持。

### 4.1 真实后端写冒烟未覆盖项（如实记录，待 Acceptor 独立实测）

以下为**积分级**差异，须以 mcp-service token 在真实后端 `http://localhost:8080` 实测确认，本包 mock 无法覆盖：

| 项 | 内容 | 依据 |
|---|---|---|
| #24 submit 返回形状 | `frappe.client.submit` 真实返回 `{message: doc}` vs `{data: doc}` | B04 F3；本包 `backend.submit` 对 message/data 双兼容，但未实测真实形状 |
| #25 get_items 返回形状 | `get_items` 参数名/返回 `current_qty`/`valuation_rate` 字段 | B04 F11；未实测真实返回 |
| **#25 get_items 必填位置参数已修正** | D02 §6.3 冻结 `posting_date`/`posting_time` 为可选，但 `get_items(warehouse, posting_date, posting_time, company, item_code=None)` 的 posting_date/posting_time 为无默认值位置参数；server 已改为**缺省时点走 Bin 读现状、仅二者齐备时走 get_items**（忠实 D02「Bin/SLE 或 get_items」口径） | B04 F11 + D02 §6.3 |
| #23/#24 子表自动派生 | Stock Entry child 行 `s_warehouse`/`t_warehouse`/`uom`/`basic_rate` 与 `purpose` 自动派生 | B04 §2.1；本包 mock 未模拟 |
| #23/#24 naming_series | 真实 `MAT-STE-XXXX-YYYYY` 连续编号 | B04 F1；本包 mock 用 `MAT-STE-2026-NNNNN` 代 |
| 主数据 create 后端校验 | Customer/Supplier/Item/Item Price 真实字段校验（重名/链接/必填/常量） | B01 §2；本包 mock 仅模拟部分（重名/Link 计数），未模拟后端 417/409 全量校验 |

## 5. 未触发停止条件

- D02/D01/E01/E02/F01 权威输入未冲突；ERPNext 实际行为与 B01/B04 冻结事实一致（前端校验/写端点口径相符）。
- 未新增对象/tool/权限/依赖；必需对象均在允许清单；可写字段白名单确定性取得（B01/B04 接口事实）。
- 未读取 C01b 冻结任务集正文/断言；未改变 D02 契约；F01 `server/` 骨架可复用（入口/注册表只增不改，E02 `lib/` 8 模块未改动）。
