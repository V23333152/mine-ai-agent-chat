#!/bin/bash
# AI Scheduler Skill - Docker 入口脚本
# 支持 MCP 模式、API 模式和 CLI 模式

set -e

# 检查必需的环境变量
check_env() {
    local missing=()

    if [ -z "$MOONSHOT_API_KEY" ]; then
        missing+=("MOONSHOT_API_KEY")
    fi

    if [ -z "$TAVILY_API_KEY" ]; then
        missing+=("TAVILY_API_KEY")
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        echo "[ERROR] 缺少必需的环境变量: ${missing[*]}"
        echo "[INFO] 请设置这些变量后再启动容器"
        exit 1
    fi
}

# 等待服务就绪
wait_for_service() {
    local host=$1
    local port=$2
    local timeout=${3:-30}

    echo "[INFO] 等待服务 $host:$port ..."
    for i in $(seq 1 $timeout); do
        if python -c "import socket; socket.create_connection(('$host', $port), timeout=1)" 2>/dev/null; then
            echo "[INFO] 服务 $host:$port 已就绪"
            return 0
        fi
        sleep 1
    done
    echo "[WARN] 服务 $host:$port 连接超时"
    return 1
}

# 打印启动信息
print_info() {
    echo "========================================"
    echo "AI Scheduler Skill"
    echo "========================================"
    echo "模式: $1"
    echo "Python: $(python --version)"
    echo "配置: $SCHEDULER_CONFIG"
    echo "数据: $SCHEDULER_DATA_DIR"
    echo "日志: $SCHEDULER_LOG_DIR"
    echo "========================================"
}

# 主入口
case "${1:-mcp}" in
    mcp)
        check_env
        print_info "MCP (stdio)"
        exec python -m scheduler_skill.mcp
        ;;

    api)
        check_env
        print_info "API Server"
        shift
        exec python -m scheduler_skill.api "$@"
        ;;

    cli)
        check_env
        print_info "CLI"
        shift
        exec python -m scheduler_skill.cli "$@"
        ;;

    shell|bash|sh)
        echo "[INFO] 进入调试 shell"
        exec /bin/bash
        ;;

    *)
        echo "[INFO] 执行自定义命令: $@"
        exec "$@"
        ;;
esac
