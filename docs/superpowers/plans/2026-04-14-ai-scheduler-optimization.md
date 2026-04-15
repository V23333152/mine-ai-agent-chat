# AI Scheduler 全面优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通模型自选链路，移除暴力重启，统一 Cron 解析，并为前端增加任务编辑与执行历史功能。

**Architecture:** 后端通过 `skill-manager.ts` 的 `registry.json` 持久化全局 `defaultModel`；Node.js API 新增 `/api/scheduler/config` 和 `/api/scheduler/tasks/:id/history`；Python MCP 层接收 `model` 参数并覆盖默认配置；前端在 `SchedulerPanel.tsx` 增加设置入口、模型字段、编辑和历史查看。

**Tech Stack:** TypeScript, Node.js, Python, APScheduler, SQLite, React, Tailwind CSS

---

## File Structure

| File | Responsibility |
|------|----------------|
| `my-chat-ui/apps/agents/src/skills/skill-manager.ts` | 新增 `getSkillRegistration` / `updateSkillConfig`，持久化 `defaultModel` 到 `registry.json` |
| `my-chat-ui/apps/agents/src/routes/scheduler.ts` | 新增 `getConfig` / `updateConfig` / `getTaskHistory`，透传 `model`，复用 `cron-parser` |
| `my-chat-ui/apps/agents/src/routes/index.ts` | 注册 3 条新路由：`/api/scheduler/config`、任务 history |
| `my-chat-ui/apps/agents/src/utils/cron-parser.ts` | **新建**：提取 `parseTimeDescription`，供路由和 Skill 共用 |
| `my-chat-ui/apps/agents/src/skills/scheduler/index.ts` | 导入统一 `cron-parser`，透传 `model`，**移除**创建任务后的进程重启逻辑 |
| `新项目/ai-scheduler-skill/src/scheduler_skill/mcp/server.py` | `_handle_schedule_cron` 正确处理 `model` 覆盖默认值（防止空字符串覆盖） |
| `新项目/ai-scheduler-skill/src/scheduler_skill/core/scheduler.py` | `_execute_task` 完成后写入 `execution_history` 表 |
| `新项目/ai-scheduler-skill/src/scheduler_skill/storage/sqlite_storage.py` | 新增执行历史读写方法：`save_execution_history`、`get_task_history` |
| `my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx` | 新增设置对话框、模型输入框、编辑对话框、历史查看弹窗 |

---

## Task 1: Skill Manager - Add Config Getter/Setter

**Files:**
- Modify: `my-chat-ui/apps/agents/src/skills/skill-manager.ts`

- [ ] **Step 1: Add `getSkillRegistration` function**

Insert before `loadSkill`:

```typescript
/**
 * 获取 Skill 注册信息（包含 config）
 */
export function getSkillRegistration(skillId: string): SkillRegistration | undefined {
  return state.registry.skills[skillId];
}

/**
 * 更新 Skill 配置并持久化
 */
export async function updateSkillConfig(skillId: string, partialConfig: Record<string, any>): Promise<void> {
  const registration = state.registry.skills[skillId];
  if (!registration) {
    throw new Error(`Skill ${skillId} not registered`);
  }
  registration.config = { ...registration.config, ...partialConfig };
  await saveRegistryToFile();
  console.log(`[SkillManager] Updated config for ${skillId}`);
}
```

- [ ] **Step 2: Update `createDefaultRegistry` default model**

Change `ai-scheduler` config from `moonshot-v1-8k` to `gpt-4o-mini`:

```typescript
"ai-scheduler": {
  id: "ai-scheduler",
  path: "./scheduler",
  enabled: true,
  config: {
    apiKey: process.env.MOONSHOT_API_KEY,
    defaultModel: "gpt-4o-mini",
    notifyUIEnabled: true,
  },
},
```

- [ ] **Step 3: Commit**

```bash
git add my-chat-ui/apps/agents/src/skills/skill-manager.ts
git commit -m "feat(skill-manager): add getSkillRegistration and updateSkillConfig helpers"
```

