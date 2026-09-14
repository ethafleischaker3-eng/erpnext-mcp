#Requires -RunAsAdministrator
<#
B00 S12 — 负向读取测试：以 b00-impl 身份读取隐藏区哨兵文件，应得 Access Denied。

步骤：
  1. 验收侧创建哨兵文件 task-sets\sentinel.txt（若不存在则自动创建）；
  2. 展示 task-sets 的 ACL（静态证据：含对 b00-impl 的 deny ACE）；
  3. 以 b00-impl 身份尝试读取，捕获结果。

用法（管理员 PowerShell）：
  .\verify-isolation.ps1
  或
  .\verify-isolation.ps1 -ImplUser "b00-impl" -Sentinel "D:\second-acceptance\task-sets\sentinel.txt"

若自动负向读取因环境限制失败，可用手动等价命令：
  runas /user:b00-impl "cmd /c type D:\second-acceptance\task-sets\sentinel.txt"
  预期输出：Access is denied.
#>

param(
    [string]$ImplUser = "b00-impl",
    [string]$Sentinel = "D:\second-acceptance\task-sets\sentinel.txt"
)

$ErrorActionPreference = "Stop"

# 1) 哨兵文件（验收侧创建）
if (-not (Test-Path $Sentinel)) {
    Set-Content -Path $Sentinel -Value "B00-S12-SENTINEL $(Get-Date -Format o)" -Encoding UTF8
    Write-Host "已创建哨兵文件: $Sentinel"
}

# 2) 静态证据：展示隐藏区 ACL
Write-Host ""
Write-Host "=== task-sets ACL（应含对 $ImplUser 的 Deny ACE）==="
icacls (Split-Path $Sentinel)

# 3) 以 b00-impl 身份尝试读取
# 辅助脚本：单引号 here-string，不做变量展开，路径经参数传入
$helper = @'
param([string]$Path)
try {
    $null = Get-Content $Path -ErrorAction Stop
    Write-Output "ACCESS_OK"
} catch {
    Write-Output ("ACCESS_DENIED: " + $_.Exception.GetType().Name)
}
'@
# 用纯 ASCII 路径存放 helper/输出，避免 $env:TEMP 含中文用户名「乐」导致 -ArgumentList 路径损坏
$workDir = Join-Path $env:ProgramData "b00-verify"
$null = New-Item -ItemType Directory -Force -Path $workDir
$helperPath = Join-Path $workDir "b00-verify-helper.ps1"
Set-Content -Path $helperPath -Value $helper -Encoding UTF8

$outPath = Join-Path $workDir "b00-verify-out.txt"
$errPath = Join-Path $workDir "b00-verify-err.txt"
Remove-Item $outPath, $errPath -ErrorAction SilentlyContinue

$cred = Get-Credential -UserName $ImplUser -Message "输入 $ImplUser 密码以执行负向读取测试"

$proc = Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$helperPath`" -Path `"$Sentinel`"" `
    -Credential $cred -Wait -PassThru `
    -RedirectStandardOutput $outPath -RedirectStandardError $errPath

Write-Host ""
Write-Host "退出码: $($proc.ExitCode)"
$stdout = if (Test-Path $outPath) { Get-Content $outPath -Raw } else { "(无 stdout)" }
$stderr = if (Test-Path $errPath) { Get-Content $errPath -Raw } else { "(无 stderr)" }
Write-Host "stdout: $stdout"
Write-Host "stderr: $stderr"

Write-Host ""
if ($stdout -match "ACCESS_DENIED" -or $stderr -match "Access is denied") {
    Write-Host "结论：Access Denied —— 真实权限隔离生效。"
} elseif ($stdout -match "ACCESS_OK") {
    Write-Host "结论：能够读取 —— 隔离未生效！请检查 ACL 后重跑 setup。"
} else {
    Write-Host "结论：结果不明确（见 stdout/stderr）。可手动执行："
    Write-Host "  runas /user:$ImplUser `"cmd /c type $Sentinel`""
}
