#!/bin/bash
# AI Scheduler Skill - 可移植性自动化测试脚本
# 用法: ./scripts/test-portability.sh [--quick|--full]

set -e

# 配置
REPO_URL="https://github.com/V23333152/ai-scheduler-skill.git"
TEST_DIR="/tmp/ai-scheduler-test-$$"
REPORT_FILE="$TEST_DIR/report.md"
RESULTS_JSON="$TEST_DIR/results.json"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 统计数据
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# 测试模式
TEST_MODE="${1:---quick}"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
    ((TESTS_TOTAL++))
}

# 清理函数
cleanup() {
    if [ "$TEST_MODE" != "--full" ]; then
        log_info "清理测试目录..."
        rm -rf "$TEST_DIR"
    else
        log_info "保留测试目录: $TEST_DIR"
    fi
}

trap cleanup EXIT

# 测试1: 仓库克隆
test_clone() {
    log_info "测试1: 从GitHub克隆仓库..."

    if git clone --depth 1 "$REPO_URL" "$TEST_DIR/repo" 2>/dev/null; then
        log_pass "仓库克隆成功"
        return 0
    else
        log_fail "仓库克隆失败"
        return 1
    fi
}

# 测试2: 文件完整性
test_file_integrity() {
    log_info "测试2: 检查文件完整性..."

    cd "$TEST_DIR/repo"

    REQUIRED_FILES=("README.md" "pyproject.toml" "Dockerfile" "docker-compose.yml")
    MISSING=()

    for file in "${REQUIRED_FILES[@]}"; do
        if [ ! -f "$file" ]; then
            MISSING+=("$file")
        fi
    done

    if [ ${#MISSING[@]} -eq 0 ]; then
        log_pass "所有必需文件存在 (${#REQUIRED_FILES[@]})"
        return 0
    else
        log_fail "缺少文件: ${MISSING[*]}"
        return 1
    fi
}

# 测试3: Python环境
test_python_env() {
    log_info "测试3: Python环境检查..."

    PYTHON_CMD=$(command -v python3 || command -v python)
    if [ -z "$PYTHON_CMD" ]; then
        log_fail "未找到Python"
        return 1
    fi

    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
    log_info "Python版本: $PYTHON_VERSION"

    if [[ "$PYTHON_VERSION" == *"3.11"* ]] || [[ "$PYTHON_VERSION" == *"3.10"* ]] || [[ "$PYTHON_VERSION" == *"3.9"* ]]; then
        log_pass "Python版本兼容"
        return 0
    else
        log_fail "Python版本可能不兼容: $PYTHON_VERSION"
        return 1
    fi
}

# 测试4: Docker环境
test_docker() {
    log_info "测试4: Docker环境检查..."

    if ! command -v docker &> /dev/null; then
        log_skip "Docker未安装"
        return 0
    fi

    DOCKER_VERSION=$(docker --version)
    log_info "Docker版本: $DOCKER_VERSION"

    if docker info &> /dev/null; then
        log_pass "Docker可用"
        return 0
    else
        log_fail "Docker守护进程未运行"
        return 1
    fi
}

# 测试5: Docker构建
test_docker_build() {
    log_info "测试5: Docker镜像构建..."

    if ! command -v docker &> /dev/null; then
        log_skip "Docker未安装"
        return 0
    fi

    cd "$TEST_DIR/repo"

    BUILD_START=$(date +%s)
    if docker build -t ai-scheduler:test . > "$TEST_DIR/build.log" 2>&1; then
        BUILD_END=$(date +%s)
        BUILD_TIME=$((BUILD_END - BUILD_START))

        IMAGE_SIZE=$(docker images ai-scheduler:test --format "{{.Size}}")
        log_pass "Docker构建成功 (${BUILD_TIME}s, $IMAGE_SIZE)"
        return 0
    else
        log_fail "Docker构建失败 (查看 $TEST_DIR/build.log)"
        return 1
    fi
}

# 测试6: Python安装
test_python_install() {
    log_info "测试6: Python包安装..."

    cd "$TEST_DIR/repo"

    # 创建虚拟环境
    $PYTHON_CMD -m venv "$TEST_DIR/venv"
    source "$TEST_DIR/venv/bin/activate"

    INSTALL_START=$(date +%s)
    if pip install -e "." > "$TEST_DIR/install.log" 2>&1; then
        INSTALL_END=$(date +%s)
        INSTALL_TIME=$((INSTALL_END - INSTALL_START))

        log_pass "Python安装成功 (${INSTALL_TIME}s)"
        return 0
    else
        log_fail "Python安装失败 (查看 $TEST_DIR/install.log)"
        return 1
    fi
}

# 测试7: 模块导入
test_module_import() {
    log_info "测试7: 模块导入测试..."

    source "$TEST_DIR/venv/bin/activate"

    if python -c "from scheduler_skill import HybridScheduler; print('OK')" 2>/dev/null; then
        log_pass "模块导入成功"
        return 0
    else
        log_fail "模块导入失败"
        return 1
    fi
}

# 测试8: 基本功能
test_basic_functionality() {
    log_info "测试8: 基本功能测试..."

    source "$TEST_DIR/venv/bin/activate"
    cd "$TEST_DIR/repo"

    # 创建测试配置
    cat > test-config.yaml << 'EOF'
version: "1.0"
cron_jobs:
  - name: test-task
    mode: cron
    schedule: "0 0 * * *"
    prompt: "test"
    model: gpt-4o-mini
    enabled: false
heartbeat:
  enabled: false
storage:
  type: "sqlite"
  path: ":memory:"
EOF

    # 测试配置加载
    if python -c "
from scheduler_skill.core.config import SchedulerConfig
try:
    config = SchedulerConfig.from_yaml('test-config.yaml')
    print('Config loaded:', len(config.tasks), 'tasks')
except Exception as e:
    print('Error:', e)
    exit(1)
" 2>/dev/null; then
        log_pass "配置加载成功"
        return 0
    else
        log_fail "配置加载失败"
        return 1
    fi
}

# 测试9: Docker运行
test_docker_run() {
    log_info "测试9: Docker容器运行..."

    if ! command -v docker &> /dev/null; then
        log_skip "Docker未安装"
        return 0
    fi

    # 创建测试配置
    mkdir -p "$TEST_DIR/config"
    cat > "$TEST_DIR/config/scheduler.yaml" << 'EOF'
version: "1.0"
cron_jobs: []
heartbeat:
  enabled: false
storage:
  type: "sqlite"
  path: "/app/data/test.db"
notify_ui:
  enabled: false
EOF

    # 运行容器测试
    if docker run --rm \
        -e MOONSHOT_API_KEY="test" \
        -e TAVILY_API_KEY="test" \
        -v "$TEST_DIR/config/scheduler.yaml:/app/config/scheduler.yaml:ro" \
        ai-scheduler:test \
        python -c "import scheduler_skill; print('Container OK')" 2>/dev/null; then
        log_pass "Docker容器运行正常"
        return 0
    else
        log_fail "Docker容器运行失败"
        return 1
    fi
}

# 生成报告
generate_report() {
    log_info "生成测试报告..."

    mkdir -p "$TEST_DIR"

    cat > "$REPORT_FILE" << EOF
# AI Scheduler Skill - 可移植性测试报告

**测试时间**: $(date '+%Y-%m-%d %H:%M:%S')
**测试平台**: $(uname -s) ($(uname -m))
**测试模式**: $TEST_MODE

## 测试统计

| 指标 | 数量 |
|-----|------|
| ✅ 通过 | $TESTS_PASSED |
| ❌ 失败 | $TESTS_FAILED |
| ⏭️ 跳过 | $TESTS_SKIPPED |
| **总计** | $TESTS_TOTAL |

## 可移植性评分

EOF

    if [ $TESTS_TOTAL -gt 0 ]; then
        SCORE=$((TESTS_PASSED * 100 / (TESTS_TOTAL - TESTS_SKIPPED)))
        STARS=$((SCORE / 20))

        echo "综合得分: $SCORE/100" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "评级: $(printf '⭐%.0s' $(seq 1 $STARS))" >> "$REPORT_FILE"
    fi

    cat >> "$REPORT_FILE" << EOF

## 结论

$(if [ $TESTS_FAILED -eq 0 ]; then
    echo "✅ 所有测试通过！项目具有良好的可移植性。"
else
    echo "⚠️ 有 $TESTS_FAILED 项测试失败，请参考上文的详细信息。"
fi)

## 推荐部署方式

$(if [ $TESTS_PASSED -ge 7 ]; then
    echo "1. **Docker Compose** - 最适合生产环境"
    echo "2. **Python SDK** - 最适合开发集成"
    echo "3. **MCP工具** - 最适合个人使用"
elif [ $TESTS_PASSED -ge 4 ]; then
    echo "1. **Python SDK** - 目前最稳定的方式"
    echo "2. **源码安装** - 需要手动解决依赖"
else
    echo "⚠️ 当前环境可能存在兼容性问题，建议检查依赖版本。"
fi)

---
*报告由 test-portability.sh 自动生成*
EOF

    # 同时生成JSON
    cat > "$RESULTS_JSON" << EOF
{
  "test_timestamp": "$(date -Iseconds)",
  "platform": "$(uname -s)",
  "architecture": "$(uname -m)",
  "test_mode": "$TEST_MODE",
  "summary": {
    "total": $TESTS_TOTAL,
    "passed": $TESTS_PASSED,
    "failed": $TESTS_FAILED,
    "skipped": $TESTS_SKIPPED,
    "score": $([ $TESTS_TOTAL -gt 0 ] && echo $((TESTS_PASSED * 100 / (TESTS_TOTAL - TESTS_SKIPPED))) || echo "0")
  },
  "recommendation": "$([ $TESTS_FAILED -eq 0 ] && echo "fully_compatible" || [ $TESTS_PASSED -ge 4 ] && echo "partially_compatible" || echo "compatibility_issues")"
}
EOF

    log_info "报告已生成:"
    echo "  - Markdown: $REPORT_FILE"
    echo "  - JSON: $RESULTS_JSON"
}

# 主函数
main() {
    echo "========================================"
    echo "AI Scheduler Skill - 可移植性测试"
    echo "========================================"
    echo "测试模式: $TEST_MODE"
    echo "测试目录: $TEST_DIR"
    echo ""

    # 创建测试目录
    mkdir -p "$TEST_DIR"

    # 执行测试
    test_clone
    test_file_integrity
    test_python_env
    test_docker

    if [ "$TEST_MODE" != "--quick" ]; then
        test_docker_build
        test_python_install
        test_module_import
        test_basic_functionality
        test_docker_run
    fi

    # 生成报告
    generate_report

    # 输出汇总
    echo ""
    echo "========================================"
    echo "          测试完成"
    echo "========================================"
    echo -e "${GREEN}通过: $TESTS_PASSED${NC}"
    echo -e "${RED}失败: $TESTS_FAILED${NC}"
    echo -e "${YELLOW}跳过: $TESTS_SKIPPED${NC}"
    echo "----------------------------------------"

    if [ -f "$REPORT_FILE" ]; then
        echo ""
        cat "$REPORT_FILE"
    fi

    # 返回退出码
    if [ $TESTS_FAILED -gt 0 ]; then
        exit 1
    fi
    exit 0
}

# 帮助信息
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "AI Scheduler Skill - 可移植性测试脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --quick    快速测试 (默认) - 只测试基础环境"
    echo "  --full     完整测试 - 包括构建和功能测试"
    echo "  --help     显示帮助"
    echo ""
    echo "示例:"
    echo "  $0                    # 快速测试"
    echo "  $0 --full             # 完整测试"
    exit 0
fi

# 执行主函数
main
