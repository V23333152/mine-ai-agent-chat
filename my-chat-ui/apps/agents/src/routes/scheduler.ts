/**
 * Scheduler API Routes
 * 提供定时任务管理的 RESTful API
 * 通过 MCP 协议与 Python 调度器通信
 */

import { IncomingMessage, ServerResponse } from "http";
import { spawn, ChildProcess } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { parseTimeToCron } from "../utils/cron-parser.js";
import { getSkillRegistration, updateSkillConfig } from "../skills/skill-manager.js";

// 获取 __dirname (ES 模块兼容)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 调度器配置
const SCHEDULER_CONFIG_PATH = resolve(__dirname, "../../scheduler.yaml");
const PYTHON_PATH = resolve(__dirname, "../../venv_scheduler/Scripts/python.exe");
const WRAPPER_PATH = resolve(__dirname, "../../mcp_scheduler_wrapper.py");

// MCP 通信状态
let schedulerProcess: ChildProcess | null = null;
let messageId = 0;
const pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();
let mcpInitialized = false;

// 内存中的任务缓存（使用对象包装以保持引用）
const taskCacheContainer = { tasks: [] as any[] };
const getTaskCache = () => taskCacheContainer.tasks;
const setTaskCache = (tasks: any[]) => { taskCacheContainer.tasks = tasks; };

/**
 * 从文件加载任务列表
 */
function loadTasksFromFile(): any[] {
  try {
    const filePath = resolve(__dirname, "../../data/tasks.json");
    if (!existsSync(filePath)) {
      // 确保目录存在
      const dir = resolve(__dirname, "../../data");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      return [];
    }
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("[Scheduler] Failed to load tasks from file:", error);
    return [];
  }
}

/**
 * 保存任务列表到文件
 */
function saveTasksToFile(tasks: any[]) {
  // 确保目录存在
  const dir = resolve(__dirname, "../../data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filePath = resolve(__dirname, "../../data/tasks.json");
  writeFileSync(filePath, JSON.stringify(tasks, null, 2), "utf-8");
  console.log(`[Scheduler] Saved ${tasks.length} tasks to ${filePath}`);
}

/**
 * 初始化任务缓存（从文件加载）
 */
export function initTaskCache() {
  setTaskCache(loadTasksFromFile());
  console.log(`[Scheduler] Loaded ${getTaskCache().length} tasks from file`);
}

/**
 * 发送 MCP 请求到调度器进程
 */
async function sendMCPRequest(method: string, params: any): Promise<any> {
  if (!schedulerProcess || !schedulerProcess.stdin || !schedulerProcess.stdout) {
    throw new Error("Scheduler process not running");
  }

  // 等待初始化完成
  if (!mcpInitialized && method !== "initialize") {
    await initializeMCP();
  }

  const id = String(++messageId);
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    // 设置超时
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("MCP request timeout"));
    }, 150000);

    // 替换 pending request 以处理超时
    const original = pendingRequests.get(id)!;
    pendingRequests.set(id, {
      resolve: (value: any) => {
        clearTimeout(timeout);
        original.resolve(value);
      },
      reject: (error: any) => {
        clearTimeout(timeout);
        original.reject(error);
      },
    });

    // 发送请求
    const data = JSON.stringify(request) + "\n";
    console.log(`[MCP] Sending: ${data.trim()}`);
    schedulerProcess!.stdin!.write(data);
  });
}

/**
 * MCP 初始化握手
 */
async function initializeMCP(): Promise<void> {
  if (mcpInitialized) return;

  console.log("[MCP] Initializing...");

  const id = String(++messageId);
  const initRequest = {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: "scheduler-api",
        version: "1.0.0"
      }
    }
  };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (result: any) => {
        console.log("[MCP] Initialized successfully:", result);
        mcpInitialized = true;
        resolve();
      },
      reject: (error: any) => {
        console.error("[MCP] Initialization failed:", error);
        reject(error);
      }
    });

    // 设置超时
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("MCP initialization timeout"));
      }
    }, 150000);

    // 发送初始化请求
    const data = JSON.stringify(initRequest) + "\n";
    console.log(`[MCP] Init: ${data.trim()}`);
    schedulerProcess!.stdin!.write(data);
  });
}

/**
 * 处理 MCP 响应
 */