---

## Task 2: Extract Unified Cron Parser

**Files:**
- Create: `my-chat-ui/apps/agents/src/utils/cron-parser.ts`
- Modify: `my-chat-ui/apps/agents/src/routes/scheduler.ts`

- [ ] **Step 1: Create `cron-parser.ts` with full `parseTimeDescription` logic**

Copy the full function from `routes/scheduler.ts`, add `export`:

```typescript
/**
 * 将自然语言时间描述转换为 Cron 表达式
 */
export function parseTimeDescription(description: string): string {
  let desc = description
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[：:,，]/g, "")
    .replace(/(每隔|每)/g, "每");

  const patterns: Record<string, string> = {
    "每天早上8点": "0 8 * * *",
    "每天早上9点": "0 9 * * *",
    "每天上午8点": "0 8 * * *",
    "每天上午9点": "0 9 * * *",
    "每天上午10点": "0 10 * * *",
    "每天上午11点": "0 11 * * *",
    "每天中午12点": "0 12 * * *",
    "每天下午1点": "0 13 * * *",
    "每天下午2点": "0 14 * * *",
    "每天下午3点": "0 15 * * *",
    "每天下午4点": "0 16 * * *",
    "每天下午5点": "0 17 * * *",
    "每天下午6点": "0 18 * * *",
    "每天晚上7点": "0 19 * * *",
    "每天晚上8点": "0 20 * * *",
    "每天晚上9点": "0 21 * * *",
    "每天晚上10点": "0 22 * * *",
    "每天晚上11点": "0 23 * * *",
    "每天凌晨0点": "0 0 * * *",
    "每天凌晨1点": "0 1 * * *",
    "每天凌晨2点": "0 2 * * *",
    "工作日早上8点": "0 8 * * 1-5",
    "工作日早上9点": "0 9 * * 1-5",
    "工作日下午6点": "0 18 * * 1-5",
    "周末早上9点": "0 9 * * 0,6",
    "周末早上10点": "0 10 * * 0,6",
    "每周一早上8点": "0 8 * * 1",
    "每周一早上9点": "0 9 * * 1",
    "每周二早上9点": "0 9 * * 2",
    "每周三早上9点": "0 9 * * 3",
    "每周四早上9点": "0 9 * * 4",
    "每周五下午6点": "0 18 * * 5",
    "每周日早上9点": "0 9 * * 0",
    "每小时": "0 * * * *",
    "每2小时": "0 */2 * * *",
    "每4小时": "0 */4 * * *",
    "每分钟": "* * * * *",
    "每5分钟": "*/5 * * * *",
    "每10分钟": "*/10 * * * *",
    "每30分钟": "*/30 * * * *",
  };

  if (patterns[desc]) {
    return patterns[desc];
  }

  const intervalMatch = desc.match(/每(\d+)(分钟|小时|时)/);
  if (intervalMatch) {
    const num = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2];
    if (unit === "分钟") {
      return `*/${num} * * * *`;
    } else if (unit === "小时" || unit === "时") {
      return `0 */${num} * * *`;
    }
  }

  let hour = -1;
  let minute = 0;

  const timeMatch = desc.match(/(\d+)[点时](?:(\d+|半|一刻|三刻)分?)?/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    const minuteStr = timeMatch[2];

    if (minuteStr) {
      if (minuteStr === "半") {
        minute = 30;
      } else if (minuteStr === "一刻") {
        minute = 15;
      } else if (minuteStr === "三刻") {
        minute = 45;
      } else if (!isNaN(parseInt(minuteStr))) {
        minute = parseInt(minuteStr, 10);
      }
    }

    const isPM = desc.includes("下午") || desc.includes("晚上") || desc.includes("傍晚");
    const isNoon = desc.includes("中午");
    const isMidnight = desc.includes("凌晨") && hour === 12;

    if (isPM && hour < 12) {
      hour += 12;
    }
    if (isNoon && hour < 12) {
      hour += 12;
    }
    if (isMidnight) {
      hour = 0;
    }
  }

  const weekdayMap: Record<string, string> = {
    "周一": "1", "周二": "2", "周三": "3", "周四": "4",
    "周五": "5", "周六": "6", "周日": "0", "星期天": "0",
    "星期一": "1", "星期二": "2", "星期三": "3", "星期四": "4",
    "星期五": "5", "星期六": "6", "星期日": "0",
    "工作日": "1-5",
    "周末": "0,6",
  };

  let weekday: string | null = null;
  for (const [key, value] of Object.entries(weekdayMap)) {
    if (desc.includes(key)) {
      weekday = value;
      break;
    }
  }

  const dayOfMonthMatch = desc.match(/每月(\d+)[号日]/);
  let dayOfMonth: string | null = null;
  if (dayOfMonthMatch) {
    dayOfMonth = dayOfMonthMatch[1];
  }

  if (hour >= 0) {
    if (dayOfMonth) {
      return `${minute} ${hour} ${dayOfMonth} * *`;
    } else if (weekday) {
      return `${minute} ${hour} * * ${weekday}`;
    } else {
      return `${minute} ${hour} * * *`;
    }
  }

  return description;
}
```

