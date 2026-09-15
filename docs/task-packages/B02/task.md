# B02 销售链路接口摸底

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 编号 | B02 |
| 名称 | 销售链路接口摸底 |
| 版本 | v1.0 |
| 状态 | 待验收 |
| 创建人 | Claude（B02 起草上下文） |
| Owner | gjg |
| Implementer | Claude（B02 独立实施上下文）；须与 Acceptor 为不同的执行实例并验证隔离 |
| Implementation Reviewer | gjg；不得读取后续对应隐藏验收材料 |
| Acceptance Reviewer | 不适用；B02 不接触正式验收材料（不生成/读取验收题、隐藏数据或终态断言） |
| Acceptor | gjg；独立于 Implementer |
| 创建日期 | 2026-09-14 |
| 冻结日期 | 2026-09-14 |
| 完成日期 | 2026-09-14 |
| 上游任务包 | A01（已封存，2026-09-14，启动门槛）；B00（已封存，提供环境/身份/权限/币种价格表事实）；B01（已封存，提供主数据接口事实与引用删除说明） |
| 下游任务包 | D01（公共契约与错误模型，其冻结依赖 B01～B05 接口事实）；经 D01→D02 传递至 F02（销售业务闭环） |

角色隔离说明：Implementer 为独立编码上下文，Acceptor 为 gjg，二者为不同的执行实例；B02 实施销售链路接口摸底，不实施任何正式业务 tool、不读取正式验收题。Implementation Reviewer gjg 兼任 Owner，但不替代独立验收。接口事实记录的「接入方确认有效」由 Owner/决策人 gjg 在独立验收环节签署，与 Implementer 自证相分离。

## 2. 目标

在验收环境 `erpnext.local` 上，用 `B02-PROBE-` 前缀合成对象实测 ERPNext 销售链路单据（Sales Order、Delivery Note）的接口行为，产出可复核的接口事实记录并冻结结论，作为 D01/D02 业务 tool 契约（#13–#15 销售订单、#21–#22 发货单 tool）的权威输入。验证记录必须逐项覆盖：

1. **对象与接口基础可用性**：Sales Order / Delivery Note 的 create/confirm/cancel 端点齐备且可达；Delivery Note 按来源销售订单生成草稿的方式；草稿删除作为回滚路径确认（PRD §5.4）；
2. **命名与编号**：`naming_series` 自动编号行为、`name` 生成形式（推测：单据无「同名唯一性」、为 series 连续编号，待实测确认）；
3. **引用字段有效性**：customer / item / warehouse / company / currency / price list 等 Link 字段无效时的校验行为；
4. **单据状态机与 docstatus**：create→草稿（docstatus=0）、confirm→已生效（1）、cancel→已取消（2）的状态漂移及 `modified` 变化语义；
5. **乐观版本断言**：confirm / cancel 时传入陈旧 `modified` 是否被后端拒绝、拒绝形式（PRD §5.2 #14/#15/#22）；
6. **来源单据与数量/库存校验**：Delivery Note 来源订单必须已生效、来源行剩余可发数量、可用库存充足/仓库有效的校验行为（PRD §5.2 #22）；
7. **原子性**：create / confirm / cancel 是否由后端单次原子完成，confirm 状态校验与提交是否同一事务（PRD §5.5）；
8. **回滚/取消条件**：cancel 的合法前态、下游单据约束、已生效单据取消的冲回行为；草稿删除路径（PRD §5.4）；
9. **失败不静默**：写失败是否被后端正确报告（非静默成功）。

接口事实记录为冻结输出，其内容结构见第 9 节，是 D01/D02 的权威输入；本包不冻结 tool 名称/schema/annotation，不形成最终业务权限（总则 §13：接口事实确认先于对应 tool 契约冻结）。

