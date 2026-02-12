@echo off
echo ========================================
echo Stopping All Node.js Servers
echo ========================================
taskkill /F /IM node.exe /T
echo.
echo All Node.js processes have been stopped!
echo You can now run START_SERVERS.bat to restart.
echo.
pause
