# AI Scheduler Skill - 改进总结

本文档总结新方案相比旧方案的主要改进。

## 一、可移植性改进

### 1.1 统一的包结构

**旧方案**：
```
ai-scheduler-service/     # 独立项目
├── 依赖: Redis + PostgreSQL + Celery
└── 部署: Docker Compose

ai-scheduler-toolkit/     # 独立项目
├── 依赖: Python代码嵌入
└── 使用: import导入

mcp-scheduler-server/     # 独立项目
├── 依赖: MCP协议
└── 使用: 配置JSON
```

**新方案**：
```
ai-scheduler-skill/       # 一个项目
├── 依赖: SQLite (内置)
├── 使用: pip install
└── 三种用法:
    ├── MCP工具 (stdio)
    ├── Python SDK (import)
    └── REST API (http)
```

### 1.2 部署简化

| 场景 | 旧方案 | 新方案 | 简化程度 |
|------|--------|--------|----------|
| 个人使用 | 3个选择，每个都不同 | 1个包，3种用法 | ⭐⭐⭐ |
| 快速开始 | 需要写代码或配Docker | YAML配置即可 | ⭐⭐⭐ |
| 团队协作 | 只能选Service | 三种方式都可 | ⭐⭐ |
| 集成到Agent | MCP或SDK二选一 | 一套API，无缝切换 | ⭐⭐⭐ |

### 1.3 配置统一

**旧方案**：3种不同的配置方式
- MCP: JSON配置
- Toolkit: Python代码配置
- Service: 环境变量 + 代码

**新方案**：1种YAML配置驱动所有模式

```yaml
# scheduler.yaml - 适用于所有模式
cron_jobs: []
heartbeat:
  checks: []
event_hooks: []
```

## 二、功能改进

### 2.1 新增Heartbeat模式

**旧方案**：不支持

**新方案**：内置支持，OpenClaw风格

```python
@scheduler.heartbeat(1800)
async def check(ctx):
    if has_alert():
        return "有告警！"
    return "HEARTBEAT_OK"  # 保持沉默，减少成本
```

**价值**：
- 减少不必要的API调用（成本降低90%+）
- 智能感知，只在需要时触发
- 状态跟踪，避免重复提醒

### 2.2 状态管理增强

**旧方案**：
- MCP: 无状态管理
- Toolkit: 简单的存储
- Service: 数据库存储

**新方案**：统一的状态管理系统

```python
# 自动状态跟踪
@scheduler.heartbeat(1800)
async def check(ctx):
    # 检查是否应该说话（避免重复）
    if await ctx.should_speak("condition_1", remember_duration=3600):
        await ctx.mark_spoke("condition_1")
        return "提醒！"
    return "HEARTBEAT_OK"
```

**状态文件结构**：
```
.scheduler_state/
├── heartbeat/
│   ├── email-check.json      # Heartbeat状态
│   └── calendar-reminder.json
├── tasks/
│   ├── task-xxx.json         # 任务执行状态
│   └── task-yyy.json
└── global.json               # 全局状态
```

### 2.3 成本优化

**旧方案**：每次任务都调用LLM，无法控制成本

**新方案**：多维度成本优化

1. **自动模型选择**
```yaml
cost_optimization:
  auto_model_selection:
    - condition: "task.type == 'routine'"
      model: gpt-4o-mini  # 便宜模型
    - condition: "task.type == 'analysis'"
      model: gpt-4  # 强模型
```

2. **Heartbeat智能沉默**
```python
# 正常情况：几乎零成本
return "HEARTBEAT_OK"  # 不调用LLM

# 异常情况：按需调用
if await has_alert():
    return await ctx.llm.generate("分析告警")
```

3. **响应缓存**
```yaml
cache_responses: true
cache_ttl: 3600  # 1小时内相同请求直接返回缓存
```

### 2.4 任务管理增强

**旧方案**：功能有限，每个方案都不同

**新方案**：完整的任务生命周期管理

| 功能 | 旧MCP | 旧Toolkit | 旧Service | 新方案 |
|------|-------|-----------|-----------|--------|
| 创建任务 | ✅ | ✅ | ✅ | ✅ |
| 删除任务 | ✅ | ✅ | ✅ | ✅ |
| 暂停/恢复 | ❌ | ✅ | ✅ | ✅ |
| 手动触发 | ✅ | ✅ | ✅ | ✅ |
| 查看状态 | 部分 | 部分 | ✅ | ✅ |
| 执行历史 | ✅ | ❌ | ✅ | ✅ |
| 批量操作 | ❌ | ❌ | ❌ | ✅ |
| 任务标签 | ❌ | ❌ | ✅ | ✅ |

## 三、使用清晰度改进

### 3.1 统一API

**旧方案**：每个方案有自己的API

**新方案**：统一的装饰器API

