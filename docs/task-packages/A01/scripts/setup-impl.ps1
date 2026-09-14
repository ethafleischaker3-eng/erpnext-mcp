# setup-impl.ps1
# Owner-side (Administrator) setup for the restricted implementer account.
# Pure ASCII on purpose (PowerShell 5.1 encoding).
#
# What it does:
#   1. Creates the account if missing, or resets its password to a known value
#      (required so you can `runas /user:<account>`).
#   2. Read-only verifies the existing Deny ACL on the acceptance area's hidden
#      subdirectories (task-sets, assertions). It does NOT modify them because
#      B00 already set them; it only warns if they are missing.
#   3. Optionally grants read+execute on a Claude Code CLI directory.

param(
    [string]$Account = "b00-impl",
    [string]$Password = "",
    [string]$AcceptanceRoot = "D:\second-acceptance",
    [string]$ClaudeDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $Password) {
    $sec = Read-Host "Enter a password for '$Account'" -AsSecureString
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
} else {
    $plain = $Password
}
$secure = ConvertTo-SecureString $plain -AsPlainText -Force

if (Get-LocalUser -Name $Account -ErrorAction SilentlyContinue) {
    Set-LocalUser -Name $Account -Password $secure -PasswordNeverExpires:$true
    Write-Host "[setup] password reset for existing account: $Account"
} else {
    New-LocalUser -Name $Account -Password $secure -PasswordNeverExpires `
        -Description "Restricted implementer account (MCP task packages)"
    Write-Host "[setup] account created: $Account"
}

# Read-only ACL verification (do not modify existing Deny ACEs).
foreach ($d in @("task-sets", "assertions")) {
    $p = Join-Path $AcceptanceRoot $d
    if (-not (Test-Path $p)) {
        Write-Host "[WARN] path not found: $p"
        continue
    }
    $out = (icacls $p 2>&1 | Out-String)
    if ($out -match [regex]::Escape($Account) -and $out -match "\(N\)") {
        Write-Host "[ok] Deny ACL present on $p"
    } else {
        Write-Host "[WARN] no Deny ACE for '$Account' on $p; apply manually:"
        Write-Host "  icacls `"$p`" /deny `"${env:COMPUTERNAME}\${Account}:(OI)(CI)(N)`""
    }
}

# Optional: grant read+execute on the Claude Code CLI dir.
if ($ClaudeDir -and (Test-Path $ClaudeDir)) {
    icacls $ClaudeDir /grant "${env:COMPUTERNAME}\${Account}:(OI)(CI)(RX)" | Out-Null
    Write-Host "[setup] granted RX on $ClaudeDir"
    Write-Host "[note] if traversal still fails under '$Account', grant (X) on each parent dir up to the drive root."
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. runas /user:$Account cmd.exe"
Write-Host "  2. in that console: powershell -ExecutionPolicy Bypass -File D:\second\docs\task-packages\A01\scripts\verify-impl.ps1"
