$projectRoot = "c:\Users\arfat\OneDrive\Desktop\SEM_4\Witchar\Witchar2\witcharproject2"
$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"
$mongoUri = "mongodb+srv://omspise856_db_user:witchar2026@cluster0.du4fjet.mongodb.net/fraudDB?retryWrites=true&w=majority"

if (-not (Test-Path $pythonExe)) {
  Write-Error "Python venv not found at $pythonExe"
  exit 1
}

$backendCmd = @"
Set-Location '$projectRoot\flask-app'
`$env:MONGODB_URI = '$mongoUri'
& '$pythonExe' 'serve_model.py'
"@

$dashboardCmd = @"
Set-Location '$projectRoot\dashboard'
npm run dev -- --host 127.0.0.1 --port 5173
"@

$paymentCmd = @"
Set-Location '$projectRoot\payment-page'
npm run dev -- --host 127.0.0.1 --port 5174
"@

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $backendCmd
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $dashboardCmd
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $paymentCmd
)

Write-Host "Launched backend (5000), dashboard (5173), and payment page (5174) in separate terminals."
