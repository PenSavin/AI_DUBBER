@echo off
setlocal
title AI Movie Translator and Dubber
cd /d "%~dp0"

set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
    set "PYTHON_ARGS="
) else (
    py -3 --version >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_EXE=py"
        set "PYTHON_ARGS=-3"
    ) else (
        python --version >nul 2>&1
        if errorlevel 1 (
            echo Python was not found. Run setup.bat first.
            pause
            exit /b 1
        )
        set "PYTHON_EXE=python"
        set "PYTHON_ARGS="
    )
)

echo ========================================================
echo   AI Movie Translator and Dubber
echo   Open http://127.0.0.1:8000 after the server starts
echo   Press Ctrl+C to stop the server
echo ========================================================

pushd "%~dp0backend"
"%PYTHON_EXE%" %PYTHON_ARGS% -m uvicorn main:app --host 127.0.0.1 --port 8000
popd
if errorlevel 1 (
    echo.
    echo The server stopped with an error. Check the message above.
    pause
)