- [ ] **Step 2: Replace local `parseTimeToCron` in `routes/scheduler.ts` with import**

At the top of `routes/scheduler.ts`, add:

```typescript
import { parseTimeDescription as parseTimeToCron } from "../utils/cron-parser.js";
```

Then **delete** the entire local `parseTimeToCron` function (lines ~223-368).

- [ ] **Step 3: Commit**

```bash
git add my-chat-ui/apps/agents/src/utils/cron-parser.ts my-chat-ui/apps/agents/src/routes/scheduler.ts
git commit -m "refactor: extract unified cron parser to utils/cron-parser.ts"
```

---

## Task 3: Node.js Scheduler Routes - Add Config & History APIs

**Files:**
- Modify: `my-chat-ui/apps/agents/src/routes/scheduler.ts`

- [ ] **Step 1: Add `getConfig` and `updateConfig` exports**

Append to the file before the final `export { ... }` block:

```typescript
// GET /api/scheduler/config
export async function getConfig(_req: IncomingMessage, res: ServerResponse) {
  try {
    const skillManager = await import("../../skills/skill-manager.js");
    const registration = skillManager.getSkillRegistration("ai-scheduler");
    sendJSON(res, {
      success: true,
      defaultModel: registration?.config?.defaultModel || "gpt-4o-mini",
    });
  } catch (error) {
    console.error("[Scheduler] Error getting config:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

// POST /api/scheduler/config
export async function updateConfig(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await getRequestBody(req);
    const skillManager = await import("../../skills/skill-manager.js");
    await skillManager.updateSkillConfig("ai-scheduler", {
      defaultModel: body.defaultModel,
    });
    sendJSON(res, { success: true });
  } catch (error) {
    console.error("[Scheduler] Error updating config:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

// GET /api/scheduler/tasks/:id/history
export async function getTaskHistory(_req: IncomingMessage, res: ServerResponse, taskId?: string) {
  if (!taskId) {
    sendJSON(res, { success: false, error: "Task ID required" }, 400);
    return;
  }
  try {
    const result = await sendMCPRequest("tools/call", {
      name: "get_task_history",
      arguments: { task_id: taskId },
    });
    sendJSON(res, { success: true, history: result });
  } catch (error) {
    console.error("[Scheduler] Error getting task history:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}
```

- [ ] **Step 2: Update `createTask` to pass `model`**

In the `createTask` function, find the `schedule_cron_task` MCP call block. Change the `arguments` object to include `model`:

```typescript
mcpResult = await sendMCPRequest("tools/call", {
  name: "schedule_cron_task",
  arguments: {
    name: body.name,
    schedule: body.schedule,
    prompt: body.prompt || "执行任务",
    timezone: body.timezone || "UTC",
    description: body.prompt?.substring(0, 100),
    model: body.model, // <-- ADD THIS LINE
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add my-chat-ui/apps/agents/src/routes/scheduler.ts
git commit -m "feat(scheduler-routes): add config and task history APIs, pass model to MCP"
```

