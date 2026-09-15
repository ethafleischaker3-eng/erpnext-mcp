#Requires -RunAsAdministrator
<#
C01a 前置 — 建立盲出题主体（c01a-blind）的文件系统隔离

作用（只增不改：B00 已封存的验收区 b00-impl ACL 与实施区普通继承一律不动）：
  1. 创建受限本地账户 c01a-blind（默认 Users 组，非管理员）；
  2. 建立 D:\second-acceptance\candidates\ 与 candidates\C01a\（验收区候选目录）；
  3. 施加盲出题主体（c01a-blind）ACL：
     - 实施区 docs\task-packages\B0[1-5]（存在者，当前 B01–B04）：施加 Deny（只读拒绝，仅 /deny，
       不 /inheritance:r，保留 Authenticated Users/Users 等既有继承给其它主体）；
     - 实施区 PRD 全文 docs\ERPNext-MCP改造PRD.md 与 docs\task-records（B 系列 Freeze Manifest/变更记录）：施加 Deny；
     - 验收区隐藏目录 task-sets/assertions/runs/snapshots：施加 Deny；
     - 验收区根：c01a-blind 仅本目录 RX（遍历用，不继承到子目录）；
     - candidates/：干净 ACL（/inheritance:r）+ Owner/SYSTEM/Administrators 全权 + c01a-blind RX(遍历) + b00-impl Deny；
     - candidates/C01a/：干净 ACL（/inheritance:r）+ Owner/SYSTEM/Administrators 全权 + c01a-blind Modify + b00-impl Deny；
     - 实施区 C01a/：无需改动（c01a-blind 已随 Authenticated Users/Users 继承 F，可读写自身治理文档与名单）；
  4. fail-closed 校验：candidates 子树无宽泛 ACE（Authenticated Users/Users/Everyone）+ 逐项权限矩阵 + 每条 icacls 退出码校验；
     发现残留 ACE 或矩阵不满足即抛出异常终止，不打印完成。

用法（管理员 PowerShell）：
  .\setup-c01a-isolation.ps1
  或
  .\setup-c01a-isolation.ps1 -BlindUser "c01a-blind" -ImplUser "b00-impl" -AcceptRoot "D:\second-acceptance" -ImplRoot "D:\second"

注意：账户密码在运行时用 Read-Host 输入，不落盘、不写入任何文件。
#>

param(
    [string]$BlindUser  = "c01a-blind",
    [string]$ImplUser   = "b00-impl",
    [string]$AcceptRoot = "D:\second-acceptance",
    [string]$ImplRoot   = "D:\second"
)

$ErrorActionPreference = "Stop"

# 当前登录用户 = 验收侧 Owner（接受/审阅隐藏材料的主体）
$Owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host "验收侧 Owner: $Owner"

# 1) 创建受限本地账户 c01a-blind
if (-not (Get-LocalUser -Name $BlindUser -ErrorAction SilentlyContinue)) {
    $pw = Read-Host -AsSecureString "为新账户 $BlindUser 设置密码（不回显、不落盘）"
    $null = New-LocalUser -Name $BlindUser -Password $pw -PasswordNeverExpires -Description "C01a 盲出题主体受限账户（非管理员）"
    Write-Host "已创建本地账户 $BlindUser（默认 Users 组，非管理员）"
} else {
    Write-Host "账户 $BlindUser 已存在，跳过创建"
}

# 2) 建立 candidates 目录结构
$candidatesPath = Join-Path $AcceptRoot "candidates"
$c01aPath       = Join-Path $candidatesPath "C01a"
foreach ($d in @($candidatesPath, $c01aPath)) {
    $null = New-Item -ItemType Directory -Force -Path $d
}
Write-Host "已建立目录结构: $candidatesPath"

# 3) icacls 封装：逐条校验原生退出码（icacls 的退出码不被 $ErrorActionPreference 捕获）
function Invoke-Icacls {
    param([string[]]$Arguments, [switch]$ShowOutput)
    if ($ShowOutput) {
        & icacls.exe @Arguments
    } else {
        & icacls.exe @Arguments | Out-Null
    }
    if ($LASTEXITCODE -ne 0) {
        throw "icacls 执行失败（退出码 $LASTEXITCODE）：icacls $($Arguments -join ' ')"
    }
}

