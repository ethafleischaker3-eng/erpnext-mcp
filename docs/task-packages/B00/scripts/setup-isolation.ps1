#Requires -RunAsAdministrator
<#
B00 W12/S12 — 建立验收区真实文件系统权限隔离

作用：
  1. 建立 D:\second-acceptance 目录结构；
  2. 创建受限本地账户 b00-impl（实施主体，默认 Users 组，非管理员）；
  3. 设置 NTFS ACL（/inheritance:r 移除继承 ACE，再显式授权）：
     - 根目录：Owner/SYSTEM/Administrators 全权 + b00-impl 最小遍历/读取（RX，仅本目录）；
     - task-sets/assertions/runs（隐藏区）：拒绝 b00-impl；
     - snapshots/reset：b00-impl 可写（B00 交付物）；
     - evidence：b00-impl 可写（落盘原始证据）；
  4. 校验无残留的 Authenticated Users / Users / Everyone ACE（按 SID S-1-5-11 / S-1-5-32-545 / S-1-1-0 判定）；
  5. 校验完整最小权限矩阵：Owner/SYSTEM/Administrators=FullControl；根目录 b00-impl=RX 且不得越权；snapshots/reset/evidence=Modify 且不得越权；task-sets/assertions/runs=Deny 覆盖 FullControl+(OI)(CI) 且无额外 Allow；
     发现残留 ACE 或矩阵不满足即 fail-closed：输出路径/主体/SID/权限明细后抛出异常终止，不打印完成、不提示继续；icacls.exe 每条命令均校验原生退出码，非零即终止；全部通过后才打印最终 ACL 与完成信息。

用法（管理员 PowerShell）：
  .\setup-isolation.ps1
  或
  .\setup-isolation.ps1 -ImplUser "b00-impl" -AcceptRoot "D:\second-acceptance"

注意：账户密码在运行时用 Read-Host 输入，不落盘、不写入任何文件。
#>

param(
    [string]$ImplUser   = "b00-impl",
    [string]$AcceptRoot = "D:\second-acceptance"
)

$ErrorActionPreference = "Stop"

# 当前登录用户 = 验收侧 Owner（接受/审阅隐藏材料的主体）
$Owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host "验收侧 Owner: $Owner"

# 1) 目录结构
foreach ($d in @("snapshots", "reset", "task-sets", "assertions", "runs", "evidence")) {
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $AcceptRoot $d)
}
Write-Host "已建立目录结构: $AcceptRoot"

# 2) 创建受限本地账户
if (-not (Get-LocalUser -Name $ImplUser -ErrorAction SilentlyContinue)) {
    $pw = Read-Host -AsSecureString "为新账户 $ImplUser 设置密码（不回显、不落盘）"
    $null = New-LocalUser -Name $ImplUser -Password $pw -PasswordNeverExpires -Description "B00 实施主体受限账户（非管理员）"
    Write-Host "已创建本地账户 $ImplUser（默认 Users 组，非管理员）"
} else {
    Write-Host "账户 $ImplUser 已存在，跳过创建"
}

# 3) ACL（关键：/inheritance:r 删除继承的 ACE，而非 /inheritance:d 那样转成显式保留；
#    这样不会残留父级继承下来的 Authenticated Users / Users 全权 ACE）
#    注意：icacls.exe 的原生退出码不会被 $ErrorActionPreference 捕获，须统一封装并逐条校验。
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

function Set-AclFor {
    param([string]$Path, [string[]]$GrantList, [string]$DenyUser = $null)
    Invoke-Icacls -Arguments @($Path, '/inheritance:r')
    # 清除显式宽泛 ACE（Authenticated Users/Users/Everyone，按 SID）：/inheritance:r 只删继承 ACE、
    # 删不掉显式 ACE，须显式 /remove:g 才能自愈并让后续校验不 fail-closed
    foreach ($sid in @('*S-1-5-11', '*S-1-5-32-545', '*S-1-1-0')) {
        Invoke-Icacls -Arguments @($Path, '/remove:g', $sid)
    }
    Invoke-Icacls -Arguments (@($Path, '/grant:r') + $GrantList)
    if ($DenyUser) {
        # 先清旧 Deny 再写新 Deny，保证重跑幂等（不再叠加重复 Deny ACE）
        Invoke-Icacls -Arguments @($Path, '/remove:d', $DenyUser)
        Invoke-Icacls -Arguments @($Path, '/deny', "${DenyUser}:(OI)(CI)F")
    }
}

$full = @("${Owner}:(OI)(CI)F", "SYSTEM:(OI)(CI)F", "Administrators:(OI)(CI)F")
$implWrite = @("${Owner}:(OI)(CI)F", "${ImplUser}:(OI)(CI)M", "SYSTEM:(OI)(CI)F", "Administrators:(OI)(CI)F")
# 根目录额外授予 b00-impl 最小遍历/读取（RX，仅本目录不继承），否则它无法到达可写的 snapshots/reset/evidence
$rootGrant = @("${Owner}:(OI)(CI)F", "SYSTEM:(OI)(CI)F", "Administrators:(OI)(CI)F", "${ImplUser}:(RX)")