---

## Task 4: Register New Routes in `routes/index.ts`

**Files:**
- Modify: `my-chat-ui/apps/agents/src/routes/index.ts`

- [ ] **Step 1: Import new handlers**

Change the scheduler imports from:

```typescript
import {
  getTasks,
  createTask,
  deleteTask as deleteSchedulerTask,
  triggerTask,
  pauseTask,
  resumeTask,
  getStats,
  startSchedulerProcess,
} from "./scheduler.js";
```

To:

```typescript
import {
  getTasks,
  createTask,
  deleteTask as deleteSchedulerTask,
  triggerTask,
  pauseTask,
  resumeTask,
  getStats,
  startSchedulerProcess,
  getConfig as getSchedulerConfig,
  updateConfig as updateSchedulerConfig,
  getTaskHistory,
} from "./scheduler.js";
```

- [ ] **Step 2: Add route entries**

Add three new routes inside the `routes` array (after the stats route):

```typescript
{ method: "GET", pattern: /^\/api\/scheduler\/stats$/, handler: getStats },
{ method: "GET", pattern: /^\/api\/scheduler\/config$/, handler: getSchedulerConfig },
{ method: "POST", pattern: /^\/api\/scheduler\/config$/, handler: updateSchedulerConfig },
{ method: "GET", pattern: /^\/api\/scheduler\/tasks\/(.+)\/history$/, handler: getTaskHistory },
```

- [ ] **Step 3: Commit**

```bash
git add my-chat-ui/apps/agents/src/routes/index.ts
git commit -m "feat(routes): register scheduler config and history endpoints"
```

---

## Task 5: Scheduler Skill - Use Unified Parser, Pass Model, Remove Restart

**Files:**
- Modify: `my-chat-ui/apps/agents/src/skills/scheduler/index.ts`

- [ ] **Step 1: Replace local `parseTimeDescription` with import**

At the top of the file, add:

```typescript
import { parseTimeDescription } from "../../utils/cron-parser.js";
```

Delete the entire local `parseTimeDescription` function (~lines 40-261).

- [ ] **Step 2: Update `schedule_cron_task` tool to accept and pass `model`**

In the `schedule_cron_task` tool schema, add `model` field:

```typescript
schema: z.object({
  name: z.string().describe("任务名称，如 '每日晨报', '下班提醒', '周报生成'"),
  scheduleDescription: z.string().describe(`时间描述...`),
  prompt: z.string().describe("任务执行时发送给 AI 的提示词..."),
  timezone: z.string().optional().default("Asia/Shanghai").describe("时区，默认 Asia/Shanghai"),
  model: z.string().optional().describe("使用的 AI 模型，默认使用全局配置"),
}),
```

In the tool implementation function signature, destructure `model`:

```typescript
async ({ name, scheduleDescription, prompt, timezone: _timezone, model }) => {
```

When calling MCP, pass `model`:

```typescript
mcpResult = await sendMCPRequest("tools/call", {
  name: "schedule_cron_task",
  arguments: {
    name: name,
    schedule: cronExpression,
    prompt: prompt,
    timezone: _timezone || "Asia/Shanghai",
    description: prompt.substring(0, 100),
    model: model || _config?.defaultModel || "gpt-4o-mini",
  },
});
```

- [ ] **Step 3: Remove process restart after creating cron task**

Delete this block inside `schedule_cron_task` (after `saveTasksToFile`):

```typescript
// 自动重启调度器进程，使新任务立即生效
console.log("[SchedulerSkill] Restarting scheduler process to activate new task...");
setTimeout(() => {
  try {
    stopSchedulerProcess();
    setTimeout(() => {
      startSchedulerProcess();
      console.log("[SchedulerSkill] Scheduler process restarted successfully");
    }, 1000);
  } catch (restartError) {
    console.error("[SchedulerSkill] Failed to restart scheduler:", restartError);
  }
}, 100);
```