# 只增不改的 Deny：先清旧 Deny 再写新 Deny，保证重跑幂等（不再叠加重复 Deny ACE）
function Set-Deny {
    param([string]$Path, [string]$User)
    Invoke-Icacls -Arguments @($Path, '/remove:d', $User)
    Invoke-Icacls -Arguments @($Path, '/deny', "${User}:(OI)(CI)F")
}

# 干净 ACL（仅用于新建的 candidates 子树）：/inheritance:r + 清宽泛 ACE + 显式授权 + 可选 Deny
function Set-CleanAcl {
    param([string]$Path, [string[]]$GrantList, [string]$DenyUser = $null)
    Invoke-Icacls -Arguments @($Path, '/inheritance:r')
    foreach ($sid in @('*S-1-5-11', '*S-1-5-32-545', '*S-1-1-0')) {
        Invoke-Icacls -Arguments @($Path, '/remove:g', $sid)
    }
    Invoke-Icacls -Arguments (@($Path, '/grant:r') + $GrantList)
    if ($DenyUser) {
        Invoke-Icacls -Arguments @($Path, '/remove:d', $DenyUser)
        Invoke-Icacls -Arguments @($Path, '/deny', "${DenyUser}:(OI)(CI)F")
    }
}

$full = @("${Owner}:(OI)(CI)F", "SYSTEM:(OI)(CI)F", "Administrators:(OI)(CI)F")

# 4) 实施区 B0[1-5]（存在者）：对 c01a-blind 施加 Deny（只读拒绝）
$taskPkgs = Join-Path $ImplRoot "docs\task-packages"
Write-Host ""
Write-Host "=== 实施区 B0[1-5] Deny ==="
foreach ($n in 1..5) {
    $b = Join-Path $taskPkgs ("B0" + $n)
    if (Test-Path $b) {
        Set-Deny -Path $b -User $BlindUser
        Write-Host "已对 $b 施加 $BlindUser Deny"
    } else {
        Write-Host "$b 不存在，跳过（待建立后补验）"
    }
}

# 4b) PRD 全文与 task-records：对 c01a-blind 施加 Deny（实施侧结论，盲会话严禁读）
$prdPath = Join-Path $ImplRoot "docs\ERPNext-MCP改造PRD.md"
if (Test-Path $prdPath) {
    Invoke-Icacls -Arguments @($prdPath, '/remove:d', $BlindUser)
    Invoke-Icacls -Arguments @($prdPath, '/deny', "${BlindUser}:(F)")
    Write-Host "已对 $prdPath 施加 $BlindUser Deny"
} else {
    Write-Host "$prdPath 不存在，跳过（请核对 PRD 路径）"
}
$taskRecordsPath = Join-Path $ImplRoot "docs\task-records"
if (Test-Path $taskRecordsPath) {
    Set-Deny -Path $taskRecordsPath -User $BlindUser
    Write-Host "已对 $taskRecordsPath 施加 $BlindUser Deny"
} else {
    Write-Host "$taskRecordsPath 不存在，跳过"
}

# 5) 验收区根：c01a-blind 最小遍历/读取（RX，仅本目录不继承），否则无法到达 candidates/C01a/
Invoke-Icacls -Arguments @($AcceptRoot, '/grant:r', "${BlindUser}:(RX)")

# 6) 验收区隐藏目录：对 c01a-blind 施加 Deny
foreach ($h in @("task-sets", "assertions", "runs", "snapshots")) {
    Set-Deny -Path (Join-Path $AcceptRoot $h) -User $BlindUser
}

# 7) candidates/：干净 ACL + c01a-blind 遍历 + b00-impl Deny（实施主体拒读候选）
Set-CleanAcl -Path $candidatesPath -GrantList ($full + "${BlindUser}:(RX)") -DenyUser $ImplUser

# 8) candidates/C01a/：干净 ACL + c01a-blind Modify + b00-impl Deny
Set-CleanAcl -Path $c01aPath -GrantList ($full + "${BlindUser}:(OI)(CI)M") -DenyUser $ImplUser

# 9) fail-closed 校验
Write-Host ""
Write-Host "=== ACE 校验（负向：candidates 子树无宽泛主体）==="

function Get-AceSid {
    param($Ace)
    if ($Ace.IdentityReference -is [System.Security.Principal.SecurityIdentifier]) {
        return $Ace.IdentityReference.Value
    }
    return $Ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
}

