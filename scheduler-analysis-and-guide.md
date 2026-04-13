# AI Scheduler Skill 定时任务系统分析报告与移植指南

## 📊 项目分析概览

### 项目1：ai-scheduler-skill（核心调度库）
**位置**: `D:\IT\新项目\ai-scheduler-skill`

### 项目2：AI智能体（集成应用）
**位置**: `D:\IT\AI智能体\my-chat-ui\apps\agents`

---

## 🔍 功能评测

### 1. 核心功能对比

| 功能特性 | ai-scheduler-skill | AI智能体集成 | 评测结果 |
|---------|-------------------|-------------|---------|
| **Cron定时任务** | ✅ 完整支持 | ✅ 通过MCP调用 | ⭐⭐⭐⭐⭐ |
| **Heartbeat智能检查** | ✅ 完整支持 | ⚠️ 部分支持 | ⭐⭐⭐⭐ |
| **Event事件驱动** | ✅ 支持 | ❌ 未使用 | ⭐⭐⭐ |
| **MCP协议** | ✅ 完整实现 | ✅ 作为客户端 | ⭐⭐⭐⭐⭐ |
| **REST API** | ✅ FastAPI | ✅ 自定义路由 | ⭐⭐⭐⭐ |
| **通知界面** | ✅ WebSocket | ✅ 继承使用 | ⭐⭐⭐⭐⭐ |
| **联网搜索** | ✅ Tavily集成 | ✅ 通过MCP | ⭐⭐⭐⭐ |
| **天气查询** | ✅ 高德地图 | ✅ 通过MCP | ⭐⭐⭐⭐ |
| **多存储后端** | ✅ SQLite/PostgreSQL/Redis | ✅ SQLite | ⭐⭐⭐⭐ |
| **任务持久化** | ✅ 文件+数据库 | ✅ JSON文件 | ⭐⭐⭐⭐ |

### 2. 架构设计评分

```
┌─────────────────────────────────────────────────────────────┐
│                    架构设计评分                              │
├─────────────────────────────────────────────────────────────┤
│  可移植性        ████████████████████████████████████  9/10 │
│  扩展性          ██████████████████████████████████    8/10 │
│  易用性          ████████████████████████████████      8/10 │
│  性能            ██████████████████████████████        7/10 │
│  稳定性          ████████████████████████████████      8/10 │
│  文档完整性      ██████████████████████████            6/10 │
└─────────────────────────────────────────────────────────────┘
                        总分: 46/60 (优秀)
```

### 3. 混合调度模式详解

#### Cron模式（精确时间）
```yaml
# 使用场景: 每日晨报、定时备份、定期报告
cron_jobs:
  - name: morning-briefing
    schedule: "0 8 * * *"  # 每天早上8点
    timezone: "Asia/Shanghai"
    prompt: "生成今日晨报..."
```
**特点**: 独立会话、精确触发、适合固定时间任务

#### Heartbeat模式（智能检查）
```yaml
# 使用场景: 邮件监控、异常检测、智能提醒
heartbeat:
  interval: 1800  # 30分钟检查一次
  checks:
    - name: email-check
      condition: "has_urgent_email"
```
**特点**: 上下文感知、批量处理、只在需要时触发

#### Event模式（事件驱动）
```yaml
# 使用场景: Webhook触发、实时响应
event_hooks:
  - name: github-webhook
    path: "/webhooks/github"
    filter: "push to main"
```
**特点**: 即时响应、适合外部系统集成

---

## 🚀 可移植性评价

### 1. 部署方式对比

| 部署方式 | 复杂度 | 可移植性 | 适用场景 |
|---------|-------|---------|---------|
| **MCP工具** | ⭐ 低 | ⭐⭐⭐⭐⭐ | 个人使用、Claude Desktop |
| **Python SDK** | ⭐⭐ 中 | ⭐⭐⭐⭐ | 项目集成、自定义开发 |
| **REST API** | ⭐⭐⭐ 高 | ⭐⭐⭐ | 团队协作、多语言环境 |
| **Docker** | ⭐⭐⭐ 高 | ⭐⭐⭐⭐ | 生产环境、云部署 |

### 2. 依赖分析

