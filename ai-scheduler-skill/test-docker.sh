#!/bin/bash
# AI Scheduler Skill - Docker 配置测试脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Docker 配置测试"
echo "========================================"

# 测试 1: 检查文件结构
echo ""
echo "[TEST 1] 检查必要文件..."
required_files=(
    "Dockerfile"
    "docker-compose.yml"
    ".env.example"
    "docker-entrypoint.sh"
    "config/scheduler.yaml"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file 存在"
    else
        echo "  ✗ $file 不存在"
        exit 1
    fi
done

# 测试 2: 检查环境变量模板
echo ""
echo "[TEST 2] 检查环境变量模板..."
if grep -q "MOONSHOT_API_KEY" .env.example && \
   grep -q "TAVILY_API_KEY" .env.example; then
    echo "  ✓ 必需变量已定义"
else
    echo "  ✗ 缺少必需变量"
    exit 1
fi

# 测试 3: 检查 Dockerfile 语法
echo ""
echo "[TEST 3] 检查 Dockerfile 语法..."
if docker build -t ai-scheduler:test . --file Dockerfile --quiet 2>/dev/null; then
    echo "  ✓ Dockerfile 语法正确"
    docker rmi ai-scheduler:test >/dev/null 2>&1 || true
else
    echo "  ✗ Dockerfile 构建失败"
    exit 1
fi

# 测试 4: 检查配置文件
echo ""
echo "[TEST 4] 检查配置文件..."
if grep -q "version:" config/scheduler.yaml && \
   grep -q "llm:" config/scheduler.yaml && \
   grep -q "storage:" config/scheduler.yaml; then
    echo "  ✓ 配置文件结构正确"
else
    echo "  ✗ 配置文件结构错误"
    exit 1
fi

# 测试 5: 检查入口脚本
echo ""
echo "[TEST 5] 检查入口脚本..."
if [ -x "docker-entrypoint.sh" ]; then
    echo "  ✓ 入口脚本可执行"
else
    echo "  ✗ 入口脚本不可执行，正在修复..."
    chmod +x docker-entrypoint.sh
    echo "  ✓ 已修复"
fi

# 测试 6: 验证 docker-compose 配置
echo ""
echo "[TEST 6] 验证 docker-compose 配置..."
if docker-compose config >/dev/null 2>&1; then
    echo "  ✓ docker-compose.yml 语法正确"
else
    echo "  ✗ docker-compose.yml 配置错误"
    exit 1
fi

echo ""
echo "========================================"
echo "所有测试通过!"
echo "========================================"
echo ""
echo "快速开始:"
echo "  1. cp .env.example .env"
echo "  2. 编辑 .env 填入 API Keys"
echo "  3. ./start-docker.sh"
echo ""
