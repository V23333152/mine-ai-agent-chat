# AI Scheduler Skill - 可移植性测试方案

## 测试理念

模拟真实用户从 GitHub 克隆仓库到成功运行的完整流程，测试项目在不同环境、不同配置下的可移植性。

## 测试矩阵

### 环境矩阵

| 测试场景 | 操作系统 | Docker | Python | 预期结果 |
|---------|---------|--------|--------|---------|
| 纯净Linux | Ubuntu 22.04 | ✅ | 3.11 | 完全支持 |
| 纯净macOS | macOS 14 | ✅ | 3.11 | 完全支持 |
| Windows开发 | Windows 11 | ✅ | 3.11 | 完全支持 |
| 无Docker环境 | Any | ❌ | 3.11 | 本地运行 |
| 旧版Python | Ubuntu 20.04 | ✅ | 3.9 | 降级兼容 |
| 云服务器 | Debian 12 | ✅ | 3.11 | 生产部署 |
| NAS/轻量设备 | Alpine | ✅ | 3.11 | 资源受限 |

### 部署方式矩阵

| 部署方式 | 复杂度 | 适用场景 | 测试重点 |
|---------|-------|---------|---------|
| **方式A: MCP工具** | ⭐ 低 | Claude Desktop/Cursor | 配置简洁性 |
| **方式B: Python SDK** | ⭐⭐ 中 | 项目集成 | 依赖兼容性 |
| **方式C: Docker Compose** | ⭐⭐ 中 | 个人部署 | 一键启动 |
| **方式D: Docker单容器** | ⭐⭐ 中 | 简单部署 | 资源占用 |
| **方式E: 源码安装** | ⭐⭐⭐ 高 | 开发调试 | 构建过程 |
| **方式F: K8s部署** | ⭐⭐⭐⭐ 高 | 生产集群 | 高可用性 |

---

## 详细测试流程

### 阶段一：获取代码（通用步骤）

```bash
# 步骤1: 克隆仓库
git clone https://github.com/V23333152/ai-scheduler-skill.git
cd ai-scheduler-skill

# 验证点：
# ✅ 仓库可访问
# ✅ 文件完整（检查关键文件存在性）
# ✅ README可读取
```

**检查清单**:
- [ ] `git clone` 成功
- [ ] `README.md` 存在且可读
- [ ] `pyproject.toml` 或 `requirements.txt` 存在
- [ ] `Dockerfile` 存在（Docker测试需要）
- [ ] `docker-compose.yml` 存在（Docker测试需要）

---

### 阶段二：部署方式测试

#### 方式A: MCP工具方式（5分钟测试）

**目标**: 验证最简单的使用方式

```bash
# 步骤1: 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 或 venv\Scripts\activate  # Windows

# 步骤2: 安装
pip install -e ".[llm]"

# 步骤3: 创建最小配置
cat > test-scheduler.yaml << 'EOF'
version: "1.0"
cron_jobs:
  - name: test-task
    mode: cron
    schedule: "*/5 * * * *"
    prompt: "Say hello"
    model: gpt-4o-mini
    enabled: true
heartbeat:
  enabled: false
storage:
  type: "sqlite"
  path: "./test.db"
llm:
  default_model: "gpt-4o-mini"
EOF

# 步骤4: 设置环境变量
export MOONSHOT_API_KEY="your-key"
export TAVILY_API_KEY="your-key"

# 步骤5: 测试启动
python -m scheduler_skill.mcp
```

**验证点**:
- [ ] 安装过程无错误
- [ ] MCP服务器能启动
- [ ] 能响应工具列表请求
- [ ] 内存占用 < 200MB

**评分标准**:
| 指标 | 优秀 | 合格 | 不合格 |
|-----|-----|-----|-------|
| 安装时间 | < 2分钟 | < 5分钟 | > 5分钟 |
| 启动时间 | < 5秒 | < 10秒 | > 10秒 |
| 内存占用 | < 150MB | < 300MB | > 300MB |

---

#### 方式B: Python SDK方式（10分钟测试）

**目标**: 验证程序化集成能力

