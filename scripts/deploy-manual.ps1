# deploy-manual.ps1

Write-Host "Re-building and Deploying Kanteen..." -ForegroundColor Cyan

# 1. Clean previous builds
if (Test-Path ".next") {
    Write-Host "Cleaning .next directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".next"
}

# 2. Build the project
Write-Host "Building project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Aborting." -ForegroundColor Red
    exit 1
}

# 3. Deploy to Firebase
Write-Host "Deploying to Firebase..." -ForegroundColor Yellow
firebase deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Deployment successful!" -ForegroundColor Green