# 3a) 根目录：Owner/SYSTEM/Administrators 全权 + b00-impl 最小遍历/读取
Set-AclFor -Path $AcceptRoot -GrantList $rootGrant

# 3b) 隐藏区：拒绝实施主体
foreach ($h in @("task-sets", "assertions", "runs")) {
    Set-AclFor -Path (Join-Path $AcceptRoot $h) -GrantList $full -DenyUser $ImplUser
}

# 3c) snapshots/reset：实施主体可写
foreach ($d in @("snapshots", "reset")) {
    Set-AclFor -Path (Join-Path $AcceptRoot $d) -GrantList $implWrite
}

# 3d) evidence：实施主体可写（落盘原始证据）
Set-AclFor -Path (Join-Path $AcceptRoot "evidence") -GrantList $implWrite

# 4) 校验：不应残留 Authenticated Users / Users / Everyone 的 ACE（按 SID 判定，避免本地化差异）
Write-Host ""
Write-Host "=== ACE 校验（负向：无宽泛主体）==="

# 统一取 ACE 主体 SID；NTAccount 需 Translate 成本地 SID 字符串
function Get-AceSid {
    param($Ace)
    if ($Ace.IdentityReference -is [System.Security.Principal.SecurityIdentifier]) {
        return $Ace.IdentityReference.Value
    }
    return $Ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
}

$unexpectedSids = @('S-1-5-11', 'S-1-5-32-545', 'S-1-1-0')  # Authenticated Users / Users / Everyone
$bad = @()
$allDirs = @($AcceptRoot) + (@("snapshots", "reset", "task-sets", "assertions", "runs", "evidence") | ForEach-Object { Join-Path $AcceptRoot $_ })
foreach ($d in $allDirs) {
    $acl = Get-Acl -LiteralPath $d
    foreach ($ace in $acl.Access) {
        $sid = Get-AceSid $ace
        if ($sid -in $unexpectedSids) {
            $bad += "$d :: $($ace.IdentityReference.Value) (SID $sid) :: $($ace.FileSystemRights)"
        }
    }
}
if ($bad.Count -gt 0) {
    Write-Host ""
    Write-Host "FAIL：检测到 $($bad.Count) 条意外残留 ACE（Authenticated Users / Users / Everyone），"
    Write-Host "      未达到验收区 ACL 隔离要求，脚本终止（fail-closed）。"
    Write-Host "残留 ACE 明细（路径 :: 主体 (SID) :: 权限）："
    foreach ($entry in $bad) {
        Write-Host "  $entry"
    }
    throw "fail-closed：发现 $($bad.Count) 条残留 ACE（S-1-5-11 / S-1-5-32-545 / S-1-1-0），未建立干净的验收区 ACL，脚本终止，请人工核对并修正后重跑。"
}
Write-Host "通过：未发现 Authenticated Users / Users / Everyone 的 ACE"

# 5) 权限矩阵校验（正向/负向）：不仅确认无宽泛主体，还确认最小权限矩阵逐项成立
Write-Host ""
Write-Host "=== 权限矩阵校验（正向：最小权限逐项成立）==="

$sidOwner          = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$sidSystem         = 'S-1-5-18'
$sidAdministrators = 'S-1-5-32-544'
$sidImpl           = (Get-LocalUser -Name $ImplUser).SID.Value

$fcRights  = [System.Security.AccessControl.FileSystemRights]::FullControl
$rxRights  = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
$modRights = [System.Security.AccessControl.FileSystemRights]::Modify
$allow     = [System.Security.AccessControl.AccessControlType]::Allow
$deny      = [System.Security.AccessControl.AccessControlType]::Deny
$inhOiCi   = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
# Synchronize 位在 icacls 生成的真实 ACE 与 .NET FileSystemRights 枚举间存在不一致（一方含、一方不含），
# 若计入“不得越权”的负向掩码，会把正确 ACL 误判为越权而 FAIL；故统一忽略该位。
$syncBit   = [int][System.Security.AccessControl.FileSystemRights]::Synchronize
# 超出目标权限的位掩码（用于“不得越权”的负向校验）；Synchronize 位不视为越权
$beyondRx  = -bnot (([int]$rxRights) -bor $syncBit)
$beyondMod = -bnot (([int]$modRights) -bor $syncBit)

