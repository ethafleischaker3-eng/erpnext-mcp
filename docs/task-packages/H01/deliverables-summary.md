# H01 项目交付物汇总（CD-2）

> 文档性质：H01 交付物 CD-2，《项目交付物汇总》。依据《MCP 改造任务包总则》v1.1 §4.6 交付任务包定义，逐类汇总并追溯到对应任务包交付物。
> 任务包：H01 v1.0（已冻结）；实施主体：Claude（H01 交付上下文）；Owner：gjg；日期：2026-09-18。
> 本汇总只引用上游已封存/已通过交付物的脱敏结论与位置，不重新执行、不产出新业务交付。

---

## 0. 交付形态声明

本项目为「**旁挂 MCP server + 独立验收环境**」形态（规范 §6.2 旁挂形态、PRD §5.7）：`server/` 为独立进程 stdio MCP server，不改后端源码，不开发前端；验收在独立站点 `erpnext.local` 上以合成数据完成。**生产部署、生产凭据、生产数据治理不在此次交付范围内**——交付物汇总中「部署运维/回滚」为验收环境口径，生产上线为二期事项（见 §7）。

## 1. 验证记录

| 项 | 内容 | 位置 |
|---|---|---|
| 集成验收结论 | G01 v1.0 通过：15 题 × 连续两轮 30/30 全过、失败路径 T11–T15 100%、销售/采购多步链通过、26 tool 覆盖 19 写/6 读/1 plan、调用/自纠未超限 | `docs/task-packages/G01/acceptance-report.md` |
| 逐题逐轮运行记录（隐藏，对实施主体 Deny） | 30 份 `G01-R{r}-{T}.json`（题目 prompt、tool 调用序列、后端终态 dump、断言核对、次数统计） | `D:\second-acceptance\runs\`（H01 仅引用位置与脱敏结论，不读取） |
| 缺陷归责与闭环 | T09 实现缺陷 → F04 #23 → `RTN-20260918-G01-001` → 修复 `c6b4273` → G01 复跑通过 | `docs/task-records/returns/RTN-20260918-G01-001.md` |
| 客户端确认能力验证 | A01 L3 成立（Claude Code 2.1.263 / MCP 2025-11-25 支持 `elicitation`，fail-closed） | `docs/task-packages/A01/verification-record.md` |
| 接口事实（B01–B05） | 主数据/销售/采购/库存/幂等边界实测结论 | `docs/task-packages/B01..B05/*/interface-facts.md`（B05 为 `idempotency-research.md`） |
| 各 F 包自检/独立验收 | F01（6 读）、F02（10 销售/采购写）、F04（10 写/只出 plan）自检与验收记录 | `docs/task-packages/F01|F02|F04/*/dev-selftest.md`、`acceptance-record.md` |

## 2. 权限矩阵

| 项 | 内容 | 位置 |
|---|---|---|
| 权限矩阵（逐 tool + 反向逐对象） | 26 tool × 12 操作允许 + 9 引用允许对象的最小权限映射；DocType → DocPerm 收敛（23 DocType） | `docs/task-packages/E01/permission-matrix.md`（v1.1） |
| 两张允许清单 | 操作允许 12 类 / 引用允许 9 类，server 侧三层强制拦截 | `docs/task-packages/E01/allowlist.md`（v1.1） |
| 正式账号/角色 | 专用账号 `mcp-service` + 角色 `MCP Business Caller`（23 DocPerm；Account/Cost Center 仅 read+select 框架级只读依赖） | `docs/task-packages/E01/roles.md`（v1.1） |
| 人工确认与 fail-closed | server 侧 elicitation 确认、完整参数、拒绝零副作用、客户端不支持/币种价格表异常 fail-closed | `docs/task-packages/E01/confirmation-failclosed.md` |
| 越权验证 | 清单外对象/引用增删改/只读写均 403 拒绝 | `docs/task-packages/E01/authorization-verification.md` |

> 凭据值一律脱敏，不在此汇总输出（E01 `roles.md` 仅登记 API 凭证为「专用 Token（脱敏）」，原始值在验收区 evidence）。

## 3. 部署运维说明

| 项 | 内容 | 位置 |
|---|---|---|
| MCP server 运行 | `server/index.js`，stdio JSON-RPC，零外部依赖，Node ≥ 18；`export ERP_BASE_URL/ERP_API_KEY/ERP_API_SECRET` 后 `node index.js`；未配置凭据时仅应答 initialize/tools/list | `server/README.md` |
| 后端环境 | ERPNext v15.121.2 / Frappe v15.120.1，Docker 部署（`frappe_docker-backend-1`/`-db-1`），站点 `erpnext.local`，访问 `http://localhost:8080` | `erp/README.md` §2/§3 |
| 后端启停 | `docker compose -f compose.yaml -f overrides/compose.mariadb.yaml -f overrides/compose.redis.yaml -f overrides/compose.noproxy.yaml up/down` | `erp/README.md` §3.1 |
| 快照/备份/重置 | 原生备份 / `mariadb-dump` / Docker 卷备份三种方式，站点库 `_ebde57cb5cf2199a` | `erp/README.md` §3.2 |
| 锁定配置 | 锁单公司 `gjg`、币种 `CNY`、销售价格表 `Standard Selling`（server 集中配置，fail-closed） | `server/src/config.js`、E01 `confirmation-failclosed.md` §2.1 |

