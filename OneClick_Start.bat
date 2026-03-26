@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Nexxora HR Intelligence Cloud - One-Click Start
echo ===================================================
echo.

:: 1. Start Django Backend
echo [1/2] Starting Django Backend Server...
echo (This will open in a new window. Keep it open while using the app.)
cd /d "%~dp0backend"
start "Nexxora Backend" cmd /k ".\venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000"

:: 2. Wait for server to initialize
echo Waiting for backend to initialize (5s)...
timeout /t 5 >nul

:: 3. Launch Frontend
echo [2/2] Launching Nexxora HR Portal...
echo.
echo TIP: If the portal doesn't load, ensure your local VS Code 
echo      Live Server or similar is running on port 5500.
echo.
echo Backend URL: http://127.0.0.1:8000/api/
echo Frontend URL: http://127.0.0.1:5500/frontend/auth.html
echo.

:: Attempt to open the auth page
start http://127.0.0.1:5500/frontend/auth.html

echo.
echo ===================================================
echo   SUCCESS: Nexxora AI Agent Infrastructure Ready
echo ===================================================
echo.
pause