#### 核心依赖
```
Python >= 3.10
- apscheduler (Cron调度)
- aiohttp (异步HTTP)
- mcp (MCP协议)
- pyyaml (配置解析)
- croniter (Cron表达式)
```

#### 可选依赖
```
- aiohttp (WebSocket通知界面)
- asyncpg (PostgreSQL支持)
- redis (Redis支持)
- aiohttp-session (会话管理)
```

### 3. 跨平台兼容性

| 平台 | 支持状态 | 注意事项 |
|-----|---------|---------|
| **Windows** | ✅ 完全支持 | 使用venv_scheduler虚拟环境 |
| **Linux** | ✅ 完全支持 | 推荐使用Docker部署 |
| **macOS** | ✅ 完全支持 | 与Linux相同 |
| **WSL** | ✅ 支持 | 路径转换需注意 |

---

## 📦 移植安装教程

### 第一部分：快速开始（5分钟）

#### 步骤1: 克隆或复制项目
```bash
# 方式1: 直接复制已有项目
cp -r "D:\IT\新项目\ai-scheduler-skill" "你的目标路径\ai-scheduler-skill"

# 方式2: 克隆Git仓库（如果有）
git clone https://github.com/your-repo/ai-scheduler-skill.git
```

#### 步骤2: 创建Python虚拟环境
```bash
cd ai-scheduler-skill

# Windows
python -m venv venv_scheduler
venv_scheduler\Scripts\activate

# Linux/macOS
python3 -m venv venv_scheduler
source venv_scheduler/bin/activate
```

#### 步骤3: 安装依赖
```bash
# 基础依赖
pip install apscheduler aiohttp mcp pyyaml croniter

# 如果需要通知界面
pip install aiohttp-session

# 如果需要PostgreSQL
pip install asyncpg

# 如果需要Redis
pip install redis aioredis
```

#### 步骤4: 配置环境变量
创建 `.env` 文件:
```bash
# LLM API配置（二选一）
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://api.openai.com/v1

# 或者使用Kimi
MOONSHOT_API_KEY=your_moonshot_key

# 联网搜索（可选）
TAVILY_API_KEY=your_tavily_key

# 天气查询（可选）
AMAP_WEBSERVICE_KEY=your_amap_key

# 配置文件路径
SCHEDULER_CONFIG=./scheduler.yaml
```

#### 步骤5: 创建配置文件
创建 `scheduler.yaml`:
```yaml
version: "1.0"

# Cron定时任务
cron_jobs:
  - name: morning-briefing
    mode: cron
    schedule: "0 8 * * *"
    timezone: "Asia/Shanghai"
    prompt: |
      请生成今日晨报：
      - 日期: {{date}}
      - 天气: {{weather}}
      - 温度: {{temperature}}
      - 穿衣建议: {{clothing_advice}}
    model: kimi-k2.5
    enabled: true

# Heartbeat智能检查
heartbeat:
  enabled: true
  interval: 60
  silent_hours: [23, 7]

# 存储配置
storage:
  type: "sqlite"
  path: "./data/scheduler.db"

# LLM配置
llm:
  default_model: "kimi-k2.5"
  api_key: null  # 从环境变量读取
  base_url: "https://api.moonshot.cn/v1"
  temperature: 1.0

# 通知界面
notify_ui:
  enabled: true
  port: 8765
  auto_open_browser: true
```

#### 步骤6: 启动MCP服务器
```bash
# 方式1: 直接使用Python模块
python -m scheduler_skill.mcp

# 方式2: 使用包装脚本（参考AI智能体项目）
python mcp_scheduler_wrapper.py
```

---

### 第二部分：与Claude Desktop集成

#### 配置Claude Desktop
编辑 `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "scheduler": {
      "command": "python",
      "args": [
        "D:\\你的路径\\ai-scheduler-skill\\src\\scheduler_skill\\mcp\\server.py"
      ],
      "env": {
        "OPENAI_API_KEY": "your-key",
        "SCHEDULER_CONFIG": "D:\\你的路径\\scheduler.yaml",
        "TAVILY_API_KEY": "your-tavily-key",
        "AMAP_WEBSERVICE_KEY": "your-amap-key"
      }
    }
  }
}
```

