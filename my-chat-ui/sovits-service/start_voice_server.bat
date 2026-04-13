@echo off
chcp 65001 >nul
echo 启动实时语音对话服务器...
echo.

:: 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到Python，请先安装Python
    pause
    exit /b 1
)

:: 安装依赖
echo 检查依赖...
pip install websockets aiohttp numpy requests -q

:: 启动服务器
echo.
echo 启动WebSocket服务器: ws://127.0.0.1:8881
echo.
python realtime_voice_server.py

pause
