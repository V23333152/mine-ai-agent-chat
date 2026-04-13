# AI 智能体项目

## 项目简介

基于 LangGraph + React 的 AI 智能体系统，支持多轮对话、工具调用、RAG 文档检索、定时任务调度等功能。

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (React + Vite)                      │
│                         端口: 5173                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 对话功能     │  │ 向量数据库   │  │ 定时任务管理        │  │
│  │ LangGraph   │  │ 管理面板    │  │ AI Scheduler        │  │
│  │ 端口: 2024  │  │ 端口: 8000  │  │ 端口: 8889          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼────────────────┼──────────────────┼──────────────┘
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    后端服务 (Node.js + Python)                   │
│  • LangGraph Agent  • ChromaDB  • Skills  • MCP Server          │
└─────────────────────────────────────────────────────────────────┘
```

## 核心功能

### 1. AI 对话 (端口 2024)
- 基于 LangGraph 的 Agent 架构
- 支持工具调用（搜索、地图、天气等）
- 流式响应输出
- 多轮对话记忆

### 2. RAG 文档检索 (端口 8000)
- ChromaDB 向量数据库
- 文档上传与索引
- 语义搜索
- 与 Agent 对话联动

### 3. 定时任务调度 (端口 8889)
- **Cron 模式**: 精确时间点执行
- **Heartbeat 模式**: 智能检查，按需触发
- **Event 模式**: Webhook 事件驱动
- Kimi API 支持

### 4. Skill 系统
- 模块化工具扩展
- 高德地图、天气查询等内置 Skill
- 支持动态启用/禁用
- 环境变量配置

## 快速开始

### 环境要求
- Node.js 18+
- Python 3.10+
- pnpm

### 安装依赖

```bash
cd my-chat-ui
pnpm install
```

### 配置环境变量

```bash
cd apps/agents

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，添加以下配置：
# MOONSHOT_API_KEY=your-moonshot-key        # Kimi API Key
# ZHIPU_API_KEY=your-zhipu-key              # 智谱 AI Key
# AMAP_WEBSERVICE_KEY=your-amap-key         # 高德地图 Key
```

### 启动服务

**方式一：同时启动所有服务**
```bash
cd my-chat-ui
pnpm dev          # 启动前端 + LangGraph (2024端口)
```

**方式二：分别启动**
```bash
# 终端1 - 前端
cd my-chat-ui/apps/web
pnpm dev

# 终端2 - LangGraph Agent
cd my-chat-ui/apps/agents
pnpm dev

# 终端3 - RAG 后端 (可选)
cd LangGraph
python run_api.py

# 终端4 - 定时任务调度器 (可选)
cd my-chat-ui/apps/agents
pnpm api
```

### 访问地址
- 前端界面: http://localhost:5173
- Agent API: http://localhost:2024
- RAG API: http://localhost:8000
- 调度器 API: http://localhost:8889

## 项目结构

```
my-chat-ui/
├── apps/
│   ├── agents/              # LangGraph Agent 服务
│   │   ├── src/
│   │   │   ├── react-agent/ # Agent 核心逻辑
│   │   │   ├── routes/      # API 路由
│   │   │   └── skills/      # Skill 系统
│   │   ├── .env             # 环境变量
│   │   └── scheduler.yaml   # 定时任务配置
│   │
│   └── web/                 # React 前端
│       ├── src/
│       │   ├── components/  # UI 组件
│       │   ├── routes/      # 页面路由
│       │   └── lib/         # 工具函数
│       └── .env             # 前端环境变量
│
├── skills/                  # 独立 Skill 目录
│   └── amap-lbs/            # 高德地图 Skill
│
└── README.md                # 本文件
```

## 定时任务配置

编辑 `apps/agents/scheduler.yaml`:

```yaml
cron_jobs:
  - name: morning-briefing
    schedule: "0 8 * * *"           # 每天早上 8 点
    prompt: "生成今日晨报"
    timezone: "Asia/Shanghai"
    model: "moonshot-v1-8k"

heartbeat:
  enabled: true
  interval: 300                    # 5 分钟检查一次

llm:
  default_model: "moonshot-v1-8k"
  base_url: "https://api.moonshot.cn/v1"
```

## Skill 开发

### 创建新 Skill

```typescript
// apps/agents/src/skills/my-skill/index.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const metadata = {
  id: "my-skill",
  name: "我的 Skill",
  version: "1.0.0",
  description: "这是一个示例 Skill",
};

export async function createSkill(config?: Record<string, any>) {
  return {
    metadata,
    tools: [
      tool(
        async ({ input }) => {
          return `处理结果: ${input}`;
        },
        {
          name: "my_tool",
          description: "工具描述",
          schema: z.object({
            input: z.string().describe("输入参数"),
          }),
        }
      ),
    ],
    enabled: true,
  };
}
```

### 注册 Skill

```typescript
// apps/agents/src/skills/skill-manager.ts
import { createSkill as createMySkill } from "./my-skill/index.js";

const skillFactories = {
  "amap-lbs": createAmapSkill,
  "my-skill": createMySkill,  // 添加这一行
};
```

## 常见问题

### 1. Python 依赖问题
```bash
# 创建 Python 3.10 虚拟环境
py -3.10 -m venv venv_scheduler
.\venv_scheduler\Scripts\activate
pip install pydantic apscheduler aiofiles aiohttp pyyaml openai
```

### 2. 端口冲突
检查端口占用：
```bash
netstat -ano | findstr :2024
netstat -ano | findstr :8889
```

### 3. 环境变量未生效
重启服务前确保 .env 文件已保存，或使用 `source .env` 加载。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + TypeScript + Tailwind + shadcn/ui |
| Agent | LangGraph + LangChain |
| 向量数据库 | ChromaDB |
| 调度器 | APScheduler + MCP |
| LLM | Moonshot (Kimi) / OpenAI |

## 文档索引

- [Skill 使用指南](my-chat-ui/apps/agents/src/skills/README.md)
- [调度器配置](my-chat-ui/apps/agents/scheduler.yaml)
- [API 文档](http://localhost:8889/api/docs) (需启动服务)

## License

MIT
