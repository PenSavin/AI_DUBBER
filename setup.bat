@echo off
setlocal
cd /d "%~dp0"

echo Setting up AI Movie Translator...

py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
) else (
    python --version >nul 2>&1
    if errorlevel 1 (
        echo Python 3.10 or newer was not found. Install Python and try again.
        pause
        exit /b 1
    )
    set "PYTHON_CMD=python"
)

if not exist ".venv\Scripts\python.exe" (
    %PYTHON_CMD% -m venv .venv
    if errorlevel 1 goto :failed
)

".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :failed

".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto :failed

where npm >nul 2>&1
if errorlevel 1 (
    if exist "backend\static\app\index.html" echo npm was not found. The existing compiled UI will be used.
    if not exist "backend\static\app\index.html" echo npm was not found. The built-in fallback UI will be used.
    goto :success
)

pushd frontend
call npm ci
if errorlevel 1 (
    popd
    goto :failed
)
call npm run build
if errorlevel 1 (
    popd
    goto :failed
)
popd

:success
echo.
echo Setup completed. Start the app with run.bat.
pause
exit /b 0

:failed
echo.
echo Setup did not complete. Review the message above, fix the issue, and run setup.bat again.
pause
exit /b 1
