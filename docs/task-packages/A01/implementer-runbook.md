# A01 实施会话隔离启动 Runbook

> 性质：Owner 侧运维文档。解决「实施会话必须以受限账户运行，且该账户要能跑 Claude Code」这一操作缺口。A01 及后续 B01–B05、E/F 通用。本文不是 A01 冻结交付物，不改变任何冻结内容。

## 1. 诊断结论（已实测确认）

- 隔离是**按账号**生效的：`D:\second-acceptance\task-sets`、`D:\second-acceptance\assertions` 上已存在 `b00-impl:(OI)(CI)(N)` Deny，`b00-impl` 读这两个目录会 Access Denied。
- 之前 A01 新窗口 `ls` 验收区成功，是因为它跑在 **Owner 账号 `乐`（= gjg）** 下——Owner 作为 Acceptor 本来就该能读验收区，隔离对 Owner 不生效。
- 结论：实施会话必须**以受限账户 `b00-impl` 运行**，不是 Owner 账号。

## 2. 第 5 步的正确判据（纠正之前的措辞）

之前的 brief 写「ls 验收区，可读就停」太粗了。`b00-impl` 能列出 `D:\second-acceptance` 根目录（只见 6 个目录名，无害），但**读进 `task-sets` / `assertions` 会被拒**。

- 正确判据 = **读进隐藏子目录必须 Access Denied**（不是「列根目录失败」）。
- `verify-impl.ps1` 就是按这个正确判据写的。

## 3. 一次性准备（Owner/管理员，只做一次）

### 3.1 设密码

```powershell
powershell -ExecutionPolicy Bypass -File D:\second\docs\task-packages\A01\scripts\setup-impl.ps1 -Account b00-impl
```

脚本会：创建/重置 `b00-impl` 密码（设为永不过期），并**只读校验** `task-sets`/`assertions` 上的 Deny ACL（不改动它们，因为 B00 已经设好了）。

### 3.2 让 `b00-impl` 能跑 claude（两条路，二选一）

**方式 A（离线、复用现有安装，推荐先试）**——授「遍历 + 读」：

```powershell
icacls "C:\Users\乐" /grant "LAPTOP-DNCTQOH0\b00-impl:(X)"
icacls "C:\Users\乐\AppData" /grant "LAPTOP-DNCTQOH0\b00-impl:(X)"
icacls "C:\Users\乐\AppData\Roaming" /grant "LAPTOP-DNCTQOH0\b00-impl:(X)"
icacls "C:\Users\乐\AppData\Roaming\npm" /grant "LAPTOP-DNCTQOH0\b00-impl:(OI)(CI)(RX)"
```

`(X)` 只给「穿过目录」的遍历权，不给列目录/读文件，`b00-impl` 无法看 `乐` 个人文件，只是能走到 npm 目录。

**方式 B（更干净，需网络）**——把 claude 装到共享目录，只授 `D:\claude` 和 `D:\node`，完全不动 `乐` 的个人目录。

### 3.3 认证（`b00-impl` 的 claude 会话需要自己的认证）

- 方式 A：在 `b00-impl` 会话里设 `ANTHROPIC_API_KEY` 环境变量。
- 方式 B：在 `b00-impl` 会话里跑 `claude login` 独立登录。

不要直接把 `乐` 的 `~/.claude` 认证目录复制给 `b00-impl`——那会把 Owner 登录态共享给实施账户，弱化会话独立性。

## 4. 每次启动实施会话的标准动作

```powershell
runas /user:b00-impl cmd.exe        # 输入 3.1 设的密码
```

在新控制台里：

```cmd
set PATH=D:\node;C:\Users\乐\AppData\Roaming\npm;%PATH%
powershell -ExecutionPolicy Bypass -File D:\second\docs\task-packages\A01\scripts\verify-impl.ps1
```

看到 `ISOLATED: all checks passed` 才继续；否则停，按第 6 节处理。

然后：

```cmd
cd /d D:\second
set ANTHROPIC_API_KEY=<你的 key>      # 若走 3.3 方式 A
claude
```

粘贴 implementer brief（开工前五步那段），开始 A01 实施。

## 5. 校验清单（`verify-impl.ps1` 覆盖）

| 检查 | 期望 |
|---|---|
| 读 `D:\second-acceptance\task-sets` | Access Denied |
| 读 `D:\second-acceptance\assertions` | Access Denied |
| 写 `D:\second` 实施区 | 成功 |
| `node` / `claude` 可解析 | 成功 |

## 6. 校验失败的处置

- **读 task-sets/assertions 成功** → Deny ACL 丢失，隔离失效。补 `icacls <dir> /deny "LAPTOP-DNCTQOH0\b00-impl:(OI)(CI)(N)"` 并**报告 Owner**（这属于总则 §16.2 的隔离未生效，连带 C01a/C01b/G01 门槛）。
- **写 D:\second 失败** → `D:\second` 对 Authenticated Users 是 (F)，一般不失败；若失败，检查是否有人收紧了 ACL。
- **claude 不可解析** → 第 3.2 的授权没到位，或 PATH 没含 npm 目录。
- **node 不可解析** → PATH 没含 `D:\node`。

## 7. 备注

- `b00-impl` 名字虽带 B00，但其 Deny ACL 是通用实施隔离，A01 及后续包可复用；每个 claude 会话仍是独立执行实例，不构成角色混淆。
- 若你更愿意用新账号（如 `impl`），把脚本 `-Account` 参数和 3.2/6 里的账号名换掉即可，ACL 由 `setup-impl.ps1` 的校验提示补建。
