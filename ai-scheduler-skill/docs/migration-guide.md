# 迁移指南：从旧方案到统一混合调度系统

## 旧方案 vs 新方案对比

### 项目结构对比

**旧方案**（3个独立项目）：
```
ai-scheduler-service/       # 独立服务，依赖Redis+PG
ai-scheduler-toolkit/       # Python库，需要嵌入代码
mcp-scheduler-server/       # MCP工具，功能单一
```

**新方案**（统一项目）：
```
ai-scheduler-skill/         # 一个项目，三种用法
├── src/scheduler_skill/
│   ├── core/               # 统一核心
│   ├── mcp/                # MCP工具封装
│   ├── api/                # REST API封装
│   └── ...
└── scheduler.yaml          # 统一配置
```

### 功能对比

| 功能 | 旧方案 - MCP | 旧方案 - Toolkit | 旧方案 - Service | 新方案 |
|------|-------------|-----------------|-----------------|-------|
| **使用难度** | ⭐ 低 | ⭐⭐ 中 | ⭐⭐⭐ 高 | ⭐ 低 |
| **部署复杂度** | ⭐ 低 | ⭐ 低 | ⭐⭐⭐ 高 | ⭐ 低 |
| **功能完整性** | ⭐⭐ 中 | ⭐⭐⭐ 高 | ⭐⭐⭐ 高 | ⭐⭐⭐ 高 |
| **配置方式** | 代码配置 | 代码配置 | 环境变量 | YAML配置 |
| **混合调度** | ❌ | ❌ | ❌ | ✅ |
| **Heartbeat** | ❌ | ❌ | ❌ | ✅ |
| **状态管理** | ❌ | ⭐⭐ 部分 | ⭐⭐⭐ 完整 | ⭐⭐⭐ 完整 |
| **成本优化** | ❌ | ❌ | ❌ | ✅ |
| **可移植性** | ⭐⭐ 中 | ⭐ 低 | ⭐⭐ 中 | ⭐⭐⭐ 高 |

### 代码对比

#### 创建定时任务

**旧方案 - MCP Server**：
```python
# 需要修改server.py添加新工具
# 无法通过配置添加任务
```

**旧方案 - Toolkit**：
```python
# 需要编写Python代码
@toolkit.scheduled(cron="0 9 * * *")
async def daily_task(ctx: TaskContext):
    result = await ctx.llm.generate("生成日报")
    return result
```

**新方案 - 统一配置**：
```yaml
# scheduler.yaml - 无需代码
cron_jobs:
  - name: daily-report
    schedule: "0 9 * * *"
    prompt: "生成日报"
    model: gpt-4o-mini
```

#### Heartbeat智能检查

**旧方案 - 不支持**：
```python
# 没有Heartbeat概念
# 必须自己实现状态管理
```

**新方案 - 内置支持**：
```yaml
# scheduler.yaml
heartbeat:
  checks:
    - name: email-check
      interval: 1800
      check_prompt: "检查是否有紧急邮件"
      silent_hours: [23, 7]
```

或代码方式：
```python
@scheduler.heartbeat(1800)
async def check_email(ctx):
    if has_urgent_mail():
        return "有紧急邮件！"
    return "HEARTBEAT_OK"  # 保持沉默
```

## 迁移步骤

### 从 MCP Scheduler Server 迁移

**步骤1：更新配置**

旧配置（MCP Server）：
```json
{
  "mcpServers": {
    "scheduler": {
      "command": "python",
      "args": ["-m", "mcp_scheduler_server.src.server"],
      "env": {"OPENAI_API_KEY": "..."}
    }
  }
}
```

新配置：
```json
{
  "mcpServers": {
    "scheduler": {
      "command": "python",
      "args": ["-m", "scheduler_skill.mcp"],
      "env": {
        "OPENAI_API_KEY": "...",
        "SCHEDULER_CONFIG": "./scheduler.yaml"
      }
    }
  }
}
```

**步骤2：创建YAML配置**

创建 `scheduler.yaml`：
```yaml
cron_jobs:
  - name: my-task  # 原来的任务
    schedule: "0 9 * * *"
    prompt: "原来的提示词"
    model: gpt-4
```

**步骤3：使用新工具**

原来的MCP工具：
- `schedule_task` → `schedule_cron_task`（更清晰）
- `list_tasks` → `list_tasks`（相同）
- `delete_task` → `delete_task`（相同）

新增工具：
- `schedule_heartbeat_task` - 创建Heartbeat任务
- `create_morning_briefing` - 快速创建晨报

### 从 AI Scheduler Toolkit 迁移