Also update the success return message to remove "调度器正在重启..." text.

- [ ] **Step 4: Remove process restart after creating heartbeat task**

Do the same deletion in `schedule_heartbeat_task` and update its return message.

- [ ] **Step 5: Commit**

```bash
git add my-chat-ui/apps/agents/src/skills/scheduler/index.ts
git commit -m "feat(scheduler-skill): use unified cron parser, pass model, remove violent restart"
```

---

## Task 6: Python MCP Server - Fix Model Override

**Files:**
- Modify: `新项目/ai-scheduler-skill/src/scheduler_skill/mcp/server.py`

- [ ] **Step 1: Fix `_handle_schedule_cron` model resolution**

Find this line:

```python
config.model = ModelConfig(model=args.get("model") or self.scheduler.config.default_model.model)
```

If it already exists, verify it uses `args.get("model") or ...` and not `args.get("model", ...)` which would fail on empty string. If the line looks different, replace it with:

```python
model_name = args.get("model") or self.scheduler.config.default_model.model
config.model = ModelConfig(model=model_name)
```

- [ ] **Step 2: Ensure success message includes model**

In the return text, add model info:

```python
return [TextContent(type="text", text=
    f"✅ Cron任务已创建\n"
    f"名称: {config.name}\n"
    f"任务ID: {task_id}\n"
    f"调度: {config.cron.schedule}\n"
    f"模型: {config.model.model}"
)]
```

- [ ] **Step 3: Commit**

```bash
git add 新项目/ai-scheduler-skill/src/scheduler_skill/mcp/server.py
git commit -m "fix(mcp-server): correctly override default model from args"
```

---

## Task 7: Python SQLite Storage - Add Execution History

**Files:**
- Modify: `新项目/ai-scheduler-skill/src/scheduler_skill/storage/sqlite_storage.py`

- [ ] **Step 1: Add execution history table in `initialize`**

Inside `initialize`, after the `task_configs` table creation, add:

```python
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS execution_history (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                status TEXT,
                output TEXT,
                started_at TIMESTAMP,
                finished_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
```

- [ ] **Step 2: Add `save_execution_history` method**

Append to the class:

```python
    async def save_execution_history(self, record: dict):
        """保存执行历史"""
        if not self._conn:
            await self.initialize()
        await self._conn.execute(
            """
            INSERT INTO execution_history (id, task_id, status, output, started_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                record.get("id"),
                record.get("task_id"),
                record.get("status"),
                record.get("output"),
                record.get("started_at"),
            ),
        )
        await self._conn.commit()

    async def get_task_history(self, task_id: str, limit: int = 20) -> List[dict]:
        """获取任务执行历史"""
        if not self._conn:
            await self.initialize()
        async with self._conn.execute(
            """
            SELECT id, task_id, status, output, started_at, finished_at
            FROM execution_history
            WHERE task_id = ?
            ORDER BY finished_at DESC
            LIMIT ?
            """,
            (task_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()
            cols = [desc[0] for desc in cursor.description]
            return [dict(zip(cols, row)) for row in rows]
```

- [ ] **Step 3: Commit**

```bash
git add 新项目/ai-scheduler-skill/src/scheduler_skill/storage/sqlite_storage.py
git commit -m "feat(storage): add execution_history table and methods"
```

---

## Task 8: Python HybridScheduler - Record Execution History

**Files:**
- Modify: `新项目/ai-scheduler-skill/src/scheduler_skill/core/scheduler.py`

- [ ] **Step 1: Add history save at end of `_execute_task`**

Find the block near the end where `execution_result` is created. After:

```python
        # 创建执行结果
        execution_result = ExecutionResult(...)
```

Add:

```python
        # 保存执行历史
        try:
            await self.storage.save_execution_history({
                "id": execution_id,
                "task_id": task_id,
                "status": status.value,
                "output": str(result) if result else (error or ""),
                "started_at": ctx.started_at.isoformat(),
            })
        except Exception as e:
            logger.warning(f"[Scheduler] Failed to save execution history: {e}")
```