**前置数据与库存边界**：本包允许创建 `B02-PROBE-` 前缀 Customer / Item 作为销售单据的引用前置数据（复用 B01 已冻结主数据接口事实，不重复摸底）；Delivery Note confirm 的「可用库存充足」正向发货需真实库存就绪（属 B03 采购收货 / B04 库存调拨范围），本包仅实测「库存不足 → 拒绝形式」负向行为与「非库存物料（service item）→ 正向发货」行为，充足库存正向发货记为跨任务边界，留待 B03/B04 或 F02。

## 3. 非目标

- 不开发 MCP server 或任何正式业务 tool（F02 职责）；
- 不冻结 tool 契约、不定义 tool 语义/输入输出 schema/annotation/错误结构（D01/D02 职责）；
- 不形成最终业务权限、正式角色矩阵或两张允许清单（E01 职责）；
- 不开展 B01 主数据 / B03 采购链路 / B04 库存与回滚链路接口摸底；
- 不开展 B05 幂等可实现性调研；
- 不实现幂等机制、批次台账、前置断言、事后校验或回滚逻辑（E02–E04 职责）；
- 不生成、读取或运行正式验收题、隐藏数据、终态断言或评分脚本；
- 不修改 ERPNext 源码、schema、`frappe_docker` 或站点配置；
- 不以 B02 通过代替后续契约冻结、业务 tool 实现或项目验收。

## 4. 前置条件

| 条件 | 验证方式 | 状态 |
|---|---|---|
| B00 v1.0 已封存 | 检查 B00 登记表行、Freeze Manifest 及 `governance-b00-v1.0-accepted` 标签 | 已验证 |
| A01 v1.0 已封存 | 检查 A01 登记表行、Freeze Manifest 及 `governance-a01-v1.0-accepted` 标签 | 已验证 |
| B01 v1.0 已封存 | 检查 B01 登记表行、Freeze Manifest 及 `governance-b01-v1.0-accepted` 标签 | 已验证 |
| 《ERPNext-MCP 改造 PRD》已冻结 | 检查 PRD 页头基线 `2026-09-12-r1` | 已验证 |
| 《MCP 改造任务包总则》及配套模板、登记表结构、边界规则已冻结 | 检查各文档页头及对应 Freeze Manifest | 已验证 |
| 通用执行面判断结论已冻结 | 检查 PRD §3.1「不存在通用执行面，按业务任务拆分」结论 | 已验证 |
| 本地 ERPNext 实例可访问且凭据可用 | 复核 `http://localhost:8080` 可达、Token 与登录凭据有效（B02 实施时复核） | 已验证（2026-09-14：get_logged_user→Administrator，HTTP 200） |
| 站点 `erpnext.local` 为独占、非生产、可销毁验收环境，快照可重置 | 复用 B00/B01 已冻结环境事实，实施时复核站点独占与快照重置可用 | 已验证（2026-09-14：本包实测 dump→写探针→restore 往返成功，探针对象还原清除） |
| Owner 已明确 | Owner 为 gjg | 已验证 |
| Implementer、Acceptor、Implementation Reviewer 已确定 | Implementer=独立编码上下文、Implementation Reviewer=gjg、Acceptor=gjg；Implementer 与 Acceptor 为不同执行实例 | 已验证 |

任一强制前置条件不成立，任务不得进入「实施中」。

## 5. 权威输入

