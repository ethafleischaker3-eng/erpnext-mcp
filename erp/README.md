# ERPNext 进销存系统 · 部署与接口文档

> 本文件是本地 ERPNext 实例的**单一交接入口**，记录它的主要功能、实现方法、以及可调用的接口（API）。
> 后续的「MCP 改造」以本文档为后端事实依据。
>
> 关联文档（同仓库）：
> - [开源后端 Agent 化接入规范](../docs/开源后端Agent化接入规范.md)——通用规范，回答「怎么算接对」
> - [ERPNext-MCP 改造 PRD](../docs/ERPNext-MCP改造PRD.md)——本次落地，回答「这次做什么」

---

## 1. 项目概述

本实例是 **ERPNext v15（Frappe v15）** 的开源进销存（销售/采购/库存）系统，以 Docker 方式部署在本地，作为「旁挂 MCP server → 通用 agent 读写管理」改造项目的**后端**。

改造目标是把它封装成一个 MCP server，让通用 AI agent 通过标准 MCP 协议对进销存业务对象完成**读、写、管理**三类操作。本文档不涉及 MCP server 本身，只描述被封装的后端。

---

## 2. 系统信息

| 项 | 值 |
|---|---|
| ERPNext 版本 | 15.121.2 |
| Frappe 框架版本 | 15.120.1 |
| 数据库 | MariaDB 11.8.9 |
| 缓存/队列 | Redis（cache / queue 两个实例） |
| 访问地址 | http://localhost:8080 |
| 站点名 | `erpnext.local` |
| 站点数据库名 | `_ebde57cb5cf2199a` |
| 登录账号 | `Administrator` / `admin` |
| API 凭证 | Key `b6bd54fbd0970b3` · Secret `8f0fd9ddb61fe4e` |
| 数据落盘 | D 盘 `D:\docker\docker-desktop\DockerDesktopWSL\disk\docker_data.vhdx` |
| 部署目录 | `d:\second\frappe_docker` |

> ⚠️ API 凭证与密码均为本地开发环境默认值，**若迁移到任何共享/生产环境必须更换**。

---

## 3. 快速启动与运维

### 3.1 启动 / 停止

```bash
cd /d/second/frappe_docker

# 启动
docker compose -f compose.yaml -f overrides/compose.mariadb.yaml \
  -f overrides/compose.redis.yaml -f overrides/compose.noproxy.yaml up -d

# 查看状态
docker compose -f compose.yaml -f overrides/compose.mariadb.yaml \
  -f overrides/compose.redis.yaml -f overrides/compose.noproxy.yaml ps

# 停止（保留数据）
docker compose -f compose.yaml -f overrides/compose.mariadb.yaml \
  -f overrides/compose.redis.yaml -f overrides/compose.noproxy.yaml down
```

> 首次启动前需：① 启动 Docker Desktop；② 配置代理（见 §8.3）。

### 3.2 备份 / 快照 / 重置（验收环境的关键能力）

Frappe 是**多租户**：每个站点一个独立数据库。快照/重置的粒度是站点数据库 `_ebde57cb5cf2199a`。三种方式：

```bash
# 方式 A：ERPNext 原生备份（含上传文件）
docker exec frappe_docker-backend-1 bench --site erpnext.local backup --with-files

# 方式 B：直接 dump 数据库
docker exec frappe_docker-db-1 mariadb-dump -uroot -perpnext-dev-123 \
  _ebde57cb5cf2199a > snapshot.sql
# 还原
docker exec -i frappe_docker-db-1 mariadb -uroot -perpnext-dev-123 \
  _ebde57cb5cf2199a < snapshot.sql

# 方式 C：备份 Docker 卷（最底层，连配置一起）
docker run --rm -v frappe_docker_db-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/db-data.tar.gz -C /data .
```

> 对应《规范》§12.4：验收环境必须支持数据库重置到指定快照。方式 B/C 用于实现「每道写题配初始态快照 + 重置脚本」。

### 3.3 常用 bench 命令

