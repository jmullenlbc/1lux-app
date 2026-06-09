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
# Run npm install if package.json or package-lock.json changed since last install,
# OR if the husky pre-push hook hasn't been wired up yet (catches the
# common "pulled main but forgot to npm install" case so the pre-push
# guard is always active). Cheap when nothing changed.
if (-not (Test-Path ".husky/_/pre-push") -or
    ((Get-Item package.json).LastWriteTime -gt (Get-Item node_modules -ErrorAction SilentlyContinue).LastWriteTime)) {
    Write-Host "Running npm install (deps changed or husky not yet wired)..."
    npm install --silent
}

# Generate deploy history so /admin/changelog works locally too
node scripts/generate-deploy-log.js
Write-Host "Starting dev server on http://localhost:3000"
npm run dev
