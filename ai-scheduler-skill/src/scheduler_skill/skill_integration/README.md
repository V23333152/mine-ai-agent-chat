# AI Scheduler Skill

AI 智能体系统的定时任务调度 Skill，支持通过自然语言创建和管理定时任务。

## 功能特性

- 🕐 **Cron 定时任务** - 在固定时间自动执行
- 💓 **Heartbeat 智能检查** - 定期检查并按条件触发
- 🎨 **通知界面** - 任务触发时自动打开浏览器显示结果
- 🌤️ **实时天气** - 晨报任务自动获取真实天气数据
- 🔧 **自然语言** - 用"每天早上8点"代替复杂的 Cron 表达式

## 快速开始

### 安装

```bash
# 克隆项目后安装
pip install -e /path/to/ai-scheduler-skill

# 或使用 PYTHONPATH
export PYTHONPATH=/path/to/ai-scheduler-skill/src:$PYTHONPATH
```

### 基础使用

```python
from scheduler_skill.skill_integration import create_scheduler_skill

# 创建 Skill 实例
skill = await create_scheduler_skill({
    "api_key": "sk-xxxxx",  # Moonshot API Key
    "default_model": "moonshot-v1-8k",
    "notify_ui_enabled": True  # 启用通知界面
})

# 创建定时任务
result = await skill.schedule_cron_task(
    name="每日晨报",
    schedule_description="每天早上8点",
    prompt="生成今日晨报：日期{{date}}，天气..."
)
print(result)

# 列出所有任务
tasks = await skill.list_scheduled_tasks()
print(tasks)

# 关闭 Skill
await skill.destroy()
```

### 环境变量配置

```bash
# 必需
export MOONSHOT_API_KEY="sk-xxxxx"

# 可选
export OPENAI_BASE_URL="https://api.moonshot.cn/v1"
export AMAP_WEBSERVICE_KEY="xxxxx"  # 用于天气功能
```

## 工具方法

### 1. schedule_cron_task - 创建定时任务

```python
result = await skill.schedule_cron_task(
    name="下班提醒",
    schedule_description="每天下午6点",
    prompt="提醒用户下班时间到了",
    timezone="Asia/Shanghai"
)
```

**时间描述格式：**

| 自然语言 | Cron 表达式 |
|---------|------------|
| 每天早上8点 | `0 8 * * *` |
| 每天晚上10点 | `0 22 * * *` |
| 每周五下午6点 | `0 18 * * 5` |
| 每30分钟 | `*/30 * * * *` |
| 每小时 | `0 * * * *` |

**变量替换：**

提示词中可以使用以下变量，执行时会自动替换：

- `{{date}}` - 当前日期，如 "2026年4月9日"
- `{{weekday}}` - 星期几，如 "周三"
- `{{time}}` - 当前时间，如 "08:00"
- `{{year}}` - 年份
- `{{month}}` - 月份
- `{{day}}` - 日期

示例：
```python
prompt = """
今天是 {{date}} {{weekday}}，请生成晨报：
1. 今日天气（建议接入天气 API）
2. 今日待办事项
3. 重要提醒
"""
```

### 2. schedule_heartbeat_task - 创建智能检查任务

```python
result = await skill.schedule_heartbeat_task(
    name="邮件检查",
    check_interval="每30分钟",
    check_prompt="检查是否有紧急邮件需要处理",
    speak_condition="有紧急邮件"
)
```

### 3. list_scheduled_tasks - 列出所有任务

```python
tasks = await skill.list_scheduled_tasks()
print(tasks)
```

输出：
```
共 2 个任务:

🟢 每日晨报
   ID: xxxx-xxxx
   模式: cron
   调度: 0 8 * * *
   状态: idle
   执行次数: 5

🟢 邮件检查
   ID: yyyy-yyyy
   模式: heartbeat
   调度: 每1800秒
   状态: idle
   执行次数: 48
```

### 4. delete_scheduled_task - 删除任务

