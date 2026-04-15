# AI Scheduler Skill - 统一混合调度系统

> 🎯 **一个系统，三种用法**：MCP工具 | Python SDK | REST API服务

AI Scheduler Skill 是一个统一的、高度可移植的AI Agent定时任务调度解决方案，融合了OpenClaw的Cron+Heartbeat混合模式设计理念。

## ✨ 核心特性

### 🔀 混合调度模式 (Hybrid Scheduling)

| 模式 | 适用场景 | 特点 |
|------|----------|------|
| **Cron** | 精确时间点任务 | 独立会话，精确触发，适合报告生成、备份等 |
| **Heartbeat** | 智能检查任务 | 上下文感知，批量处理，只在需要时触发 |
| **Event** | 事件驱动任务 | Webhook触发，即时响应，适合实时处理 |

### 🚀 三种使用方式

```yaml
# 方式1: MCP工具 (零代码集成)
# 直接集成到 Claude Desktop、Cursor 等MCP客户端

# 方式2: Python SDK (灵活编程)
from scheduler_skill import HybridScheduler, TaskConfig

# 方式3: REST API服务 (多语言支持)
curl http://localhost:8000/api/v1/tasks
```

### 📦 统一配置系统

使用单一YAML配置文件管理所有任务，无需编写代码：

```yaml
# scheduler.yaml - 一个文件管理所有任务
version: "1.0"

# Cron模式：精确时间执行
cron_jobs:
  - name: morning-briefing
    schedule: "0 8 * * *"
    prompt: "生成今日晨报..."
    model: gpt-4o-mini

# Heartbeat模式：智能检查
heartbeat:
  interval: 1800  # 30分钟
  checks:
    - name: email-check
      condition: "has_urgent_email"
      action: "notify_user"

# Event模式：Webhook触发
event_hooks:
  - name: github-webhook
    path: "/webhooks/github"
    filter: "push to main"
    action: "deploy"
```

## 📋 快速开始

### 安装

```bash
pip install ai-scheduler-skill
```

### 方式1：作为MCP工具使用

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "scheduler": {
      "command": "python",
      "args": ["-m", "scheduler_skill.mcp"],
      "env": {
        "OPENAI_API_KEY": "your-key",
        "SCHEDULER_CONFIG": "./scheduler.yaml"
      }
    }
  }
}
```

### 方式2：作为Python SDK使用

```python
import asyncio
from scheduler_skill import HybridScheduler, TaskConfig, ScheduleMode

async def main():
    # 初始化调度器
    scheduler = HybridScheduler.from_config("scheduler.yaml")
    await scheduler.start()
    
    # 方式A: 使用装饰器 (类似APScheduler)
    @scheduler.cron("0 9 * * *")
    async def daily_report(ctx):
        result = await ctx.llm.generate("生成日报")
        await ctx.storage.save("daily_report", result)
    
    # 方式B: 使用Heartbeat (智能检查)
    @scheduler.heartbeat(interval=1800)
    async def check_emails(ctx):
        emails = await ctx.http.get("/api/emails")
        urgent = [e for e in emails if e.priority == "high"]
        if urgent:  # 只在有紧急邮件时才说话
            return f"发现 {len(urgent)} 封紧急邮件！"
        return "HEARTBEAT_OK"  # 保持沉默
    
    # 保持运行
    await scheduler.run_forever()

asyncio.run(main())
```

### 方式3：作为REST API服务使用

```bash
# 启动服务
python -m scheduler_skill.api --config scheduler.yaml

# 创建任务
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "daily-report",
    "mode": "cron",
    "schedule": "0 9 * * *",
    "prompt": "生成今日工作日报"
  }'

# 列出任务
curl http://localhost:8000/api/v1/tasks

# 手动触发
curl -X POST http://localhost:8000/api/v1/tasks/daily-report/trigger
```

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Scheduler Skill                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   MCP    │  │   Python SDK │  │     REST API         │  │
│  │  Tools   │  │   Decorators │  │   Endpoints          │  │
│  └────┬─────┘  └──────┬───────┘  └──────────┬───────────┘  │
│       └────────────────┼─────────────────────┘              │
│                        ▼                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Unified Hybrid Scheduler                 │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │   Cron   │  │  Heartbeat   │  │    Event       │  │  │
│  │  │ Engine   │  │   Engine     │  │   Handler      │  │  │
│  │  └──────────┘  └──────────────┘  └────────────────┘  │  │
│  └────────────────────────┬─────────────────────────────┘  │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Task Execution Context                   │  │
│  │  ┌──────┐  ┌────────┐  ┌─────────┐  ┌─────────────┐  │  │
│  │  │ LLM  │  │ Storage│  │  HTTP   │  │   Logger    │  │  │
│  │  │Client│  │        │  │ Client  │  │             │  │  │
│  │  └──────┘  └────────┘  └─────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 📚 文档

- [架构设计](docs/architecture.md)
- [配置参考](docs/configuration.md)
- [MCP工具使用](docs/mcp-usage.md)
- [Python SDK参考](docs/python-sdk.md)
- [REST API文档](docs/rest-api.md)
- [示例集合](examples/)

## 🎯 设计原则

### 1. 可移植性优先
- 单一配置驱动，无需编写代码
- 三种使用方式，无缝切换
- 零依赖部署（SQLite内置，Redis可选）

### 2. 混合调度
- Cron + Heartbeat + Event 三种模式互补
- 成本优化设计（Heartbeat默认保持沉默）
- 状态跟踪文件机制

### 3. 简洁易用
- 约定优于配置
- 智能默认值
- 清晰的错误提示

## 📄 许可证

MIT License
