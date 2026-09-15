#Requires -RunAsAdministrator
<#
C01a W01/S01 — 盲出题主体（c01a-blind）负向读取 + 正向写入自证

作用（脚本本身以 c01a-blind 身份做探测，故需管理员运行以授权 -Credential 跨账户启动）：
  1. 建立验收区隐藏目录哨兵（task-sets/assertions/runs/snapshots 各一个 c01a-sentinel.txt，不存在则创建）；
  2. 以 c01a-blind 身份依次探测：
     - 负向读取实施区 B0[1-5] 存在者（B01–B04 的 task.md）、PRD 全文（docs\ERPNext-MCP改造PRD.md）与 B 系列 Freeze Manifest（docs\task-records\freeze-manifests\B04-v1.0.md）→ 期望 READ_DENIED；
     - 负向读取验收区隐藏目录哨兵 → 期望 READ_DENIED；
     - 正向写入 candidates/C01a/write-probe.txt → 期望 WRITE_OK（探测后由本脚本清理）；
  3. 汇总判定：任一期望不符即 fail-closed，不打印「通过」。

用法（管理员 PowerShell）：
  .\verify-c01a-isolation.ps1
  或
  .\verify-c01a-isolation.ps1 -BlindUser "c01a-blind" -AcceptRoot "D:\second-acceptance" -ImplRoot "D:\second"
#>

param(
    [string]$BlindUser  = "c01a-blind",
    [string]$AcceptRoot = "D:\second-acceptance",
    [string]$ImplRoot   = "D:\second"
)

$ErrorActionPreference = "Stop"

# 1) 验收区隐藏目录哨兵（验收侧创建）
foreach ($h in @("task-sets", "assertions", "runs", "snapshots")) {
    $s = Join-Path (Join-Path $AcceptRoot $h) "c01a-sentinel.txt"
    if (-not (Test-Path $s)) {
        Set-Content -Path $s -Value "C01a-W01-SENTINEL $(Get-Date -Format o)" -Encoding UTF8
    }
}

# 2) 组装探测目标
$taskPkgs = Join-Path $ImplRoot "docs\task-packages"
$readTargets = @()
foreach ($n in 1..5) {
    $b  = Join-Path $taskPkgs ("B0" + $n)
    $tm = Join-Path $b "task.md"
    if (Test-Path $tm) { $readTargets += $tm }
}
# PRD 全文与 B 系列 Freeze Manifest（实施侧结论，盲会话严禁读）
$prdRead = Join-Path $ImplRoot "docs\ERPNext-MCP改造PRD.md"
if (Test-Path $prdRead) { $readTargets += $prdRead }
$fmRead = Join-Path $ImplRoot "docs\task-records\freeze-manifests\B04-v1.0.md"
if (Test-Path $fmRead) { $readTargets += $fmRead }

foreach ($h in @("task-sets", "assertions", "runs", "snapshots")) {
    $readTargets += (Join-Path (Join-Path $AcceptRoot $h) "c01a-sentinel.txt")
}
$writeTarget = Join-Path (Join-Path (Join-Path $AcceptRoot "candidates") "C01a") "write-probe.txt"

# 3) 以 c01a-blind 身份执行的辅助脚本（单引号 here-string，不做变量展开）
$helper = @'
param([string]$Path, [switch]$Write)
if ($Write) {
    try { $null = Set-Content -Path $Path -Value "probe" -Encoding UTF8 -ErrorAction Stop; Write-Output "WRITE_OK" }
    catch { Write-Output ("WRITE_DENIED: " + $_.Exception.GetType().Name) }
} else {
    try { $null = Get-Content $Path -ErrorAction Stop; Write-Output "READ_OK" }
    catch { Write-Output ("READ_DENIED: " + $_.Exception.GetType().Name) }
}
'@
# 用纯 ASCII 路径存放 helper/输出，避免 $env:TEMP 含中文用户名「乐」导致 -ArgumentList 路径损坏
$workDir    = Join-Path $env:ProgramData "c01a-verify"
$null       = New-Item -ItemType Directory -Force -Path $workDir
$helperPath = Join-Path $workDir "c01a-verify-helper.ps1"
Set-Content -Path $helperPath -Value $helper -Encoding UTF8

$cred = Get-Credential -UserName $BlindUser -Message "输入 $BlindUser 密码以执行自证探测"

function Invoke-AsBlind {
    param([string]$Path, [switch]$Write)
    $out = Join-Path $workDir "c01a-verify-out.txt"
    $err = Join-Path $workDir "c01a-verify-err.txt"
    Remove-Item $out, $err -ErrorAction SilentlyContinue
    if ($Write) {
        $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$helperPath`" -Path `"$Path`" -Write"
    } else {
        $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$helperPath`" -Path `"$Path`""
    }
    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList $argList -Credential $cred -Wait -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $err
    $stdout = if (Test-Path $out) { Get-Content $out -Raw } else { "(无 stdout)" }
    $stderr = if (Test-Path $err) { Get-Content $err -Raw } else { "(无 stderr)" }
    return [pscustomobject]@{ Path = $Path; Write = [bool]$Write; Stdout = $stdout; Stderr = $stderr; ExitCode = $proc.ExitCode }
}

Write-Host ""
Write-Host "=== 负向读取 / 正向写入自证（以 $BlindUser 身份）==="

$failures = @()
foreach ($p in $readTargets) {
    $r = Invoke-AsBlind -Path $p
    if ($r.Stdout -match "READ_DENIED") {
        Write-Host "OK   READ_DENIED  :: $p"
    } else {
        Write-Host "FAIL 期望 READ_DENIED 但得到 '$($r.Stdout)' (exit $($r.ExitCode)) :: $p"
        $failures += "$p :: 期望 READ_DENIED，实际 '$($r.Stdout)'"
    }
}

$r = Invoke-AsBlind -Path $writeTarget -Write
if ($r.Stdout -match "WRITE_OK") {
    Write-Host "OK   WRITE_OK     :: $writeTarget"
} else {
    Write-Host "FAIL 期望 WRITE_OK 但得到 '$($r.Stdout)' (exit $($r.ExitCode)) :: $writeTarget"
    $failures += "$writeTarget :: 期望 WRITE_OK，实际 '$($r.Stdout)'"
}

# 清理写探针（本脚本以管理员身份删除 c01a-blind 创建的探针文件）
Remove-Item $writeTarget -ErrorAction SilentlyContinue

Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "FAIL：隔离自证未通过，明细如下："
    foreach ($f in $failures) { Write-Host "  $f" }
    throw "fail-closed：C01a 盲出题主体隔离自证未通过（$($failures.Count) 项）。"
}
Write-Host "通过：B0[1-5]/PRD/task-records 与验收区隐藏目录均 READ_DENIED，candidates/C01a/ WRITE_OK —— 盲隔离生效。"
