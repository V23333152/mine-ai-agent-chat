#!/bin/bash
# AI Scheduler Skill - Docker 快速启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印带颜色的信息
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker 未安装，请先安装 Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    info "Docker 版本: $(docker --version)"
    info "Docker Compose 版本: $(docker-compose --version)"
}

# 检查环境变量
check_env() {
    if [ ! -f ".env" ]; then
        warn ".env 文件不存在，正在从模板创建..."
        cp .env.example .env
        error "请编辑 .env 文件，填入你的 API Keys"
        exit 1
    fi

    # 加载环境变量
    export $(grep -v '^#' .env | xargs)

    local missing=()
    [ -z "$MOONSHOT_API_KEY" ] && missing+=("MOONSHOT_API_KEY")
    [ -z "$TAVILY_API_KEY" ] && missing+=("TAVILY_API_KEY")

    if [ ${#missing[@]} -ne 0 ]; then
        error "缺少必需的环境变量: ${missing[*]}"
        error "请编辑 .env 文件添加这些变量"
        exit 1
    fi

    info "环境变量检查通过"
}

# 创建必要目录
setup_dirs() {
    mkdir -p data logs
    info "数据目录已准备"
}

# 主菜单
show_menu() {
    echo ""
    echo "========================================"
    echo "  AI Scheduler Skill - Docker 管理"
    echo "========================================"
    echo ""
    echo "  1) 启动服务 (docker-compose up)"
    echo "  2) 停止服务 (docker-compose down)"
    echo "  3) 查看日志"
    echo "  4) 重启服务"
    echo "  5) 构建镜像"
    echo "  6) 进入调试模式"
    echo "  7) 备份数据"
    echo "  0) 退出"
    echo ""
    echo "========================================"
}

# 启动服务
start_service() {
    info "正在启动服务..."
    docker-compose up -d
    info "服务已启动"
    info "MCP 服务: docker-compose logs -f scheduler-mcp"
    info "API 服务: http://localhost:${API_PORT:-8000}"
    info "WebSocket: ws://localhost:${NOTIFY_UI_PORT:-8765}"
}

# 停止服务
stop_service() {
    info "正在停止服务..."
    docker-compose down
    info "服务已停止"
}

# 查看日志
view_logs() {
    echo "选择服务:"
    echo "  1) MCP 服务"
    echo "  2) API 服务"
    echo "  3) 所有服务"
    read -p "请输入选项 [1-3]: " choice

    case $choice in
        1) docker-compose logs -f scheduler-mcp ;;
        2) docker-compose logs -f scheduler-api ;;
        3) docker-compose logs -f ;;
        *) warn "无效选项" ;;
    esac
}

# 重启服务
restart_service() {
    info "正在重启服务..."
    docker-compose restart
    info "服务已重启"
}

# 构建镜像
build_image() {
    info "正在构建镜像..."
    docker-compose build --no-cache
    info "镜像构建完成"
}

# 调试模式
debug_mode() {
    info "进入调试模式..."
    docker-compose run --rm --entrypoint /bin/bash scheduler-mcp
}

# 备份数据
backup_data() {
    local backup_dir="backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"

    info "正在备份数据到 $backup_dir..."

    # 备份 SQLite 数据库
    if docker cp ai-scheduler-mcp:/app/data/scheduler.db "$backup_dir/" 2>/dev/null; then
        info "数据库备份成功"
    else
        warn "数据库备份失败"
    fi

    # 备份配置
    cp -r config "$backup_dir/" 2>/dev/null || true

    # 打包
    tar czf "${backup_dir}.tar.gz" "$backup_dir"
    rm -rf "$backup_dir"

    info "备份完成: ${backup_dir}.tar.gz"
}

# 主程序
main() {
    check_docker
    check_env
    setup_dirs

    while true; do
        show_menu
        read -p "请输入选项 [0-7]: " choice

        case $choice in
            1) start_service ;;
            2) stop_service ;;
            3) view_logs ;;
            4) restart_service ;;
            5) build_image ;;
            6) debug_mode ;;
            7) backup_data ;;
            0) info "再见!"; exit 0 ;;
            *) warn "无效选项，请重新输入" ;;
        esac

        echo ""
        read -p "按 Enter 键继续..."
    done
}

# 如果是直接执行，运行主程序
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
