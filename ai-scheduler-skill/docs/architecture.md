# AI Scheduler Skill - 架构设计文档

## 设计理念

### 1. 可移植性优先

**目标**：一个系统，三种使用方式，无缝切换

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
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**实现方式**：
- **MCP工具**：实现MCP协议，可被任何MCP客户端调用
- **Python SDK**：提供装饰器API，与原生Python代码无缝集成
- **REST API**：FastAPI实现，支持多语言集成

### 2. 混合调度模式

受OpenClaw启发，融合三种调度模式：

```
┌────────────────────────────────────────────────────────────┐
│                    调度模式对比                             │
├─────────────┬──────────────┬──────────────┬────────────────┤
│   特性      │    Cron      │  Heartbeat   │     Event      │
├─────────────┼──────────────┼──────────────┼────────────────┤
│ 触发时机    │ 精确时间     │ 定期+条件    │ 事件触发       │
│ 会话上下文  │ 独立         │ 共享         │ 独立           │
│ 成本优化    │ 中等         │ 高           │ 低             │
│ 适用场景    │ 定时报告     │ 智能监控     │ 实时响应       │
│ 噪音控制    │ 固定输出     │ 沉默是金     │ 按需输出       │
└─────────────┴──────────────┴──────────────┴────────────────┘
```

**推荐组合**：
- **Cron**：每日晨报、定时备份、定期报告
- **Heartbeat**：邮件监控、日程提醒、异常检测
- **Event**：GitHub Webhook、告警响应、用户交互

### 3. 沉默是金原则

Heartbeat的核心设计：

```python
@scheduler.heartbeat(interval=1800)
async def smart_check(ctx):
    # 检查条件
    if has_alert():
        return "有告警！"  # 需要时说话
    
    return "HEARTBEAT_OK"  # 正常时保持沉默
```

**状态管理机制**：
- 使用状态文件记录已提醒事项
- 支持记忆时长配置
- 夜间静默模式

## 系统架构

### 核心组件

```
┌─────────────────────────────────────────────────────────────┐
│                     核心调度层                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ CronEngine  │  │HeartbeatEng. │  │   EventEngine    │   │
│  │ (APScheduler)│  │(asyncio.Task)│  │  (Webhook Handler)│   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘   │
│         └─────────────────┼────────────────────┘            │
│                           ▼                                 │
│              ┌─────────────────────────┐                    │
│              │   UnifiedTaskExecutor   │                    │
│              └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     执行上下文层                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │   LLM    │  │ Storage  │  │   HTTP   │  │  State   │    │
│  │  Client  │  │          │  │  Client  │  │  Manager │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

```
1. 任务注册
   ┌──────────┐     ┌──────────────┐     ┌─────────────┐
   │  Config  │────▶│   Scheduler  │────▶│    Task     │
   │   YAML   │     │   Factory    │     │   Registry  │
   └──────────┘     └──────────────┘     └─────────────┘

2. 任务触发
   ┌──────────┐     ┌──────────────┐     ┌─────────────┐
   │  Trigger │────▶│   Executor   │────▶│   Handler   │
   │(Cron/HB) │     │   Context    │     │   (User)    │
   └──────────┘     └──────────────┘     └─────────────┘

3. 结果处理
   ┌──────────┐     ┌──────────────┐     ┌─────────────┐
   │  Result  │────▶│  State Store │────▶│  Webhook    │
   │          │     │   (SQLite)   │     │  (Optional) │
   └──────────┘     └──────────────┘     └─────────────┘
```

## 关键技术决策

### 1. 为什么选择APScheduler？

**优点**：
- 成熟的Cron表达式支持
- 多种触发器（Cron、Interval、Date）
- 异步支持
- 任务持久化

**局限与应对**：
- 单节点 → 支持Redis分布式扩展
- 无状态 → 结合StateManager实现状态管理

### 2. 为什么是SQLite默认？

**可移植性考虑**：
- 零配置，开箱即用
- 单文件，易于迁移
- 支持PostgreSQL无缝升级

### 3. 为什么统一配置格式？

**三种模式统一配置**：

```yaml
# 一个文件管理所有任务
cron_jobs: []      # Cron任务
heartbeat:         # Heartbeat任务
  checks: []
event_hooks: []    # Event任务
```

**好处**：
- 降低学习成本
- 便于版本控制
- 支持配置热重载

## 扩展点

### 1. 自定义存储

```python
from scheduler_skill.storage.base import Storage

class MyStorage(Storage):
    async def save(self, key, value, task_id=None):
        # 实现保存逻辑
        pass
    
    async def load(self, key, default=None):
        # 实现加载逻辑
        pass