```bash
docker exec frappe_docker-backend-1 bench --site erpnext.local list-apps      # 列出已装应用
docker exec frappe_docker-backend-1 bench --site erpnext.local console        # 进入 Python 控制台
docker exec frappe_docker-backend-1 bench --site erpnext.local execute <代码>  # 执行一段 Python
docker exec frappe_docker-db-1 mariadb -uroot -perpnext-dev-123              # 进入数据库
```

---

## 4. 实现方法

### 4.1 Frappe 框架与 DocType 模型

ERPNext 构建在 **Frappe** 框架之上。核心机制是 **DocType（文档类型）**：一个 DocType 就是一个业务对象（数据模型 + 表单 UI + 权限 + REST API 全部由它自动生成）。

```text
DocType 定义（JSON + 少量 Python）
        │  自动生成
        ├── 数据库表（自动迁移）
        ├── 表单界面（Desk）
        ├── 权限系统（角色/行级/字段级）
        └── REST API（/api/resource/<DocType>）
```

- 后端：Python（Werkzeug/Gunicorn）
- 数据库：MariaDB（ORM 自动建表迁移）
- 缓存/队列：Redis（RQ 后台任务）
- 实时：Socket.IO

### 4.2 Docker 架构

```text
frontend (nginx)  ──► backend (gunicorn)  ──► db (MariaDB)
     │                    │                      ▲
     └── websocket        └── redis-cache ───────┘
                              redis-queue ─► queue-short/long workers
                              scheduler（定时任务）
```

各服务见 `frappe_docker/compose.yaml` + `overrides/`（mariadb、redis、noproxy）。

### 4.3 单据状态机（关键概念）

交易类单据（订单、收货、发货、调拨等）遵循三态流转：

```text
Draft(草稿, docstatus=0)  ──提交──►  Submitted(已提交, docstatus=1)  ──取消──►  Cancelled(已取消, docstatus=2)
```

- 草稿：可随意改/删，**无业务效果**（不产生库存变动、不锁库存）。
- 已提交：正式生效，产生库存流水（Stock Ledger Entry）等**不可擦除**的账目。
- 已取消：作废，冲回已生效的业务效果（冲减库存/预留）。

> 这直接映射到 MCP 改造的 tool 后缀：`create`（建草稿）、`confirm`（提交）、`cancel`（取消），也是《PRD》三档分级（全自动/人确认/只出 plan）的业务依据。

---

## 5. 主要功能（业务范围）

本次纳入进销存最小闭环，覆盖三类能力：**读**（检索/查详情/查库存）、**写**（主数据 + 单据草稿）、**管理**（生效/取消/调拨/盘点）。

### 5.1 纳入对象（12 个）

| 业务对象 | DocType | 用途 | 读写 |
|---|---|---|---|
| 客户 | Customer | 销售主数据 | 读写 |
| 供应商 | Supplier | 采购主数据 | 读写 |
| 物料 | Item | 进销存主数据 | 读写 |
| 物料价格 | Item Price | 销售定价 | 读写 |
| 销售订单 | Sales Order | 接单 | 读写 |
| 采购订单 | Purchase Order | 采购 | 读写 |
| 采购收货单 | Purchase Receipt | 采购入库 | 读写 |
| 销售发货单 | Delivery Note | 销售出库 | 读写 |
| 库存调拨 | Stock Entry | 仓库间移动 | 读写 |
| 库存盘点 | Stock Reconciliation | 账实对齐 | 只出方案 |
| 库存余量 | Bin | 库存查询 | 只读 |
| 库存流水 | Stock Ledger Entry | 出入库追溯 | 只读 |

### 5.2 明确不接

财务（销售发票/收付款/记账凭证/总账）、制造（BOM/工单/生产计划）、CRM、HR、项目、资产、网站内容、系统管理（用户/角色/权限/站点设置）。

### 5.3 单据流转（核心链路）

```text
销售：Sales Order ──提交──► Delivery Note（发货出库）──► 库存减少
采购：Purchase Order ──提交──► Purchase Receipt（收货入库）──► 库存增加
库存：Stock Entry（调拨 A→B）；Stock Reconciliation（盘点对账）
追溯：上述每次生效都会写 Stock Ledger Entry；Bin 记录各仓库余量
```

### 5.4 主数据依赖（写操作的前置条件）

