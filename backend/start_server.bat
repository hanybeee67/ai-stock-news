@echo off
REM ==========================================
REM AI Stock Briefing Backend Server Script
REM ==========================================

echo.
echo  ==========================================
echo   Starting AI Stock Briefing Backend...
echo  ==========================================
echo.

cd /d "%~dp0"

if not exist ".env" (
    echo [Error] .env file is missing!
    echo Please copy .env.example to .env and enter your API key:
    echo   copy .env.example .env
    echo   notepad .env
    pause
    exit /b 1
)

if not exist "venv" (
    echo [Setup] Creating Python virtual environment...
    python -m venv venv
)

echo [Setup] Activating virtual environment...
call venv\Scripts\activate.bat

echo [Setup] Installing dependencies...
pip install -r requirements.txt

echo.
echo [Start] Starting FastAPI server at http://localhost:8000
echo [Info] Press Ctrl+C to stop the server
echo.

python main.py

pause
