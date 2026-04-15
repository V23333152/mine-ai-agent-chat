#!/bin/bash
# AI Scheduler Skill - GitHub Codespaces 初始化脚本

set -e

echo "========================================"
echo "  AI Scheduler Skill - 开发环境初始化"
echo "========================================"

# 安装 Python 依赖
echo ""
echo "[1/5] 安装 Python 依赖..."
pip install --user -e ".[llm,dev]" 2>/dev/null || pip install --user -e "."

# 安装 Docker Compose
echo ""
echo "[2/5] 检查 Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "  ✓ Docker Compose 已安装"
else
    echo "  ✓ Docker Compose 已存在: $(docker-compose --version)"
fi

# 创建必要目录
echo ""
echo "[3/5] 创建必要目录..."
mkdir -p data logs config
chmod +x docker-entrypoint.sh test-docker.sh start-docker.sh 2>/dev/null || true
echo "  ✓ 目录已创建"

# 创建 .env 文件（如果不存在）
echo ""
echo "[4/5] 检查环境变量配置..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "  ✓ .env 文件已从模板创建"
        echo ""
        echo "  ⚠️  注意：请编辑 .env 文件，填入你的 API Keys"
    else
        echo "  ✗ .env.example 文件不存在"
    fi
else
    echo "  ✓ .env 文件已存在"
fi

# 设置 Git 配置（如果有）
echo ""
echo "[5/5] 配置 Git..."
git config --global --get user.name >/dev/null 2>&1 || echo "  ℹ️  提示: 使用 'git config --global user.name \"Your Name\"' 设置用户名"
git config --global --get user.email >/dev/null 2>&1 || echo "  ℹ️  提示: 使用 'git config --global user.email \"you@example.com\"' 设置邮箱"

echo ""
echo "========================================"
echo "  初始化完成!"
echo "========================================"
echo ""
echo "快速开始:"
echo "  1. 编辑 .env 文件填入 API Keys (如果尚未设置)"
echo "  2. 运行测试: ./test-docker.sh"
echo "  3. 启动服务: ./start-docker.sh"
echo ""
echo "可用端口:"
echo "  - API 服务:    http://localhost:8000"
echo "  - WebSocket:   ws://localhost:8765"
echo "  - UI 服务:     http://localhost:3000"
echo ""
echo "查看文档: cat DOCKER.md"
echo ""