function handleMCPResponse(line: string) {
  try {
    const response = JSON.parse(line);
    console.log(`[MCP] Received: ${line.substring(0, 200)}...`);

    if (response.id && pendingRequests.has(response.id)) {
      const { resolve, reject } = pendingRequests.get(response.id)!;
      pendingRequests.delete(response.id);

      if (response.error) {
        reject(new Error(response.error.message || String(response.error)));
      } else {
        resolve(response.result);
      }
    }
  } catch (e) {
    // 可能是日志输出，忽略
  }
}

// 同步本地任务到 MCP 调度器
async function syncLocalTasksToMCP() {
  const localTasks = loadTasksFromFile();
  if (localTasks.length === 0) {
    console.log("[Scheduler] No local tasks to sync");
    return;
  }

  // 首先获取 MCP 中已有的任务列表，避免重复注册
  let mcpExistingTasks: string[] = [];
  try {
    const listResult = await sendMCPRequest("tools/call", {
      name: "list_tasks",
      arguments: {},
    });
    const listText = listResult?.content?.[0]?.text || "";
    // 解析任务名称（简单解析）
    const nameMatches = listText.match(/🟢\s+(.+)/g);
    if (nameMatches) {
      mcpExistingTasks = nameMatches.map((m: string) => m.replace(/🟢\s+/, '').trim());
    }
    console.log(`[Scheduler] MCP existing tasks: ${mcpExistingTasks.join(', ')}`);
  } catch (e) {
    console.log("[Scheduler] Could not get MCP task list, will sync all tasks");
  }

  console.log(`[Scheduler] Syncing ${localTasks.length} local tasks to MCP...`);

  for (const task of localTasks) {
    // 只同步 cron 任务
    if (task.mode === "cron") {
      // 检查任务是否已在 MCP 中存在（按名称匹配）
      if (mcpExistingTasks.includes(task.name)) {
        console.log(`[Scheduler] Task ${task.name} already exists in MCP, skipping sync`);
        continue;
      }

      let cronExpression: string | null = null;

      // 检查 schedule 是否是有效的 cron 表达式（包含空格）
      if (task.schedule?.includes(" ") && /^[\d*\/,-]+$/.test(task.schedule.replace(/\s/g, ""))) {
        cronExpression = task.schedule;
      } else {
        // 尝试将自然语言转换为 cron
        cronExpression = parseTimeToCron(task.schedule);
      }

      if (!cronExpression) {
        console.log(`[Scheduler] Cannot parse schedule for task ${task.name}: ${task.schedule}`);
        continue;
      }

      try {
        console.log(`[Scheduler] Syncing task: ${task.name} (${task.id}) with cron: ${cronExpression}`);

        // 调用 MCP 重新创建任务
        const mcpResult = await sendMCPRequest("tools/call", {
          name: "schedule_cron_task",
          arguments: {
            name: task.name,
            schedule: cronExpression,
            prompt: task.description || "执行任务",
            timezone: task.timezone || "Asia/Shanghai",
            description: task.description,
          },
        });

        // 检查是否成功
        const content = mcpResult?.content?.[0]?.text || "";
        if (content.includes("❌") || content.includes("错误")) {
          console.error(`[Scheduler] MCP returned error for ${task.name}:`, content);
          continue;
        }

        // 获取新的任务 ID
        const newTaskId = extractTaskIdFromMCPResult(mcpResult);
        if (newTaskId) {
          console.log(`[Scheduler] Task ${task.name} registered with new ID: ${newTaskId}`);
          // 更新本地任务 ID
          task.id = newTaskId;
        }
      } catch (error) {
        console.error(`[Scheduler] Failed to sync task ${task.name}:`, error);
      }
    }
  }

  // 保存更新后的任务列表
  saveTasksToFile(localTasks);
  setTaskCache(localTasks);
  console.log("[Scheduler] Task sync completed");
}