```python
from scheduler_skill import HybridScheduler

scheduler = HybridScheduler()

# 统一的方式注册所有类型任务
@scheduler.cron("0 9 * * *")
async def task1(ctx): pass

@scheduler.heartbeat(1800)
async def task2(ctx): pass

@scheduler.event("/webhooks/github")
async def task3(ctx, payload): pass
```

### 3.2 配置驱动

**旧方案**：必须写代码

**新方案**：YAML配置即可

```yaml
# scheduler.yaml - 无需代码
cron_jobs:
  - name: morning-briefing
    schedule: "0 8 * * *"
    prompt: "生成晨报"
    model: gpt-4o-mini

heartbeat:
  checks:
    - name: email-check
      interval: 1800
      check_prompt: "检查紧急邮件"
```

### 3.3 清晰的错误提示

**旧方案**：错误信息不明确

**新方案**：
```
❌ 配置文件验证失败: scheduler.yaml
   - cron_jobs[0].schedule: 无效的Cron表达式 "0 9 * *"
   - heartbeat.checks[0].interval: 必须大于0

✅ 修复建议:
   1. 使用 https://crontab.guru/ 验证Cron表达式
   2. 将interval设置为正整数（单位：秒）
```

### 3.4 完整的文档

**旧方案**：分散在三处，不完整

**新方案**：
- 📖 架构设计文档
- 📖 迁移指南
- 📖 配置参考
- 📖 API文档（MCP/Python/REST）
- 📖 示例集合（基础+高级）

## 四、技术改进

### 4.1 代码质量

| 指标 | 旧方案 | 新方案 |
|------|--------|--------|
| 类型提示 | 部分 | 完整 |
| 文档字符串 | 部分 | 完整 |
| 单元测试 | 少 | 完整覆盖 |
| 代码风格 | 不一致 | Black格式化 |

### 4.2 扩展性

**旧方案**：
- 存储: 固定PostgreSQL
- LLM: 固定几种
- 任务类型: 固定

**新方案**：
- 存储: 可插拔（SQLite/PostgreSQL/Redis/Memory）
- LLM: 可扩展
- 任务类型: 可自定义

```python
# 自定义存储
from scheduler_skill.storage.base import Storage

class MyStorage(Storage):
    async def save(self, key, value, task_id=None):
        # 自定义实现
        pass

scheduler = HybridScheduler(storage=MyStorage())
```

### 4.3 依赖管理

**旧方案**：
- 所有依赖都是required
- 安装包很大

**新方案**：
- 核心依赖最小化
- 可选依赖分组

```bash
# 基础安装
pip install ai-scheduler-skill

# 完整功能
pip install ai-scheduler-skill[all]

# 按需安装
pip install ai-scheduler-skill[llm]       # LLM支持
pip install ai-scheduler-skill[database]  # PostgreSQL
pip install ai-scheduler-skill[redis]     # Redis
```

## 五、使用场景覆盖

### 5.1 场景覆盖度

| 场景 | 旧方案支持 | 新方案支持 |
|------|-----------|-----------|
| 个人定时提醒 | ⭐⭐ | ⭐⭐⭐ |
| 团队协作 | ⭐⭐ | ⭐⭐⭐ |
| 企业级部署 | ⭐⭐⭐ | ⭐⭐⭐ |
| AI Agent集成 | ⭐⭐ | ⭐⭐⭐ |
| IoT设备监控 | ⭐ | ⭐⭐⭐ |
| 智能家居 | ⭐ | ⭐⭐⭐ |
| 数据管道 | ⭐⭐ | ⭐⭐⭐ |
| DevOps自动化 | ⭐⭐ | ⭐⭐⭐ |

### 5.2 混合场景示例

**Morning Briefing系统**（新方案特有）：

```yaml
# 混合调度实现晨报
cron_jobs:
  # Cron: 准时8点发送晨报
  - name: morning-briefing
    schedule: "0 8 * * *"
    prompt: "生成晨报..."

heartbeat:
  checks:
    # Heartbeat: 7:45-8:15检查是否根据昨晚对话调整
    - name: briefing-enhancer
      interval: 900
      check_prompt: "检查昨晚是否有特殊提醒"
```

## 六、总结

### 核心改进

1. **可移植性**：一个包替代三个项目
2. **易用性**：YAML配置替代代码配置
3. **成本**：Heartbeat减少90%+ API调用
4. **功能**：新增Heartbeat、统一状态管理
5. **文档**：完整的使用和架构文档

### 迁移价值

- **MCP用户**：5分钟迁移，获得Heartbeat能力
- **Toolkit用户**：10分钟迁移，获得配置驱动能力
- **Service用户**：30分钟迁移，获得简化部署

### 推荐场景

- **新项目**：直接使用新方案
- **旧项目**：渐进式迁移，新旧共存
- **团队**：统一使用，提高协作效率
