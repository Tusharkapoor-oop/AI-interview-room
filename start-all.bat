@echo off
echo ============================================================
echo  AEGIS INTERVIEW ROOM — FULL STACK LAUNCHER
echo ============================================================
echo  Starting Backend on http://localhost:8000 ...
start "Aegis Backend" cmd /k "cd /d %~dp0backend-cv && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo  Waiting 3 seconds for backend to initialize...
timeout /t 3 /nobreak >nul

echo  Starting Frontend on http://localhost:5173 ...
start "Aegis Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo ============================================================
echo  Both servers started in separate windows!
echo  Backend:  http://localhost:8000/docs
echo  Frontend: http://localhost:5173
echo ============================================================
pause
