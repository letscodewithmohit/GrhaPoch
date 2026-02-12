@echo off
echo ========================================
echo Starting Backend Server
echo ========================================
cd /d "C:\Users\manmo\Downloads\grap poch\backend"
start "Backend Server" cmd /k "npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo Starting Frontend Server
echo ========================================
cd /d "C:\Users\manmo\Downloads\grap poch\frontend"
start "Frontend Server" cmd /k "npm run dev"

echo.
echo ========================================
echo Both servers are starting!
echo ========================================
echo Backend: http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Close this window. Your servers are running in separate windows.
pause