# 注册
scheduler = HybridScheduler(
    storage=MyStorage()
)
```

### 2. 自定义LLM连接器

```python
from scheduler_skill.connectors.base import LLMConnector

class MyLLM(LLMConnector):
    async def generate(self, prompt, **kwargs):
        # 调用自定义模型
        return result

# 使用
scheduler.llm_client = MyLLM()
```

### 3. 自定义任务处理器

```python
async def my_handler(ctx: TaskContext):
    # 使用ctx提供的工具
    data = await ctx.http.get("...")
    analysis = await ctx.llm.generate(f"分析: {data}")
    await ctx.storage.save("result", analysis)
    return analysis

# 注册
await scheduler.register(TaskConfig(
    name="my-task",
    mode=ScheduleMode.CRON,
    handler=my_handler,
    cron=CronConfig(schedule="0 * * * *")
))
```

## 性能优化

### 1. 成本优化

```yaml
cost_optimization:
  # 自动模型选择
  auto_model_selection:
    - condition: "task.type == 'routine'"
      model: gpt-4o-mini  # 便宜模型
    - condition: "task.type == 'analysis'"
      model: gpt-4  # 强模型
  
  # 缓存
  cache_responses: true
  cache_ttl: 3600
```

### 2. 并发控制

```python
# 最大并发任务数
scheduler = HybridScheduler(
    max_concurrent_tasks=10
)

# 任务级别控制
@scheduler.cron("0 * * * *", max_instances=1)
async def my_task(ctx):
    pass
```

### 3. 心跳频率优化

```python
# 根据重要性调整频率
@scheduler.heartbeat(interval=300)   # 重要：5分钟
async def critical_check(ctx):
    pass

@scheduler.heartbeat(interval=3600)  # 一般：1小时
async def normal_check(ctx):
    pass
```

## 安全设计

### 1. 配置安全

```yaml
# 敏感信息使用环境变量
model:
  api_key: ${OPENAI_API_KEY}  # 从环境变量读取

webhook:
  secret: ${WEBHOOK_SECRET}
```

### 2. Webhook验证

```python
EventConfig(
    webhook_path="/webhooks/github",
    webhook_secret="${GITHUB_SECRET}",  # HMAC验证
    rate_limit=10  # 速率限制
)
```

### 3. 沙箱执行

```python
# 使用受限上下文
ctx = TaskContext(
    # 只暴露必要的工具
    allowed_tools=["llm", "storage", "http"]
)
```

## 监控与可观测性

### 1. 日志系统

```
logs/
├── scheduler.log           # 主日志
├── tasks/
│   ├── task-xxx.log       # 单个任务日志
│   └── task-yyy.log
└── heartbeat/
    └── heartbeat.log      # Heartbeat专用日志
```

### 2. 状态仪表板

```python
# 获取统计信息
stats = scheduler.get_stats()
print(f"总任务数: {stats['total_tasks']}")
print(f"Cron任务: {stats['cron_tasks']}")
print(f"Heartbeat任务: {stats['heartbeat_tasks']}")
```

### 3. 健康检查

```bash
# HTTP健康检查
curl http://localhost:8000/health

# 返回
{"status": "healthy", "service": "ai-scheduler"}
```

## 部署模式

### 模式1：MCP工具（个人使用）

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "scheduler": {
      "command": "python",
      "args": ["-m", "scheduler_skill.mcp"],
      "env": {"OPENAI_API_KEY": "..."}
    }
  }
}
```

### 模式2：Python SDK（项目集成）

```python
from scheduler_skill import HybridScheduler

scheduler = HybridScheduler.from_config("scheduler.yaml")
await scheduler.start()
```

### 模式3：REST服务（团队协作）

```bash
# Docker部署
docker run -v $(pwd)/scheduler.yaml:/app/scheduler.yaml \
  -p 8000:8000 \
  ai-scheduler-skill

# K8s部署
kubectl apply -f deploy/k8s.yaml
```

## 未来演进

### 路线图

- [ ] 支持更多LLM提供商（Gemini、Cohere等）
- [ ] 任务依赖图（DAG工作流）
- [ ] 智能错误恢复（LLM自动修复）
- [ ] 人机协同（执行前人工审批）
- [ ] 执行沙箱（Docker隔离）
- [ ] 分布式任务队列（Celery集成）

## 总结

AI Scheduler Skill 的设计目标是：

1. **简单易用**：一个YAML配置文件驱动全部
2. **高度可移植**：三种使用方式，无缝切换
3. **成本优化**：Heartbeat模式减少不必要的API调用
4. **生产就绪**：内置监控、日志、错误处理
