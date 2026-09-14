# B00 Evidence Manifest

> 当前状态：B00 v1.0 已冻结的正式证据计划。下列 `EV-B00-*` 仅为草案映射，不构成正式实施、自检或验收证据。B00 进入「实施中」后，必须按冻结自检方法重新执行 S01—S12，以 `EV-B00-*` 编号登记正式证据。

## 1. 证据映射（冻结后执行）

| 证据编号 | 对应工作项/自检/完成条件 | 必须记录的实际命令或操作 | 预期值 | 原始输出位置 | 当前状态 |
|---|---|---|---|---|---|
| EV-B00-001 | W01、S01、前置条件 | 执行 `bench list-apps` 及版本查询，记录站点名、地址、凭据可用性（脱敏）；确认站点独占、非生产、可销毁 | 版本与基线一致；登录/Token 可用；Owner 确认站点可销毁后才进入写操作 | `evidence/W01-environment-<时间戳>.txt` | 待实施 |
| EV-B00-002 | W02、S02、对象裁剪 | 查询 12+9 类对象 DocType 元数据 | 目标 DocType 均存在且可访问；清单外对象不出现 | `evidence/W02-doctypes-<时间戳>.txt` | 待实施 |
| EV-B00-003 | W03、S03、权限模型可行性 | 检查角色/用户/权限分配机制，创建探针角色 | 可按调用方粒度配置最小权限 | `D:\second-acceptance\evidence\EV-B00-003-permission-model-<时间戳>.txt` | 待实施 |
| EV-B00-004 | W04、S04、临时探针最小权限 | 以探针账号访问清单外对象 | 越权被后端原生拒绝（PermissionError） | `D:\second-acceptance\evidence\EV-B00-004-probe-unauthorized-<时间戳>.txt` | 待实施 |
| EV-B00-005 | W05、S05、原生 API 可用性 | 验证 12+9 对象只读可达，以最小合成探针验证写端点 | 只读可达；写端点经合成探针可用；不逐对象 CRUD | `evidence/W05-api-<时间戳>.txt` | 待实施 |
| EV-B00-006 | W06、S06、事务与回滚 | 验证后端事务/回滚能力，测试失败不静默成功 | 事务/回滚能力存在；失败路径不静默成功 | `D:\second-acceptance\evidence\EV-B00-006-transaction-rollback-<时间戳>.txt` | 待实施 |
| EV-B00-007 | W07、S07、快照重置 | 先备份→验证恢复路径→写合成数据→dump→恢复→比对终态 | 恢复路径可回滚；恢复后终态与快照一致 | `D:\second-acceptance\evidence\EV-B00-007-snapshot-restore-<时间戳>.txt` | 待实施 |
| EV-B00-008 | W08、S08、独立验收环境 | 确认站点独占、非生产；校验应用版本与迁移状态；生成 DocType 元数据基线哈希 | 应用版本符合目标；迁移正常；生成 schema 基线哈希；不声称与生产一致 | `D:\second-acceptance\evidence\EV-B00-008-acceptance-env-<时间戳>.txt` | 待实施 |
| EV-B00-009 | W09、S09、可信调用方身份 | 调用 `get_logged_user` 等核查身份来源/稳定性/共享/区分 | 身份来源可信、跨会话稳定、区分原则明确 | `D:\second-acceptance\evidence\EV-B00-009-caller-identity-<时间戳>.txt` | 待实施 |
| EV-B00-010 | W10、S10、币种/价格表 | 查询 Company/Price List 唯一性，核验 fail-closed 条件 | `gjg` 唯一、CNY、selling 价格表唯一=Standard Selling | `D:\second-acceptance\evidence\EV-B00-010-currency-pricelist-<时间戳>.txt` | 待实施 |
| EV-B00-011 | W11、S11、存量证据接管 | 重新执行或书面采纳 PRD 引用的「B00 实测」探索证据 | 生成新证据编号并保留来源引用 | `evidence/W11-adopt-<时间戳>.txt` | 待实施 |
| EV-B00-012 | W12、S12、隔离路径（当前阻断） | 执行 D12 `setup-isolation.ps1` 建账户+ACL、`verify-isolation.ps1` 以受限账户读哨兵 | 读取返回 Access Denied，真实权限隔离生效 | `D:\second-acceptance\evidence\EV-B00-012-isolation-sentinel-<时间戳>.txt` | 待实施 |

## 2. 正式证据记录要求

每条 `EV-B00-*` 必须在执行后补齐：执行者、精确到秒且含时区的时间、操作系统与 shell 版本、完整命令或可复现人工步骤、退出码、预期值、实际值、原始输出位置、原始输出 SHA-256、关联的 B00 冻结版本/哈希及脱敏说明。只有结论而无原始输出的记录不得标记为成功。

## 3. 敏感信息与受控位置

- 涉及凭据值、完整认证头、数据库连接信息、后端真实业务数据的原始输出不得进入公开实施区；
- 公开证据目录 `docs/task-packages/B00/evidence/` 仅存放脱敏后的命令签名、结论摘要与可复核的退出码/哈希；
- 敏感原始输出的受控目录为 `D:\second-acceptance\evidence\`（Owner=gjg；访问主体=验收侧 Acceptor/Implementation Reviewer；保留至项目交付）；各证据行的原始输出已指向具体文件路径模板 `EV-B00-<编号>-<主题>-<时间戳>.txt`，实施时以实际时间戳落盘；
- 不得记录密码、密钥、完整认证头或其他敏感凭据（总则 §6.13）。