```python
# test_sdk.py
import asyncio
import sys
import time

# 测试1: 模块导入
try:
    from scheduler_skill import HybridScheduler, TaskConfig, ScheduleMode
    from scheduler_skill.core.config import CronConfig
    print("✅ 模块导入成功")
except ImportError as e:
    print(f"❌ 模块导入失败: {e}")
    sys.exit(1)

# 测试2: 创建调度器
try:
    scheduler = HybridScheduler()
    print("✅ 调度器创建成功")
except Exception as e:
    print(f"❌ 调度器创建失败: {e}")
    sys.exit(1)

# 测试3: 装饰器API
@scheduler.cron("*/1 * * * *", name="test-cron")
async def test_task(ctx):
    print(f"Task executed at {time.time()}")
    return "OK"

print("✅ 装饰器注册成功")

# 测试4: 任务列表
async def main():
    await scheduler.start()
    tasks = scheduler.list_tasks()
    print(f"✅ 任务列表获取成功: {len(tasks)} 个任务")
    
    # 测试5: 统计信息
    stats = scheduler.get_stats()
    print(f"✅ 统计信息: {stats}")
    
    await asyncio.sleep(2)
    await scheduler.shutdown()
    print("✅ 调度器正常关闭")

if __name__ == "__main__":
    asyncio.run(main())
```

**验证点**:
- [ ] SDK可正常导入
- [ ] 装饰器API工作正常
- [ ] 任务生命周期管理正常
- [ ] 无内存泄漏

---

#### 方式C: Docker Compose方式（15分钟测试）

**目标**: 验证容器化部署的便利性

```bash
# 步骤1: 准备环境文件
cp .env.example .env
# 编辑 .env 填入API Keys

# 步骤2: 构建并启动
docker-compose up -d

# 步骤3: 等待服务就绪
sleep 10

# 步骤4: 健康检查
docker-compose ps

# 步骤5: 查看日志
docker-compose logs -f scheduler-mcp

# 步骤6: 测试API（如果有API服务）
curl http://localhost:8000/api/v1/stats

# 步骤7: 停止
docker-compose down
```

**验证点**:
- [ ] `docker-compose up` 一键启动成功
- [ ] 健康检查通过
- [ ] 日志正常输出
- [ ] 端口映射正确
- [ ] 数据卷持久化正常

**评分标准**:
| 指标 | 优秀 | 合格 | 不合格 |
|-----|-----|-----|-------|
| 构建时间 | < 3分钟 | < 5分钟 | > 5分钟 |
| 启动时间 | < 30秒 | < 60秒 | > 60秒 |
| 镜像大小 | < 500MB | < 1GB | > 1GB |

---

#### 方式D: Docker单容器方式（10分钟测试）

**目标**: 验证最小化部署

```bash
# 步骤1: 构建镜像
docker build -t ai-scheduler:test .

# 步骤2: 运行容器
docker run -d \
  --name scheduler-test \
  -e MOONSHOT_API_KEY="test" \
  -e TAVILY_API_KEY="test" \
  -v $(pwd)/config:/app/config:ro \
  -p 8765:8765 \
  ai-scheduler:test mcp

# 步骤3: 检查状态
docker ps | grep scheduler-test
docker logs scheduler-test

# 步骤4: 资源检查
docker stats scheduler-test --no-stream

# 步骤5: 清理
docker rm -f scheduler-test
```

---

#### 方式E: 源码安装方式（10分钟测试）

**目标**: 验证开发环境搭建

```bash
# 步骤1: 创建虚拟环境
python -m venv venv-dev
source venv-dev/bin/activate

# 步骤2: 安装开发依赖
pip install -e ".[dev,llm]"

# 步骤3: 运行测试
pytest tests/ -v --tb=short

# 步骤4: 代码检查
flake8 src/
black --check src/
```

---

### 阶段三：配置灵活性测试

测试不同配置文件的兼容性：

```yaml
# 配置A: 最小配置
version: "1.0"
cron_jobs: []

# 配置B: 完整配置
version: "1.0"
cron_jobs:
  - name: full-task
    mode: cron
    schedule: "0 9 * * *"
    timezone: "Asia/Shanghai"
    prompt: "Test"
    model: gpt-4o-mini
    enabled: true
    retry_policy:
      max_attempts: 3
      delay_seconds: 5
    
heartbeat:
  enabled: true
  interval: 1800
  silent_hours: [23, 7]
  
storage:
  type: "sqlite"
  path: "./data/scheduler.db"
  
llm:
  default_model: "gpt-4o-mini"
  api_key: null
  base_url: "https://api.moonshot.cn/v1"
  temperature: 1.0
  timeout: 120
  
notify_ui:
  enabled: true
  port: 8765
  auto_open_browser: false
```

