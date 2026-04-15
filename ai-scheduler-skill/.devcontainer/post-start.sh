#!/bin/bash
# AI Scheduler Skill - GitHub Codespaces 启动后脚本

echo ""
echo "🚀 欢迎使用 AI Scheduler Skill 开发环境!"
echo ""

# 检查 Docker 是否可用
if docker info >/dev/null 2>&1; then
    echo "  ✓ Docker 服务正常运行"
else
    echo "  ⚠️  Docker 服务可能还在启动中，请稍等..."
fi

# 检查环境变量
if [ -f ".env" ]; then
    source .env 2>/dev/null || true
    if [ -n "$MOONSHOT_API_KEY" ] || [ -n "$TAVILY_API_KEY" ]; then
        echo "  ✓ API Keys 已配置"
    else
        echo "  ⚠️  API Keys 未配置，请编辑 .env 文件"
    fi
else
    echo "  ⚠️  .env 文件不存在，请运行: cp .env.example .env"
fi

echo ""
echo "常用命令:"
echo "  ./test-docker.sh    - 运行 Docker 配置测试"
echo "  ./start-docker.sh   - 启动 Docker 服务（交互式）"
echo "  docker-compose up   - 直接启动所有服务"
echo "  docker-compose ps   - 查看服务状态"
echo ""
echo "提示: 端口已自动转发，你可以直接在浏览器中访问!"
echo ""