**Windows路径注意**: 使用双反斜杠 `\\` 或正斜杠 `/`

---

### 第三部分：与Node.js/TypeScript项目集成

#### 1. 创建MCP包装脚本
创建 `mcp_scheduler_wrapper.py`:
```python
#!/usr/bin/env python3
"""MCP Scheduler Wrapper - 用于通过PYTHONPATH方式加载"""

import sys
import os

# 添加 ai-scheduler-skill 到 Python 路径
SCHEDULER_SKILL_PATH = os.getenv(
    "SCHEDULER_SKILL_PATH",
    r"D:\你的路径\ai-scheduler-skill\src"
)
sys.path.insert(0, SCHEDULER_SKILL_PATH)

# 加载 .env 文件
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip().strip('"').strip("'")

# 设置默认配置路径
if not os.getenv("SCHEDULER_CONFIG"):
    os.environ["SCHEDULER_CONFIG"] = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "scheduler.yaml"
    )

# 启动 MCP 服务器
from scheduler_skill.mcp.server import MCPServer
import asyncio

if __name__ == "__main__":
    server = MCPServer()
    asyncio.run(server.run())
```

#### 2. TypeScript MCP客户端
参考 `AI智能体` 项目的 `scheduler.ts`，创建简化的MCP客户端:

```typescript
import { spawn, ChildProcess } from "child_process";

class SchedulerMCPClient {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string, { resolve: any; reject: any }>();

  start(pythonPath: string, wrapperPath: string) {
    this.process = spawn(pythonPath, [wrapperPath], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    this.process.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim().startsWith("{")) {
          this.handleResponse(line);
        }
      }
    });
  }

  private handleResponse(line: string) {
    const response = JSON.parse(line);
    if (response.id && this.pendingRequests.has(response.id)) {
      const { resolve, reject } = this.pendingRequests.get(response.id)!;
      this.pendingRequests.delete(response.id);
      response.error ? reject(response.error) : resolve(response.result);
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    const id = String(++this.messageId);
    const request = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }, 30000);
      this.process!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  // 便捷方法
  async createCronTask(name: string, schedule: string, prompt: string) {
    return this.callTool("schedule_cron_task", {
      name,
      schedule,
      prompt,
      timezone: "Asia/Shanghai",
    });
  }

  async listTasks() {
    return this.callTool("list_tasks", {});
  }

  async triggerTask(taskId: string) {
    return this.callTool("trigger_task", { task_id: taskId });
  }

  stop() {
    this.process?.kill();
    this.process = null;
  }
}

// 使用示例
const client = new SchedulerMCPClient();
client.start(
  "D:\\路径\\venv_scheduler\\Scripts\\python.exe",
  "D:\\路径\\mcp_scheduler_wrapper.py"
);

// 创建定时任务
await client.createCronTask(
  "daily-report",
  "0 9 * * *",
  "生成今日工作报告"
);

// 列出所有任务
const tasks = await client.listTasks();
console.log(tasks);
```

---

### 第四部分：高级配置

#### 1. 自定义任务处理器
```python
from scheduler_skill import HybridScheduler, TaskConfig, ScheduleMode

scheduler = HybridScheduler.from_config("scheduler.yaml")

# 自定义Cron任务
@scheduler.cron("0 9 * * *", name="custom-task")
async def my_custom_task(ctx):
    # 使用上下文提供的工具
    data = await ctx.http.get("https://api.example.com/data")
    analysis = await ctx.llm.generate(f"分析数据: {data}")
    await ctx.storage.save("analysis", analysis)
    return analysis

# 自定义Heartbeat任务
@scheduler.heartbeat(interval=300, name="smart-check")
async def my_heartbeat_task(ctx):
    # 检查条件
    status = await check_system_status()
    if status.has_alert:
        return f"⚠️ 系统告警: {status.message}"
    return "HEARTBEAT_OK"  # 正常时保持沉默

await scheduler.start()
```

#### 2. 多存储后端切换
```yaml
# SQLite (默认，适合个人使用)
storage:
  type: "sqlite"
  path: "./data/scheduler.db"

# PostgreSQL (适合团队协作)
storage:
  type: "postgres"
  host: "localhost"
  port: 5432
  database: "scheduler"
  user: "postgres"
  password: "${DB_PASSWORD}"

# Redis (适合分布式部署)
storage:
  type: "redis"
  host: "localhost"
  port: 6379
  db: 0
```

