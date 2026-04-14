# AI Scheduler 全面优化设计文档

## 1. 背景与目标

### 1.1 现状问题

`ai-scheduler-skill` 项目已具备 Cron / Heartbeat / Event 三种调度能力，以及 MCP、REST API、前端面板三种使用方式。但在代码审查中发现以下影响用户体验和可维护性的问题：

1. **模型选择链路断裂**：Python 核心 `UnifiedLLMClient` 已支持 OpenAI / Anthropic / DeepSeek / Ollama，但前端和 Node.js 层均未传递 `model` 参数，用户无法自选模型。且各层默认模型配置不一致（Skill 层 `moonshot-v1-8k` vs Python 层 `gpt-4o-mini`）。
2. **创建任务后暴力重启进程**：`skills/scheduler/index.ts` 每次创建任务都会 `stopSchedulerProcess()` 再 `startSchedulerProcess()`，导致所有正在执行的任务中断。
3. **三份重复的 Cron 解析逻辑**：前端 `SchedulerPanel.tsx`、Skill 层 `scheduler/index.ts`、API 路由 `scheduler.ts` 中各有一份几乎相同的 `parseTimeDescription`，维护成本高。
4. **缺少执行历史与任务编辑**：前端只能查看任务列表，无法查看某次任务的 AI 输出；也无法编辑任务，只能删除重建。

### 1.2 设计目标

- 打通用户自选模型的完整链路，采用**全局默认模型**策略（Skill 注册表持久化）。
- 消除暴力重启，改为** MCP 热注册**。
- 提取**统一的 Cron 解析工具**，供前端和后端共用。
- 前端增加**任务编辑**（无感知的删除+重建）和**执行历史**查看能力。

---

## 2. 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 模型配置粒度 | **全局默认** | 用户选择 B，即在前端/后端统一设置默认模型，所有新任务自动继承 |
| 模型输入方式 | **完全自由输入** | 用户选择 C，不限制模型列表，兼容任意新模型（如 `kimi-k2.5`、`qwen-max`） |
| 模型设置持久化 | **skill-manager 注册表 (`registry.json`)** | 用户选择 B，已有配置系统可热生效，无需新增存储 |
| 任务编辑实现 | **删除并重建** | 用户选择 B，APScheduler 修改 schedule 本质就是重建，此方案最干净 |
| Cron 解析去重 | **提取到独立工具模块** | 后端路由和 Skill 共用；前端由于交互需要仍保留本地解析，但会与后端保持同步 |
| 进程重启问题 | **直接移除重启逻辑** | Python `HybridScheduler._register_task` 已支持热注册，无需重启 |

---

## 3. 架构改动

### 3.1 改动范围

```
my-chat-ui/apps/agents/src/
├── routes/scheduler.ts              # 透传 model，新增 config API，提取公共解析
├── skills/scheduler/index.ts        # 读取 defaultModel，移除重启，透传 model
├── skills/skill-manager.ts          # defaultModel 写入注册表，支持 API 更新
├── skills/types.ts                  # 如有需要补充 SkillConfig 类型
└── data/                            # registry.json 已存在

my-chat-ui/apps/web/src/components/scheduler/
├── SchedulerPanel.tsx               # 新增设置入口、模型字段、编辑、执行历史

新项目/ai-scheduler-skill/src/scheduler_skill/
├── mcp/server.py                    # schedule_cron_task 接收 model 并覆盖默认
├── core/scheduler.py                # 确保 _register_task 热注册稳定可用
└── storage/...                      # 复用 SQLite 存储执行历史
```

### 3.2 数据流：创建任务（带 model）

```
用户在前端创建任务
    │
    ▼
SchedulerPanel.tsx
    │  读取全局 defaultModel (registry.json 通过 API)
    │  允许用户在表单中覆盖 model（可选）
    ▼
POST /api/scheduler/tasks
    │  body 包含 model
    ▼
routes/scheduler.ts
    │  调用 MCP schedule_cron_task，携带 model
    ▼
Python MCP Server
    │  model 存在 ? 覆盖 config.default_model.model : 使用默认
    ▼
HybridScheduler._register_task()
    │  热注册新任务（无需重启进程）
    ▼
APScheduler.add_job()
```

---

## 4. 详细设计

### 4.1 Node.js API 层 (`routes/scheduler.ts`)

#### 新增 API

```typescript
// GET /api/scheduler/config
export async function getConfig(_req, res) {
  const skillManager = await import("../../skills/skill-manager.js");
  const registration = skillManager.getSkillRegistration("ai-scheduler");
  sendJSON(res, {
    success: true,
    defaultModel: registration?.config?.defaultModel || "gpt-4o-mini",
  });
}

// POST /api/scheduler/config
export async function updateConfig(req, res) {
  const body = await getRequestBody(req);
  const skillManager = await import("../../skills/skill-manager.js");
  await skillManager.updateSkillConfig("ai-scheduler", {
    defaultModel: body.defaultModel,
  });
  sendJSON(res, { success: true });
}
```

#### 修改 `createTask`

在调用 `schedule_cron_task` 时增加 `model: body.model` 参数。

#### 提取公共 Cron 解析

新建 `utils/cron-parser.ts`，将 `parseTimeDescription` 提取到此处，供 `routes/scheduler.ts` 和 `skills/scheduler/index.ts` 导入使用。

