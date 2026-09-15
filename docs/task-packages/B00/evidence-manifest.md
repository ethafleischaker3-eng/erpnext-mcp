# B00 Evidence Manifest

> 当前状态：B00 v1.0 已通过独立验收（2026-09-14）。下列 `EV-B00-*` 条目为按冻结自检方法执行 S01—S12 后登记的正式证据。

## 1. 证据映射（冻结后执行）

| 证据编号 | 对应工作项/自检/完成条件 | 必须记录的实际命令或操作 | 预期值 | 原始输出位置 | 当前状态 |
|---|---|---|---|---|---|
| EV-B00-001 | W01、S01、前置条件 | 执行 `bench list-apps` 及版本查询，记录站点名、地址、凭据可用性（脱敏）；确认站点独占、非生产、可销毁 | 版本与基线一致；登录/Token 可用；Owner 确认站点可销毁后才进入写操作 | `evidence/W01-environment-20260912-194210.txt` | 已完成（版本+凭据+站点独占/可销毁 Owner 书面确认） |
| EV-B00-002 | W02、S02、对象裁剪 | 查询 12+9 类对象 DocType 元数据 | 目标 DocType 均存在且可访问；清单外对象不出现 | `evidence/W02-doctypes-20260912-194313.txt` | 已完成（21/21 HTTP 200） |
| EV-B00-003 | W03、S03、权限模型可行性 | 检查角色/用户/权限分配机制，创建探针角色 | 可按调用方粒度配置最小权限 | `D:\second-acceptance\evidence\EV-B00-003-permission-model-20260912-194614.txt` | 已完成（机制核查）；探针角色创建属 W04 |
| EV-B00-004 | W04、S04、临时探针最小权限 | 以探针账号访问清单外对象 | 越权被后端原生拒绝（PermissionError） | `D:\second-acceptance\evidence\EV-B00-004-probe-unauthorized-20260912-200900.txt`、`D:\second-acceptance\evidence\EV-B00-004-probe-docperm-fields-20260914-105516.txt` | 已完成（探针角色/用户 + 清单外 PermissionError + 21 DocPerm 字段级 read=1/write=0/create=0/delete=0） |
| EV-B00-005 | W05、S05、原生 API 可用性 | 验证 12+9 对象只读可达，以最小合成探针验证写端点 | 只读可达；写端点经合成探针可用；不逐对象 CRUD | `evidence/W05-api-20260912-201055.txt`、`evidence/W05-api-create-read-20260914-105620.txt` | 已完成（POST 200/创建后 GET 200/DELETE 202/清理后 404） |
| EV-B00-006 | W06、S06、事务与回滚 | 验证后端事务/回滚能力，测试失败不静默成功 | 事务/回滚能力存在；失败路径不静默成功 | `D:\second-acceptance\evidence\EV-B00-006-transaction-rollback-20260912-201152.txt` | 已完成（rollback 后 None + 417 LinkValidationError） |
| EV-B00-007 | W07、S07、快照重置 | 先备份→验证恢复路径→写合成数据→dump→恢复→比对终态 | 恢复路径可回滚；恢复后终态与快照一致 | `D:\second-acceptance\evidence\EV-B00-007-snapshot-restore-20260912-201242.txt` | 已完成（dump 8.3MB → 合成写 → restore → 404） |
| EV-B00-008 | W08、S08、独立验收环境 | 确认站点独占、非生产；校验应用版本与迁移状态；生成 DocType 元数据基线哈希 | 应用版本符合目标；迁移正常；生成 schema 基线哈希；不声称与生产一致 | `D:\second-acceptance\evidence\EV-B00-008-acceptance-env-20260912-194503.txt` | 已完成（版本+迁移+schema 哈希+站点独占/非生产 Owner 书面确认） |
| EV-B00-009 | W09、S09、可信调用方身份 | 调用 `get_logged_user` 等核查身份来源/稳定性/共享/区分 | 身份来源可信、跨会话稳定、区分原则明确 | `D:\second-acceptance\evidence\EV-B00-009-caller-identity-20260912-194614.txt`、`D:\second-acceptance\evidence\EV-B00-009-caller-identity-crosssession-20260914-094316.txt` | 已完成（token+两个独立登录会话均返回 Administrator，跨会话稳定）；服务账号共享策略已由 Owner gjg 最终书面确认（2026-09-14） |
| EV-B00-010 | W10、S10、币种/价格表 | 查询 Company/Price List 唯一性，核验 fail-closed 条件 | `gjg` 唯一、CNY、selling 价格表唯一=Standard Selling | `D:\second-acceptance\evidence\EV-B00-010-currency-pricelist-20260912-194355.txt` | 已完成（Company=1/gjg/CNY；selling+enabled PriceList=1/Standard Selling） |
| EV-B00-011 | W11、S11、存量证据接管 | 重新执行或书面采纳 PRD 引用的「B00 实测」探索证据 | 生成新证据编号并保留来源引用 | `evidence/W11-adopt-20260912-194643.txt`、`evidence/W11-masterdata-counts-20260912-194716.txt` | 已完成（版本/公司/币种/价格表/主数据 re-verify 一致；接口读写结论待 W05） |
| EV-B00-012 | W12、S12、隔离路径 | 执行 D12 `setup-isolation.ps1` 建账户+ACL、`verify-isolation.ps1` 以受限账户读哨兵 | 读取返回 Access Denied，真实权限隔离生效 | `D:\second-acceptance\evidence\EV-B00-012-isolation-sentinel-20260914-102703.txt`、`D:\second-acceptance\evidence\EV-B00-012-setup-20260914-102703.txt` | 已完成：b00-impl 读哨兵返回 ACCESS_DENIED（干净态重跑）；静态 ACL 隐藏区各仅一条 Deny、无宽泛 ACE |

