@echo off
chcp 65001 >nul
echo ==========================================
echo    GPT-SoVITS TTS 服务启动脚本
echo ==========================================
echo.

REM 检查 Python
echo [1/3] 检查 Python 环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请安装 Python 3.9+
    pause
    exit /b 1
)
python --version
echo.

REM 检查虚拟环境
echo [2/3] 检查虚拟环境...
if not exist "venv" (
    echo 创建虚拟环境...
    python -m venv venv
)

call venv\Scripts\activate.bat
echo 虚拟环境已激活
echo.

REM 安装依赖
echo [3/3] 安装依赖...
pip install -q -r requirements.txt
if errorlevel 1 (
    echo [警告] 部分依赖安装失败，尝试继续启动...
)
echo.

REM 启动服务
echo ==========================================
echo    启动 GPT-SoVITS TTS 服务
echo    地址: http://127.0.0.1:8080
echo ==========================================
echo.

python main.py

pause