#### 3. 自定义通知界面
```python
from scheduler_skill.notify_ui import NotifyUIServer

# 启动自定义通知服务器
notify_server = NotifyUIServer(port=8765)
await notify_server.start(auto_open_browser=True)

# 发送自定义通知
await notify_server.notify(
    title="任务完成",
    content="这是任务执行结果",
    msg_type="success"
)
```

---

### 第五部分：Docker部署

#### 1. 创建Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY src/ ./src/
COPY scheduler.yaml .

# 环境变量
ENV PYTHONPATH=/app/src
ENV SCHEDULER_CONFIG=/app/scheduler.yaml

# 暴露端口（用于REST API和通知界面）
EXPOSE 8000 8765

# 启动命令
CMD ["python", "-m", "scheduler_skill.mcp"]
```

#### 2. Docker Compose配置
```yaml
version: '3.8'

services:
  scheduler:
    build: .
    container_name: ai-scheduler
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
      - AMAP_WEBSERVICE_KEY=${AMAP_WEBSERVICE_KEY}
    volumes:
      - ./data:/app/data
      - ./scheduler.yaml:/app/scheduler.yaml
    ports:
      - "8000:8000"  # REST API
      - "8765:8765"  # 通知界面
    restart: unless-stopped
```

#### 3. 启动Docker服务
```bash
docker-compose up -d
```

---

### 第六部分：故障排除

#### 常见问题及解决方案

| 问题 | 原因 | 解决方案 |
|-----|-----|---------|
| MCP连接失败 | 路径错误或环境变量未设置 | 检查Python路径和env配置 |
| 任务不触发 | Cron表达式错误或时区问题 | 验证Cron表达式，检查时区设置 |
| 通知界面不显示 | 端口被占用或浏览器阻止 | 更换端口，检查防火墙设置 |
| LLM调用失败 | API Key无效或余额不足 | 检查API Key，查看额度 |
| 搜索功能不可用 | Tavily API Key未配置 | 设置TAVILY_API_KEY |
| 天气查询失败 | 高德Key无效 | 检查AMAP_WEBSERVICE_KEY |

#### 调试技巧
```bash
# 1. 检查环境变量
python -c "import os; print(os.getenv('OPENAI_API_KEY'))"

# 2. 测试MCP连接
python -c "from scheduler_skill.mcp.server import MCPServer; print('MCP Server OK')"

# 3. 验证配置文件
python -c "from scheduler_skill.core.config import SchedulerConfig; c = SchedulerConfig.from_yaml('scheduler.yaml'); print('Config OK')"

# 4. 查看日志
# Windows
type logs\scheduler.log

# Linux/macOS
tail -f logs/scheduler.log
```

---

## 📝 总结

### 系统优势
1. **高度可移植** - 三种使用方式，无缝切换
2. **混合调度** - Cron + Heartbeat + Event，满足各种场景
3. **成本优化** - Heartbeat模式减少不必要的API调用
4. **易于集成** - MCP协议支持主流AI客户端
5. **功能丰富** - 内置联网搜索、天气查询、通知界面

### 适用场景
- ✅ 个人AI助手定时任务
- ✅ 团队自动化工作流
- ✅ 智能监控和告警
- ✅ 定时报告生成
- ✅ 事件驱动处理

### 不适用场景
- ❌ 高并发分布式任务（需配合Celery）
- ❌ 毫秒级精确调度
- ❌ 强一致性事务处理

---

## 🔗 参考资源

- **项目结构**: `D:\IT\新项目\ai-scheduler-skill`
- **集成示例**: `D:\IT\AI智能体\my-chat-ui\apps\agents\src\routes\scheduler.ts`
- **配置文件**: `D:\IT\AI智能体\my-chat-ui\apps\agents\scheduler.yaml`
- **架构文档**: `D:\IT\新项目\ai-scheduler-skill\docs\architecture.md`

---

*本报告由AI Assistant生成，基于对项目的代码分析*
*生成日期: 2026-04-13*