| 优先级 | 名称 | 路径/位置 | 版本或提交标识 |
|---|---|---|---|
| 1 | 开源后端 Agent 化接入规范 | `docs/开源后端Agent化接入规范.md` | 2026-09-07 定稿版 |
| 2 | ERPNext-MCP 改造 PRD | `docs/ERPNext-MCP改造PRD.md` | 2026-09-12-r1 |
| 3 | MCP 改造任务包总则 | `docs/MCP改造任务包总则.md` | v1.0；以对应 Freeze Manifest 为准 |
| 4 | MCP 改造封闭任务包模板 | `docs/任务包模板.md` | v1.0；以对应 Freeze Manifest 为准 |
| 5 | MCP 改造任务包登记表 | `docs/任务包登记表.md` | v1.0 字段结构基线；任务行受控更新 |
| 6 | 实施区与验收区边界 | `docs/实施区与验收区边界.md` | v1.0 边界规则 |
| 7 | ERPNext 进销存系统·部署与接口文档 | `erp/README.md` | 当前工作树版本 |
| 8 | frappe_docker 依赖 | `frappe_docker`（submodule） | 固定提交 `a0c52135d4d41c4b8acf7adfdfc5bbcba46dd4d0` |
| 9 | B00 封存记录与下游影响 | `docs/task-packages/B00/task.md` §18 | B00 v1.0（已封存，2026-09-14） |
| 10 | A01 封存记录与下游影响 | `docs/task-packages/A01/task.md` §18 | A01 v1.0（已封存，2026-09-14） |
| 11 | B01 封存记录与下游影响 | `docs/task-packages/B01/task.md` §18 | B01 v1.0（已封存，2026-09-14） |
| 12 | 治理修订评审记录 | `docs/变更记录-2026-09-12-任务包治理修订.md` | CHG-20260912-001（2026-09-12） |

## 6. 授权范围与所有权

### 6.1 可读取范围