### 4.2 Skill 层

#### `skill-manager.ts`

- `createDefaultRegistry` 中确保 `ai-scheduler` 的 `config.defaultModel` 存在（默认 `"gpt-4o-mini"`）。
- 新增 `getSkillRegistration(skillId)` 和 `updateSkillConfig(skillId, partialConfig)`：
  - `updateSkillConfig` 合并配置并写入 `registry.json`。
  - 如果 Skill 已加载，同步更新内存中的 `registration.config`。

#### `skills/scheduler/index.ts`

- `createSchedulerSkill(config)` 中读取 `config.defaultModel`。
- `schedule_cron_task` Tool：
  - 将 `model` 参数加入 schema（`z.string().optional()`）。
  - 如果用户未传 `model`，使用 `config.defaultModel`。
  - 传给 MCP `schedule_cron_task` 的 `arguments.model`。
- **移除**以下代码块：
  ```typescript
  // 自动重启调度器进程，使新任务立即生效
  setTimeout(() => {
    stopSchedulerProcess();
    setTimeout(() => startSchedulerProcess(), 1000);
  }, 100);
  ```
- 心跳任务同理移除重启逻辑。

### 4.3 Python MCP 层 (`mcp/server.py`)

#### `schedule_cron_task` 工具 schema

已存在 `model` 字段，无需修改 schema。

#### `_handle_schedule_cron`

修改模型获取逻辑：

```python
model_name = args.get("model") or self.scheduler.config.default_model.model
config.model = ModelConfig(model=model_name)
```

> 注意：当前代码已经写了 `model=ModelConfig(model=args.get("model") or self.scheduler.config.default_model.model)`，但需确认 MCP 请求中 `model` 为空字符串时不覆盖默认值。应使用：`args.get("model") or self.scheduler.config.default_model.model`。

### 4.4 前端 (`SchedulerPanel.tsx`)

#### 新增状态

```typescript
const [globalConfig, setGlobalConfig] = useState({ defaultModel: "gpt-4o-mini" });
const [showSettingsDialog, setShowSettingsDialog] = useState(false);
const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
const [executionHistory, setExecutionHistory] = useState<any[]>([]);
const [showHistoryTaskId, setShowHistoryTaskId] = useState<string | null>(null);
```

#### 设置入口

在面板头部"新建任务"按钮左侧增加一个齿轮图标按钮 `onClick={() => setShowSettingsDialog(true)}`。

设置对话框内只有一个表单：
- **默认模型**：自由文本输入框，标签注明 "例如 gpt-4o-mini、claude-3-5-sonnet、deepseek-chat"
- **保存**：调用 `POST /api/scheduler/config`

#### 创建任务表单调整

Cron 任务创建表单在"AI 提示词"下方增加一行：
- **模型**：文本输入框，默认值为 `globalConfig.defaultModel`，允许用户手动覆盖。

#### 任务编辑

任务卡片操作区增加"编辑"图标按钮。点击后：
1. `setEditingTask(task)` 打开编辑对话框。
2. 对话框预填充原任务的 `name`、`schedule`、`prompt`、`model`。
3. 用户点击保存后：
   - 先调用 `DELETE /api/scheduler/tasks/${task.id}`
   - 再调用 `POST /api/scheduler/tasks` 用新参数创建任务
   - toast 提示"任务已更新"

#### 执行历史

任务卡片增加"历史"图标按钮。点击后弹出 Drawer/Dialog：
- 调用 `GET /api/scheduler/tasks/${task.id}/history`
- 列表展示：执行时间、状态（成功/失败）、AI 输出摘要（前 200 字），可展开查看完整内容。

### 4.5 Python 执行历史存储

复用已有的 `SQLiteStorage` 和 `TaskContext` 日志能力：

- 在 `core/scheduler.py` 的 `_execute_task` 中，任务完成后将 `execution_id`、`task_id`、`started_at`、`finished_at`、`status`、`output` 写入 SQLite 表 `execution_history`。
- 若该表不存在，自动创建：
  ```sql
  CREATE TABLE IF NOT EXISTS execution_history (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    output TEXT
  );
  ```
- MCP Server 新增 `get_task_history` 工具；Node.js 路由新增 `GET /api/scheduler/tasks/:id/history` 接口做转发。

---

## 5. 非功能性要求

- **向后兼容**：未设置 `model` 的任务继续使用 Python 侧的 `default_model`（`gpt-4o-mini`），不影响已有任务。
- **错误处理**：若用户填写的模型名称在 Python 侧调用时触发 404，应在 WebSocket 通知或执行历史中清晰展示错误原因。
- **测试重点**：
  - `POST /api/scheduler/config` 读写正确。
  - 创建任务时 `model` 参数正确透传到 Python。
  - 编辑任务时旧任务删除、新任务创建顺序正确。
  - 移除重启逻辑后，新任务仍能正常触发。

---

## 6. 排除范围（YAGNI）

- 不实现模型列表的下拉框/自动补全（用户选择自由输入）。
- 不实现每个任务独立的持久化模型记忆（任务本身不存 model，创建时从全局配置读取）。
- 不修改 Heartbeat 和 Event 任务的模型选择（本次只针对 Cron 任务，但后端接口保留扩展性）。
- 不重构整个 Skill 注册系统（只在 `skill-manager.ts` 中增加最小必要的 getter/setter）。
