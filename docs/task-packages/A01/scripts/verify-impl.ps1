# verify-impl.ps1
# Run AS the restricted implementer account to prove isolation is effective
# before starting any implementation work.
#
# Exit code 0 = isolated and ready; non-zero = a check failed -> stop and report.
#
# Checks:
#   1. Reading the acceptance area hidden subdirectories must be DENIED.
#   2. Writing to the implementation area must be ALLOWED.
#   3. The toolchain (node / claude) must be reachable.

$ErrorActionPreference = "Continue"

$AcceptanceRoot = "D:\second-acceptance"
$HiddenDirs = @("task-sets", "assertions")
$ImplProbe = "D:\second\docs\task-packages\A01\probe\state\verify-impl-probe.txt"

$ok = @()
$fail = @()

# 1. Negative read checks (must fail with Access Denied).
foreach ($d in $HiddenDirs) {
    $p = Join-Path $AcceptanceRoot $d
    try {
        $x = Get-ChildItem -LiteralPath $p -ErrorAction Stop
        $fail += "NOT-ISOLATED: read '$p' succeeded ($($x.Count) entries). Isolation NOT effective."
    } catch {
        $isDenied = $false
        $ex = $_.Exception
        while ($null -ne $ex) {
            if ($ex -is [System.UnauthorizedAccessException]) { $isDenied = $true; break }
            $ex = $ex.InnerException
        }
        if ($isDenied) {
            $ok += "isolated: read '$p' -> Access Denied (expected)"
        } else {
            $fail += "UNEXPECTED error reading '$p': $($_.Exception.Message)"
        }
    }
}

# 2. Positive write check (must succeed).
try {
    $dir = Split-Path -Parent $ImplProbe
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    "probe" | Set-Content -LiteralPath $ImplProbe -Encoding Ascii
    Remove-Item -LiteralPath $ImplProbe -Force
    $ok += "write ok: '$ImplProbe' created and removed"
} catch {
    $fail += "WRITE FAILED to implementation area: $($_.Exception.Message)"
}

# 3. Toolchain check.
$node = Get-Command node -ErrorAction SilentlyContinue
$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($node) { $ok += "node: $($node.Source)" } else { Write-Host "[warn] node not on PATH (optional; native claude.exe does not need it)" }
if ($claude) { $ok += "claude: $($claude.Source)" } else { $fail += "claude not found on PATH" }

# Report.
Write-Host "=== verify-impl result ==="
foreach ($line in $ok)   { Write-Host "[ok]   $line" }
foreach ($line in $fail) { Write-Host "[FAIL] $line" }

if ($fail.Count -eq 0) {
    Write-Host "ISOLATED: all checks passed. Implementation may proceed."
    exit 0
} else {
    Write-Host "STOP: isolation or toolchain check failed. Do not start implementation; report to Owner."
    exit 1
}
