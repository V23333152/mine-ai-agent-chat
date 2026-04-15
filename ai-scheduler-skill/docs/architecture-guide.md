# AI 定时任务调度系统 - 小白友好版架构指南

> 📚 本文档面向零基础用户，用通俗易懂的语言解释定时任务系统的工作原理

---

## 📑 目录

1. [什么是这个系统？](#1-什么是这个系统)
2. [整体架构图](#2-整体架构图)
3. [系统分层详解](#3-系统分层详解)
   - 3.1 前端界面层
   - 3.2 API 服务层
   - 3.3 定时任务引擎层
4. [任务存储方式](#4-任务存储方式)
5. [任务执行流程](#5-任务执行流程)
6. [核心代码分析](#6-核心代码分析)
7. [常见问题](#7-常见问题)

---

## 1. 什么是这个系统？

### 一句话解释

这是一个**自动帮你定时执行 AI 任务的系统**。

### 生活化类比

想象你有一个**智能闹钟**，但它不只是响铃，还能：

- ⏰ 每天早上8点**自动生成新闻摘要**
- 🍽️ 每天中午12:30**提醒你该吃饭了**
- 🏃 每天晚上6点**提醒你下班**

而且这个闹钟会**自己思考**（通过 AI），不只是简单的提醒。

### 技术定义

这是一个基于 **MCP (Model Context Protocol)** 协议的定时任务调度系统，使用 Python 的 APScheduler 库作为定时引擎，通过 Node.js 与前端交互。

---

## 2. 整体架构图

### 🏗️ 建筑类比

想象一座**三层办公楼**：

```
┌─────────────────────────────────────────────────────────────┐
│  🏢 第一层：前台（前端界面）                                 │
│     ├─ 你可以看到的网页界面                                  │
│     ├─ 创建任务、查看任务列表                                │
│     └─ 地址：http://localhost:5173                          │
├─────────────────────────────────────────────────────────────┤
│  🏢 第二层：办公室（API 服务层）                             │
│     ├─ Node.js 服务（接待员）                               │
│     ├─ 接收前台的请求，转发给后端                            │
│     ├─ Skill 管理系统（部门经理）                           │
│     └─ 地址：http://localhost:8889                          │
├─────────────────────────────────────────────────────────────┤
│  🏢 第三层：工厂（定时任务引擎）                             │
│     ├─ Python 服务（工人）                                  │
│     ├─ APScheduler（生产线）                                │
│     ├─ MCP 协议（对讲机）                                   │
│     └─ 实际执行任务的地方                                    │
└─────────────────────────────────────────────────────────────┘
```

### 📊 技术架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户（你）                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  🌐 前端界面 (React + TypeScript)                               │
│  ├─ 文件：apps/web/src/components/thread/index.tsx             │
│  ├─ 功能：创建任务、查看列表、手动触发                          │
│  ├─ 技术：React Hooks, WebSocket                               │
│  └─ 地址：http://localhost:5173                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP 请求
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  🖥️ API 服务层 (Node.js + TypeScript)                           │
│  ├─ 文件：apps/agents/src/routes/scheduler.ts                  │
│  ├─ 功能：HTTP API 路由、MCP 客户端、进程管理                    │
│  ├─ Skill Manager：管理各种技能（高德地图、天气、定时任务）       │
│  └─ 地址：http://localhost:8889                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ MCP 协议 (JSON-RPC over stdio)
                           │ 就像用对讲机通话
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ 定时任务引擎 (Python)                                       │
│  ├─ 文件：ai-scheduler-skill/src/scheduler_skill/              │
│  ├─ MCP Server：接收指令的"耳朵"                               │
│  ├─ APScheduler：定时任务的"大脑"                              │
│  ├─ Task Executor：执行任务的"手"                             │
│  └─ Task Storage：保存任务的"笔记本"                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 系统分层详解

### 3.1 前端界面层

**作用**：用户能看到和操作的界面

**类比**：餐厅的点餐台

| 组件     | 功能                     | 对应文件                                   |
| -------- | ------------------------ | ------------------------------------------ |
| 任务列表 | 显示所有定时任务         | `apps/web/src/components/thread/index.tsx` |
| 创建表单 | 输入任务名称、时间、内容 | 同上                                       |
| 触发按钮 | 手动立即执行任务         | 同上                                       |
| 状态显示 | 显示运行/暂停/空闲       | 同上                                       |

**小白解释**：
就像你去餐厅点菜，看到菜单（任务列表），告诉服务员你想吃什么（创建任务），也可以催菜（手动触发）。

---

### 3.2 API 服务层

**作用**：连接前端和后端的"桥梁"

**类比**：餐厅的服务员

#### 3.2.1 两大核心功能

**功能一：HTTP API（对外）**

```javascript
// 提供这些接口给前端调用：
GET  /api/scheduler/tasks      // 获取任务列表
POST /api/scheduler/tasks      // 创建新任务
DELETE /api/scheduler/tasks/:id // 删除任务
POST /api/scheduler/tasks/:id/trigger // 手动触发
```

**功能二：MCP 客户端（对内）**

```javascript
// 通过 MCP 协议与 Python 进程通信
sendMCPRequest("tools/call", {
  name: "schedule_cron_task",
  arguments: { name: "每日新闻", schedule: "0 8 * * *" },
});
```

#### 3.2.2 进程管理

```javascript
// 启动 Python 进程（就像打开工厂电源）
schedulerProcess = spawn(PYTHON_PATH, [WRAPPER_PATH]);

// 监听 Python 的输出（就像听对讲机）
schedulerProcess.stdout.on("data", handleMCPResponse);
```

**小白解释**：
服务员（API层）的工作：

1. 听客人点菜（接收前端请求）
2. 把菜单传给厨房（发给 Python）
3. 把做好的菜端给客人（返回结果）

---

### 3.3 定时任务引擎层（核心）

**作用**：真正执行任务的地方

**类比**：餐厅的厨房

#### 3.3.1 组成模块

```
厨房（Python 服务）
│
├─ 📻 对讲机 (MCP Server)
│   └─ 文件：mcp/server.py
│   └─ 功能：接收 Node.js 传来的指令
│
├─ 🧠 厨师长 (APScheduler)
│   └─ 文件：scheduler.py
│   └─ 功能：管理所有定时任务，到时间就执行
│
├─ 👨‍🍳 厨师 (Task Executor)
│   └─ 文件：task_executor.py
│   └─ 功能：调用 AI API 生成内容
│
├─ 📋 订单本 (Task Storage)
│   └─ 文件：task_storage.py
│   └─ 功能：保存任务配置和执行记录
│
└─ 📢 传菜员 (Notification)
    └─ 文件：notification.py
    └─ 功能：把结果通知给前端
```

#### 3.3.2 MCP Server 详解

MCP = Model Context Protocol（模型上下文协议）

**简单理解**：这是一种**标准的对讲机语言**，让不同的程序能互相理解。

**通信流程**：

```
Node.js: "嘿，帮我创建一个新任务"
         ↓ (JSON-RPC 格式)
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "schedule_cron_task",
    "arguments": {
      "name": "每日新闻",
      "schedule": "0 8 * * *"
    }
  }
}
         ↓ (stdio 管道传输)
Python: "收到！任务已创建，ID 是 xxx"
         ↓
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{"type": "text", "text": "✅ 任务创建成功"}]
  }
}
```

**小白解释**：
MCP 就像餐厅里的**标准化点餐单**：

- 无论哪个服务员（Node.js）
- 用同样的格式写单
- 厨房（Python）都能看懂
- 不会出现"这个服务员写字太草，厨师看不懂"的问题

---

## 4. 任务存储方式

### 4.1 三层存储架构

```
┌─────────────────────────────────────────────────────────────┐
│  第一层：脑子里的记忆（内存）                                 │
│  ├─ 位置：Python 进程的内存中                                │
│  ├─ 内容：当前运行的任务、下次执行时间                        │
│  ├─ 特点：速度快，断电就消失                                 │
│  └─ 类比：你脑子里记得"3点要开会"                           │
├─────────────────────────────────────────────────────────────┤
│  第二层：便利贴（文件存储）                                   │
│  ├─ 位置：scheduler.yaml 和 .scheduler_state/               │
│  ├─ 内容：任务配置、执行历史                                 │
│  ├─ 特点：持久保存，重启不丢                                 │
│  └─ 类比：便利贴上写的待办事项                               │
├─────────────────────────────────────────────────────────────┤
│  第三层：备份笔记本（Node.js 缓存）                          │
│  ├─ 位置：data/tasks.json                                   │
│  ├─ 内容：任务列表的副本                                     │
│  ├─ 特点：给前端快速读取用                                   │
│  └─ 类比：前台的小抄，方便快速查看                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 存储文件详解

#### 文件一：scheduler.yaml（用户配置）

```yaml
# 这个文件就像你的"闹钟设置清单"
tasks:
  - name: morning-briefing # 闹钟名称
    type: cron # 类型：定时触发
    schedule: "0 8 * * *" # Cron 表达式：每天8点
    prompt: "生成今日晨报..." # 要 AI 执行的内容
    timezone: Asia/Shanghai # 时区

  - name: 午休提醒
    type: cron
    schedule: "30 12 * * *" # 每天12:30
    prompt: "提醒用户吃午饭..."
```

**小白解释**：
就像你手机里的**闹钟设置界面**：

- 闹钟名称："起床"
- 时间：每天 7:00
- 铃声：" birds叫"

#### 文件二：运行时状态（.scheduler_state/）

```json
{
  "id": "3a0aa0e6-70f4-44a8-aa6b-28fb7f533e02",
  "name": "每日新闻",
  "status": "idle", // 当前状态
  "total_runs": 7, // 总共执行了7次
  "successful_runs": 7, // 成功了7次
  "failed_runs": 0, // 失败了0次
  "last_run": "2026-04-13T08:00:06", // 上次执行
  "next_run": "2026-04-14T08:00:00" // 下次执行
}
```

**小白解释**：
就像闹钟的**执行记录**：

- 响了几次
- 哪次你没听见（失败）
- 下次什么时候响

#### 文件三：Node.js 缓存（data/tasks.json）

```json
[
  {
    "id": "xxx",
    "name": "每日新闻",
    "mode": "cron",
    "status": "idle",
    "schedule": "0 8 * * *"
  }
]
```

**小白解释**：
前台服务员的小抄，记录今天有哪些订单，方便快速回答客人的询问。

---

## 5. 任务执行流程

### 5.1 完整流程图

```
时间到了（早上8:00）
    │
    ▼
┌─────────────────┐
│ APScheduler     │  "检查到每日新闻任务该执行了"
│ （定时器）       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Task Executor   │  "开始执行任务"
│ （执行器）       │
└────────┬────────┘
         │
         ├─ 1. 构建提示词
         │   "请生成今日新闻摘要..."
         │
         ├─ 2. 调用 AI API
         │   发送给 Moonshot/Kimi
         │   ↓
         │   等待 AI 回复
         │   ↓
         │   收到生成的内容
         │
         ├─ 3. 保存结果
         │   写入执行记录
         │
         └─ 4. 发送通知
             WebSocket → 前端
             飞书 Bot → 手机
         │
         ▼
┌─────────────────┐
│  任务完成！      │
│  显示在界面上    │
└─────────────────┘
```

### 5.2 手动触发流程

```
你点击"立即执行"按钮
    │
    ▼
前端发送 HTTP 请求
    │
    ▼
Node.js 接收请求
    │
    ├─ 1. 验证任务存在
    ├─ 2. 调用 MCP 请求
    │   sendMCPRequest("trigger_task", {task_id})
    │
    ▼
Python MCP Server 接收
    │
    ▼
调用 scheduler.trigger_task()
    │
    ▼
立即执行任务（同上）
    │
    ▼
返回结果给 Node.js
    │
    ▼
Node.js 返回给前端
    │
    ▼
你看到"执行成功！"
```

---

## 6. 核心代码分析

### 6.1 Python 侧核心代码

#### MCP Server 入口（server.py）

```python
# 就像餐厅前台的电话接线员
class MCPServer:
    def handle_request(self, request):
        # 1. 解析请求
        method = request["method"]
        params = request["params"]

        # 2. 根据方法名分发处理
        if method == "tools/call":
            tool_name = params["name"]

            if tool_name == "schedule_cron_task":
                # 创建定时任务
                return self.scheduler.add_cron_task(params["arguments"])

            elif tool_name == "trigger_task":
                # 手动触发任务
                return self.scheduler.trigger_task(params["arguments"]["task_id"])

            elif tool_name == "list_tasks":
                # 获取任务列表
                return self.scheduler.list_tasks()
```

**小白解释**：
就像餐厅的**电话点餐系统**：

- 顾客打电话说"我要订外卖"（schedule_cron_task）
- 或者说"我现在就要吃"（trigger_task）
- 或者说"你们有什么菜"（list_tasks）
- 接线员把电话转给对应的部门

#### 定时调度器（scheduler.py）

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

class TaskScheduler:
    def __init__(self):
        # 创建一个调度器（就像买一个大闹钟）
        self.scheduler = AsyncIOScheduler()
        self.scheduler.start()  # 启动闹钟

    def add_cron_task(self, task_config):
        # 添加一个定时任务（设置一个新闹钟）
        self.scheduler.add_job(
            func=self.execute_task,      # 到时间执行这个函数
            trigger="cron",               # 使用 Cron 触发
            hour=8, minute=0,            # 每天8点0分
            args=[task_config]           # 传给函数的参数
        )

    async def execute_task(self, task_config):
        # 实际执行任务（闹钟响了，该做事了）
        executor = TaskExecutor()
        result = await executor.run(task_config)
        return result
```

**小白解释**：
APScheduler 就像一个**智能闹钟**：

- 你可以设置很多个闹钟（多个任务）
- 每个闹钟响的时候做不同的事（执行不同函数）
- 它会自动管理所有闹钟，不会漏掉任何一个

#### 任务执行器（task_executor.py）

```python
class TaskExecutor:
    async def run(self, task):
        # 1. 准备问题（提示词）
        prompt = task["prompt"]

        # 2. 问 AI（就像问 ChatGPT）
        response = await self.llm.chat.completions.create(
            model="moonshot-v1-8k",      # 使用 Moonshot AI
            messages=[
                {"role": "system", "content": "你是一个助手"},
                {"role": "user", "content": prompt}
            ]
        )

        # 3. 获取回答
        content = response.choices[0].message.content

        # 4. 发送通知
        await self.notifier.send({
            "task": task["name"],
            "content": content
        })

        return content
```

**小白解释**：
这个就像你**问 ChatGPT 问题**：

- 输入："帮我生成今日新闻"
- AI 思考...
- 输出："今天的主要新闻有..."
- 然后把结果发送给你（通过飞书/前端）

---

### 6.2 Node.js 侧核心代码

#### HTTP 路由处理（scheduler.ts）

```typescript
// 创建任务
export async function createTask(req, res) {
  // 1. 获取前端传来的数据
  const body = await getRequestBody(req);
  // { name: "每日新闻", schedule: "0 8 * * *", prompt: "..." }

  // 2. 调用 MCP 创建任务
  const result = await sendMCPRequest("tools/call", {
    name: "schedule_cron_task",
    arguments: body,
  });

  // 3. 保存到本地缓存
  const task = {
    id: extractTaskId(result),
    name: body.name,
    schedule: body.schedule,
  };
  saveTasksToFile([...existingTasks, task]);

  // 4. 返回成功给前端
  res.end(JSON.stringify({ success: true, task }));
}
```

**小白解释**：
就像餐厅服务员的**标准工作流程**：

1. 听客人点菜（接收请求）
2. 告诉厨房做菜（调用 MCP）
3. 记录订单（保存到文件）
4. 告诉客人菜已下单（返回响应）

#### MCP 客户端通信（scheduler.ts）

```typescript
// 向 Python 进程发送请求
async function sendMCPRequest(method: string, params: any) {
  // 生成唯一 ID（就像订单号）
  const id = String(++messageId);

  // 构建 JSON-RPC 请求
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  // 通过管道发送给 Python（就像对讲机）
  schedulerProcess.stdin.write(JSON.stringify(request) + "\n");

  // 等待 Python 回复（ Promise 就像"等对方回话"）
  return new Promise((resolve) => {
    pendingRequests.set(id, { resolve });
  });
}

// 接收 Python 的回复
function handleMCPResponse(line: string) {
  const response = JSON.parse(line);

  // 根据 ID 找到对应的请求
  const request = pendingRequests.get(response.id);

  // 把结果返回给等待的人
  request.resolve(response.result);
}
```

**小白解释**：
这就是**对讲机的使用流程**：

1. 按住说话键（stdin.write）
2. 说"我是 5 号，听到请回答"（带 id 的请求）
3. 等待对方回复（Promise）
4. 听到"5 号，这里是厨房，收到"（handleMCPResponse）
5. 松开说话键，对话完成

---

## 7. 常见问题

### Q1: 为什么需要 Python 和 Node.js 两个服务？

**答**：就像餐厅需要**前台**和**厨房**：

- Node.js 是前台（接待客人、处理订单）
- Python 是厨房（实际做菜）
- Python 有 APScheduler 这个强大的"厨房设备"，Node.js 没有

### Q2: MCP 是什么？为什么不用 HTTP？

**答**：

- MCP = 标准化的对讲机语言
- 可以用 HTTP，但 MCP 更轻量、标准化
- 进程间通信用 stdio（标准输入输出）比 HTTP 更高效

### Q3: 任务数据存在哪里？会丢吗？

**答**：

- 存在三个地方：内存 + YAML文件 + JSON文件
- 只要电脑不爆炸，文件里的数据就不会丢
- 即使 Python 进程崩溃，重启后会从文件恢复

### Q4: 我可以添加飞书通知吗？

**答**：可以！在 `task_executor.py` 执行完成后，添加：

```python
await feishu_bot.send_message(content)
```

### Q5: Cron 表达式是什么？

**答**：
Cron 是 Linux 系统的定时语法，就像设置闹钟的"高级语言"。

| 表达式        | 含义      | 类比            |
| ------------- | --------- | --------------- |
| `0 8 * * *`   | 每天8点   | 每天早上的闹钟  |
| `0 */2 * * *` | 每2小时   | 每2小时提醒喝水 |
| `0 9 * * 1`   | 每周一9点 | 每周一早会提醒  |
| `*/5 * * * *` | 每5分钟   | 频繁的心跳检测  |

**记忆法**：`分 时 日 月 周`

---

## 📚 附录：文件路径汇总

### Python 侧（ai-scheduler-skill）

```
src/
├── scheduler_skill/
│   ├── __init__.py
│   ├── __main__.py              # 启动入口
│   ├── mcp/
│   │   └── server.py            # MCP 服务端
│   ├── scheduler.py             # APScheduler 封装
│   ├── task_executor.py         # 任务执行器
│   ├── task_storage.py          # 任务存储
│   └── notification.py          # 通知中心
├── scheduler.yaml               # 任务配置
└── .scheduler_state/            # 运行时状态
    └── tasks/
        └── {task_id}.json
```

### Node.js 侧（my-chat-ui/apps/agents）

```
src/
├── routes/
│   ├── scheduler.ts             # HTTP API + MCP 客户端
│   ├── index.ts                 # API 路由注册
│   └── skills.ts                # Skills HTTP API
├── skills/
│   ├── scheduler/
│   │   └── index.ts             # Skill 封装
│   └── skill-manager.ts         # Skill 管理器
├── api-server.ts                # API 服务入口
└── data/
    └── tasks.json               # 本地任务缓存
```

---

## 🎯 总结

**核心概念回顾**：

1. **三层架构**：前端（餐厅）→ API（服务员）→ Python（厨房）
2. **通信协议**：MCP（标准对讲机语言）
3. **存储方式**：内存 + 文件 + 缓存（脑子 + 便利贴 + 小抄）
4. **执行流程**：定时触发 → AI 生成 → 通知推送

**给小白的一句话**：
这个系统就是一个**自动化的 AI 助手**，每天到点就问 AI 问题，然后把答案发给你。就像你请了一个秘书，每天早上8点帮你查新闻、中午提醒你吃饭。

---

_文档版本：1.0_  
_最后更新：2026-04-13_  
_适合人群：零基础用户、产品经理、新手开发者_