一个对象往往依赖其他对象先存在。已实测的最小依赖链：

```text
Customer Group（客户组，非分组）─┐
                                 ├─► Customer（客户）
Territory（销售区域）────────────┘

Supplier Group（供应商组）──► Supplier（供应商）

Item Group ─► Item（物料，需 Unit of Measure）─► Item Price（价格）
Company（公司）+ Warehouse（仓库）─► 交易单据（订单/收货/发货）必需
```

> ✅ 当前实例已完成 Setup Wizard，默认主数据（Company/Warehouse/Item Group/Customer Group/Territory）均已就位，写操作可直接使用；仅当把站点恢复到裸快照时才需自行重建依赖链。

---

## 6. 接口（API）说明

### 6.1 基础信息

- Base URL：`http://localhost:8080`
- 两种认证方式（详见 6.2）

### 6.2 认证

**方式 A：Token（推荐，MCP server 使用）**

```bash
-H "Authorization: token <api_key>:<api_secret>"
```

**方式 B：Cookie Session（适合浏览器/调试）**

```bash
# 1) 登录拿会话 cookie
curl -c cookies.txt -X POST http://localhost:8080/api/method/login \
  -d "usr=Administrator&pwd=admin"
# 2) 后续请求带 cookie
curl -b cookies.txt http://localhost:8080/api/resource/Customer
```

> Token 方式无需 CSRF/session 管理，是程序化接入（MCP）的首选。

### 6.3 通用 CRUD

路由（来自 Frappe 源码 `frappe/api/v1.py`）：

| 操作 | 方法 + 路径 | 说明 |
|---|---|---|
| 列表 | `GET /api/resource/{doctype}` | 返回 `{"data":[...]}` |
| 创建 | `POST /api/resource/{doctype}` | JSON body，返回 `{"data":{...}}` |
| 读取单条 | `GET /api/resource/{doctype}/{name}` | |
| 更新 | `PUT /api/resource/{doctype}/{name}` | JSON body 只含变更字段 |
| 删除 | `DELETE /api/resource/{doctype}/{name}` | 返回 HTTP 202 |
| 调用方法 | `POST /api/resource/{doctype}/{name}` | body 带 `run_method=<方法名>` |
| RPC 方法 | `POST /api/method/{whitelisted_method}` | 如 `frappe.client.submit` |

### 6.4 单据动作（提交 / 取消）

```bash
# 提交（草稿 → 生效）
curl -X POST "http://localhost:8080/api/resource/Sales%20Order/SO-00001" \
  -H "Authorization: token <key>:<secret>" \
  -H "Content-Type: application/json" \
  -d '{"run_method":"submit"}'

# 取消（生效 → 取消）
curl -X POST "http://localhost:8080/api/resource/Sales%20Order/SO-00001" \
  -H "Authorization: token <key>:<secret>" \
  -H "Content-Type: application/json" \
  -d '{"run_method":"cancel"}'

# 等价 whitelisted 方法
curl -X POST "http://localhost:8080/api/method/frappe.client.submit" \
  -H "Authorization: token <key>:<secret>" \
  -d '{"doc":"SO-00001"}'
```

### 6.5 查询参数（列表接口）

| 参数 | 作用 | 示例 |
|---|---|---|
| `fields` | 选择返回字段（JSON 数组） | `fields=["name","customer_name"]` |
| `filters` | 过滤条件（JSON 数组） | `filters=[["docstatus","=","1"]]` |
| `limit_page_length` | 每页条数 | `limit_page_length=20` |
| `limit_start` | 分页偏移 | `limit_start=20` |
| `order_by` | 排序 | `order_by=creation desc` |

### 6.6 错误处理

接口返回 `{"exception": "...", "exc_type": "...", "exc": "..."}`，其中：
- `ValidationError` / `LinkValidationError` —— 业务校验失败（如依赖对象不存在），错误信息可直接用于自纠。
- `PermissionError` —— 越权，需检查角色权限。
- 成功的创建/读取返回 `{"data": {...}}`；列表返回 `{"data": [...]}`。

---

## 7. 对象 ↔ 接口映射