**验证点**:
- [ ] 最小配置能启动
- [ ] 完整配置能启动
- [ ] 配置热重载（如果支持）
- [ ] 配置错误友好提示

---

### 阶段四：跨平台测试

#### Linux (Ubuntu/Debian)
```bash
# 测试脚本
./scripts/test-portability.sh linux
```

#### macOS
```bash
# 测试脚本
./scripts/test-portability.sh macos
```

#### Windows (PowerShell)
```powershell
# 测试脚本
.\scripts\test-portability.ps1
```

---

## 自动化测试脚本

创建 `scripts/test-portability.sh`:

```bash
#!/bin/bash
# 可移植性测试主脚本

set -e

REPO_URL="https://github.com/V23333152/ai-scheduler-skill.git"
TEST_DIR="/tmp/ai-scheduler-portability-test"
RESULT_FILE="$TEST_DIR/result.json"

# 清理
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

echo "🚀 开始可移植性测试..."
echo "测试目录: $TEST_DIR"

# 阶段1: 克隆仓库
echo "📦 阶段1: 克隆仓库..."
if git clone "$REPO_URL" "$TEST_DIR/repo" 2>/dev/null; then
    echo "✅ 克隆成功"
    CLONE_STATUS="passed"
else
    echo "❌ 克隆失败"
    CLONE_STATUS="failed"
    exit 1
fi

cd "$TEST_DIR/repo"

# 阶段2: 文件完整性检查
echo "🔍 阶段2: 文件完整性检查..."
REQUIRED_FILES=("README.md" "pyproject.toml" "Dockerfile" "docker-compose.yml")
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
    echo "✅ 所有必需文件存在"
    FILE_STATUS="passed"
else
    echo "❌ 缺少文件: ${MISSING_FILES[*]}"
    FILE_STATUS="failed"
fi

# 阶段3: Python环境检查
echo "🐍 阶段3: Python环境检查..."
PYTHON_VERSION=$(python3 --version 2>/dev/null || echo "not found")
if [[ "$PYTHON_VERSION" == *"3.11"* ]] || [[ "$PYTHON_VERSION" == *"3.10"* ]]; then
    echo "✅ Python版本支持: $PYTHON_VERSION"
    PYTHON_STATUS="passed"
else
    echo "⚠️ Python版本可能不兼容: $PYTHON_VERSION"
    PYTHON_STATUS="warning"
fi

# 阶段4: Docker检查
echo "🐳 阶段4: Docker环境检查..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "✅ Docker已安装: $DOCKER_VERSION"
    DOCKER_STATUS="passed"
    
    # 测试Docker构建
    echo "🔨 测试Docker构建..."
    if docker build -t ai-scheduler:test . > /dev/null 2>&1; then
        echo "✅ Docker构建成功"
        DOCKER_BUILD_STATUS="passed"
        
        # 获取镜像大小
        IMAGE_SIZE=$(docker images ai-scheduler:test --format "{{.Size}}")
        echo "📊 镜像大小: $IMAGE_SIZE"
    else
        echo "❌ Docker构建失败"
        DOCKER_BUILD_STATUS="failed"
    fi
else
    echo "⚠️ Docker未安装"
    DOCKER_STATUS="skipped"
    DOCKER_BUILD_STATUS="skipped"
fi

# 阶段5: 安装测试
echo "📥 阶段5: Python安装测试..."
python3 -m venv "$TEST_DIR/venv"
source "$TEST_DIR/venv/bin/activate"

if pip install -e "." > /dev/null 2>&1; then
    echo "✅ 基础安装成功"
    INSTALL_STATUS="passed"
    
    # 测试导入
    if python -c "from scheduler_skill import HybridScheduler" 2>/dev/null; then
        echo "✅ 模块导入成功"
        IMPORT_STATUS="passed"
    else
        echo "❌ 模块导入失败"
        IMPORT_STATUS="failed"
    fi
else
    echo "❌ 安装失败"
    INSTALL_STATUS="failed"
    IMPORT_STATUS="skipped"
fi

# 生成报告
echo "📊 生成测试报告..."

cat > "$RESULT_FILE" << EOF
{
  "test_timestamp": "$(date -Iseconds)",
  "platform": "$(uname -s)",
  "architecture": "$(uname -m)",
  "results": {
    "clone": "$CLONE_STATUS",
    "file_integrity": "$FILE_STATUS",
    "python_environment": "$PYTHON_STATUS",
    "docker": "$DOCKER_STATUS",
    "docker_build": "$DOCKER_BUILD_STATUS",
    "pip_install": "$INSTALL_STATUS",
    "module_import": "$IMPORT_STATUS"
  },
  "details": {
    "python_version": "$PYTHON_VERSION",
    "docker_version": "${DOCKER_VERSION:-\"not installed\"}",
    "image_size": "${IMAGE_SIZE:-\"N/A\"}"
  }
}
EOF

echo ""
echo "========================================"
echo "        可移植性测试完成"
echo "========================================"
echo "结果文件: $RESULT_FILE"
echo ""
cat "$RESULT_FILE"
```

