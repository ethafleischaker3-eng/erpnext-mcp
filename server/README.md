# ERPNext MCP server（F01 通用查询能力 + F04 库存与主数据维护）

> 仓库根 `server/`：MCP server 骨架 + 迁入 E02 `lib/` 8 模块 + 16 个 tool（6 读 #1/#2/#3/#4/#5/#26 + 10 写/只出 plan #6–#12/#23–#25）。
> 只读接入（6 读 tool）由 F01 建立；写接入（10 写/只出 plan tool）由 F04 追加（入口/注册表只增不改，复用 F01 骨架与白名单层）。
> 后端调用统一经正式账号 `mcp-service` + 角色 `MCP Business Caller`。
> E02 原 `lib/`（`docs/task-packages/E02/lib/`）保留为机制参考不动；本目录 `lib/` 为其逐字迁入副本。

## 运行方式（stdio MCP server，零外部依赖，Node ≥ 18）

```bash
# 注入后端凭据（mcp-service token，取值于部署时自后端容器 /tmp/mcp_token.txt 注入，不落代码）
export ERP_BASE_URL="http://localhost:8080"
export ERP_API_KEY="<mcp-service api_key>"
export ERP_API_SECRET="<mcp-service api_secret>"

node index.js
```

未配置 `ERP_API_KEY`/`ERP_API_SECRET` 时 server 仍可启动并应答 `initialize`/`tools/list`，但后端调用会以后端拒绝/不可达口径返回（不夹带凭据猜测）。

## 16 个 tool

### 6 只读 tool（F01，D02 §2）

| tool | 目标对象 | 说明 |
|---|---|---|
| `erpnext_document_search` | 九类单据/主数据（不含 supplier/bin/sle） | 分页检索；`object_type` 硬编码九类；`filters` 仅该对象可检索字段 |
| `erpnext_document_get` | 同九类 | 单对象详情 + 当前状态 |
| `erpnext_stock_level_query` | Bin（只读） | 实际/可用/预留余量 |
| `erpnext_stock_ledger_query` | Stock Ledger Entry（只读） | 出入库流水 |
| `erpnext_supplier_search` | Supplier（只读） | 供应商检索（专走本 tool） |
| `erpnext_batch_status_get` | （server 批次台账元数据） | 只读可见性边界：归属自身会话可查/他人不可见/管理员可查全量/不可主动回滚 |

### 10 写/只出 plan tool（F04，D02 §3/§6）

| tool | 目标对象 | 档位 | 幂等 |
|---|---|---|---|
| `erpnext_customer_create` | Customer ▲ | 人确认 | create 300s |
| `erpnext_customer_update` | Customer ▲ | 人确认 | 指纹合并 300s |
| `erpnext_supplier_create` | Supplier ▲ | 人确认 | create 300s |
| `erpnext_supplier_update` | Supplier ▲ | 人确认 | 指纹合并 300s |
| `erpnext_item_create` | Item ▲ | 人确认 | create 300s |
| `erpnext_item_update` | Item ▲ | 人确认 | 指纹合并 300s |
| `erpnext_item_price_set` | Item Price ▲ | 人确认 | 指纹合并 300s |
| `erpnext_stock_transfer_create` | Stock Entry ▲ | 全自动（仅 L3） | create 300s |
| `erpnext_stock_transfer_confirm` | Stock Entry ▲ | 人确认 | confirm 60s（状态断言） |
| `erpnext_stock_reconciliation_plan` | Bin/SLE ◐ | 只出 plan | 不适用 |

## 目录结构

```
server/
  index.js              入口（stdio JSON-RPC MCP server；elicitation 确认 + 写能力门控；注册表只增不改）
  lib/                  迁入 E02 lib/ 8 模块（errors/fingerprint/idempotency/identity/batch-ledger/batch-status/precondition/postcondition）
  src/
    registry.js         tool 注册表（F01 6 读 + F04 10 写/只出 plan；F02 串行追加 #13–#22，不改既有条目）
    allowlist.js        白名单层（object_type 九类 / Link 目标 / filters 可检索字段 / 写对象与可写字段枚举）
    config.js           运行时配置（凭据自环境变量 + 锁单公司/币种/价格表 + fail-closed 判定）
    backend.js          后端 REST 客户端（读 GET + 写 POST/PUT/submit/getItems）
    translate.js        错误转译（后端原生异常 → D01 §4 统一错误形状）
    elicitation.js      server 侧确认（人确认档 8 tool；accept/decline·cancel/不支持）
    tools/              16 个 tool 模块 + write-common（写 tool 公共层）+ common（读 tool 公共层）
  test/selftest.js      开发自检 S01—S17（node test/selftest.js）
```

## 写操作口径与错误模型

- 写 tool 挂接 E01 确认/白名单/权限层（人确认档 8 tool 经 elicitation；#23 免确认仅 L3；#25 无写入）、E02 幂等/前置/事后/批次机制（create 300s / confirm 60s 不放宽）。
- 写前确认、写后回读终态、批次台账（会话级归属）；币种/价格表 fail-closed（`gjg.default_currency` 空或 selling 价格表数量 ≠ 1 → 拒绝初始化写能力）。
- 后端写：POST/PUT `/api/resource/{doctype}` + `frappe.client.submit`（#24 全量 doc）；无 DELETE/`run_method`/cancel（回滚归管理员运维）。
- 错误统一形状（D01 §4）：`{ isError:true, code, message, retryable, details? }`；不裸抛堆栈/后端原生异常名；后端不可达不自动重试写。
- 幂等命中（`idempotent_replay`）与 confirm 状态断言命中（`already_in_target_state`）是成功语义，非错误。
