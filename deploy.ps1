param(
    [Parameter(Mandatory=$true)]
    [string]$Message
)

Set-Location "C:\ilc-studios-live"

Write-Host "`nDeploying to app.ilcstudios.com..." -ForegroundColor Cyan

# Stage all changes
git add .

# Commit
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing new to commit." -ForegroundColor Yellow
    exit 0
}

# Push to GitHub (Amplify auto-deploys on push to main)
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed. Check your GitHub credentials." -ForegroundColor Red
    exit 1
}

Write-Host "`nPushed! AWS Amplify is building now — live at https://app.ilcstudios.com in ~2 minutes." -ForegroundColor Green