---

## 测试报告模板

测试完成后生成报告：

```markdown
# AI Scheduler Skill - 可移植性测试报告

**测试时间**: 2026-04-13
**测试环境**: Ubuntu 22.04 / macOS 14 / Windows 11
**测试版本**: v1.0.0

## 执行摘要

| 测试项目 | 状态 | 备注 |
|---------|-----|-----|
| Git克隆 | ✅ 通过 | 仓库可访问 |
| 文件完整性 | ✅ 通过 | 所有必需文件存在 |
| Docker构建 | ✅ 通过 | 镜像大小: 450MB |
| Python安装 | ✅ 通过 | 支持3.10/3.11 |
| MCP模式 | ✅ 通过 | 启动时间: 3秒 |
| SDK模式 | ✅ 通过 | 所有API可用 |
| Docker Compose | ✅ 通过 | 一键启动成功 |

## 可移植性评分

```
整体可移植性: 9.2/10 ⭐⭐⭐⭐⭐

分项评分:
- 部署便利性: 9.5/10
- 配置灵活性: 9.0/10
- 跨平台兼容: 9.0/10
- 文档完整性: 8.5/10
- 错误处理: 9.5/10
```

## 发现的问题

| 问题 | 严重程度 | 解决方案 |
|-----|---------|---------|
| Windows路径格式 | 低 | 使用双反斜杠或正斜杠 |
| 内存占用略高 | 中 | 可考虑多阶段构建优化 |

## 推荐部署方式

1. **个人用户**: 方式A (MCP工具) - 最简单
2. **开发测试**: 方式E (源码安装) - 最灵活
3. **生产环境**: 方式C (Docker Compose) - 最稳定
```

---

## 执行测试

### 一键测试命令

```bash
# 完整测试
curl -fsSL https://raw.githubusercontent.com/V23333152/ai-scheduler-skill/main/scripts/test-portability.sh | bash

# 或本地执行
./scripts/test-portability.sh
```

### 手动测试清单

复制以下清单，逐项测试：

```markdown
## 移植性测试清单

### 环境准备
- [ ] 操作系统: _____________
- [ ] Python版本: ___________
- [ ] Docker版本: ___________

### 阶段1: 获取代码
- [ ] git clone成功
- [ ] 文件完整

### 阶段2: 部署测试
- [ ] 方式A (MCP) 成功
- [ ] 方式B (SDK) 成功
- [ ] 方式C (Docker) 成功

### 阶段3: 功能验证
- [ ] 能创建定时任务
- [ ] 能列出任务
- [ ] 能触发任务执行
- [ ] 通知界面正常

### 结果记录
- 总体评分: ___/10
- 推荐部署方式: _________
- 遇到的问题: _________
```

这个测试方案的核心价值：
1. **真实场景**: 模拟从GitHub克隆到运行的完整流程
2. **多维度覆盖**: 6种部署方式 × 多平台 × 多配置
3. **量化评估**: 明确的评分标准和自动化测试
4. **实用导向**: 最终给出推荐部署方案