# BHXH Server - Khoi dong may chu
# Chu y: Chay script nay trong PowerShell

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  BHXH Server - Khoi dong may chu" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = "C:\Users\HN STORE\baohiemxahoi\baohiemxahoi-master"
Set-Location $projectPath

# Kiem tra port 3001
$portInUse = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Host "[WARNING] Port 3001 dang duoc su dung!" -ForegroundColor Yellow
    Write-Host "Dang killing process..." -ForegroundColor Yellow
    $portInUse | ForEach-Object { 
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
    }
    Start-Sleep -Seconds 2
}

# Kiem tra build
Write-Host "[1/3] Kiem tra build..." -ForegroundColor Cyan
if (-not (Test-Path "dist\index.js")) {
    Write-Host "[BUILD] Chua co build, dang build..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Build that bai!" -ForegroundColor Red
        Read-Host "Nhan Enter de thoat"
        exit 1
    }
}

Write-Host "[2/3] Khoi dong server..." -ForegroundColor Cyan
Write-Host ""

# Khoi dong server
node dist/index.js

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Server khong the khoi dong!" -ForegroundColor Red
    Write-Host "Vui long kiem tra cau hinh." -ForegroundColor Red
    Read-Host "Nhan Enter de thoat"
}
