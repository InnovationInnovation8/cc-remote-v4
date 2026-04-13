# CC-Remote v4 — Package Verification Script
# Receivers run this before / after install to verify the 5 trust points from the North Star.
#
# Usage:
#   pwsh scripts/verify-package.ps1                          # all checks
#   pwsh scripts/verify-package.ps1 -ZipPath cc-remote.zip   # include ZIP hash check
#   pwsh scripts/verify-package.ps1 -ExpectedHash <SHA256>   # compare against published hash

param(
    [string]$ZipPath = "",
    [string]$ExpectedHash = ""
)

$ErrorActionPreference = "Continue"
$Pass = 0
$Fail = 0

function Write-Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = "")
    if ($Ok) {
        Write-Host "  [PASS] $Name" -ForegroundColor Green
        if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkGray }
        $script:Pass++
    } else {
        Write-Host "  [FAIL] $Name" -ForegroundColor Red
        if ($Detail) { Write-Host "         $Detail" -ForegroundColor Yellow }
        $script:Fail++
    }
}

Write-Host ""
Write-Host "================================================================"
Write-Host " CC-Remote v4 — Package Verification (5 Trust Points)"
Write-Host "================================================================"
Write-Host ""

# --- Check 1: ZIP hash (optional) -------------------------------------------
Write-Host "[1/5] ZIP integrity (CertUtil SHA-256)" -ForegroundColor Cyan
if ($ZipPath -and (Test-Path $ZipPath)) {
    $hashOutput = CertUtil -hashfile $ZipPath SHA256 | Where-Object { $_ -match '^[0-9a-fA-F\s]+$' } | Select-Object -First 1
    $actualHash = ($hashOutput -replace '\s', '').ToLower()
    if ($ExpectedHash) {
        $expectedNorm = $ExpectedHash.ToLower() -replace '\s', ''
        Write-Check "ZIP SHA-256 matches published hash" ($actualHash -eq $expectedNorm) "actual=$actualHash"
    } else {
        Write-Check "ZIP SHA-256 computed (no expected value provided)" $true "actual=$actualHash"
    }
} else {
    Write-Host "  [SKIP] ZipPath not provided or not found." -ForegroundColor DarkYellow
}
Write-Host ""

# --- Check 2: Task Scheduler (no cc-remote tasks) ---------------------------
Write-Host "[2/5] No tasks registered in Task Scheduler" -ForegroundColor Cyan
$taskHits = (schtasks /query 2>$null | Select-String -Pattern "cc-remote" -CaseSensitive:$false)
Write-Check "schtasks /query has no 'cc-remote' entries" ($null -eq $taskHits -or $taskHits.Count -eq 0)
Write-Host ""

# --- Check 3: Run key (no cc-remote auto-startup) ---------------------------
Write-Host "[3/5] No Run key entry for cc-remote" -ForegroundColor Cyan
$runHits = (reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" 2>$null | Select-String -Pattern "cc-remote|cc.remote" -CaseSensitive:$false)
Write-Check "HKCU Run key has no cc-remote entries" ($null -eq $runHits -or $runHits.Count -eq 0)
Write-Host ""

# --- Check 4: npm dependency integrity --------------------------------------
Write-Host "[4/5] npm dependency integrity (npm ci --ignore-scripts)" -ForegroundColor Cyan
if (Test-Path "package-lock.json") {
    $npmOk = $false
    try {
        $npmOutput = npm ci --ignore-scripts --dry-run 2>&1
        $npmOk = ($LASTEXITCODE -eq 0)
    } catch {
        $npmOk = $false
    }
    Write-Check "npm ci dry-run succeeds (no integrity violations)" $npmOk
} else {
    Write-Host "  [SKIP] package-lock.json not present (run npm install first)." -ForegroundColor DarkYellow
}
Write-Host ""

# --- Check 5: Listening port 3737 (server only) -----------------------------
Write-Host "[5/5] Network listener on port 3737" -ForegroundColor Cyan
$netOutput = netstat -ano | Select-String -Pattern ":3737\s" -CaseSensitive:$false
$listenLines = $netOutput | Where-Object { $_ -match "LISTENING" }
if ($listenLines.Count -gt 0) {
    $pidValues = $listenLines | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
    $allOk = $true
    $details = @()
    foreach ($pidValue in $pidValues) {
        if ($pidValue -match '^\d+$') {
            $proc = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
            if ($proc) {
                $details += "PID=$pidValue ($($proc.ProcessName))"
                if ($proc.ProcessName -ne 'node' -and $proc.ProcessName -notlike '*node*') {
                    $allOk = $false
                }
            }
        }
    }
    Write-Check "Port 3737 is listened only by node.exe" $allOk ($details -join ', ')
} else {
    Write-Host "  [SKIP] No listener on port 3737 (server not running)." -ForegroundColor DarkYellow
}
Write-Host ""

# --- Summary ----------------------------------------------------------------
Write-Host "================================================================"
Write-Host " Result: $Pass passed, $Fail failed" -ForegroundColor $(if ($Fail -eq 0) { "Green" } else { "Red" })
Write-Host "================================================================"
Write-Host ""

if ($Fail -gt 0) {
    Write-Host "Verification FAILED. Review failed checks above." -ForegroundColor Red
    Write-Host "See docs/SECURITY.md for details on each check." -ForegroundColor DarkGray
    exit 1
}
Write-Host "All checks passed. Package matches the 5 trust point criteria." -ForegroundColor Green
exit 0
