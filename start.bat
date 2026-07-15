@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/2] 필요한 패키지 설치 중...
pip install -q -r requirements.txt
echo [2/2] 급등주 알리미 서버 시작 (http://localhost:8000)
python main.py
pause
