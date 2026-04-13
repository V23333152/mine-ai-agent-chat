# AI Scheduler Skill - 定时任务调度

集成 `ai-scheduler-skill` 项目的 Skill 模块，提供自然语言创建和管理定时任务能力。

## 功能特性

- 🕐 **Cron 定时任务** - 支持自然语言描述（如"每天早上8点"）
- 💓 **Heartbeat 智能检查** - 定期检查，按条件触发
- 🎨 **通知界面** - 自动打开浏览器显示任务结果
- 🔧 **变量替换** - 支持 `{{date}}`, `{{weekday}}`, `{{time}}` 等变量

## 快速开始

### 环境要求

- `MOONSHOT_API_KEY` - 在 `.env` 文件中设置
- Python 调度器服务已启动（通过 `pnpm api`）

### 使用示例

当 Skill 启用后，AI Agent 会自动获得以下工具：

#### 1. 创建定时任务

```
用户: 帮我创建一个每天早上8点的晨报任务

AI: 我来为您创建每日晨报任务。

[调用 schedule_cron_task]
- name: "每日晨报"
- scheduleDescription: "每天早上8点"
- prompt: "生成今日晨报..."

✅ 定时任务 "每日晨报" 创建成功！
调度: 每天早上8点
提示词: 生成今日晨报...

任务将在设定时间自动执行，结果会显示在通知界面 (http://localhost:8765)
```

#### 2. 创建智能检查任务

```
用户: 每30分钟检查一下有没有紧急邮件

AI: 我来为您创建邮件检查任务。

[调用 schedule_heartbeat_task]
- name: "邮件检查"
- checkInterval: "每30分钟"
- checkPrompt: "检查是否有紧急邮件需要处理"
- speakCondition: "有紧急邮件"

✅ 智能检查任务 "邮件检查" 创建成功！
检查间隔: 每30分钟
触发条件: 有紧急邮件

系统会定期检查，仅在满足条件时通知你。
```

#### 3. 列出所有任务

```
用户: 查看我所有的定时任务

AI: 以下是您的定时任务列表：

📋 当前定时任务列表:

🟢 每日晨报 (Cron)
   调度: 每天早上8点
   状态: 运行中
   执行次数: 12

🟢 邮件检查 (Heartbeat)
   调度: 每1800秒
   状态: 运行中
   执行次数: 48

💡 提示: 可以在前端界面 http://localhost:5173 的"定时任务"面板中查看和管理所有任务。
```

## 工具说明

### schedule_cron_task - 创建定时任务

**参数：**
- `name` (string): 任务名称
- `scheduleDescription` (string): 时间描述
  - "每天早上8点" → `0 8 * * *`
  - "每天晚上10点" → `0 22 * * *`
  - "每周五下午6点" → `0 18 * * 5`
  - "每30分钟" → `*/30 * * * *`
- `prompt` (string): AI 提示词，支持变量
- `timezone` (string): 时区，默认 "Asia/Shanghai"

**变量替换：**
- `{{date}}` - 2026年4月9日
- `{{weekday}}` - 周三
- `{{time}}` - 08:00
- `{{year}}` - 2026
- `{{month}}` - 4
- `{{day}}` - 9

### schedule_heartbeat_task - 创建智能检查

**参数：**
- `name` (string): 任务名称
- `checkInterval` (string): 检查间隔
- `checkPrompt` (string): 检查提示词
- `speakCondition` (string): 触发条件

### list_scheduled_tasks - 列出任务

无需参数，返回所有任务列表。

### delete_scheduled_task - 删除任务

**参数：**
- `taskId` (string): 任务ID

### trigger_task_now - 立即触发

**参数：**
- `taskId` (string): 任务ID

## 配置

在 `skill-manager.ts` 的默认注册表中配置：

```typescript
"ai-scheduler": {
  id: "ai-scheduler",
  path: "./scheduler",
  enabled: true,
  config: {
    apiKey: process.env.MOONSHOT_API_KEY,
    defaultModel: "moonshot-v1-8k",
    notifyUIEnabled: true,
  },
}
```

## 可移植性

此 Skill 依赖 Python 调度器服务。在其他项目中使用时：

1. 确保 Python 调度器已启动（端口 8889）
2. 或者直接导入 `ai-scheduler-skill` 的 Python 模块

```python
# 在其他 Python 项目中使用
from scheduler_skill.skill_integration import create_scheduler_skill

skill = await create_scheduler_skill({
    "api_key": "sk-xxxxx",
    "default_model": "moonshot-v1-8k"
})

# 创建任务
await skill.schedule_cron_task(
    name="测试任务",
    schedule_description="每分钟",
    prompt="这是一个测试"
)
```

## 故障排除

### 任务没有按时执行

1. 检查 Python 调度器是否运行：`pnpm api`
2. 检查 MOONSHOT_API_KEY 是否设置
3. 查看调度器日志

### 通知界面没有打开

1. 确认浏览器没有被阻止
2. 手动访问 `http://localhost:8765`
3. 检查端口是否被占用

## 依赖

- `ai-scheduler-skill` Python 模块
- `MOONSHOT_API_KEY` 环境变量
- Python 3.10+ 虚拟环境
