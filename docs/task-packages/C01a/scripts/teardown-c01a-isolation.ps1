#Requires -RunAsAdministrator
<#
C01a 前置回滚 — 撤销 c01a-blind 隔离设置

作用（只撤 c01a-blind 相关，不触碰 b00-impl 既有 ACL）：
  1. 移除受限本地账户 c01a-blind；
  2. 移除实施区 docs\task-packages\B0[1-5]（存在者）对 c01a-blind 的 Deny ACE；
  3. 移除验收区根对 c01a-blind 的 RX 与隐藏目录（task-sets/assertions/runs/snapshots）对 c01a-blind 的 Deny ACE；
  4. 删除 candidates/（默认删，因它是本包新建的验收区候选目录；-KeepCandidates 保留）。

用法（管理员 PowerShell）：
  .\teardown-c01a-isolation.ps1
  或
  .\teardown-c01a-isolation.ps1 -BlindUser "c01a-blind" -AcceptRoot "D:\second-acceptance" -ImplRoot "D:\second" -KeepCandidates
#>

param(
    [string]$BlindUser  = "c01a-blind",
    [string]$AcceptRoot = "D:\second-acceptance",
    [string]$ImplRoot   = "D:\second",
    [switch]$KeepCandidates
)

$ErrorActionPreference = "Stop"

# 1) 移除账户
if (Get-LocalUser -Name $BlindUser -ErrorAction SilentlyContinue) {
    Remove-LocalUser -Name $BlindUser
    Write-Host "已移除本地账户 $BlindUser"
} else {
    Write-Host "账户 $BlindUser 不存在，跳过"
}

# 2) 移除实施区 B0[1-5] 的 Deny
$taskPkgs = Join-Path $ImplRoot "docs\task-packages"
foreach ($n in 1..5) {
    $b = Join-Path $taskPkgs ("B0" + $n)
    if (Test-Path $b) {
        icacls $b /remove:d $BlindUser | Out-Null
        Write-Host "已移除 $b 对 $BlindUser 的 Deny"
    }
}

# 3) 移除验收区根 RX 与隐藏目录 Deny
icacls $AcceptRoot /remove:g $BlindUser | Out-Null
foreach ($h in @("task-sets", "assertions", "runs", "snapshots")) {
    $hd = Join-Path $AcceptRoot $h
    if (Test-Path $hd) {
        icacls $hd /remove:d $BlindUser | Out-Null
    }
}

# 4) 删除 candidates/
if (-not $KeepCandidates) {
    $cp = Join-Path $AcceptRoot "candidates"
    if (Test-Path $cp) {
        Remove-Item -Path $cp -Recurse -Force
        Write-Host "已删除 $cp"
    }
} else {
    Write-Host "保留 candidates/（-KeepCandidates）"
}
