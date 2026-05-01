@echo off
echo Starting MAEC...
echo.
echo Starting backend server on port 3001...
start "MAEC Server" cmd /k "cd /d "%~dp0server" && npm start"
timeout /t 2 /nobreak > nul
echo Starting frontend dev server on port 5173...
start "MAEC Client" cmd /k "cd /d "%~dp0client" && npm run dev"
echo.
echo Both servers starting...
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
pause