$unexpectedSids = @('S-1-5-11', 'S-1-5-32-545', 'S-1-1-0')  # Authenticated Users / Users / Everyone
$bad = @()
foreach ($d in @($candidatesPath, $c01aPath)) {
    $acl = Get-Acl -LiteralPath $d
    foreach ($ace in $acl.Access) {
        $sid = Get-AceSid $ace
        if ($sid -in $unexpectedSids) {
            $bad += "$d :: $($ace.IdentityReference.Value) (SID $sid) :: $($ace.FileSystemRights)"
        }
    }
}
if ($bad.Count -gt 0) {
    Write-Host "FAIL：candidates 子树检测到 $($bad.Count) 条意外残留 ACE（Authenticated Users / Users / Everyone）："
    foreach ($entry in $bad) { Write-Host "  $entry" }
    throw "fail-closed：candidates 子树存在宽泛 ACE，未建立干净 ACL，脚本终止。"
}
Write-Host "通过：candidates 子树未发现 Authenticated Users / Users / Everyone 的 ACE"

# 10) 权限矩阵校验（正向/负向）
Write-Host ""
Write-Host "=== 权限矩阵校验（正向：最小权限逐项成立）==="

$sidOwner          = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$sidSystem         = 'S-1-5-18'
$sidAdministrators = 'S-1-5-32-544'
$sidBlind          = (Get-LocalUser -Name $BlindUser).SID.Value
$sidImpl           = (Get-LocalUser -Name $ImplUser).SID.Value

$fcRights  = [System.Security.AccessControl.FileSystemRights]::FullControl
$rxRights  = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
$modRights = [System.Security.AccessControl.FileSystemRights]::Modify
$allow     = [System.Security.AccessControl.AccessControlType]::Allow
$deny      = [System.Security.AccessControl.AccessControlType]::Deny
$inhOiCi   = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
# Synchronize 位在 icacls 生成的真实 ACE 与 .NET 枚举间不一致，统一忽略，避免误判越权
$syncBit   = [int][System.Security.AccessControl.FileSystemRights]::Synchronize
$beyondRx  = -bnot (([int]$rxRights) -bor $syncBit)
$beyondMod = -bnot (([int]$modRights) -bor $syncBit)

$matrixFailures = @()

function Assert-FullControl {
    param($acl, $sid, $label, $path)
    $hit = $acl.Access | Where-Object {
        (Get-AceSid $_) -eq $sid -and
        $_.AccessControlType -eq $allow -and
        ($_.FileSystemRights -band $fcRights) -eq $fcRights
    }
    if (-not $hit) { $matrixFailures += "$path :: 缺少 $label ($sid) 的 Allow FullControl" }
}

function Assert-DenyOiCi {
    param($acl, $sid, $label, $path)
    $hit = $acl.Access | Where-Object {
        (Get-AceSid $_) -eq $sid -and
        $_.AccessControlType -eq $deny -and
        ([int]$_.FileSystemRights -band [int]$fcRights) -eq [int]$fcRights -and
        ([int]$_.InheritanceFlags -band [int]$inhOiCi) -eq [int]$inhOiCi
    }
    if (-not $hit) { $matrixFailures += "$path :: 缺少对 $label ($sid) 覆盖 FullControl 且带 (OI)(CI) 继承的 Deny ACE" }
}

# 10a) candidates/ 与 candidates/C01a/：Owner/SYSTEM/Administrators 全权 + ImplUser Deny + BlindUser 按角色 RX/Modify
foreach ($entry in @(
    @{ Path = $candidatesPath; Role = 'cand-root'  },
    @{ Path = $c01aPath;       Role = 'cand-write' }
)) {
    $dir  = $entry.Path
    $role = $entry.Role
    $acl  = Get-Acl -LiteralPath $dir

    foreach ($ref in @(@('Owner', $sidOwner), @('SYSTEM', $sidSystem), @('Administrators', $sidAdministrators))) {
        Assert-FullControl -acl $acl -sid $ref[1] -label $ref[0] -path $dir
    }
    Assert-DenyOiCi -acl $acl -sid $sidImpl -label $ImplUser -path $dir

    if ($role -eq 'cand-root') {
        $hit = $acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidBlind -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band [int]$rxRights) -eq [int]$rxRights
        }
        if (-not $hit) { $matrixFailures += "$dir :: 缺少 $BlindUser ($sidBlind) 的 Allow RX" }
        foreach ($ace in ($acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidBlind -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band $beyondRx) -ne 0
        })) {
            $matrixFailures += "$dir :: $BlindUser 存在超出 RX 的 Allow 权限：$($ace.FileSystemRights)"
        }
    } else {
        $hit = $acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidBlind -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band [int]$modRights) -eq [int]$modRights
        }
        if (-not $hit) { $matrixFailures += "$dir :: 缺少 $BlindUser ($sidBlind) 的 Allow Modify" }
        foreach ($ace in ($acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidBlind -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band $beyondMod) -ne 0
        })) {
            $matrixFailures += "$dir :: $BlindUser 存在超出 Modify 的 Allow 权限：$($ace.FileSystemRights)"
        }
    }
}

