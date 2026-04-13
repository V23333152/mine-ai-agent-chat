@echo off
chcp 65001 >nul
echo 启动代码解释器服务...
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
pip install aiohttp numpy matplotlib pandas pillow -q

:: 启动服务
echo.
echo 启动代码解释器服务: http://127.0.0.1:8882
echo.
python code_interpreter.py

pause
