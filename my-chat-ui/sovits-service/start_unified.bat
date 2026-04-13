@echo off
chcp 65001 >nul
echo 🚀 启动统一后端服务...
echo ========================================
echo 服务地址: http://localhost:8888
echo API文档:  http://localhost:8888/docs
echo ========================================
echo.

python unified_server.py %*