# 10b) 验收区根：BlindUser 至少具备 RX
$aclRoot = Get-Acl -LiteralPath $AcceptRoot
$hit = $aclRoot.Access | Where-Object {
    (Get-AceSid $_) -eq $sidBlind -and
    $_.AccessControlType -eq $allow -and
    ([int]$_.FileSystemRights -band [int]$rxRights) -eq [int]$rxRights
}
if (-not $hit) { $matrixFailures += "$AcceptRoot :: 缺少 $BlindUser ($sidBlind) 的 Allow RX" }

# 10c) 验收区隐藏目录：BlindUser 应有 Deny
foreach ($h in @("task-sets", "assertions", "runs", "snapshots")) {
    $hd  = Join-Path $AcceptRoot $h
    $acl = Get-Acl -LiteralPath $hd
    Assert-DenyOiCi -acl $acl -sid $sidBlind -label $BlindUser -path $hd
}

# 10d) 实施区 B0[1-5]（存在者）：BlindUser 应有 Deny
foreach ($n in 1..5) {
    $b = Join-Path $taskPkgs ("B0" + $n)
    if (Test-Path $b) {
        $acl = Get-Acl -LiteralPath $b
        Assert-DenyOiCi -acl $acl -sid $sidBlind -label $BlindUser -path $b
    }
}

# 10e) PRD 全文与 task-records：BlindUser 应有 Deny
$prdPath = Join-Path $ImplRoot "docs\ERPNext-MCP改造PRD.md"
if (Test-Path $prdPath) {
    $acl = Get-Acl -LiteralPath $prdPath
    $hit = $acl.Access | Where-Object {
        (Get-AceSid $_) -eq $sidBlind -and
        $_.AccessControlType -eq $deny
    }
    if (-not $hit) { $matrixFailures += "$prdPath :: 缺少对 $BlindUser ($sidBlind) 的 Deny ACE" }
}
$taskRecordsPath = Join-Path $ImplRoot "docs\task-records"
if (Test-Path $taskRecordsPath) {
    $acl = Get-Acl -LiteralPath $taskRecordsPath
    Assert-DenyOiCi -acl $acl -sid $sidBlind -label $BlindUser -path $taskRecordsPath
}

if ($matrixFailures.Count -gt 0) {
    Write-Host "FAIL：权限矩阵校验未通过，明细如下："
    foreach ($f in $matrixFailures) { Write-Host "  $f" }
    throw "fail-closed：权限矩阵校验未通过（$($matrixFailures.Count) 项），脚本终止。"
}
Write-Host "通过：权限矩阵校验（candidates 子树 + 根 RX + 隐藏区/B0[1-5] Deny 逐项成立）"

Write-Host ""
Write-Host "=== 最终 ACL 核对（请逐条确认）==="
Invoke-Icacls -Arguments @($AcceptRoot) -ShowOutput
foreach ($d in @("candidates", "candidates\C01a", "task-sets", "assertions", "runs", "snapshots")) {
    Invoke-Icacls -Arguments @(Join-Path $AcceptRoot $d) -ShowOutput
}
foreach ($n in 1..5) {
    $b = Join-Path $taskPkgs ("B0" + $n)
    if (Test-Path $b) { Invoke-Icacls -Arguments @($b) -ShowOutput }
}
Write-Host ""
Write-Host "完成。下一步运行 .\verify-c01a-isolation.ps1 做负向读取/正向写入自证。"
