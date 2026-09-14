#Requires -RunAsAdministrator
<#
B00 W12/S12 回滚脚本 — 撤销隔离设置

作用：
  1. 移除受限本地账户 b00-impl；
  2. 重置 D:\second-acceptance 各目录 ACL 为默认继承；
  3. 可选删除验收区目录（默认不删，仅重置 ACL）。

用法（管理员 PowerShell）：
  .\teardown-isolation.ps1
  或
  .\teardown-isolation.ps1 -ImplUser "b00-impl" -AcceptRoot "D:\second-acceptance" -RemoveDirectory
#>

param(
    [string]$ImplUser   = "b00-impl",
    [string]$AcceptRoot = "D:\second-acceptance",
    [switch]$RemoveDirectory
)

$ErrorActionPreference = "Stop"

# 1) 移除账户
if (Get-LocalUser -Name $ImplUser -ErrorAction SilentlyContinue) {
    Remove-LocalUser -Name $ImplUser
    Write-Host "已移除本地账户 $ImplUser"
} else {
    Write-Host "账户 $ImplUser 不存在，跳过"
}

# 2) 重置 ACL 为默认继承
if (Test-Path $AcceptRoot) {
    icacls $AcceptRoot /reset /t /c | Out-Null
    Write-Host "已重置 $AcceptRoot 及其子目录 ACL 为默认继承"
}

# 3) 可选删除目录
if ($RemoveDirectory) {
    if (Test-Path $AcceptRoot) {
        Remove-Item -Path $AcceptRoot -Recurse -Force
        Write-Host "已删除 $AcceptRoot"
    }
} else {
    Write-Host "未删除目录（保留 $AcceptRoot）；如需删除请加 -RemoveDirectory"
}
