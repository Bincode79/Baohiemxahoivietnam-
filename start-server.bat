@echo off
title BHXH Server - Port 3001
color 0A
cd /d "%~dp0"
echo ==========================================
echo   BHXH Server - Khoi dong may chu
echo ==========================================
echo.

:: Kiem tra port 3001
netstat -ano | findstr ":3001" >nul
if %errorlevel%==0 (
    echo [WARNING] Port 3001 dang duoc su dung!
    echo Vui long tat ung dung khac hoac doi port.
    echo.
    echo Dang killing process...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

echo [1/3] Kiem tra build...
if not exist "dist\index.js" (
    echo [BUILD] Chua co build, dang build...
    call npm run build
    if errorlevel==1 (
        echo [ERROR] Build that bai!
        pause
        exit /b 1
    )
)

echo [2/3] Khoi dong server...
echo.
node dist/index.js

if errorlevel==1 (
    echo.
    echo [ERROR] Server khong the khoi dong!
    echo Vui long kiem tra cau hinh.
    pause
)
