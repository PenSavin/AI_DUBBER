@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Python environment not found. Run setup.bat first.
    pause
    exit /b 1
)
if not exist "backend\bin\ffmpeg.exe" (
    echo backend\bin\ffmpeg.exe is missing. Restore the bundled FFmpeg file and try again.
    pause
    exit /b 1
)

echo Installing the Windows executable builder...
".venv\Scripts\python.exe" -m pip install --upgrade pyinstaller "pywebview>=6.1"
if errorlevel 1 goto :failed

echo Building AI DUBBER.exe...
".venv\Scripts\pyinstaller.exe" --noconfirm --clean --onedir --windowed --name "AI DUBBER" --paths "backend" --add-data "backend\static;static" --collect-all faster_whisper --collect-all ctranslate2 --collect-all av --collect-all tokenizers --collect-all edge_tts --collect-all webview --exclude-module torch --exclude-module pyannote --exclude-module demucs --exclude-module imageio_ffmpeg "backend\desktop_launcher.py"
if errorlevel 1 goto :failed

if not exist "dist\AI DUBBER\bin" mkdir "dist\AI DUBBER\bin"
copy /Y "backend\bin\ffmpeg.exe" "dist\AI DUBBER\bin\ffmpeg.exe" >nul
if errorlevel 1 goto :failed
copy /Y "README.md" "dist\AI DUBBER\README.md" >nul
if errorlevel 1 goto :failed

echo.
echo Build completed: dist\AI DUBBER\AI DUBBER.exe
echo Copy the entire "dist\AI DUBBER" folder to your PC, then double-click AI DUBBER.exe.
pause
exit /b 0

:failed
echo.
echo Build failed. Review the error above.
pause
exit /b 1