| # | 业务对象 | DocType | 关键必填/依赖 | 读写 |
|---|---|---|---|---|
| 1 | 客户 | Customer | customer_group（非分组）、territory | 读写 |
| 2 | 供应商 | Supplier | supplier_group | 读写 |
| 3 | 物料 | Item | item_group、stock_uom | 读写 |
| 4 | 物料价格 | Item Price | item_code、price_list、price_list_rate | 读写 |
| 5 | 销售订单 | Sales Order | customer、items[]（item_code+qty）、company | 读写 |
| 6 | 采购订单 | Purchase Order | supplier、items[]、company | 读写 |
| 7 | 采购收货单 | Purchase Receipt | 关联采购订单、items[] | 读写 |
| 8 | 销售发货单 | Delivery Note | 关联销售订单、items[] | 读写 |
| 9 | 库存调拨 | Stock Entry | 源/目仓库、items[] | 读写 |
| 10 | 库存盘点 | Stock Reconciliation | 仓库、items[]（实盘数量） | 只出方案 |
| 11 | 库存余量 | Bin | 由库存变动自动生成 | 只读 |
| 12 | 库存流水 | Stock Ledger Entry | 由单据提交自动生成 | 只读 |

> DocType 的完整字段结构可通过 `GET /api/method/frappe.client.get_list?doctype=...` 或访问 `/api/resource/{doctype}` 观察返回，也可用 `bench --site erpnext.local console` 里 `frappe.get_meta("{doctype}")` 查看。

---

## 8. 已知事项 / 注意事项

### 8.1 已完成 Setup Wizard，默认主数据已就位

`setup_complete=1`，Setup Wizard 已跑通，站点已含标准默认主数据（均为 ERPNext 默认项）：
- Company `gjg`（1 个）
- Warehouse（5 个：成品库/原材料库/在途库/在制品库等）
- Item Group（6 个）、Customer Group（5 个）、Territory（3 个）

因此**无需再手动初始化主数据**，可直接创建业务对象。若验收需要「干净基线」，用 §3.2 的快照/重置把站点数据库恢复到初始态即可。

### 8.2 单据依赖 Company

销售/采购/库存类单据必须存在 Company（及默认 Warehouse）。当前 Company `gjg` 与默认 Warehouse 均已存在，该依赖已满足，可直接下单/收货/发货。若在其他快照或全新环境重建，仍需先补全这条链。

### 8.3 网络需走代理

Docker Hub 直连不通，Docker Desktop 必须配置代理（Settings → Resources → Proxies）才能拉镜像。详见部署笔记。

### 8.4 凭证安全

`Administrator/admin`、API Key/Secret、DB 密码 `erpnext-dev-123` 均为本地默认值，共享/生产环境必须更换。

---

## 9. 附录

### 9.1 完整 curl 示例（token 认证）

```bash
TOKEN="token b6bd54fbd0970b3:8f0fd9ddb61fe4e"
BASE="http://localhost:8080/api/resource"

# 登录态验证
curl -H "Authorization: $TOKEN" http://localhost:8080/api/method/frappe.auth.get_logged_user

# 列出客户
curl -H "Authorization: $TOKEN" "$BASE/Customer?limit_page_length=5"

# 建客户组
curl -X POST -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  "$BASE/Customer%20Group" -d '{"customer_group_name":"Commercial","parent_customer_group":"All Customer Groups"}'

# 建客户
curl -X POST -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  "$BASE/Customer" -d '{"customer_name":"测试客户","customer_group":"Commercial","territory":"All Territories"}'

# 删除
curl -X DELETE -H "Authorization: $TOKEN" "$BASE/Customer/测试客户"
```

### 9.2 已验证的接口结论（实测）

- ✅ 登录（cookie）与 Token 两种认证均可用
- ✅ 读：列表 / 单条 / get_logged_user 均返回正常
- ✅ 写：建 Customer Group / Territory / Customer 成功
- ✅ 业务校验：客户挂到「分组」被正确拒绝（LinkValidationError）
- ✅ 删：DELETE 返回 HTTP 202，环境可恢复干净
- ✅ 原生 API 完整可用，适合作为 MCP server 的封装目标
