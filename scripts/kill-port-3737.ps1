$conn = Get-NetTCPConnection -LocalPort 3737 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $pids = $conn | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
  foreach ($procId in $pids) {
    Write-Host "Killing PID $procId"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}
$after = Get-NetTCPConnection -LocalPort 3737 -State Listen -ErrorAction SilentlyContinue
if ($after) { Write-Host "Port 3737 still LISTEN" } else { Write-Host "Port 3737 free" }
