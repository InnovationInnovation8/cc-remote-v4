$procs = Get-Process -Name 'CC Remote' -ErrorAction SilentlyContinue
foreach ($p in $procs) {
  Write-Host "PID=$($p.Id) Title='$($p.MainWindowTitle)' Handle=$($p.MainWindowHandle)"
}
# Also look for conhost/cmd windows associated with CC Remote
Get-Process | Where-Object { $_.MainWindowTitle -match 'CC Remote|セットアップ' } | ForEach-Object {
  Write-Host "Found: PID=$($_.Id) Name=$($_.ProcessName) Title='$($_.MainWindowTitle)'"
}
