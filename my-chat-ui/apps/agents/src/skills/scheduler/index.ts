/**
 * AI Scheduler Skill - 定时任务调度
 *
 * 集成 ai-scheduler-skill 项目，提供自然语言创建定时任务能力
 *
 * 使用示例:
 *   "帮我创建一个每天早上8点的晨报任务"
 *   "设置一个每30分钟检查邮件的提醒"
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Skill, SkillMetadata } from "../types.js";
import { parseTimeToCron } from "../../utils/cron-parser.js";

// 导入 scheduler 路由的函数
import {
  sendMCPRequest,
  taskCacheContainer,
  startSchedulerProcess,
  saveTasksToFile,
} from "../../routes/scheduler.js";

// 获取 taskCache 的便捷引用
const getTaskCache = () => taskCacheContainer.tasks;


export const schedulerSkillMetadata: SkillMetadata = {
  id: "ai-scheduler",
  name: "AI 定时任务调度器",
  version: "1.0.0",
  description: "通过自然语言创建和管理定时任务，支持 Cron 定时、Heartbeat 智能检查",
  type: "native",
  tags: ["schedule", "cron", "automation", "task"],
  config: [
    {
      name: "apiKey",
      type: "string",
      required: false,
      description: "Moonshot API Key",
      env: "MOONSHOT_API_KEY",
    },
    {
      name: "defaultModel",
      type: "string",
      required: false,
      description: "默认使用的 AI 模型",
      default: "gpt-4o-mini",
    },
    {
      name: "notifyUIEnabled",
      type: "boolean",
      required: false,
      description: "是否启用通知界面",
      default: true,
    },
  ],
  tools: [
    {
      id: "schedule_cron_task",
      name: "创建定时任务",
      description: "创建一个在固定时间自动执行的任务",
    },
    {
      id: "schedule_heartbeat_task",
      name: "创建智能检查任务",
      description: "创建一个定期检查并按条件触发的任务",
    },
    {
      id: "list_scheduled_tasks",
      name: "列出所有任务",
      description: "查看当前所有的定时任务",
    },
    {
      id: "delete_scheduled_task",
      name: "删除任务",
      description: "删除指定的定时任务",
    },
    {
      id: "trigger_task_now",
      name: "立即触发任务",
      description: "手动立即执行一个任务",
    },
    {
      id: "scheduler_web_search",
      name: "Tavily联网搜索",
      description: "使用Tavily API搜索互联网上的最新信息",
    },
  ],
};

export async function createSchedulerSkill(
  _config?: Record<string, any>
): Promise<Skill> {
  // 从环境变量读取配置
  // const apiKey = _config?.apiKey || process.env.MOONSHOT_API_KEY;
  // const defaultModel = _config?.defaultModel || "moonshot-v1-8k";
  // const notifyUIEnabled = _config?.notifyUIEnabled !== false;

  return {
    metadata: schedulerSkillMetadata,
    tools: [
      // 1. 创建定时任务
      tool(
        async ({ name, scheduleDescription, prompt, timezone: _timezone, model }) => {
          // 通过 MCP 调用 Python 调度器
          try {
            console.log(`[SchedulerSkill] Creating cron task: ${name}, schedule: ${scheduleDescription}`);

            // 将自然语言转换为 cron 表达式
            let cronExpression = parseTimeToCron(scheduleDescription);
            if (!cronExpression) {
              // 如果已经是有效的 cron 表达式，允许直接透传
              const fields = scheduleDescription.trim().split(/\s+/);
              const isValidCronField = (f: string) =>
                /^[\d*,\/\-#]+$/.test(f) || /^[L?]$/.test(f) || /^\d+W$/.test(f) || /^LW$/.test(f);
              const isValidCron = fields.length === 5 && fields.every(isValidCronField);
              if (!isValidCron) {
                return `❌ 创建任务失败: 无法理解时间描述 "${scheduleDescription}"，请使用支持的格式（如"每天早上8点"、"每30分钟"），或输入标准 Cron 表达式`;
              }
              cronExpression = scheduleDescription;
            }
            console.log(`[SchedulerSkill] Converted "${scheduleDescription}" to cron: ${cronExpression}`);

            // 调用 MCP 创建任务
            let mcpResult;
            try {
              mcpResult = await sendMCPRequest("tools/call", {
                name: "schedule_cron_task",
                arguments: {
                  name: name,
                  schedule: cronExpression,
                  prompt: prompt,
                  timezone: _timezone || "Asia/Shanghai",
                  description: prompt.substring(0, 100),
                  model: model || undefined,
                },
              });
            } catch (mcpError) {
              console.error("[SchedulerSkill] MCP call failed:", mcpError);
              return `❌ 创建任务失败: MCP 调度器调用失败 - ${mcpError instanceof Error ? mcpError.message : String(mcpError)}`;
            }

            console.log("[SchedulerSkill] MCP result:", mcpResult);

            // 从 MCP 响应中提取任务ID
            const content = mcpResult?.content?.[0]?.text || "";

            // 首先检查是否有错误信息
            if (content.includes("❌") || content.includes("错误")) {
              console.error("[SchedulerSkill] MCP returned error:", content);
              return `❌ 创建任务失败: ${content.replace("❌ ", "").replace(/错误[:：]\s*/, "")}`;
            }

            const match = content.match(/任务ID[:：]\s*(\S+)/);
            const taskId = match ? match[1] : null;

            if (taskId) {
              // 添加任务到本地缓存
              const task = {
                id: taskId,
                name: name,
                mode: "cron",
                schedule: cronExpression,  // 存储 cron 表达式以便同步
                scheduleDescription: scheduleDescription,  // 保留原始描述
                timezone: _timezone || "Asia/Shanghai",
                description: prompt.substring(0, 100),
                status: "idle",
                enabled: true,
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0,
                createdAt: new Date().toISOString(),
              };
              getTaskCache().push(task);

              // 保存到文件（持久化）
              try {
                const currentTasks = getTaskCache();
                console.log(`[SchedulerSkill] Saving ${currentTasks.length} tasks to file...`);
                saveTasksToFile(currentTasks);
                console.log("[SchedulerSkill] Save completed successfully");
              } catch (saveError) {
                console.error("[SchedulerSkill] Failed to save tasks:", saveError);
              }

              return `✅ 定时任务 "${name}" 创建成功！\n\n任务ID: ${taskId}\n调度: ${scheduleDescription}\n时区: ${_timezone || "Asia/Shanghai"}\n提示词: ${prompt.substring(0, 50)}...`;
            } else {
              console.error("[SchedulerSkill] Could not extract task ID from MCP response:", content);
              return `❌ 创建任务失败: 无法从调度器获取任务ID。响应: ${content.substring(0, 200)}`;
            }
          } catch (error) {
            console.error("[SchedulerSkill] Error creating task:", error);
            return `❌ 创建任务失败: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: "schedule_cron_task",
          description: `
创建定时任务，在指定时间自动执行 AI 提示词。

【时间描述格式】
系统会自动将中文时间描述转换为 Cron 表达式，支持以下格式：

1. 每天执行：
   - "每天早上8点" / "每天上午9点" - 固定时间
   - "每天下午6点" / "每天晚上10点" - 12小时制自动转换
   - "每天中午12点" / "每天凌晨0点"
   - "每天早上8点半" - 支持"半"、"一刻"(15分)、"三刻"(45分)

2. 工作日/周末：
   - "工作日早上9点" - 周一到周五
   - "工作日下午6点" - 下班提醒
   - "周末早上10点" - 周六周日

3. 每周执行：
   - "每周一早上8点" / "每周五下午6点"
   - "每周三下午3点半"
   - "每周日早上9点"

4. 每月执行：
   - "每月1号早上9点" - 月初执行
   - "每月15号下午2点" - 月中执行

5. 间隔执行：
   - "每30分钟" / "每5分钟" / "每10分钟"
   - "每2小时" / "每4小时" / "每小时"

【示例】
- 每日晨报: name="每日晨报", scheduleDescription="每天早上8点", prompt="生成今日晨报，包括天气、日程..."
- 下班提醒: name="下班提醒", scheduleDescription="工作日下午6点", prompt="提醒用户该下班了..."
- 周报生成: name="周报生成", scheduleDescription="每周五下午6点", prompt="生成本周工作总结..."
- 健康提醒: name="喝水提醒", scheduleDescription="每2小时", prompt="提醒用户喝水活动..."
          `.trim(),
          schema: z.object({
            name: z.string().describe("任务名称，如 '每日晨报', '下班提醒', '周报生成'"),
            scheduleDescription: z
              .string()
              .describe(
                `时间描述，系统会自动解析。支持的格式：
- 每天: "每天早上8点", "每天下午6点半", "每天晚上10点"
- 工作日: "工作日早上9点", "工作日下午6点"
- 周末: "周末早上10点"
- 每周: "每周一早上8点", "每周五下午6点"
- 每月: "每月1号早上9点"
- 间隔: "每30分钟", "每2小时", "每5分钟"`
              ),
            prompt: z
              .string()
              .describe("任务执行时发送给 AI 的提示词，支持变量 {{date}}, {{weekday}}, {{time}}, {{weather}}, {{temperature}}"),
            timezone: z
              .string()
              .optional()
              .default("Asia/Shanghai")
              .describe("时区，默认 Asia/Shanghai"),
            model: z.string().optional().describe("使用的AI模型，如 gpt-4o-mini"),
          }),
        }
      ),

      // 2. 创建智能检查任务
      tool(
        async ({ name, checkInterval, checkPrompt: _checkPrompt, speakCondition }) => {
          try {
            console.log(`[SchedulerSkill] Creating heartbeat task: ${name}, interval: ${checkInterval}`);

            // 解析间隔（转换为秒）
            let intervalSeconds = 300; // 默认5分钟
            const intervalMatch = checkInterval.match(/(\d+)/);
            if (intervalMatch) {
              const num = parseInt(intervalMatch[1]);
              if (checkInterval.includes("分钟")) {
                intervalSeconds = num * 60;
              } else if (checkInterval.includes("小时")) {
                intervalSeconds = num * 3600;
              } else if (checkInterval.includes("秒")) {
                intervalSeconds = num;
              }
            }

            // 调用 MCP 创建心跳任务
            let mcpResult;
            try {
              mcpResult = await sendMCPRequest("tools/call", {
                name: "schedule_heartbeat_task",
                arguments: {
                  name: name,
                  interval: intervalSeconds,
                  check_prompt: _checkPrompt,
                  speak_condition: speakCondition || "has_alert",
                  silent_hours: [23, 7],
                },
              });
            } catch (mcpError) {
              console.error("[SchedulerSkill] MCP call failed:", mcpError);
              return `❌ 创建任务失败: MCP 调度器调用失败 - ${mcpError instanceof Error ? mcpError.message : String(mcpError)}`;
            }

            console.log("[SchedulerSkill] Heartbeat task result:", mcpResult);

            // 从 MCP 响应中提取任务ID
            const content = mcpResult?.content?.[0]?.text || "";

            // 首先检查是否有错误信息
            if (content.includes("❌") || content.includes("错误")) {
              console.error("[SchedulerSkill] MCP returned error:", content);
              return `❌ 创建任务失败: ${content.replace("❌ ", "").replace(/错误[:：]\s*/, "")}`;
            }

            const match = content.match(/任务ID[:：]\s*(\S+)/);
            const taskId = match ? match[1] : null;

            if (taskId) {
              // 添加任务到本地缓存
              const task = {
                id: taskId,
                name: name,
                mode: "heartbeat",
                schedule: `every ${intervalSeconds}s`,
                interval: intervalSeconds,
                description: _checkPrompt.substring(0, 100),
                speakCondition: speakCondition || "has_alert",
                status: "idle",
                enabled: true,
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0,
                createdAt: new Date().toISOString(),
              };
              getTaskCache().push(task);

              // 保存到文件（持久化）
              try {
                const currentTasks = getTaskCache();
                console.log(`[SchedulerSkill] Saving ${currentTasks.length} tasks to file...`);
                saveTasksToFile(currentTasks);
                console.log("[SchedulerSkill] Save completed successfully");
              } catch (saveError) {
                console.error("[SchedulerSkill] Failed to save tasks:", saveError);
              }

              return `✅ 智能检查任务 "${name}" 创建成功！\n\n任务ID: ${taskId}\n检查间隔: ${checkInterval} (${intervalSeconds}秒)\n触发条件: ${speakCondition}`;
            } else {
              console.error("[SchedulerSkill] Could not extract task ID from MCP response:", content);
              return `❌ 创建任务失败: 无法从调度器获取任务ID。响应: ${content.substring(0, 200)}`;
            }
          } catch (error) {
            console.error("[SchedulerSkill] Error creating heartbeat task:", error);
            return `❌ 创建任务失败: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: "schedule_heartbeat_task",
          description: `
创建智能检查任务，定期检查并按条件触发通知。

适合场景:
- 检查是否有紧急邮件（有则通知，无则静默）
- 监控系统状态（异常时才提醒）
- 定期检查待办事项（有逾期才提示）

示例:
- 邮件检查: checkInterval="每30分钟", checkPrompt="检查紧急邮件", speakCondition="有紧急邮件"
- 系统监控: checkInterval="每5分钟", checkPrompt="检查CPU和内存", speakCondition="系统负载过高"
          `.trim(),
          schema: z.object({
            name: z.string().describe("任务名称，如 '邮件检查', '系统监控'"),
            checkInterval: z
              .string()
              .describe("检查间隔，如 '每5分钟', '每30分钟', '每小时'"),
            checkPrompt: z
              .string()
              .describe("检查时执行的提示词"),
            speakCondition: z
              .string()
              .default("有重要事项")
              .describe("何时触发通知的条件描述"),
          }),
        }
      ),

      // 3. 列出所有任务
      tool(
        async () => {
          try {
            console.log("[SchedulerSkill] Listing tasks from cache, count:", getTaskCache().length);

            if (getTaskCache().length === 0) {
              return `📋 当前没有定时任务。\n\n💡 提示: 使用 schedule_cron_task 工具创建新任务，或在前端界面 http://localhost:5173 的"定时任务"面板中管理任务。`;
            }

            const taskList = getTaskCache().map((task, index) => {
              const statusEmoji = task.status === "running" ? "🟡" : task.status === "paused" ? "🔴" : "🟢";
              return `${index + 1}. ${statusEmoji} ${task.name} (${task.mode})
   调度: ${task.schedule || "未设置"}
   状态: ${task.status || "idle"}
   执行次数: ${task.totalRuns || 0}`;
            }).join("\n\n");

            return `📋 当前定时任务列表 (${getTaskCache().length}个):\n\n${taskList}\n\n💡 提示: 在前端界面 http://localhost:5173 的"定时任务"面板中可以查看和管理所有任务。`;
          } catch (error) {
            console.error("[SchedulerSkill] Error listing tasks:", error);
            return `❌ 获取任务列表失败: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: "list_scheduled_tasks",
          description: "列出所有定时任务及其状态",
          schema: z.object({}),
        }
      ),

      // 4. 删除任务
      tool(
        async ({ taskId }) => {
          try {
            console.log(`[SchedulerSkill] Deleting task: ${taskId}`);

            // 先尝试通过 MCP 删除
            try {
              await sendMCPRequest("tools/call", {
                name: "delete_task",
                arguments: { task_id: taskId },
              });
            } catch (mcpError) {
              console.log("[SchedulerSkill] MCP delete failed (task may not exist in scheduler):", mcpError);
            }

            // 从本地缓存删除
            const index = getTaskCache().findIndex((t) => t.id === taskId);
            if (index === -1) {
              return `⚠️ 任务 ${taskId} 不存在或已被删除`;
            }

            const task = getTaskCache()[index];
            getTaskCache().splice(index, 1);

            // 保存到文件（持久化）
            saveTasksToFile(getTaskCache());

            console.log(`[SchedulerSkill] Deleted task: ${task.name} (${taskId})`);
            return `✅ 任务 "${task.name}" (${taskId}) 已删除`;
          } catch (error) {
            console.error("[SchedulerSkill] Error deleting task:", error);
            return `❌ 删除任务失败: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: "delete_scheduled_task",
          description: "删除指定的定时任务",
          schema: z.object({
            taskId: z.string().describe("要删除的任务ID"),
          }),
        }
      ),

      // 5. 立即触发任务
      tool(
        async ({ taskId }) => {
          try {
            console.log(`[SchedulerSkill] Triggering task: ${taskId}`);

            // 查找任务
            const task = getTaskCache().find((t) => t.id === taskId);
            if (!task) {
              return `❌ 任务 ${taskId} 不存在`;
            }

            // 通过 MCP 触发任务
            let mcpResult;
            try {
              mcpResult = await sendMCPRequest("tools/call", {
                name: "trigger_task",
                arguments: { task_id: taskId },
              });
              console.log("[SchedulerSkill] Trigger result:", mcpResult);
            } catch (mcpError) {
              console.error("[SchedulerSkill] MCP trigger failed:", mcpError);
              return `❌ 触发任务失败: ${mcpError instanceof Error ? mcpError.message : String(mcpError)}`;
            }

            // 更新任务统计
            task.totalRuns = (task.totalRuns || 0) + 1;
            task.successfulRuns = (task.successfulRuns || 0) + 1;
            task.lastRun = new Date().toISOString();

            // 保存到文件（持久化）
            saveTasksToFile(getTaskCache());

            return `✅ 任务 "${task.name}" 已手动触发\n\n任务ID: ${taskId}\n执行时间: ${task.lastRun}\n\n请查看通知界面 http://localhost:8765 获取执行结果。`;
          } catch (error) {
            console.error("[SchedulerSkill] Error triggering task:", error);
            return `❌ 触发任务失败: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: "trigger_task_now",
          description: "立即手动执行一个任务（用于测试）",
          schema: z.object({
            taskId: z.string().describe("要触发的任务ID"),
          }),
        }
      ),

      // 6. 联网搜索 (scheduler专用)
      tool(
        async ({ query, maxResults, includeAnswer }) => {
          try {
            console.log(`[SchedulerSkill] Tavily search: ${query}`);

            // 通过 MCP 调用搜索
            let mcpResult;
            try {
              mcpResult = await sendMCPRequest("tools/call", {
                name: "scheduler_web_search",
                arguments: {
                  query: query,
                  max_results: maxResults || 10,
                  include_answer: includeAnswer !== false,
                },
              });
            } catch (mcpError) {
              console.error("[SchedulerSkill] MCP scheduler_web_search failed:", mcpError);
              return `❌ 搜索失败: ${mcpError instanceof Error ? mcpError.message : String(mcpError)}`;
            }

            console.log("[SchedulerSkill] Tavily search result:", mcpResult);

            // 解析搜索结果
            const content = mcpResult?.content?.[0]?.text || "";

            if (content.includes("❌") || content.includes("错误")) {
              console.error("[SchedulerSkill] Search returned error:", content);
              return `❌ 搜索失败: ${content.replace("❌ ", "").replace(/错误[:：]\s*/, "")}`;
            }

            return content || "✅ 搜索完成，但未返回结果";
          } catch (error) {
            console.error("[SchedulerSkill] Error in web search:", error);
            return `❌ 搜索失败: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
        {
          name: "scheduler_web_search",
          description: `
Tavily联网搜索工具，使用Tavily API搜索互联网上的最新信息。

特点:
- 专为AI优化的搜索结果
- 支持实时新闻、热点事件
- 包含AI生成的答案摘要

使用场景:
- 获取最新新闻、热点事件
- 查询实时数据、股价、天气
- 搜索技术文档、教程
- 查找产品信息、评价

示例:
- 搜索新闻: query="今日热点新闻", maxResults=10
- 查询天气: query="北京今天天气", maxResults=5
- 技术搜索: query="React 19 新特性", maxResults=10
          `.trim(),
          schema: z.object({
            query: z.string().describe("搜索查询词，如 '今日热点新闻'、'React 教程'"),
            maxResults: z.number().optional().default(10).describe("返回结果数量（1-10，默认10）"),
            includeAnswer: z.boolean().optional().default(true).describe("是否包含AI生成的答案摘要（默认true）"),
          }),
        }
      ),
    ],
    enabled: true,

    initialize: async () => {
      console.log("[SchedulerSkill] 正在初始化...");

      // 启动 scheduler 进程
      try {
        startSchedulerProcess();
        console.log("[SchedulerSkill] Scheduler 进程已启动");
      } catch (error) {
        console.error("[SchedulerSkill] 启动 Scheduler 进程失败:", error);
      }

      console.log("[SchedulerSkill] 可用工具: schedule_cron_task, schedule_heartbeat_task, list_scheduled_tasks, delete_scheduled_task, trigger_task_now, scheduler_web_search");
      console.log("[SchedulerSkill] 功能特性: 1) 支持模型透传 2) 统一 Cron 解析 3) 热注册无需重启");
      console.log("[SchedulerSkill] 当前缓存任务数:", getTaskCache().length);
      return true;
    },

    destroy: async () => {
      console.log("[SchedulerSkill] 已关闭");
    },
  };
}