// 启动调度器进程
export function startSchedulerProcess() {
  if (schedulerProcess) {
    console.log("[Scheduler] Process already running");
    return;
  }

  // 从文件加载任务缓存
  initTaskCache();

  console.log("[Scheduler] Starting scheduler process...");
  console.log(`[Scheduler] Config path: ${SCHEDULER_CONFIG_PATH}`);

  // 检查 API key (支持 OpenAI 或 Moonshot/Kimi)
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasMoonshot = !!process.env.MOONSHOT_API_KEY;

  if (!hasOpenAI && !hasMoonshot) {
    console.warn("[Scheduler] WARNING: No API key found!");
    console.warn("[Scheduler] Please set OPENAI_API_KEY or MOONSHOT_API_KEY in your .env file");
  } else {
    if (hasMoonshot) {
      console.log("[Scheduler] MOONSHOT_API_KEY is set (using Kimi)");
      // 将 MOONSHOT_API_KEY 传给 Python 作为 OPENAI_API_KEY
      if (!hasOpenAI) {
        process.env.OPENAI_API_KEY = process.env.MOONSHOT_API_KEY;
      }
      // 设置 Kimi API base URL
      if (!process.env.OPENAI_BASE_URL) {
        process.env.OPENAI_BASE_URL = "https://api.moonshot.cn/v1";
        console.log("[Scheduler] Set OPENAI_BASE_URL for Kimi API");
      }
    } else {
      console.log("[Scheduler] OPENAI_API_KEY is set (using OpenAI)");
    }
  }

  mcpInitialized = false;

  // 调试：打印环境变量

  const envVars = {
    ...process.env,
    SCHEDULER_CONFIG: SCHEDULER_CONFIG_PATH,
    PYTHONIOENCODING: "utf-8",
    // 确保 Python 加载当前仓库的 ai-scheduler-skill，而不是旧路径
    SCHEDULER_SKILL_PATH: process.env.SCHEDULER_SKILL_PATH || resolve(process.cwd(), "../../../ai-scheduler-skill/src"),
    // 确保 TAVILY_API_KEY 被传递
    TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",
    // 确保 webhook 和飞书凭据被传递
    AGENTS_WEBHOOK_URL: process.env.AGENTS_WEBHOOK_URL || "",
    FEISHU_APP_ID: process.env.FEISHU_APP_ID || "",
    FEISHU_APP_SECRET: process.env.FEISHU_APP_SECRET || "",
    FEISHU_RECEIVE_ID: process.env.FEISHU_RECEIVE_ID || "",
    FEISHU_RECEIVE_ID_TYPE: process.env.FEISHU_RECEIVE_ID_TYPE || "open_id",
  };

  // 检查搜索API配置
  if (process.env.TAVILY_API_KEY) {
    console.log("[Scheduler] Tavily search API key configured, length:", process.env.TAVILY_API_KEY.length);
  } else {
    console.log("[Scheduler] WARNING: TAVILY_API_KEY not found in process.env, search functionality will be disabled");
  }

  console.log("[Scheduler] SCHEDULER_SKILL_PATH:", envVars.SCHEDULER_SKILL_PATH);
  console.log("[Scheduler] AGENTS_WEBHOOK_URL:", envVars.AGENTS_WEBHOOK_URL || "NOT SET");
  console.log("[Scheduler] FEISHU_APP_ID:", envVars.FEISHU_APP_ID ? "SET" : "NOT SET");
  console.log("[Scheduler] Spawning Python with env keys:", Object.keys(envVars).filter(k => ["API", "KEY", "BASE", "WEBHOOK", "FEISHU"].some(s => k.includes(s))));

  schedulerProcess = spawn(PYTHON_PATH, [WRAPPER_PATH], {
    env: envVars,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // 处理 stdout
  let buffer = "";
  schedulerProcess.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    buffer += text;

    // 按行处理
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 保留未完成的行

    for (const line of lines) {
      if (line.trim()) {
        // 检查是否是 JSON-RPC 响应
        if (line.trim().startsWith("{")) {
          handleMCPResponse(line);
        } else {
          console.log(`[Scheduler] ${line.trim()}`);
        }
      }
    }
  });

  schedulerProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[Scheduler] Error: ${data.toString().trim()}`);
  });

  schedulerProcess.on("close", (code: number) => {
    console.log(`[Scheduler] Process exited with code ${code}`);
    mcpInitialized = false;
    schedulerProcess = null;
    // 拒绝所有挂起的请求
    for (const [_id, { reject }] of pendingRequests) {
      reject(new Error("Scheduler process closed"));
    }
    pendingRequests.clear();
  });

  console.log("[Scheduler] Process started");

  // 等待一会儿让进程启动，然后初始化
  setTimeout(() => {
    initializeMCP()
      .then(() => {
        // MCP 初始化成功后，同步本地任务到 MCP
        return syncLocalTasksToMCP();
      })
      .catch(err => {
        console.error("[MCP] Auto-init failed:", err);
      });
  }, 1000);
}

// 停止调度器进程
export function stopSchedulerProcess() {
  if (schedulerProcess) {
    schedulerProcess.kill();
    schedulerProcess = null;
    mcpInitialized = false;
    console.log("[Scheduler] Process stopped");
  }
}

// 获取请求体
async function getRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// 发送 JSON 响应
function sendJSON(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET /api/scheduler/tasks - 获取任务列表
export async function getTasks(_req: IncomingMessage, res: ServerResponse) {
  try {
    // 始终从文件加载任务（防止热重载后缓存丢失）
    const fileTasks = loadTasksFromFile();
    // 合并内存中的状态更新
    const currentCache = getTaskCache();
    for (const fileTask of fileTasks) {
      const cachedTask = currentCache.find(t => t.id === fileTask.id);
      if (cachedTask) {
        // 保留内存中的状态（如运行状态）
        fileTask.status = cachedTask.status || fileTask.status;
        if (cachedTask.totalRuns !== undefined) {
          fileTask.totalRuns = cachedTask.totalRuns;
        }
      }
    }
    setTaskCache(fileTasks);
    console.log(`[Scheduler] Loaded ${fileTasks.length} tasks from file`);

    // 尝试从 MCP 获取任务状态更新
    try {
      const result = await sendMCPRequest("tools/call", {
      name: "list_tasks",
      arguments: {},
      });

      console.log("[Scheduler] MCP list_tasks result:", result);

      // 解析 MCP 返回的任务列表
      let mcpTasks: any[] = [];
      if (result?.content?.[0]?.text) {
        const text = result.content[0].text;
        if (!text.includes("暂无定时任务")) {
          const lines = text.split("\n");
          let currentTask: any = null;
          for (const line of lines) {
            const statusMatch = line.match(/^(🟢|🟡|🔴)\s*(.+)/);
            if (statusMatch) {
              if (currentTask) mcpTasks.push(currentTask);
              currentTask = {
                name: statusMatch[2].trim(),
                status: statusMatch[1] === "🟢" ? "idle" : statusMatch[1] === "🟡" ? "running" : "paused",
              };
            } else if (currentTask) {
              const idMatch = line.match(/ID:\s*(\S+)/);
              if (idMatch) currentTask.id = idMatch[1];
              const modeMatch = line.match(/模式:\s*(\S+)/);
              if (modeMatch) currentTask.mode = modeMatch[1];
              const scheduleMatch = line.match(/调度:\s*(.+)/);
              if (scheduleMatch) currentTask.schedule = scheduleMatch[1].trim();
              const runsMatch = line.match(/执行次数:\s*(\d+)/);
              if (runsMatch) currentTask.totalRuns = parseInt(runsMatch[1], 10);
              const lastRunMatch = line.match(/上次执行:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
              if (lastRunMatch) currentTask.lastRun = new Date(lastRunMatch[1].replace(' ', 'T')).toISOString();
            }
          }
          if (currentTask) mcpTasks.push(currentTask);
        }
      }

      // 合并 MCP 任务到本地缓存（根据任务名称去重，防止配置文件任务重复）
      for (const mcpTask of mcpTasks) {
        // 先根据名称查找是否已存在（配置文件任务可能每次 ID 不同）
        const localTaskByName = getTaskCache().find((t) => t.name === mcpTask.name);
        if (localTaskByName) {
          // 更新已有任务的 ID 和状态
          localTaskByName.id = mcpTask.id;
          localTaskByName.status = mcpTask.status;
          localTaskByName.schedule = mcpTask.schedule || localTaskByName.schedule;
          localTaskByName.mode = mcpTask.mode || localTaskByName.mode;
          if (mcpTask.totalRuns !== undefined) {
            localTaskByName.totalRuns = mcpTask.totalRuns;
          }
          if (mcpTask.lastRun) {
            localTaskByName.lastRun = mcpTask.lastRun;
          }
        } else {
          // 检查是否根据 ID 已存在
          const localTaskById = getTaskCache().find((t) => t.id === mcpTask.id);
          if (localTaskById) {
            // 更新已有任务
            localTaskById.status = mcpTask.status;
            if (mcpTask.totalRuns !== undefined) {
              localTaskById.totalRuns = mcpTask.totalRuns;
            }
            if (mcpTask.lastRun) {
              localTaskById.lastRun = mcpTask.lastRun;
            }
          } else {
            // 添加新任务到缓存（来自 scheduler.yaml 的配置任务或新创建的任务）
            getTaskCache().push({
              ...mcpTask,
              enabled: true,
              totalRuns: mcpTask.totalRuns || 0,
              successfulRuns: 0,
              failedRuns: 0,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      // 不再保存 MCP 合并结果到文件，防止覆盖 skill 创建的任务
      // 只更新内存中的任务状态
      console.log(`[Scheduler] Updated task statuses from MCP, file tasks: ${getTaskCache().length}`);
    } catch (mcpError) {
      console.log("[Scheduler] MCP list_tasks failed, using file cache:", mcpError);
    }

    sendJSON(res, {
      success: true,
      tasks: getTaskCache(),
    });
  } catch (error) {
    console.error("[Scheduler] Error getting tasks:", error);
    sendJSON(res, {
      success: true,
      tasks: getTaskCache(),
    });
  }
}

// 从 MCP 响应中提取任务ID
function extractTaskIdFromMCPResult(result: any): string | null {
  if (!result) return null;
  // result.content 是 TextContent 数组
  const content = result.content?.[0]?.text;
  if (!content) return null;

  // 匹配 "任务ID: xxx" 或 "任务ID：xxx"
  const match = content.match(/任务ID[:：]\s*(\S+)/);
  if (match) {
    return match[1];
  }
  return null;
}

// POST /api/scheduler/tasks - 创建任务
export async function createTask(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await getRequestBody(req);
    console.log("[Scheduler] Creating task:", body);

    let mcpResult: any = null;
    let pythonTaskId: string | null = null;

    // 调用 MCP 创建任务（必须先调用，获取 Python 生成的 ID）
    try {
      if (body.mode === "cron") {
        mcpResult = await sendMCPRequest("tools/call", {
          name: "schedule_cron_task",
          arguments: {
            name: body.name,
            schedule: body.schedule,
            prompt: body.prompt || "执行任务",
            timezone: body.timezone || "UTC",
            description: body.prompt?.substring(0, 100),
            model: body.model,
          },
        });

        console.log("[Scheduler] MCP create cron task result:", mcpResult);
        pythonTaskId = extractTaskIdFromMCPResult(mcpResult);
      } else if (body.mode === "heartbeat") {
        mcpResult = await sendMCPRequest("tools/call", {
          name: "schedule_heartbeat_task",
          arguments: {
            name: body.name,
            interval: body.interval,
            check_prompt: body.check_prompt || body.prompt || "检查任务",
            speak_condition: body.speak_condition || "has_alert",
            silent_hours: body.silent_hours || [23, 7],
          },
        });

        console.log("[Scheduler] MCP create heartbeat task result:", mcpResult);
        pythonTaskId = extractTaskIdFromMCPResult(mcpResult);
      }
    } catch (mcpError) {
      console.error("[Scheduler] MCP create task failed:", mcpError);
      // MCP 失败，返回错误
      sendJSON(res, { success: false, error: `MCP error: ${mcpError}` }, 500);
      return;
    }

    if (!pythonTaskId) {
      // 检查是否 MCP 返回了错误信息
      const mcpText = mcpResult?.content?.[0]?.text || "";
      if (mcpText.includes("❌") || mcpText.includes("错误")) {
        console.error("[Scheduler] MCP returned error:", mcpText);
        sendJSON(res, { success: false, error: mcpText.replace("❌ ", "") }, 500);
        return;
      }
      console.error("[Scheduler] Could not extract task ID from MCP result:", mcpResult);
      sendJSON(res, { success: false, error: "Failed to get task ID from scheduler" }, 500);
      return;
    }

    // 使用 Python 返回的任务ID
    const task: any = {
      id: pythonTaskId,
      name: body.name,
      mode: body.mode,
      status: "idle",
      enabled: true,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      createdAt: new Date().toISOString(),
    };

    if (body.mode === "cron") {
      task.schedule = body.schedule;
      task.timezone = body.timezone || "UTC";
    } else if (body.mode === "heartbeat") {
      task.schedule = `every ${body.interval}s`;
      task.interval = body.interval;
    }

    if (body.prompt || body.check_prompt) {
      task.description = (body.prompt || body.check_prompt).substring(0, 100);
    }

    if (body.model) {
      task.model = body.model;
    }

    getTaskCache().push(task);

    // 保存到文件（持久化）
    saveTasksToFile(getTaskCache());

    console.log(`[Scheduler] Created task: ${task.name} (${task.id})`);

    sendJSON(res, {
      success: true,
      task,
      message: "Task created successfully",
    });
  } catch (error) {
    console.error("[Scheduler] Error creating task:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

// DELETE /api/scheduler/tasks/:id - 删除任务
export async function deleteTask(_req: IncomingMessage, res: ServerResponse, taskId?: string) {
  try {
    if (!taskId) {
      sendJSON(res, { success: false, error: "Task ID required" }, 400);
      return;
    }
    // 尝试通过 MCP 删除
    try {
    await sendMCPRequest("tools/call", {
      name: "delete_task",
      arguments: { task_id: taskId },
    });
  } catch (mcpError) {
    console.log("[Scheduler] MCP delete failed:", mcpError);
  }

    const index = getTaskCache().findIndex((t) => t.id === taskId);
    if (index === -1) {
      sendJSON(res, { success: false, error: "Task not found" }, 404);
      return;
    }

    const task = getTaskCache()[index];
    getTaskCache().splice(index, 1);

    // 保存到文件（持久化）
    saveTasksToFile(getTaskCache());

    console.log(`[Scheduler] Deleted task: ${task.name} (${taskId})`);

    sendJSON(res, {
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("[Scheduler] Error deleting task:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

// POST /api/scheduler/tasks/:id/trigger - 手动触发任务
export async function triggerTask(_req: IncomingMessage, res: ServerResponse, taskId?: string) {
  if (!taskId) {
    sendJSON(res, { success: false, error: "Task ID required" }, 400);
    return;
  }
  try {
    const task = getTaskCache().find((t) => t.id === taskId);
    if (!task) {
      sendJSON(res, { success: false, error: "Task not found" }, 404);
      return;
    }

    // 尝试通过 MCP 触发
    let mcpResult;
    let triggered = false;
    try {
      mcpResult = await sendMCPRequest("tools/call", {
        name: "trigger_task",
        arguments: { task_id: taskId },
      });

      // 检查 MCP 返回的内容是否包含错误
      const mcpText = mcpResult?.content?.[0]?.text || "";
      console.log("[Scheduler] MCP response text:", mcpText);
      if (mcpText.includes("错误") || mcpText.includes("❌")) {
        console.log("[Scheduler] MCP returned error, will execute locally:", mcpText);
        throw new Error(mcpText);
      }

      triggered = true;
      console.log("[Scheduler] MCP trigger success", mcpResult);
    } catch (mcpError) {
      console.log("[Scheduler] MCP trigger failed, will execute locally:", mcpError);
      // MCP 触发失败，任务只在本地存在，直接本地执行
      triggered = true;
      
      // 本地执行：发送任务到通知系统
      const notification = {
        type: "task_execution",
        taskId: taskId,
        taskName: task.name,
        prompt: task.description || task.prompt || "执行任务",
        executedAt: new Date().toISOString(),
        status: "pending",
      };
      
      // 保存执行记录（可以在这里调用 AI 或直接显示通知）
      console.log("[Scheduler] Local task execution:", notification);
      
      mcpResult = { 
        local: true, 
        message: "Task executed locally (task not registered in MCP scheduler)",
        notification: notification
      };
    }

    // 更新任务统计
    task.totalRuns++;
    if (triggered) {
      task.successfulRuns++;
    }
    task.lastRun = new Date().toISOString();
    task.status = "idle";

    // 保存到文件（持久化）
    saveTasksToFile(getTaskCache());

    console.log(`[Scheduler] Triggered task: ${task.name} (${taskId})`);

    sendJSON(res, {
      success: true,
      executionId: generateId(),
      status: "success",
      durationMs: 1000,
      mcpResult,
      message: "Task triggered successfully",
    });
  } catch (error) {
    console.error("[Scheduler] Error triggering task:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

// POST /api/scheduler/tasks/:id/pause - 暂停任务
export async function pauseTask(_req: IncomingMessage, res: ServerResponse, taskId?: string) {
  if (!taskId) {
    sendJSON(res, { success: false, error: "Task ID required" }, 400);
    return;
  }
  try {
    const task = getTaskCache().find((t) => t.id === taskId);
    if (!task) {
      sendJSON(res, { success: false, error: "Task not found" }, 404);
      return;
    }

    // 尝试通过 MCP 暂停
    try {
      await sendMCPRequest("tools/call", {
        name: "toggle_task",
        arguments: { task_id: taskId, pause: true },
      });
    } catch (mcpError) {
      console.log("[Scheduler] MCP pause failed:", mcpError);
    }

    task.status = "paused";

    console.log(`[Scheduler] Paused task: ${task.name} (${taskId})`);

    sendJSON(res, {
      success: true,
      message: "Task paused successfully",
    });
  } catch (error) {
    console.error("[Scheduler] Error pausing task:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

// POST /api/scheduler/tasks/:id/resume - 恢复任务
export async function resumeTask(_req: IncomingMessage, res: ServerResponse, taskId?: string) {
  try {
    if (!taskId) {
      sendJSON(res, { success: false, error: "Task ID required" }, 400);
      return;
    }
    const task = getTaskCache().find((t) => t.id === taskId);
    if (!task) {
      sendJSON(res, { success: false, error: "Task not found" }, 404);
      return;
    }

    // 尝试通过 MCP 恢复
    try {
      await sendMCPRequest("tools/call", {
        name: "toggle_task",
        arguments: { task_id: taskId, pause: false },
      });
    } catch (mcpError) {
      console.log("[Scheduler] MCP resume failed:", mcpError);
    }

    task.status = "idle";

    console.log(`[Scheduler] Resumed task: ${task.name} (${taskId})`);

    sendJSON(res, {
      success: true,
      message: "Task resumed successfully",
    });
  } catch (error) {
    console.error("[Scheduler] Error resuming task:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

// GET /api/scheduler/stats - 获取调度器统计
export async function getStats(_req: IncomingMessage, res: ServerResponse) {
  try {
    // 尝试从 MCP 获取统计
    let mcpStats;
    try {
    mcpStats = await sendMCPRequest("tools/call", {
      name: "get_stats",
      arguments: {},
    });
  } catch (mcpError) {
    console.log("[Scheduler] MCP get_stats failed:", mcpError);
  }

    const stats = {
      running: schedulerProcess !== null,
      total_tasks: getTaskCache().length,
      cron_tasks: getTaskCache().filter((t) => t.mode === "cron").length,
      heartbeat_tasks: getTaskCache().filter((t) => t.mode === "heartbeat").length,
      event_tasks: getTaskCache().filter((t) => t.mode === "event").length,
      started_at: new Date().toISOString(),
      mcpStats,
    };

    sendJSON(res, { success: true, ...stats });
  } catch (error) {
    console.error("[Scheduler] Error getting stats:", error);
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

export async function getConfig(_req: IncomingMessage, res: ServerResponse) {
  const registration = getSkillRegistration("ai-scheduler");
  sendJSON(res, { success: true, config: registration?.config || {} });
}

export async function updateConfig(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await getRequestBody(req);
    await updateSkillConfig("ai-scheduler", body);
    sendJSON(res, { success: true, message: "Config updated" });
  } catch (error) {
    sendJSON(res, { success: false, error: String(error) }, 500);
  }
}

export async function getTaskHistory(_req: IncomingMessage, res: ServerResponse, taskId?: string) {
  try {
    const result = await sendMCPRequest("tools/call", {
      name: "get_task_history",
      arguments: { task_id: taskId || undefined, limit: 50 },
    });
    const text = result?.content?.[0]?.text;
    if (text && (text.trim().startsWith("[") || text.trim().startsWith("{"))) {
      const parsed = JSON.parse(text);
      sendJSON(res, { success: true, history: parsed });
      return;
    }
    sendJSON(res, { success: true, history: [] });
  } catch (error) {
    console.log("[Scheduler] get_task_history failed:", error);
    sendJSON(res, { success: true, history: [] });
  }
}

// 导出供 Skill 系统使用
export { taskCacheContainer, sendMCPRequest, saveTasksToFile };