- [ ] **Step 2: Commit**

```bash
git add 新项目/ai-scheduler-skill/src/scheduler_skill/core/scheduler.py
git commit -m "feat(scheduler): persist execution history to sqlite"
```

---

## Task 9: Python MCP Server - Add `get_task_history` Tool

**Files:**
- Modify: `新项目/ai-scheduler-skill/src/scheduler_skill/mcp/server.py`

- [ ] **Step 1: Add tool to `list_tools`**

Inside the `list_tools` return array, add:

```python
                Tool(
                    name="get_task_history",
                    description="获取指定任务的执行历史记录",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "任务ID"
                            }
                        },
                        "required": ["task_id"]
                    }
                ),
```

- [ ] **Step 2: Add handler in `call_tool`**

Add branch:

```python
                elif name == "get_task_history":
                    return await self._handle_get_task_history(arguments)
```

- [ ] **Step 3: Implement `_handle_get_task_history`**

Append to class:

```python
    async def _handle_get_task_history(self, args: dict) -> Sequence[TextContent]:
        """处理获取任务历史"""
        task_id = args.get("task_id")
        if not task_id:
            return [TextContent(type="text", text="❌ 错误: task_id 不能为空")]
        try:
            history = await self.scheduler.storage.get_task_history(task_id, limit=20)
            if not history:
                return [TextContent(type="text", text="暂无执行记录")]
            return [TextContent(type="text", text=json.dumps(
                history,
                ensure_ascii=False,
                indent=2
            ))]
        except Exception as e:
            logger.error(f"[MCP] Failed to get task history: {e}")
            return [TextContent(type="text", text=f"❌ 错误: {str(e)}")]
```

- [ ] **Step 4: Commit**

```bash
git add 新项目/ai-scheduler-skill/src/scheduler_skill/mcp/server.py
git commit -m "feat(mcp-server): add get_task_history tool"
```

---

## Task 10: Frontend - Add Settings Dialog & Model Field

**Files:**
- Modify: `my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx`

- [ ] **Step 1: Add imports and state**

Add `Settings` icon to the lucide-react import list if missing.

Add new state variables inside `SchedulerPanel`:

```typescript
  const [globalConfig, setGlobalConfig] = useState({ defaultModel: "gpt-4o-mini" });
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsModel, setSettingsModel] = useState("gpt-4o-mini");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
```

- [ ] **Step 2: Load global config on mount**

Inside the existing `useEffect` (or a new one):

```typescript
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/scheduler/config`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.defaultModel) {
            setGlobalConfig({ defaultModel: data.defaultModel });
          }
        }
      } catch (e) {
        console.error("[Scheduler] Failed to load config:", e);
      }
    })();
  }, []);
```

- [ ] **Step 3: Add settings button in header**

Find the header div with "新建任务" button. Insert before it:

```tsx
          <Button variant="outline" size="icon" onClick={() => { setSettingsModel(globalConfig.defaultModel); setShowSettingsDialog(true); }}>
            <Settings className="h-4 w-4" />
          </Button>
