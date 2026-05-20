# Kill any process holding port 3000, then start the dev server on 3000
$connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($connections) {
    $procIds = $connections.OwningProcess | Sort-Object -Unique
    foreach ($procId in $procIds) {
        Write-Host "Killing PID $procId on port 3000..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
}
# Generate deploy history so /admin/changelog works locally too
node scripts/generate-deploy-log.js
Write-Host "Starting dev server on http://localhost:3000"
npm run dev
