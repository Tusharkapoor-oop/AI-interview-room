@echo off
echo ============================================================
echo  AEGIS INTERVIEW ROOM — BACKEND SERVER (FastAPI / Uvicorn)
echo  URL: http://localhost:8000
echo  Docs: http://localhost:8000/docs
echo ============================================================
cd /d "%~dp0backend-cv"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
