@echo off
title AI Video Dubber ^& Translation (AI DUBBER)
cd /d "%~dp0"

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo ========================================================
echo   AI Video Dubber ^& Translation (AI DUBBER)
echo   Starting server at http://127.0.0.1:8000
echo ========================================================

python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
pause