$dirRoles = @(
    @{ Path = $AcceptRoot;                          Role = 'root'  }
    @{ Path = (Join-Path $AcceptRoot 'snapshots');  Role = 'write' }
    @{ Path = (Join-Path $AcceptRoot 'reset');      Role = 'write' }
    @{ Path = (Join-Path $AcceptRoot 'evidence');   Role = 'write' }
    @{ Path = (Join-Path $AcceptRoot 'task-sets');  Role = 'deny'  }
    @{ Path = (Join-Path $AcceptRoot 'assertions'); Role = 'deny'  }
    @{ Path = (Join-Path $AcceptRoot 'runs');       Role = 'deny'  }
)

$matrixFailures = @()
foreach ($entry in $dirRoles) {
    $dir  = $entry.Path
    $role = $entry.Role
    $acl  = Get-Acl -LiteralPath $dir

    # Owner / SYSTEM / Administrators：Allow FullControl（所有目录均要求）
    foreach ($ref in @(@('Owner', $sidOwner), @('SYSTEM', $sidSystem), @('Administrators', $sidAdministrators))) {
        $name = $ref[0]; $sid = $ref[1]
        $hit = $acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sid -and
            $_.AccessControlType -eq $allow -and
            ($_.FileSystemRights -band $fcRights) -eq $fcRights
        }
        if (-not $hit) {
            $matrixFailures += "$dir :: 缺少 $name ($sid) 的 Allow FullControl"
        }
    }

    if ($role -eq 'root') {
        # 正：根目录 b00-impl 至少具备 RX
        $hit = $acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidImpl -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band [int]$rxRights) -eq [int]$rxRights
        }
        if (-not $hit) {
            $matrixFailures += "$dir :: 缺少 $ImplUser ($sidImpl) 的 Allow ReadAndExecute(RX)"
        }
        # 负：根目录 b00-impl 不得有超出 RX 的 Allow 权限
        foreach ($ace in ($acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidImpl -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band $beyondRx) -ne 0
        })) {
            $matrixFailures += "$dir :: $ImplUser 存在超出 RX 的 Allow 权限：$($ace.FileSystemRights)"
        }
    }
    elseif ($role -eq 'write') {
        # 正：snapshots/reset/evidence b00-impl 至少具备 Modify
        $hit = $acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidImpl -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band [int]$modRights) -eq [int]$modRights
        }
        if (-not $hit) {
            $matrixFailures += "$dir :: 缺少 $ImplUser ($sidImpl) 的 Allow Modify"
        }
        # 负：不得超过 Modify（禁止 ChangePermissions/TakeOwnership 等）
        foreach ($ace in ($acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidImpl -and
            $_.AccessControlType -eq $allow -and
            ([int]$_.FileSystemRights -band $beyondMod) -ne 0
        })) {
            $matrixFailures += "$dir :: $ImplUser 存在超出 Modify 的 Allow 权限：$($ace.FileSystemRights)"
        }
    }
    elseif ($role -eq 'deny') {
        # 正：task-sets/assertions/runs 存在对 b00-impl 的 Deny ACE，覆盖 FullControl 且带 OI+CI 继承范围
        $hit = $acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidImpl -and
            $_.AccessControlType -eq $deny -and
            ([int]$_.FileSystemRights -band [int]$fcRights) -eq [int]$fcRights -and
            ([int]$_.InheritanceFlags -band [int]$inhOiCi) -eq [int]$inhOiCi
        }
        if (-not $hit) {
            $matrixFailures += "$dir :: 缺少对 $ImplUser ($sidImpl) 覆盖 FullControl 且带 (OI)(CI) 继承的 Deny ACE"
        }
        # 负：隐藏区不得存在对 b00-impl 的额外 Allow ACE
        foreach ($ace in ($acl.Access | Where-Object {
            (Get-AceSid $_) -eq $sidImpl -and
            $_.AccessControlType -eq $allow
        })) {
            $matrixFailures += "$dir :: $ImplUser 在隐藏区存在额外 Allow ACE：$($ace.FileSystemRights)"
        }
    }
}

if ($matrixFailures.Count -gt 0) {
    Write-Host "FAIL：权限矩阵校验未通过，明细如下："
    foreach ($f in $matrixFailures) {
        Write-Host "  $f"
    }
    throw "fail-closed：权限矩阵校验未通过（$($matrixFailures.Count) 项），验收区 ACL 未达到最小权限要求，脚本终止。"
}
Write-Host "通过：权限矩阵校验（Owner/SYSTEM/Administrators=FullControl；b00-impl 按角色 RX/Modify/Deny）"

Write-Host ""
Write-Host "=== 最终 ACL 核对（请逐条确认）==="
Invoke-Icacls -Arguments @($AcceptRoot) -ShowOutput
foreach ($d in @("snapshots", "reset", "task-sets", "assertions", "runs", "evidence")) {
    Invoke-Icacls -Arguments @(Join-Path $AcceptRoot $d) -ShowOutput
}
Write-Host ""
Write-Host "完成。下一步运行 .\verify-isolation.ps1 做负向读取测试。"
