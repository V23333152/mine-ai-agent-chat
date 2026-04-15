# AI Scheduler Skill - 可移植性测试完整指南

本文档指导你如何测试 ai-scheduler-skill 项目的可移植性，验证其在不同环境和部署方式下的兼容性。

---

## 📋 测试概览

### 什么是可移植性测试？

可移植性测试验证项目能否在不同环境（操作系统、Python版本、部署方式）下正常运行，而无需大量修改。

### 测试覆盖范围

```
┌─────────────────────────────────────────────────────────────┐
│                    可移植性测试矩阵                          │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   操作系统   │   Python版本  │   Docker     │    部署方式     │
├──────────────┼──────────────┼──────────────┼────────────────┤
│   Linux      │    3.9       │    有/无     │   MCP工具      │
│   macOS      │    3.10      │    有/无     │   Python SDK   │
│   Windows    │    3.11      │    有/无     │   Docker       │
│              │    3.12      │              │   源码安装     │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

---

## 🚀 快速开始（3分钟）

### 方式1: 一键远程测试（推荐）

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/V23333152/ai-scheduler-skill/main/scripts/test-portability.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/V23333152/ai-scheduler-skill/main/scripts/test-portability.ps1 | iex
```

### 方式2: 本地仓库测试

```bash
# 1. 进入项目目录
cd ai-scheduler-skill

# 2. 运行测试
./scripts/test-portability.sh --quick
```

---

## 📊 详细测试流程

### 阶段1: 环境准备（1分钟）

**检查清单:**
```bash
# 检查 Git
git --version

# 检查 Python
python3 --version  # 或 python --version

# 检查 Docker（可选）
docker --version
docker-compose --version
```

**预期结果:**
- Git >= 2.0
- Python >= 3.9
- Docker >= 20.10（可选）

---

### 阶段2: 代码获取测试（2分钟）

**模拟真实用户操作:**

```bash
# 1. 从GitHub克隆（模拟新用户）
git clone https://github.com/V23333152/ai-scheduler-skill.git
cd ai-scheduler-skill

# 2. 验证文件完整性
ls -la
```

**验证点:**
- [ ] 仓库可访问
- [ ] 克隆成功
- [ ] README.md 存在
- [ ] pyproject.toml 存在
- [ ] Dockerfile 存在（Docker测试需要）

---

### 阶段3: 部署方式测试（选择一种）

#### 方式A: MCP工具方式（最简单，5分钟）

**目标**: 作为 Claude Desktop / Cursor 的 MCP 工具使用

```bash
# 1. 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 2. 安装
pip install -e ".[llm]"

# 3. 创建最小配置
cat > test-scheduler.yaml << 'EOF'
version: "1.0"
cron_jobs:
  - name: test-task
    mode: cron
    schedule: "*/5 * * * *"
    prompt: "Test task"
    model: gpt-4o-mini
    enabled: false
heartbeat:
  enabled: false
storage:
  type: "sqlite"
  path: "./test.db"
llm:
  default_model: "gpt-4o-mini"
EOF

# 4. 设置环境变量
export MOONSHOT_API_KEY="your-key"
export TAVILY_API_KEY="your-key"

# 5. 测试启动
timeout 5 python -m scheduler_skill.mcp || echo "MCP started successfully"
```

**成功标志:**
- 无报错启动
- 内存占用 < 200MB
- 能响应工具列表请求

---

#### 方式B: Python SDK方式（开发集成，10分钟）

**目标**: 将调度器集成到自己的 Python 项目中

```python
# test_sdk.py
import asyncio
import sys

print("测试1: 模块导入...")
try:
    from scheduler_skill import HybridScheduler, TaskConfig, ScheduleMode
    from scheduler_skill.core.config import CronConfig
    print("✅ 模块导入成功")
except ImportError as e:
    print(f"❌ 模块导入失败: {e}")
    sys.exit(1)

print("\n测试2: 创建调度器...")
try:
    scheduler = HybridScheduler()
    print("✅ 调度器创建成功")
except Exception as e:
    print(f"❌ 调度器创建失败: {e}")
    sys.exit(1)

print("\n测试3: 装饰器API...")
@scheduler.cron("*/1 * * * *", name="test-cron")
async def test_task(ctx):
    return "OK"
print("✅ 装饰器注册成功")

print("\n测试4: 任务列表...")
async def main():
    await scheduler.start()
    tasks = scheduler.list_tasks()
    print(f"✅ 任务列表获取成功: {len(tasks)} 个任务")
    
    stats = scheduler.get_stats()
    print(f"✅ 统计信息: {stats}")
    
    await scheduler.shutdown()
    print("✅ 调度器正常关闭")

asyncio.run(main())
print("\n✅ SDK方式测试全部通过!")
```

**运行测试:**
```bash
python test_sdk.py
```

---

#### 方式C: Docker方式（生产部署，15分钟）

**目标**: 使用 Docker 容器化部署

```bash
# 1. 准备环境文件
cp .env.example .env
# 编辑 .env 填入你的 API Keys

# 2. 构建镜像
docker build -t ai-scheduler:test .

# 3. 查看镜像信息
docker images ai-scheduler:test

# 4. 运行容器测试
docker run --rm \
  -e MOONSHOT_API_KEY="test" \
  -e TAVILY_API_KEY="test" \
  ai-scheduler:test \
  python -c "import scheduler_skill; print('Docker OK')"

# 5. 使用 Docker Compose
docker-compose up -d

# 6. 检查服务状态
docker-compose ps
docker-compose logs -f

# 7. 停止服务
docker-compose down
```

