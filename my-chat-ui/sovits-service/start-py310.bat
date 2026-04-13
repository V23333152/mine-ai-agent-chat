@echo off
chcp 65001 >nul
echo ==========================================
echo    GPT-SoVITS TTS 服务启动脚本 (Python 3.10)
echo ==========================================
echo.

REM 检查 Python 3.10
echo [1/2] 检查 Python 3.10 环境...
py -3.10 --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python 3.10
    pause
    exit /b 1
)
py -3.10 --version
echo.

REM 启动服务
echo [2/2] 启动 GPT-SoVITS TTS 服务...
echo    地址: http://127.0.0.1:8080
echo ==========================================
echo.

py -3.10 main.py

pause
