@echo off
echo Starting Patent Coversheet App in Development Mode...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Dependencies not found. Installing...
    call install.bat
    if %errorlevel% neq 0 (
        exit /b 1
    )
)

echo Starting Electron application...
npm run dev