## 2. 正式证据记录要求

每条 `EV-B00-*` 必须在执行后补齐：执行者、精确到秒且含时区的时间、操作系统与 shell 版本、完整命令或可复现人工步骤、退出码、预期值、实际值、原始输出位置、原始输出 SHA-256、关联的 B00 冻结版本/哈希及脱敏说明。只有结论而无原始输出的记录不得标记为成功。

## 3. 敏感信息与受控位置

- 涉及凭据值、完整认证头、数据库连接信息、后端真实业务数据的原始输出不得进入公开实施区；
- 公开证据目录 `docs/task-packages/B00/evidence/` 仅存放脱敏后的命令签名、结论摘要与可复核的退出码/哈希；
- 敏感原始输出的受控目录为 `D:\second-acceptance\evidence\`（Owner=gjg；访问主体=验收侧 Acceptor/Implementation Reviewer；保留至项目交付）；各证据行的原始输出已指向具体文件路径模板 `EV-B00-<编号>-<主题>-<时间戳>.txt`，实施时以实际时间戳落盘；
- 不得记录密码、密钥、完整认证头或其他敏感凭据（总则 §6.13）。

## 4. 正式证据执行结果（2026-09-12 实施中批次）

执行者：Claude（B00 实施上下文）；时区 China Standard Time (UTC+08:00)；Docker 29.7.2；操作系统 Windows 11 家庭中文版 (build 10.0.26200)。原始输出 SHA-256 基于最终写入的证据文件计算，未写回证据文件本身。

| 证据编号 | 判定 | 原始输出位置 | 原始输出 SHA-256 |
|---|---|---|---|
| EV-B00-001 | 通过：frappe 15.120.1 / erpnext 15.121.2 与基线一致；ping 200；token+cookie 均登录成功 | `evidence/W01-environment-20260912-194210.txt` | `fc2f1e6e9577ff47ee6b2c21448f5cd6523fd2f181e634606325e641d1f52630` |
| EV-B00-002 | 通过：12 操作 + 9 引用 DocType 全部 HTTP 200 | `evidence/W02-doctypes-20260912-194313.txt` | `afedc55d904b2c557a138675748f4977cdf0e1034c05f5354898c2c8ec42da83` |
| EV-B00-003 | 通过：50 启用角色；Customer 9 条 DocPerm 规则；角色粒度权限机制存在 | `D:\second-acceptance\evidence\EV-B00-003-permission-model-20260912-194614.txt` | `eea7a3b1b039934e62bb28e8199cf945e6bf3c8a4ed55ff0ed5606247b6194e6` |
| EV-B00-008 | 通过：DB 侧版本 15.120.1/15.121.2 与代码侧一致（无未执行迁移）；schema 基线哈希 `bb1411f71bf6b4d833d69cbc0064230881e00cef9685298c629364bb2907c5e2` | `D:\second-acceptance\evidence\EV-B00-008-acceptance-env-20260912-194503.txt` | `f9ef5586c9038d9e09d3c76a0ed233439d09a7b2ee75d3ace83e788df82bc3db` |
| EV-B00-009 | 通过：token + 两个独立登录会话 `get_logged_user` 均返回 Administrator（跨会话稳定，服务端认定，非 agent 自报）；服务账号共享策略已由 Owner gjg 最终书面确认（2026-09-14） | `D:\second-acceptance\evidence\EV-B00-009-caller-identity-20260912-194614.txt`、`D:\second-acceptance\evidence\EV-B00-009-caller-identity-crosssession-20260914-094316.txt` | `56e9e59a4cdbbcbe1628918bd2bd37cccc0dfabd0a245ed7c38d8f35b8af31c3`、`d12a7fb2875775073916d486072a864afa356c8a10cfb85ecadebb64c5466020` |
| EV-B00-010 | 通过：Company=1（gjg，default_currency=CNY）；selling=1 且 enabled=1 Price List=1（Standard Selling，CNY） | `D:\second-acceptance\evidence\EV-B00-010-currency-pricelist-20260912-194355.txt` | `713197bf92238478c949777c6afd7ab70a343498f9a65f3a95dbd813e695ae54` |
| EV-B00-011 | 通过：MariaDB 11.8.9；Warehouse=5/Item Group=6/Customer Group=5/Territory=3 与探索记录一致；已生成新证据编号并保留来源引用 | `evidence/W11-adopt-20260912-194643.txt`、`evidence/W11-masterdata-counts-20260912-194716.txt` | `686d2d7bb55ef01844dfbbad5af77b3a816dd286efb838a702c92b817374b222`、`a0adba63d471f7e4b31e5e97a7c023f99000ed7af5018e99f4960ab4ff7c50ca` |
| EV-B00-004 | 通过：B00 Probe 角色（21 对象 read=1）+ b00-probe 用户已提交；has read Customer=True；Sales Invoice/Journal Entry/Purchase Invoice/BOM 均 PermissionError；补证 21 DocPerm 字段级 dump 均为 read=1/write=0/create=0/delete=0/submit=0/cancel=0/amend=0（NON_READ_PERM_COUNT=0，最小只读） | `D:\second-acceptance\evidence\EV-B00-004-probe-unauthorized-20260912-200900.txt`、`D:\second-acceptance\evidence\EV-B00-004-probe-docperm-fields-20260914-105516.txt` | `bd0178cd4301cf7a0c5eb3c9326847edfaec6d27bf1b6430113ebe4cf665d175`、`dfa799e5d96fdada0f8ebd108085327ecfebc98e7fadff9eefc259128fd832ae` |
| EV-B00-005 | 通过：Customer Group 写探针 POST 200 → 创建后 GET 200（对象可读）→ DELETE 202 → 清理后 404 | `evidence/W05-api-20260912-201055.txt`、`evidence/W05-api-create-read-20260914-105620.txt` | `029c669de197e658523a3be3747bf3d5e41844cebd48a3e947101ffa240b42d5`、`4f10956337251fba19f219320e8f73cac4b0b95dcc6932a06d6ebadf367d3e53` |
| EV-B00-006 | 通过：begin+insert+rollback 后对象不存在；非法写 HTTP 417 + LinkValidationError（不静默成功） | `D:\second-acceptance\evidence\EV-B00-006-transaction-rollback-20260912-201152.txt` | `f99e8c91a2fd00b5b22ca9e747a4e71f162bcc40fcf7bbe6e137c116d71e9095` |
| EV-B00-007 | 通过：mariadb-dump 8.3MB/56620 行 → 合成写 200 → restore → 404（终态一致） | `D:\second-acceptance\evidence\EV-B00-007-snapshot-restore-20260912-201242.txt` | `db319c527e08361bb75a6a64702ded7dd77314cde69abfbba62256513378f3ac` |
| EV-B00-012 | 通过：b00-impl 读哨兵 stdout=ACCESS_DENIED: UnauthorizedAccessException（干净态重跑）；静态 ACL 隐藏区各仅一条 b00-impl Deny + Owner/SYSTEM/Administrators（无宽泛 ACE、无重复 Deny） | `D:\second-acceptance\evidence\EV-B00-012-isolation-sentinel-20260914-102703.txt`、`D:\second-acceptance\evidence\EV-B00-012-setup-20260914-102703.txt` | `d15b502711ab1f143298606e1e1ba23de55c8a58e0933940ae5e4e0e0062018b`、`71d80dae45a9c4733db79b838e2b8d6aee705c4bca60ef1e7a12f6e20295c789` |

## 5. 剩余事项

Owner 站点独占书面确认已于 2026-09-12 取得（W01 补充证据）；W04—W12 已全部完成；探针清理与 pristine 初始快照已于 2026-09-14 完成（快照 `baseline-20260914-095506.sql`，SHA-256 `2d0be88c…`，零 B00 产物残留；reset 脚本 `D:\second-acceptance\reset\restore-snapshot.sh`）。剩余事项：

1. **D12 脚本缺陷修复（已完成）**（见 §6）：四处缺陷已修复，并于 2026-09-14 由 Owner 以管理员 PowerShell 从干净态重跑（teardown→setup→verify）验证通过，已重拍 EV-B00-012（隐藏区各仅一条 Deny + 负向读取 ACCESS_DENIED）。
2. **服务账号共享策略（已由 Owner gjg 最终书面确认，2026-09-14）**：EV-B00-009 跨会话稳定性已实证，服务账号共享策略已回填（共用单一 Administrator 服务账号，Role/DocPerm 区分主体）；Owner gjg 于 2026-09-14 最终书面确认该策略生效，迁移到共享/生产环境前须更换凭据并由 E04 冻结时另行明确。
3. **正式自检 S01—S12（已完成，2026-09-14）**：冻结后按冻结自检方法逐项复核（含五份不可变治理文件哈希），已转「待验收」并经 Acceptor 独立复核 + Acceptance Reviewer gjg 签核通过。
4. **S04/W05 补证（已完成，2026-09-14）**：独立验收两项存疑/观察已关闭——① EV-B00-004 补字段级 dump `EV-B00-004-probe-docperm-fields-20260914-105516.txt`，21 条 DocPerm 均 read=1/write=0/create=0/delete=0/submit=0/cancel=0/amend=0（NON_READ_PERM_COUNT=0），证明最小只读；② EV-B00-005 补创建后 GET `W05-api-create-read-20260914-105620.txt`（POST 200 → 创建后 GET 200 → DELETE 202 → 404）。补证探针已 restore pristine 快照清理，零残留（Role/User/DocPerm/B00-PROBE Customer Group 均不存在）。

5. **snapshots/ 由受控转隐藏（已完成，2026-09-15）**：B00 v1.0 封存后发现 snapshots/（初始数据与快照所在）实际 ACL 仍为 b00-impl Modify（B00 写基线的临时授权），实施主体可读基线快照，违反边界 §2「隐藏初始数据」隔离原则。已由 Owner gjg 于 2026-09-15 以管理员 icacls 将 snapshots/ 改为 b00-impl Deny（静态 `(OI)(CI)N`，与 task-sets/assertions/runs 同源），并经 `verify-isolation.ps1 -Sentinel D:\second-acceptance\snapshots\sentinel.txt` 负向读取返回 `ACCESS_DENIED: UnauthorizedAccessException`。证据：静态 `D:\second-acceptance\evidence\EV-B00-012-snapshots-deny-20260915-133520.txt`、动态 `D:\second-acceptance\evidence\EV-B00-012-snapshots-deny-verify-20260915-133929.txt`。对应边界文档升版 v1.1（CHG-20260915-001）。

**独立验收结论（2026-09-14）**：Acceptor 独立复核 S01—S12 全通过、无阻断项；Acceptance Reviewer gjg 签核「独立验收通过」；S12 经 Owner 现场实测 `verify-isolation.ps1` 返回 `ACCESS_DENIED: UnauthorizedAccessException`；B00 状态转「验收通过」。

## 6. D12 脚本缺陷记录（已修复并重跑重拍）

W12 的 `setup-isolation.ps1` 与 `verify-isolation.ps1` 在实施中发现缺陷，隔离功能已通过手工修复 ACL + 纯 ASCII 路径负向读取验证达成。四处缺陷均已于 2026-09-14 在脚本中修复：

1. **setup-isolation.ps1 `/inheritance:r` 不清理显式宽泛 ACE**：首次 `New-Item` 后 `Authenticated Users/Users:(F)` 以显式 ACE 存在，`/inheritance:r` 只删继承 ACE、删不掉它们。已修复：`Set-AclFor` 授权前对 `*S-1-5-11`/`*S-1-5-32-545`/`*S-1-1-0` 显式 `/remove:g` 自愈。
2. **setup-isolation.ps1 第 5 步权限矩阵校验过严**：`icacls (RX)`/`(M)` 生成的 ACE 与 .NET `ReadAndExecute`/`Modify` 枚举在 Synchronize 位上不一致，`-bnot` 得到的越权掩码把 Synchronize 计为越权，正确 ACL 也判 FAIL。已修复：越权掩码显式排除 Synchronize 位。
3. **setup-isolation.ps1 `/deny` 重跑叠加重复 Deny ACE**：已修复：`Set-AclFor` 写 Deny 前先 `/remove:d` 清旧 Deny，保证重跑幂等。
4. **verify-isolation.ps1 中文用户名路径 bug**：`$env:TEMP` 含中文用户名 `乐`，`-ArgumentList` 路径损坏。已修复：改用纯 ASCII 路径 `$env:ProgramData\b00-verify`。

上述脚本缺陷不改变「隔离生效」这一冻结事实（动态负向读取已实证 Access Denied）。四处缺陷已于 2026-09-14 修复，并由 Owner 以管理员 PowerShell 从干净态重跑（teardown→setup→verify）验证通过：隐藏区 b00-impl 各仅一条 Deny、无宽泛 ACE、负向读取返回 ACCESS_DENIED。干净态证据见 `EV-B00-012-setup-20260914-102703.txt` 与 `EV-B00-012-isolation-sentinel-20260914-102703.txt`。