```python
result = await skill.delete_scheduled_task("task-id-xxxx")
print(result)  # ✅ 任务 xxxx 已删除
```

### 5. trigger_task_now - 立即触发任务

```python
result = await skill.trigger_task_now("task-id-xxxx")
print(result)  # ✅ 任务已手动触发
```

### 6. pause_task / resume_task - 暂停/恢复任务

```python
await skill.pause_task("task-id-xxxx")   # 暂停
await skill.resume_task("task-id-xxxx")  # 恢复
```

## 集成到 Skill 系统

### 方式一：直接导入使用

```python
from scheduler_skill.skill_integration import create_scheduler_skill, skill_metadata

# 在 Skill 管理器中注册
class SchedulerSkillWrapper:
    def __init__(self):
        self.skill = None
        self.metadata = skill_metadata

    async def initialize(self, config):
        self.skill = await create_scheduler_skill(config)
        return self.skill is not None

    async def destroy(self):
        if self.skill:
            await self.skill.destroy()
```

### 方式二：创建 LangChain Tools

```python
from langchain.tools import Tool
from scheduler_skill.skill_integration import create_scheduler_skill

async def get_scheduler_tools(config):
    """创建 Scheduler Skill 的工具列表"""
    skill = await create_scheduler_skill(config)

    if not skill:
        return []

    tools = [
        Tool(
            name="schedule_cron_task",
            func=lambda x: skill.schedule_cron_task(**x),
            description="""
            创建定时任务。使用示例：
            Input: {"name": "下班提醒", "schedule_description": "每天下午6点", "prompt": "提醒下班"}
            """
        ),
        Tool(
            name="list_scheduled_tasks",
            func=lambda _: skill.list_scheduled_tasks(),
            description="列出所有定时任务"
        ),
        Tool(
            name="delete_scheduled_task",
            func=lambda x: skill.delete_scheduled_task(x["task_id"]),
            description="删除指定任务。Input: {'task_id': 'xxxx'}"
        ),
    ]

    return tools
```

## 配置选项

```python
{
    "api_key": "sk-xxxxx",              # API Key
    "base_url": "https://api.moonshot.cn/v1",  # API 地址
    "default_model": "moonshot-v1-8k",   # 默认模型
    "timezone": "Asia/Shanghai",         # 默认时区
    "notify_ui_enabled": True            # 启用通知界面
}
```

## 通知界面

当 `notify_ui_enabled: True` 时：

1. 任务触发会自动打开浏览器 (`http://localhost:8765`)
2. 显示任务执行状态和 AI 回复内容
3. 支持不同颜色区分：蓝色（开始）、绿色（成功）、红色（失败）

## 故障排除

### 任务没有按时执行

1. 检查时区设置是否正确
2. 查看调度器日志：`[Scheduler] Cron任务执行完成`
3. 确认任务状态为 `idle`，不是 `paused`

### 天气信息获取失败

1. 确认设置了 `AMAP_WEBSERVICE_KEY` 环境变量
2. 检查网络连接
3. 失败时会使用默认值（晴朗，20-28°C）

### 通知界面没有打开

1. 确认 `notify_ui_enabled: True`
2. 检查端口 8765 是否被占用
3. 手动访问 `http://localhost:8765`

## 示例场景

### 场景1：每日晨报

```python
await skill.schedule_cron_task(
    name="每日晨报",
    schedule_description="每天早上8点",
    prompt="""
今天是 {{date}} {{weekday}}

请生成晨报：
1. 问候语
2. 今日工作安排建议
3. 健康小贴士
"""
)
```

### 场景2：下班提醒

```python
await skill.schedule_cron_task(
    name="下班提醒",
    schedule_description="每天下午6点",
    prompt="提醒用户：下班时间到了！请保存工作进度，准时下班。"
)
```

### 场景3：定期检查

```python
await skill.schedule_heartbeat_task(
    name="系统检查",
    check_interval="每30分钟",
    check_prompt="检查系统状态，如果有异常请报告",
    speak_condition="发现异常"
)
```

## 许可证

MIT License