**步骤1：更新依赖**

```bash
# 旧依赖
pip uninstall ai-scheduler-toolkit

# 新依赖
pip install ai-scheduler-skill
```

**步骤2：迁移代码**

旧代码：
```python
from ai_scheduler import SchedulerToolkit, TaskConfig

toolkit = SchedulerToolkit()
await toolkit.start()

@toolkit.scheduled(cron="0 9 * * *")
async def task(ctx):
    pass
```

新代码（几乎相同）：
```python
from scheduler_skill import HybridScheduler

scheduler = HybridScheduler()
await scheduler.start()

@scheduler.cron("0 9 * * *")
async def task(ctx):
    pass
```

**步骤3：迁移到YAML配置（可选）**

如果希望使用配置驱动：

```yaml
# scheduler.yaml
cron_jobs:
  - name: daily-task
    schedule: "0 9 * * *"
    prompt: "..."
```

```python
# Python代码简化为
scheduler = HybridScheduler.from_config("scheduler.yaml")
await scheduler.start()
```

### 从 AI Scheduler Service 迁移

**步骤1：简化部署**

旧部署（复杂）：
```bash
# 需要Redis + PostgreSQL
docker-compose up -d redis postgres

# 启动服务
uvicorn scheduler.api.main:app

# 启动Worker
celery -A scheduler.tasks.execution worker
```

新部署（简单）：
```bash
# 只需要一个命令
python -m scheduler_skill.api --config scheduler.yaml
```

**步骤2：迁移API调用**

旧API：
```bash
curl -X POST http://localhost:8000/api/v1/tasks \
  -d '{"name": "...", "cron": "...", "prompt_template": "..."}'
```

新API：
```bash
# 更清晰的endpoint
curl -X POST http://localhost:8000/api/v1/tasks/cron \
  -d '{"name": "...", "schedule": "...", "prompt": "..."}'
```

**步骤3：保留扩展能力**

如果需要分布式：
```yaml
# scheduler.yaml
storage:
  type: redis  # 切换到Redis
  url: redis://localhost:6379
```

## 兼容性说明

### 破坏性变更

| 旧方案 | 新方案 | 影响 |
|--------|--------|------|
| `prompt_template` | `prompt` | 字段名变更 |
| `cron_expr` | `schedule` | 字段名变更 |
| `model_config` | `model` | 结构简化 |
| `enabled` field | `enabled` | 相同 |

### 向后兼容

新方案保持以下兼容：
- Cron表达式格式（标准Cron）
- 环境变量读取方式
- Webhook回调格式

## 最佳实践建议

### 1. 新项目建议

**直接使用YAML配置**：
```yaml
# scheduler.yaml
version: "1.0"

# 混合调度
cron_jobs: []
heartbeat:
  checks: []
event_hooks: []
```

### 2. 现有项目迁移建议

**渐进式迁移**：
1. 先作为MCP工具使用（零代码）
2. 逐步将任务移到YAML配置
3. 最后迁移Python代码逻辑

### 3. 团队协作建议

**使用REST API服务**：
```bash
# 共享服务
python -m scheduler_skill.api --config team-scheduler.yaml

# 各成员使用curl或SDK调用
curl http://scheduler-team/api/v1/tasks
```

## 常见问题

### Q: 需要同时安装多个包吗？

**A**: 不需要。新方案统一为一个包：
```bash
pip install ai-scheduler-skill
# 可选依赖
pip install ai-scheduler-skill[all]  # 完整功能
```

### Q: 旧数据如何迁移？

**A**: SQLite数据可以直接复制使用：
```bash
# 复制数据库文件
cp old_scheduler.db ai-scheduler-skill/scheduler.db
```

### Q: 支持K8s部署吗？

**A**: 支持，且更简单：
```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-scheduler
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: scheduler
        image: ai-scheduler-skill:latest
        args: ["-m", "scheduler_skill.api", "--config", "/config/scheduler.yaml"]
```

### Q: 如何回滚？

**A**: 新旧方案可以共存：
```bash
# 保留旧服务
python -m old_mcp_server &

# 同时运行新服务
python -m scheduler_skill.mcp &
```

## 总结

迁移到新方案的好处：

1. **统一维护**：一个项目替代三个项目
2. **降低复杂度**：YAML配置替代代码配置
3. **新增能力**：Heartbeat混合调度
4. **成本优化**：智能沉默减少API调用
5. **更好移植**：三种使用方式，灵活切换

迁移成本：
- MCP用户：更新配置即可（5分钟）
- Toolkit用户：包名变更（10分钟）
- Service用户：简化部署（30分钟）
