# ERPNext-MCP 改造项目 · 使用说明

> 项目形态：**旁挂 MCP server + 独立验收环境**。把本地 ERPNext v15（Docker）封装成 26 个 MCP tool，让 Claude Code 等通用 agent 通过标准 MCP 协议对进销存业务完成读、写、管理。
>
> 项目状态：**一期验收完成**（G01 集成验收 30/30 通过 + H01 符合性材料评审通过，符合性等级 L3）。生产上线、多机联网共享属二期事项（见 §9）。

---

## 1. 这是什么

```
Claude Code（MCP 客户端，L3 支持 server 侧确认）
        │ stdio JSON-RPC
        ▼
server/index.js（26 个 tool，Node ≥ 18，零外部依赖）
        │ REST API（token 认证，账号 mcp-service + 角色 MCP Business Caller）
        ▼
ERPNext v15 后端（Docker，http://localhost:8080，站点 erpnext.local）
```

- **后端**：ERPNext v15 / Frappe v15，Docker 部署在本地，站点 `erpnext.local`，库 `_ebde57cb5cf2199a`。
- **MCP server**：`server/` 目录，stdio JSON-RPC，零外部依赖，只读/写进销存业务对象。
- **客户端**：Claude Code 2.1.263 / MCP 2025-11-25（L3 前提，已由 A01 验证 server 侧确认能力）。

## 2. 快速开始（三步）

### 2.1 启动后端（Docker）

```bash
cd /d/second/frappe_docker
docker compose -f compose.yaml -f overrides/compose.mariadb.yaml \
  -f overrides/compose.redis.yaml -f overrides/compose.noproxy.yaml up -d
```

> 前提：Docker Desktop 已启动且配好代理（镜像拉取需代理，见 `erp/README.md` §8.3）。

### 2.2 启动 MCP server

```bash
cd /d/second/server
export ERP_BASE_URL="http://localhost:8080"
export ERP_API_KEY="<mcp-service api_key>"
export ERP_API_SECRET="<mcp-service api_secret>"
node index.js
```

- 凭据来自部署时后端容器 `/tmp/mcp_token.txt` 注入的 `mcp-service` 账号 token（不落代码）。
- 未配置 `ERP_API_KEY`/`ERP_API_SECRET` 时，server 仍可应答 `initialize`/`tools/list`，但后端调用按「不可达/拒绝」口径返回。

### 2.3 接入客户端（Claude Code）

stdio MCP 配置示例：

```json
{
  "mcpServers": {
    "erpnext": {
      "command": "node",
      "args": ["d:/second/server/index.js"],
      "env": {
        "ERP_BASE_URL": "http://localhost:8080",
        "ERP_API_KEY": "...",
        "ERP_API_SECRET": "..."
      }
    }
  }
}
```

## 3. 26 个 tool 一览

| 类别 | 数量 | tool |
|---|---|---|
| 读 | 6 | `erpnext_document_search` / `erpnext_document_get` / `erpnext_stock_level_query` / `erpnext_stock_ledger_query` / `erpnext_supplier_search` / `erpnext_batch_status_get` |
| 全自动写（草稿，免确认） | 5 | `erpnext_sales_order_create` / `erpnext_purchase_order_create` / `erpnext_purchase_receipt_create` / `erpnext_delivery_note_create` / `erpnext_stock_transfer_create` |
| 人确认写（生效/取消/主数据） | 14 | `erpnext_sales_order_confirm`/`_cancel`、`erpnext_purchase_order_confirm`/`_cancel`、`erpnext_purchase_receipt_confirm`、`erpnext_delivery_note_confirm`、`erpnext_stock_transfer_confirm`、`erpnext_customer_create`/`_update`、`erpnext_supplier_create`/`_update`、`erpnext_item_create`/`_update`、`erpnext_item_price_set` |
| 只出 plan | 1 | `erpnext_stock_reconciliation_plan`（盘点方案，不写数据） |

> 完整逐 tool 契约见 `docs/task-packages/D02/tool-contract.md`。实现事实以 `server/src/registry.js`（26 tool）为准。
> ⚠️ `server/README.md` 标题仍写「16 个 tool」是已知文档滞后，实际为 26 个。

## 4. 典型用法（对 agent 说自然语言即可）

- **查库存**：「查一下物料 XXX 在各仓库的库存余量」 → `erpnext_stock_level_query`
- **建客户**：「登记一个新客户，客户组 Commercial，区域 All Territories」 → `erpnext_customer_create`（人确认，客户端 approve）
- **下销售单**：「给客户建一张销售订单草稿，物料 YYY × 10」 → `erpnext_sales_order_create`（全自动，免确认）
- **生效**：「把订单 SO-xxxxx 提交生效」 → `erpnext_sales_order_confirm`（人确认）
- **盘点**：「帮我做 W 仓库的库存盘点方案」 → `erpnext_stock_reconciliation_plan`（只出方案，你在后端人工执行）