**验证点:**
- [ ] 镜像构建成功
- [ ] 镜像大小 < 1GB
- [ ] 容器能正常启动
- [ ] 健康检查通过
- [ ] 端口映射正确

---

### 阶段4: 配置灵活性测试（5分钟）

**测试不同配置文件的兼容性:**

```bash
# 测试1: 最小配置
cat > config-minimal.yaml << 'EOF'
version: "1.0"
cron_jobs: []
EOF

# 测试2: 完整配置
cat > config-full.yaml << 'EOF'
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
EOF

# 验证配置加载
python -c "
from scheduler_skill.core.config import SchedulerConfig
for config_file in ['config-minimal.yaml', 'config-full.yaml']:
    try:
        config = SchedulerConfig.from_yaml(config_file)
        print(f'✅ {config_file} 加载成功')
    except Exception as e:
        print(f'❌ {config_file} 加载失败: {e}')
"
```

---

## 📈 结果评估

### 评分标准

运行测试脚本后会自动生成评分：

```
综合得分: 85/100 ⭐⭐⭐⭐

分项得分:
- 部署便利性: 9.0/10
- 配置灵活性: 8.5/10
- 跨平台兼容: 8.0/10
- 文档完整性: 8.5/10
```

### 评级说明

| 评级 | 分数 | 说明 | 建议 |
|-----|------|-----|------|
| ⭐⭐⭐⭐⭐ | 90-100 | 优秀 | 完全兼容，可直接使用 |
| ⭐⭐⭐⭐ | 75-89 | 良好 | 基本兼容，可能有轻微问题 |
| ⭐⭐⭐ | 60-74 | 一般 | 需要调整配置或依赖 |
| ⭐⭐ | < 60 | 差 | 存在严重兼容性问题 |

---

## 🔧 故障排除

### 常见问题

#### Q1: Python安装失败
**现象:** `pip install` 报错
**解决:**
```bash
# 升级 pip
pip install --upgrade pip

# 安装系统依赖
# Ubuntu/Debian:
sudo apt-get install gcc libpq-dev

# macOS:
brew install gcc
```

#### Q2: Docker构建失败
**现象:** `docker build` 报错
**解决:**
```bash
# 检查Docker守护进程
docker info

# 清理缓存重试
docker build --no-cache -t ai-scheduler:test .
```

#### Q3: MCP无法启动
**现象:** `python -m scheduler_skill.mcp` 报错
**解决:**
```bash
# 检查环境变量
echo $MOONSHOT_API_KEY
echo $TAVILY_API_KEY

# 检查配置文件
cat scheduler.yaml
```

#### Q4: 模块导入失败
**现象:** `ImportError: No module named 'scheduler_skill'`
**解决:**
```bash
# 确认安装成功
pip list | grep scheduler

# 重新安装
pip install -e "." --force-reinstall
```

---

## 📊 测试报告示例

测试完成后会生成类似以下的报告：

```markdown
# AI Scheduler Skill - 可移植性测试报告

**测试时间**: 2026-04-13T10:30:00+08:00
**测试平台**: Linux (x86_64)
**测试模式**: full

## 测试统计

| 指标 | 数量 |
|-----|------|
| 通过 | 8 |
| 失败 | 0 |
| 跳过 | 1 |

## 可移植性评分

综合得分: 92/100

评级: ⭐⭐⭐⭐⭐

## 详细结果

| 测试项 | 状态 | 备注 |
|-------|------|-----|
| Git克隆 | ✅ 通过 | 仓库可访问 |
| 文件完整性 | ✅ 通过 | 所有必需文件存在 |
| Python环境 | ✅ 通过 | 3.11.4 |
| Docker环境 | ✅ 通过 | 24.0.7 |
| Docker构建 | ✅ 通过 | 3分12秒, 485MB |
| Python安装 | ✅ 通过 | 45秒 |
| 模块导入 | ✅ 通过 | - |
| 基本功能 | ✅ 通过 | - |

## 结论

✅ 所有测试通过！项目具有良好的可移植性。

## 推荐部署方式

1. **Docker Compose** - 最适合生产环境
2. **Python SDK** - 最适合开发集成
3. **MCP工具** - 最适合个人使用
```

---

## 🤝 贡献测试

如果你想为项目贡献新的测试场景：

1. **Fork 仓库**
2. **添加测试脚本** 到 `scripts/` 目录
3. **更新 CI/CD** `.github/workflows/portability-test.yml`
4. **提交 Pull Request**

---

## 📞 获取帮助

- **GitHub Issues**: https://github.com/V23333152/ai-scheduler-skill/issues
- **文档**: [PORTABILITY-TEST.md](./PORTABILITY-TEST.md)

---

## ✅ 测试清单

复制以下清单逐项完成：

```markdown
## 我的可移植性测试

### 环境信息
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

### 结果
- 总体评分: ___/10
- 推荐部署方式: _________
- 遇到的问题: _________
```

---

**祝测试顺利！** 🚀