> 以上为验收环境运维口径；生产环境部署、生产凭据管理、生产数据治理不在本次交付范围（PRD §5.7、§11）。

## 4. 回滚手册

| 项 | 内容 | 位置 |
|---|---|---|
| 回滚路径（批次级） | 草稿 → 删除；已生效 → 后端原生取消；已取消 → 终态不可回滚（台账如实标注） | PRD §5.4、E02 `implementation-contract.md` §5 |
| 业务取消（MCP tool） | `sales_order_cancel`(#15)、`purchase_order_cancel`(#18)（人确认档） | D02 `tool-contract.md` §4.3/§5.3 |
| 异常回滚（管理员运维） | 采购收货/销售发货/库存调拨无 cancel tool，其取消由管理员运维执行后端原生取消，不开放 MCP rollback tool；执行前须管理员显式确认 | PRD §5.4、`server/README.md`「写操作口径」 |
| 回滚顺序 | 跨批次按单据上下游倒序回滚（先下游后上游），台账记录批次依赖 | PRD §5.4、E02 §5 |
| 主数据/价格回滚 | create 删除条件 + update 前镜像版本保护 + 不可自动回滚转管理员处置 | PRD §5.4「主数据与价格回滚路径」 |
| 批次查询 | `erpnext_batch_status_get`(#26) 只读查询归属自身会话批次，不可主动回滚 | D02 §2.6、E02 §6 |

> 已生效调拨单（Stock Entry）因 SLE 持久化不可物理删除（B04 F10），回滚口径为「不承诺删除」，如实声明（D02 §6.2 第 9 项）。

## 5. 验收报告

| 项 | 内容 | 位置 |
|---|---|---|
| 完整集成验收报告 | G01 结论「通过」，30/30 全过、覆盖核对、缺陷归责、剩余限制 | `docs/task-packages/G01/acceptance-report.md` |
| 符合性声明 | 本包 CD-1（等级 L3 / 档位 / SHOULD / 不适用） | `docs/task-packages/H01/compliance-statement.md` |
| 项目完成判定 | 本包 CD-3（总则 §16.4 四项逐条） | `docs/task-packages/H01/project-completion.md` |

## 6. 已知限制

1. **会话级批次归属**：stdio 下无可跨会话稳定身份信号，批次归属只能到会话粒度；普通调用方跨会话查询旧批次不支持（E02 §5.5，如实记录，不宣称未成立能力）。
2. **幂等误合并残余风险**（create 组 300s 窗口内同参数合法重复会被误合并）：无业务引用号对象无法彻底消除，缓解为窗口期缩短 + #26 批次查询暴露（B05 §9、E02 §8）。
3. **管理员判定为 hook**：管理员查询全量台账依赖后端 Role/DocPerm 判定（`adminResolver`），F 包接入前不宣称管理员查询能力成立（E02 §8）。
4. **已生效单据不可物理删除**：已生效 PR/DN/STE 因 SLE 持久化不可物理删除，回滚「不承诺删除」（B03 F9/B04 F10）。
5. **客户端变更须重新起算**：确认能力绑定 Claude Code 2.1.263（stdio）；更换客户端（如 VS Code 扩展变体存在静默拒绝 elicitation 的公开 issue）须重新核查 L3（A01 §4、总则 §12）。
6. **生产上线为二期**：本次仅验收环境交付，生产部署/凭据/数据治理未覆盖（PRD §5.7/§11）。
7. **`server/README.md`/`package.json` 描述滞后**：其「16 个 tool」描述写于 F04 时点，未随 F02 追加 #13–#22 更新为 26；实现事实以 `server/src/registry.js`（26 tool）与 G01 结论为准，文档描述为已知小瑕疵，不构成功能缺陷。

## 7. 二期事项

1. **财务域**：销售发票/收款付款/记账凭证/总账（PRD §2.2 决议 6，档位按 §10.2 单独推导）。
2. **制造域**：BOM、工单、生产计划（同上）。
3. **跨 tool 聚合回滚**：订单 → 收货 → 发货跨业务流的聚合回滚（PRD §5.4 一期为二期）。
4. **生产环境上线**：生产部署、生产凭据治理、生产数据治理（§11）与灾难恢复能力（P00 已知限制：本地 Git 不构成灾难恢复）。
5. **跨会话批次归属增强**：若 B00 验收区详细身份证据补充，可通过升级 `identity` 钩子支持跨会话查询旧批次（E02 §5.5，须走变更控制）。
6. **全自动档扩展评估**：PRD §4.1 决议 5——生效/取消暂定人确认，跑满一个验收迭代且失败路径全过后再评估扩展（业务 + 实施方）。