业务链路：销售 `Sales Order → Delivery Note`（出库）、采购 `Purchase Order → Purchase Receipt`（入库）、库存 `Stock Entry`（调拨）/ `Stock Reconciliation`（盘点）。

## 5. 关键机制

1. **L3 人确认**：14 个人确认写 tool 由 server 发起 `elicitation`，agent 只能 accept/decline。decline 零副作用；客户端不支持确认时 fail-closed（拒绝写入）。
2. **权限兜底**：只认 `mcp-service` + 角色 `MCP Business Caller`（23 DocPerm），对象/字段范围限死在 E01 两张允许清单内，越权 403。
3. **幂等**：server 按业务参数生成幂等指纹（create 300s / confirm·cancel 60s 窗口），重试不重复建单。
4. **回滚**：草稿可删、已生效走后端原生取消；调拨/收货/发货无 MCP cancel tool，取消由管理员运维执行，不承诺物理删除（SLE 持久化）。
5. **锁单配置**：公司 `gjg`、币种 `CNY`、销售价格表 `Standard Selling` 由 server 集中配置；币种或价格表异常时写能力 fail-closed。

## 6. 备份 / 快照 / 重置

```bash
# dump 站点库（推荐）
docker exec frappe_docker-db-1 mariadb-dump -uroot -perpnext-dev-123 \
  _ebde57cb5cf2199a > snapshot.sql
# 还原
docker exec -i frappe_docker-db-1 mariadb -uroot -perpnext-dev-123 \
  _ebde57cb5cf2199a < snapshot.sql
```

做破坏性操作前先 dump 一份。完整三种备份方式见 `erp/README.md` §3.2。

## 7. 多台电脑使用（局域网）

当前交付是「单机 stdio + localhost 后端」，开放给别的电脑属二期生产化范畴，且须先处理安全项。基本路径：

1. **后端出网**：8080 端口已由 compose 发布（`${HTTP_PUBLISH_PORT:-8080}:8080`），但站点是 `erpnext.local`，其他电脑访问需解决站点 host 识别（hosts 或站点配置）。
2. **每台各跑 stdio server**：`server/` 零依赖，`git clone` 或拷贝后 `export ERP_BASE_URL="http://<主机IP>:8080"` + 各自的 `node index.js` 即可。
3. **换掉默认凭证**：`Administrator/admin`、API Key/Secret、DB 密码 `erpnext-dev-123` 均为本地默认值，端口出网前必须更换。
4. **加 HTTPS + 反向代理 + 鉴权**：局域网明文 token 可被嗅探。
5. **重新核查 L3**：A01 仅在「stdio + Claude Code 2.1.263」下验证 elicitation；换传输层/换客户端须重新走 A01 门槛，否则可能降级 L2。
6. **隔离验收区**：`D:\second-acceptance\`（隐藏任务集/断言/运行记录）对实施主体 Deny，勿暴露。

## 8. 已知限制与二期事项

见 `docs/task-packages/H01/deliverables-summary.md` §6（已知限制）/ §7（二期事项）。要点：

- 会话级批次归属（stdio 无跨会话身份信号）；幂等 create 300s 窗口内同参数重复可能误合并。
- 已生效单据不可物理删除；管理员判定依赖后端 Role/DocPerm（hook）。
- 确认能力绑定 Claude Code 2.1.263（stdio），换客户端须重新核查 L3。
- **二期**：财务域、制造域、跨 tool 聚合回滚、生产环境上线（部署/凭据/数据治理/灾难恢复）、跨会话批次归属增强、全自动档扩展评估。

## 9. 文档索引

| 主题 | 位置 |
|---|---|
| 后端部署与原生 API | `erp/README.md` |
| MCP server 运行与目录 | `server/README.md` |
| 通用接入规范 | `docs/开源后端Agent化接入规范.md` |
| 项目 PRD | `docs/ERPNext-MCP改造PRD.md` |
| 任务包总则 | `docs/MCP改造任务包总则.md` |
| 26 tool 契约 | `docs/task-packages/D02/tool-contract.md` |
| 权限矩阵/允许清单 | `docs/task-packages/E01/` |
| 集成验收报告 | `docs/task-packages/G01/acceptance-report.md` |
| 符合性声明与交付物汇总 | `docs/task-packages/H01/` |