```

- [ ] **Step 4: Add settings dialog JSX**

After the delete confirmation dialog, add:

```tsx
      {/* 设置对话框 */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scheduler 设置</DialogTitle>
            <DialogDescription>配置默认使用的 AI 模型</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">默认模型</label>
              <Input
                value={settingsModel}
                onChange={(e) => setSettingsModel(e.target.value)}
                placeholder="例如 gpt-4o-mini、claude-3-5-sonnet、deepseek-chat"
              />
              <p className="text-xs text-muted-foreground mt-1">
                新创建的任务将默认使用此模型
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>取消</Button>
            <Button
              onClick={async () => {
                setIsSavingSettings(true);
                try {
                  const res = await fetch(`${API_BASE_URL}/scheduler/config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ defaultModel: settingsModel }),
                  });
                  if (!res.ok) throw new Error("Save failed");
                  setGlobalConfig({ defaultModel: settingsModel });
                  toast.success("设置已保存");
                  setShowSettingsDialog(false);
                } catch (e) {
                  toast.error("保存失败");
                } finally {
                  setIsSavingSettings(false);
                }
              }}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 5: Add model field to cron creation form**

Add state:

```typescript
  const [newTaskModel, setNewTaskModel] = useState("");
```

In `resetCreateForm`, add:

```typescript
    setNewTaskModel("");
```

In `handleCreateCronTask`, change the `model` field in the POST body:

```typescript
          model: newTaskModel || globalConfig.defaultModel,
```

In the Cron creation form JSX, after the AI prompt textarea, add:

```tsx
              <div>
                <label className="text-sm font-medium">模型</label>
                <Input
                  placeholder={globalConfig.defaultModel}
                  value={newTaskModel}
                  onChange={(e) => setNewTaskModel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  留空则使用全局默认模型: {globalConfig.defaultModel}
                </p>
              </div>
```

- [ ] **Step 6: Commit**

```bash
git add my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx
git commit -m "feat(scheduler-panel): add settings dialog and model input field"
```

---

## Task 11: Frontend - Add Task Edit Flow

**Files:**
- Modify: `my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx`

- [ ] **Step 1: Add edit state and open handler**

Add to existing state declarations:

```typescript
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskSchedule, setEditTaskSchedule] = useState("");
  const [editTaskPrompt, setEditTaskPrompt] = useState("");
  const [editTaskModel, setEditTaskModel] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
```

- [ ] **Step 2: Add edit button in task card actions**

In the task card action buttons area (near Play/Pause/Delete), insert:

```tsx
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingTask(task);
                          setEditTaskName(task.name);
                          setEditTaskSchedule(task.schedule || "");
                          setEditTaskPrompt(task.description || "");
                          setEditTaskModel(""); // model not persisted per-task currently
                        }}
                        title="编辑"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
```

> Note: If you prefer a dedicated edit icon like `Pencil`, import it from lucide-react and use that instead.

- [ ] **Step 3: Add edit dialog JSX**

After the settings dialog:

```tsx
      {/* 编辑任务对话框 */}
      <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑任务</DialogTitle>
            <DialogDescription>修改后任务将被重新创建</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">任务名称</label>
              <Input value={editTaskName} onChange={(e) => setEditTaskName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Cron 表达式</label>
              <Input value={editTaskSchedule} onChange={(e) => setEditTaskSchedule(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">AI 提示词</label>
              <Textarea value={editTaskPrompt} onChange={(e) => setEditTaskPrompt(e.target.value)} rows={4} />
            </div>
            <div>
              <label className="text-sm font-medium">模型</label>
              <Input
                placeholder={globalConfig.defaultModel}
                value={editTaskModel}
                onChange={(e) => setEditTaskModel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>取消</Button>
            <Button
              disabled={isSavingEdit}
              onClick={async () => {
                if (!editingTask) return;
                setIsSavingEdit(true);
                try {
                  // 1. delete old
                  const delRes = await fetch(`${API_BASE_URL}/scheduler/tasks/${editingTask.id}`, { method: "DELETE" });
                  if (!delRes.ok) throw new Error("Delete failed");
                  // 2. create new
                  const createRes = await fetch(`${API_BASE_URL}/scheduler/tasks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      mode: "cron",
                      name: editTaskName,
                      schedule: editTaskSchedule,
                      prompt: editTaskPrompt,
                      timezone: "Asia/Shanghai",
                      model: editTaskModel || globalConfig.defaultModel,
                    }),
                  });
                  if (!createRes.ok) throw new Error("Create failed");
                  toast.success("任务已更新");
                  setEditingTask(null);
                  fetchTasks();
                  fetchStats();
                } catch (e) {
                  console.error(e);
                  toast.error("更新失败");
                } finally {
                  setIsSavingEdit(false);
                }
              }}
            >
              {isSavingEdit ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 4: Commit**

```bash
git add my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx
git commit -m "feat(scheduler-panel): add task edit flow (delete + recreate)"
```

---

## Task 12: Frontend - Add Execution History View

**Files:**
- Modify: `my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx`

- [ ] **Step 1: Add history state and handler**

Add state:

```typescript
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
```

Add fetch function inside component:

```typescript
  const fetchTaskHistory = async (taskId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/scheduler/tasks/${taskId}/history`);
      const data = await res.json();
      setExecutionHistory(data.history || []);
    } catch (e) {
      console.error("[Scheduler] Failed to fetch history:", e);
      setExecutionHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };
```

- [ ] **Step 2: Add history button in task card**

Insert another action button near Play:

```tsx
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setHistoryTaskId(task.id);
                          fetchTaskHistory(task.id);
                        }}
                        title="执行历史"
                      >
                        <Terminal className="h-4 w-4" />
                      </Button>
```

- [ ] **Step 3: Add history dialog JSX**

After the edit dialog:

```tsx
      {/* 执行历史对话框 */}
      <Dialog open={!!historyTaskId} onOpenChange={() => setHistoryTaskId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>执行历史</DialogTitle>
            <DialogDescription>最近 20 次执行记录</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isLoadingHistory ? (
              <p className="text-muted-foreground text-sm">加载中...</p>
            ) : executionHistory.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无执行记录</p>
            ) : (
              executionHistory.map((h, idx) => (
                <div key={h.id || idx} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{h.started_at ? new Date(h.started_at).toLocaleString() : "未知时间"}</span>
                    <Badge variant={h.status === "success" ? "default" : "destructive"}>{h.status}</Badge>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap">
                    {h.output ? h.output.substring(0, 200) : "无输出"}
                    {h.output && h.output.length > 200 && "..."}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 4: Commit**

```bash
git add my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx
git commit -m "feat(scheduler-panel): add execution history view"
```

---

## Task 13: Integration Testing

- [ ] **Step 1: Start the API server and verify config API**

Run: `cd my-chat-ui/apps/agents && pnpm api`

Then in another terminal:
```bash
curl http://localhost:8889/api/scheduler/config
```
Expected: `{"success":true,"defaultModel":"gpt-4o-mini"}`

- [ ] **Step 2: Update config and verify persistence**

```bash
curl -X POST http://localhost:8889/api/scheduler/config \
  -H "Content-Type: application/json" \
  -d '{"defaultModel":"claude-3-5-sonnet"}'
```
Expected: `{"success":true}`

Re-run GET. Expected: `defaultModel` is now `"claude-3-5-sonnet"`.
Check `my-chat-ui/apps/agents/src/skills/registry.json` contains the new value.

- [ ] **Step 3: Create a cron task with custom model**

```bash
curl -X POST http://localhost:8889/api/scheduler/tasks \
  -H "Content-Type: application/json" \
  -d '{"mode":"cron","name":"test-model-task","schedule":"0 9 * * *","prompt":"hello","model":"deepseek-chat"}'
```

Check Python MCP logs. Expected: task created with model `deepseek-chat`.

- [ ] **Step 4: Verify no process restart on task creation**

Watch logs. Expected: no `[SchedulerSkill] Restarting scheduler process...` messages.

- [ ] **Step 5: Trigger task and check history**

Use the task ID from Step 3:
```bash
curl -X POST http://localhost:8889/api/scheduler/tasks/<task_id>/trigger
curl http://localhost:8889/api/scheduler/tasks/<task_id>/history
```
Expected: history returns an array with at least one entry containing `status` and `output`.

- [ ] **Step 6: Commit any remaining changes**

```bash
git add -A
git commit -m "test: verify scheduler optimization end-to-end"
```

---

## Execution Handoff

After completing all tasks:

1. Ensure `pnpm api` starts without errors.
2. Ensure frontend (`pnpm web`) compiles without TypeScript errors.
3. Run a quick smoke test: create task → edit task → view history.
4. If any step fails, fall back to @superpowers:systematic-debugging before proceeding.
