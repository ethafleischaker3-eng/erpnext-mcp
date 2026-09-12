# P00 Git 回滚说明（D09）

| 字段 | 内容 |
|---|---|
| 交付物编号 | D09 |
| 所属任务包 | P00 项目总控与治理基线 v1.1 |
| 基线标签 | `governance-p00-v1.1`（本地注释标签） |
| 基线提交 ID | `a8bc0444adbfaab125a9570a970ac51f1005db6c` |
| 建立日期 | 2026-09-12 |

## 1. 仓库边界

- 主仓库：`D:\second`（默认分支 `main`，本地身份 `gjg`）。
- `frappe_docker` 以 gitlink/submodule 形式登记，指向固定提交；其 `.git` 为独立目录，未被 `git submodule absorbgitdirs` 迁移，不修改、不吸收其历史与工作树。
- 本仓库不配置远程凭据，不执行 push、force push 或任何历史改写。

## 2. 依赖提交

- `frappe_docker` submodule 固定提交：`a0c52135d4d41c4b8acf7adfdfc5bbcba46dd4d0`。
- 远程 URL（仅本地配置事实，未验证可达）：`https://github.com/frappe/frappe_docker.git`。

## 3. 基线标签与提交

- `governance-p00-v1.1` 为本地注释标签，固定指向治理基线提交 `a8bc0444adbfaab125a9570a970ac51f1005db6c`，后续不得移动。
- 当前 HEAD 可以是基线标签的后代，但标签后的提交仅允许修改以下收尾内容（见第 4 节）。

## 4. 允许的收尾范围（标签后）

标签 `governance-p00-v1.1` 之后的提交，仅允许修改：

- 公开证据（`docs/task-packages/P00/evidence/` 及 Evidence Manifest 中的执行结果）；
- 状态记录（任务包「评审与状态记录」追加行）；
- Freeze Manifest（追加状态或执行进度说明，不改变已冻结哈希与语义）；
- 登记表动态状态（任务行状态、责任人、版本、位置、证据位置的受控更新）；
- 回滚说明（本文件）。

`docs/task-packages/P00/frozen/v1.1/` 只读快照与五份不可变治理文件的冻结内容不得改动。

## 5. 回滚与恢复规则

- 优先使用 `git revert <提交>` 生成反向提交来撤销误改，保持历史可追溯，不做 rebase、amend、reset --hard 到远端历史或 filter-branch 等改写操作。
- 误改仅影响本地工作树/暂存区时，可用 `git restore` / `git reset` 恢复；已提交内容一律以 `git revert` 处理。
- 本地 Git 与本地标签仅支持误改与逻辑回退；因无异盘副本或远程备份，不构成磁盘损坏、丢失或勒索场景下的灾难恢复能力。

## 6. 限制声明

- 本文件不记录会随收尾变化的当前 HEAD（仅记录不可移动的基线标签与其提交）。
- 本文件不含任何凭据、密钥或未授权业务数据。
