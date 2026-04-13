param([string]$code)
Add-Type -AssemblyName System.Windows.Forms

# Set clipboard first (clipboard content bypasses IME)
Set-Clipboard -Value $code

$w = New-Object -ComObject wscript.shell
$activated = $w.AppActivate(15592)
if (-not $activated) { $activated = $w.AppActivate('CC Remote.exe') }
Start-Sleep -Milliseconds 800

# Clear existing input
[System.Windows.Forms.SendKeys]::SendWait("{BACKSPACE 20}")
Start-Sleep -Milliseconds 200

# Right-click paste (Windows Terminal default paste) via Ctrl+V
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 400

# Press Enter
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

Write-Host "activated=$activated code=$code (via clipboard)"