- `docs/` 中的规范、PRD、治理文件、P00/B00/A01/B01 材料及公开记录；
- `erp/README.md` 及 `frappe_docker/` 下的部署配置（`compose.yaml`、`overrides/`、`example.env` 等）；
- `frappe_docker/` 内的 ERPNext/Frappe 后端源码与数据模型（用于核对 Sales Order / Delivery Note 字段、状态机、校验逻辑与版本断言行为）；
- ERPNext 运行时：只读 bench 命令、销售链路对象范围的 REST API 调用、只读数据库查询；
- `D:\second-acceptance\snapshots\`、`reset\`（B00 已建立并验证的初始快照与重置脚本，只读复用；不读取 `task-sets\`、`assertions\`、`runs\` 等隐藏验收材料）；
- 不读取任何正式验收题、隐藏数据、终态断言、评分脚本或出题会话上下文。

### 6.2 写入集

| 路径/对象 | 允许动作 | Owner | 是否共享 | 协调规则 |
|---|---|---|---|---|
| `docs/task-packages/B02/` | 新增和维护 B02 任务包、公开证据、接口事实记录与 Evidence Manifest | gjg | 否 | 状态变化必须追加记录，不覆盖历史 |
| `docs/任务包登记表.md` 的 B02 行 | 更新 B02 版本、状态、角色、路径与证据位置 | gjg | 是 | 仅更新 B02 行；其他任务行实质变化另走相应任务或变更流程 |
| `docs/task-records/changes/`、`returns/` | 保存 B02 变更或退回记录（如发生） | gjg | 是 | 使用稳定编号和独立文件 |
| `docs/task-records/freeze-manifests/B02-v1.0.md` | 冻结时登记 B02 冻结清单与哈希 | gjg | 否 | 哈希针对冻结文件计算，不写回被哈希文件 |
| 验收区 `D:\second-acceptance\evidence\` | 保存 B02 敏感原始输出（数据库查询结果、含凭据痕迹的 REST 响应） | gjg | 是 | 脱敏；仅本地验收环境；保留至项目交付 |
| 后端合成销售单据 | 创建/confirm/cancel/删除 `B02-PROBE-` 标识的 Sales Order、Delivery Note（仅验收环境） | gjg | 否 | 单据 name 为 series 自动编号，合成标识经交易对手/物料承载；每次测试后清理，纳入 Evidence Manifest |
| 后端合成前置主数据 | 创建/删除 `B02-PROBE-` 前缀 Customer、Item（含 stock/service 两类，作为销售单据引用前置；复用 B01 主数据接口事实，不重复摸底） | gjg | 否 | 唯一前缀避免冲突；每次测试后清理，纳入 Evidence Manifest |

### 6.3 系统、接口、数据与环境权限

| 权限类别 | 允许范围/对象 | 允许动作 | 明确禁止 | 是否可改变状态 | 不适用理由/审批与证据 |
|---|---|---|---|---|---|
| 系统、接口与命令 | 本地 Docker Compose 生命周期；`docker exec` 只读 bench；`curl` 后端 REST API（限 Sales Order/Delivery Note 读写 + 引用对象只读 + `B02-PROBE-` Customer/Item 前置数据创建/删除）；`mariadb` 只读查询与快照 dump/restore | 启动/停止容器、执行只读 bench、调用销售链路 REST API、dump/restore 站点数据库 | 禁止调用清单外对象写接口；禁止修改 `frappe_docker` 源码或提交历史；禁止 `git push`、历史改写 | 是，仅验收环境后端状态 | 由本任务交付物与证据证明 |
| 数据与凭证类型 | 本地开发默认凭据（管理员账号、API Key/Secret、数据库密码；取值见 `erp/README.md` 与 `frappe_docker/.env`，本文件不列明） | 读取并使用以调用后端 | 不得记录或输出凭据值、完整认证头 | 否 | 仅限本地验收环境；证据脱敏 |
| 数据库状态 | 站点数据库 `_ebde57cb5cf2199a` | 只读查询；快照 dump/restore | 禁止直接写库；禁止改变生产或共享数据 | 是，仅快照重置 | 合成对象写经 REST API（见上）；每次重置记录命令与终态，纳入 Evidence Manifest |
| 依赖安装 | 不适用 | 禁止 | 禁止安装或升级依赖 | 否 | 复用现有 Docker 环境 |
| 运行环境与配置 | 本地 Docker 容器与 bench 运行时 | 启停容器、执行只读 bench | 禁止修改 `frappe_docker` 工作树、ERPNext 站点/后端配置 | 是，仅容器生命周期 | 由证据证明未改动后端 |
| 外部网络与服务 | 不适用 | 禁止 | 禁止外部网络调用与远程可达性探测 | 否 | 后端为本地 `localhost:8080`，可完全离线完成 |

## 7. 禁止事项

- 不得修改上游规范、冻结 PRD、冻结治理规则和冻结验收题；
- 不得扩大对象、tool 或权限范围（仅 Sales Order/Delivery Note 读写 + 引用对象只读 + `B02-PROBE-` 前置 Customer/Item 创建/删除）；
- 不得重新验证 B01 已冻结的主数据结论（同名/版本/区间），`B02-PROBE-` Customer/Item 仅作引用前置；
- 不得新增通用 CRUD 或任意代码执行面；
- 不得绕过 server 侧确认（本包不开发 tool、不涉确认，但不得以本包结论反向放松后续确认要求）；
- 不得让失败路径静默成功；
- 不得输出密钥、密码、完整认证头、完整堆栈或未授权业务数据；
- 不得为通过验收而改变冻结题目；
- 不得将隐藏验收题、初始数据、评分细节或终态断言反馈给实施侧；
- 读取过隐藏验收材料的人员、会话或执行实例不得参与对应实现、实施方案评审、调参或定向修复；
- 不得修改 ERPNext 源码、schema、`frappe_docker` 内容或站点配置；
- 不得在生产或共享环境操作，不得写清单外对象或真实业务数据；
- 不得让 `B02-PROBE-` 合成对象在测试后残留（每次测试后删除或快照恢复）；
- 不得为测试 Delivery Note 正向发货而制造真实库存（Stock Entry/Purchase Receipt 属 B03/B04 范围）；
- 不得将 B02 状态误作契约冻结、业务 tool 实现或项目完成状态。

## 8. 工作项

| 编号 | 工作项 | 交付物/完成断言 |
|---|---|---|
| W01 | 复核验收环境与凭据 | 复核 `erpnext.local` 独占非生产可销毁、版本符合冻结目标 `15.121.2`/`15.120.1`、快照重置可用、凭据有效（脱敏）；复用 B00/B01 已冻结事实并记录复核结论 |
| W02 | Sales Order create 摸底 | 实测 Sales Order create（naming_series 自动编号、customer/item/price list 引用校验、草稿 docstatus=0、子表行项目嵌套读写）；记录接口路径、行为与报错形式 |
| W03 | Sales Order confirm 摸底 | 实测 confirm（状态漂移 0→1、modified 变化、陈旧 modified 版本断言、交易对手/物料/日期/价格关键状态校验）；记录结论 |
| W04 | Sales Order cancel 摸底 | 实测 cancel（合法前态、下游单据约束、已生效取消的冲回行为、陈旧 modified 版本断言）；记录结论 |
| W05 | Delivery Note create 摸底 | 实测按来源销售订单生成发货草稿（来源订单须已生效、行数量不超过未完成量、子表行项目、草稿状态）；记录结论 |
| W06 | Delivery Note confirm 摸底 | 实测 confirm（状态漂移、陈旧 modified 版本断言、来源行剩余可发数量校验、可用库存充足/仓库有效校验——负向库存不足 + 非库存物料正向）；记录结论 |
| W07 | 原子性/失败不静默与清理确认 | 实测 create/confirm/cancel 是否单次原子完成、confirm 状态校验与提交是否同一事务（PRD §5.5）；写失败是否被正确报告（非静默成功）；确认 `B02-PROBE-` 对象清理路径与零残留 |
| W08 | 冻结接口事实记录 | 汇总 W01–W07 形成接口事实记录（覆盖第 9 节全部 9 项），作为 D01/D02 权威输入 |

## 9. 输入输出契约

B02 不提供正式业务 tool，不定义 tool 语义或 schema。本节规定接口事实记录的冻结输出结构（D01/D02 权威输入）。

接口事实记录（交付物 D04）必须逐对象（Sales Order / Delivery Note）逐项包含并可复核：

1. 接口路径与可用性：create/confirm/cancel 的 REST 端点或等效调用方式、实测可达性；Delivery Note 按来源销售订单生成草稿的方式；草稿删除作为回滚路径确认（PRD §5.4）；
2. 命名与编号：`naming_series` 自动编号行为、`name` 生成形式（推测：单据无「同名唯一性」、为 series 连续编号，待实测确认）；
3. 引用字段有效性：customer / item / warehouse / company / currency / price list 等 Link 字段无效时的校验行为；
4. 单据状态机与 docstatus：create→草稿（docstatus=0）、confirm→已生效（1）、cancel→已取消（2）的状态漂移及 `modified` 变化语义；
5. 乐观版本断言：confirm / cancel 时传入陈旧 `modified` 是否被后端拒绝、拒绝形式（PRD §5.2 #14/#15/#22）；
6. 来源单据与数量/库存校验：Delivery Note 来源订单须已生效、来源行剩余可发数量、可用库存充足/仓库有效的校验行为（PRD §5.2 #22）；
7. 原子性结论：create/confirm/cancel 是否由后端单次原子完成，confirm 状态校验与提交是否同一事务（PRD §5.5）；
8. 回滚/取消条件：cancel 的合法前态、下游单据约束、已生效取消的冲回行为；草稿删除路径（PRD §5.4）；
9. 失败不静默：写失败是否被正确报告（非静默成功）。

记录一经冻结，写入 PRD 或成为 D01/D02 权威输入时均须走变更控制；B02 本身不改变 PRD 冻结语义。

## 10. 不变量

- 冻结 PRD、总则、模板、登记表结构与边界规则内容不得被 B02 修改；
- 不修改 ERPNext 源码、schema、`frappe_docker` 或站点配置；
- 仅操作 `B02-PROBE-` 标识合成销售单据与前置主数据，不写清单外对象或真实业务数据；
- 每次测试后合成对象不残留（删除或快照恢复）；
- 写失败不得以成功响应伪装；
- 凭据值、完整认证头、完整堆栈不得出现在证据、提交或公开实施区；
- 实施会话不得读取验收材料；不得将隐藏验收材料反馈给实施侧；
- 接口事实未经实测不得写入记录（不得以推测代替结论，总则 §4.2）。

## 11. 交付物

| 编号 | 交付物 | 存放位置 | 验收方式 |
|---|---|---|---|
| D01 | B02 任务包 | `docs/task-packages/B02/task.md` | 按冻结模板检查必备结构 |
| D02 | B02 Evidence Manifest | `docs/task-packages/B02/evidence-manifest.md` | 逐项追溯工作项与完成定义 |
| D03 | 更新后的任务包登记表 | `docs/任务包登记表.md` | B02 行与本文件一致，表格结构未改变 |
| D04 | 销售链路接口事实记录 | `docs/task-packages/B02/interface-facts.md` | 覆盖第 9 节全部 9 项，逐对象可复核 |
| D05 | 合成数据与清理记录 | `docs/task-packages/B02/evidence/`（脱敏）+ `D:\second-acceptance\evidence\`（敏感） | 合成对象唯一前缀、清理终态可复核 |
| D06 | 各场景原始证据（REST 响应、数据库查询、报错，脱敏） | `docs/task-packages/B02/evidence/` | 逐场景可复核 |

> 敏感原始证据、凭据、包含敏感信息的日志不得进入公开实施区；其受控位置统一为 `D:\second-acceptance\evidence\`，并在 Evidence Manifest 中登记脱敏引用（总则 §15.1）。

## 12. 开发自检

| 编号 | 检查方法 | 预期结果 |
|---|---|---|
| S01 | 复核站点独占/非生产/版本/快照重置/凭据 | 环境事实与 B00/B01 冻结一致；快照可重置；凭据有效 |
| S02 | Sales Order create 合成对象实测 | naming_series 编号、引用校验、草稿状态、子表行项目均有实测记录 |
| S03 | Sales Order confirm 合成对象实测 | 状态漂移、版本断言、关键业务状态校验均有实测记录 |
| S04 | Sales Order cancel 合成对象实测 | 合法前态、下游约束、冲回行为、版本断言均有实测记录 |
| S05 | Delivery Note create 合成对象实测 | 来源订单已生效校验、未完成量校验、子表行项目均有实测记录 |
| S06 | Delivery Note confirm 合成对象实测 | 状态漂移、版本断言、剩余可发数量、库存/仓库校验均有实测记录 |
| S07 | 原子性/失败不静默/清理测试 | 单次原子完成；失败不静默成功；`B02-PROBE-` 对象测试后零残留 |
| S08 | 汇总接口事实记录 | 覆盖第 9 节全部 9 项，逐对象逐项可复核 |

## 13. Evidence Manifest

证据统一维护在 `docs/task-packages/B02/evidence-manifest.md`，本文件不重复记录明细。

## 14. 完成定义

- [x] 全部前置条件已经在冻结后重新验证；
- [x] 工作项与交付物全部完成；
- [x] 接口事实记录输出契约未被擅自改变；
- [x] 适用不变量均有正式证据；
- [x] 冻结后正式开发自检通过；
- [x] Evidence Manifest 完整且正式证据可独立复核；
- [x] 未修改禁止范围；
- [x] 剩余限制和风险已记录；
- [ ] 独立验收通过。

## 15. 停止与升级条件

继承《MCP 改造任务包总则》第 6.15 节。另有以下 B02 条件时，停止受影响工作并转为「待澄清」：

- 本地 ERPNext 实例不可达且无法修复；
- 站点 `erpnext.local` 无法确认为独占、非生产、可销毁，或快照无法重置；
- 销售链路对象接口无法在授权范围内实测（如端点缺失、权限不足）；
- 需要新增对象、tool、权限或外部依赖；
- 需要修改冻结 PRD、总则、模板、登记表结构或边界规则。

**注意**：「乐观版本断言 / confirm 状态漂移 / 原子性不被后端原生保证」不是停止条件，而是可判定的有效结论——此时结论为「须由 MCP server 层实现」，仍作为 D01/D02 权威输入（PRD §5.2/§5.5）。「Delivery Note 充足库存正向发货无法在本包授权范围内实测」同样不构成停止——本包以「库存不足负向 + 非库存物料正向」为界，充足库存正向发货记为跨任务边界留待 B03/B04 或 F02。只有当无法取得可复核的确定性结论时，才触发停止与升级。

报告必须包含阻断事实、影响范围、已完成的安全检查以及需要谁作出什么决定。

## 16. 风险、假设与待决事项

- 合成对象统一使用 `B02-PROBE-` 标识；单据 `name` 为 naming_series 自动编号，合成标识经交易对手/物料承载，每次测试后以 create 返回的 `name` 列表（SO-XXXXX/DN-XXXXX）作清理主键删除或快照恢复；清理注意顺序——已确认的 SO 存在下游 DN 时先删 DN、再 cancel→delete SO；
- Sales Order / Delivery Note 的 naming_series 具体格式（如 `SO-XXXXX`、`DN-XXXXX`）待实测确认；
- confirm 状态漂移、乐观版本断言与原子性的「后端原生强制」程度待实测确认——ERPNext 可能不做原生强制，此时结论为「须由 MCP server 层实现」，仍属有效产出，不构成停止；
- Delivery Note confirm 的「可用库存充足」正向发货需真实库存就绪（B03/B04 范围），本包仅测负向库存不足 + 非库存物料正向，充足库存正向发货留待 B03/B04 或 F02；
- cancel 的下游单据约束行为待实测（已生效销售订单存在下游发货单时是否拒绝取消、拒绝形式）；
- 前置 Customer/Item 合成数据复用 B01 已冻结主数据接口事实创建，不重复摸底；Service Item（is_stock_item=0）用于 Delivery Note 正向发货，Stock Item（is_stock_item=1）用于库存不足负向；
- Implementer 为独立编码上下文，Acceptor=gjg、Implementation Reviewer=gjg；实施会话与 Acceptor 的隔离沿用 B00 已建立的隔离事实（受限账户 + NTFS ACL），B02 不重复建设；
- 后端凭据为本地开发默认值，仅限本地验收环境；迁移共享/生产环境必须更换。

## 17. 评审与状态记录

| 时间 | 原状态 | 新状态 | 操作人 | 依据/说明 |
|---|---|---|---|---|
| 2026-09-14 | 规划中 | 草拟 | Claude | 创建完整任务包文件并指定 Owner gjg，必备结构完整，待 gjg 评审冻结 |
| 2026-09-14 | 草拟 | 待评审 | Claude | 必备结构完整，提交 gjg 评审 |
| 2026-09-14 | 待评审 | 已冻结 | gjg | 评审通过，无阻断问题；批准 B02 v1.0 冻结；拍板两边界决策——① 允许 `B02-PROBE-` 前缀 Customer/Item 作引用前置（复用 B01 主数据接口事实，不重复摸底）；② Delivery Note 仅测库存不足负向 + 非库存物料正向，充足库存正向发货留待 B03/B04/F02；尚未实施或验收 |
| 2026-09-14 | 已冻结 | 实施中 | Claude（B02 实施上下文） | 前置条件核对成立（环境可达、版本 15.120.1/15.121.2 符合、凭据有效、快照重置实测可用）；进入实施 |
| 2026-09-14 | 实施中 | 待验收 | Claude（B02 实施上下文） | W01–W08 完成；D01–D06 齐备；S01–S08 自检通过；B02-PROBE- 对象零残留（REST+DB 八类 0）；interface-facts.md 覆盖 §9 全部 9 项；独立验收由 Acceptor gjg 执行 |
