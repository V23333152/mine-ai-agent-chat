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

// 导入 scheduler 路由的函数
import {
  sendMCPRequest,
  taskCacheContainer,
  startSchedulerProcess,
  stopSchedulerProcess,
  saveTasksToFile,
} from "../../routes/scheduler.js";

// 获取 taskCache 的便捷引用
const getTaskCache = () => taskCacheContainer.tasks;

/**
 * 将自然语言时间描述转换为 Cron 表达式
 * 支持中文描述，如 "每天下午6点" -> "0 18 * * *"
 *
 * 支持格式：
 * - 每天: 每天早上8点、每天下午6点半、每天晚上10点
 * - 每周: 每周一早上8点、每周五下午6点
 * - 工作日: 工作日早上9点、工作日下午6点
 * - 周末: 周末早上10点、周日下午3点
 * - 每月: 每月1号早上9点、每月15号下午2点
 * - 间隔: 每30分钟、每2小时、每隔5分钟
 * - 组合: 每周三下午3点半、每月最后一天晚上8点
 */
function parseTimeDescription(description: string): string {
  // 标准化描述：去除空格、统一标点
  let desc = description
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[：:,，]/g, "")
    .replace(/(每隔|每)/g, "每");

  // ===== 预设模式匹配 =====
  const patterns: Record<string, string> = {
    // 每天固定时间
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
    "每天下午18点": "0 18 * * *",
    "每天晚上7点": "0 19 * * *",
    "每天晚上8点": "0 20 * * *",
    "每天晚上9点": "0 21 * * *",
    "每天晚上10点": "0 22 * * *",
    "每天晚上11点": "0 23 * * *",
    "每天凌晨0点": "0 0 * * *",
    "每天凌晨1点": "0 1 * * *",
    "每天凌晨2点": "0 2 * * *",

    // 工作日（周一到周五）
    "工作日早上8点": "0 8 * * 1-5",
    "工作日早上9点": "0 9 * * 1-5",
    "工作日上午8点": "0 8 * * 1-5",
    "工作日上午9点": "0 9 * * 1-5",
    "工作日下午6点": "0 18 * * 1-5",
    "工作日晚上7点": "0 19 * * 1-5",
    "工作日晚上8点": "0 20 * * 1-5",

    // 周末（周六、周日）
    "周末早上9点": "0 9 * * 0,6",
    "周末早上10点": "0 10 * * 0,6",
    "周末下午2点": "0 14 * * 0,6",
    "周末下午3点": "0 15 * * 0,6",
    "周末晚上8点": "0 20 * * 0,6",

    // 每周固定时间
    "每周一早上8点": "0 8 * * 1",
    "每周一早上9点": "0 9 * * 1",
    "每周一下午6点": "0 18 * * 1",
    "每周二早上8点": "0 8 * * 2",
    "每周二早上9点": "0 9 * * 2",
    "每周三早上8点": "0 8 * * 3",
    "每周三早上9点": "0 9 * * 3",
    "每周四早上8点": "0 8 * * 4",
    "每周四早上9点": "0 9 * * 4",
    "每周五早上8点": "0 8 * * 5",
    "每周五早上9点": "0 9 * * 5",
    "每周五下午6点": "0 18 * * 5",
    "每周六早上9点": "0 9 * * 6",
    "每周六早上10点": "0 10 * * 6",
    "每周日早上9点": "0 9 * * 0",
    "每周日晚上9点": "0 21 * * 0",

    // 间隔频率
    "每小时": "0 * * * *",
    "每1小时": "0 * * * *",
    "每2小时": "0 */2 * * *",
    "每3小时": "0 */3 * * *",
    "每4小时": "0 */4 * * *",
    "每6小时": "0 */6 * * *",
    "每8小时": "0 */8 * * *",
    "每12小时": "0 */12 * * *",

    // 每分钟（测试用）
    "每分钟": "* * * * *",
    "每1分钟": "* * * * *",
    "每5分钟": "*/5 * * * *",
    "每10分钟": "*/10 * * * *",
    "每15分钟": "*/15 * * * *",
    "每20分钟": "*/20 * * * *",
    "每30分钟": "*/30 * * * *",
  };

  // 尝试直接匹配
  if (patterns[desc]) {
    console.log(`[SchedulerSkill] Matched preset pattern: "${desc}" -> "${patterns[desc]}"`);
    return patterns[desc];
  }

  // ===== 智能解析 =====

  // 1. 解析 "每X分钟/小时" 格式
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

  // 2. 解析时间（支持 "X点"、"X点Y分"、"X点半"、"X点一刻"、"X点三刻"）
  let hour = -1;
  let minute = 0;

  // 匹配 "X点Y分" 或 "X点"
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

    // 处理12小时制转24小时制
    const isPM = desc.includes("下午") || desc.includes("晚上") || desc.includes("傍晚") || desc.includes("黄昏");
    const isAM = desc.includes("早上") || desc.includes("上午") || desc.includes("早晨") || desc.includes("清晨");

    if (isPM && hour < 12) {
      hour += 12;
    }
    // 处理凌晨/早上 (12点特殊情况)
    if (desc.includes("凌晨") && hour === 12) {
      hour = 0;
    }
    if (desc.includes("中午") && hour < 12) {
      hour += 12;
    }
  }

  // 3. 解析星期几（完整映射）
  const weekdayMap: Record<string, number | string> = {
    // 单天
    "周一": 1, "周二": 2, "周三": 3, "周四": 4,
    "周五": 5, "周六": 6, "周日": 0, "星期天": 0,
    "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4,
    "星期五": 5, "星期六": 6, "星期日": 0,
    // 范围
    "工作日": "1-5",
    "周末": "0,6",
    "周一到周五": "1-5",
    "周一到周日": "*",
    "周二到周四": "2-4",
  };

  let weekday: string | null = null;
  for (const [key, value] of Object.entries(weekdayMap)) {
    if (desc.includes(key)) {
      weekday = String(value);
      break;
    }
  }

  // 4. 解析每月几号
  const dayOfMonthMatch = desc.match(/每月(\d+)[号日]/);
  let dayOfMonth: string | null = null;
  if (dayOfMonthMatch) {
    dayOfMonth = dayOfMonthMatch[1];
  }
  // 每月最后一天
  if (desc.includes("每月最后一天")) {
    dayOfMonth = "L";
  }

  // 5. 解析"每隔X天"格式
  const everyXDaysMatch = desc.match(/每(\d+)天/);
  if (everyXDaysMatch && hour >= 0) {
    const days = parseInt(everyXDaysMatch[1], 10);
    // 使用特殊标记，实际应用中可能需要使用更复杂的调度
    // 这里简化为每天执行（实际应该使用 APScheduler 的 interval 触发器）
    console.log(`[SchedulerSkill] Every ${days} days detected, using daily cron as approximation`);
    return `${minute} ${hour} * * *`;
  }

  // 5. 生成 Cron 表达式
  if (hour >= 0) {
    if (dayOfMonth) {
      // 每月特定日期
      return `${minute} ${hour} ${dayOfMonth} * *`;
    } else if (weekday) {
      // 每周特定天
      return `${minute} ${hour} * * ${weekday}`;
    } else {
      // 默认每天
      return `${minute} ${hour} * * *`;
    }
  }

  // 6. 特殊时间词处理
  if (desc.includes(" sunrise ") || desc.includes("日出")) {
    return `0 6 * * *`; // 日出约6点
  }
  if (desc.includes(" sunset ") || desc.includes("日落")) {
    return `0 18 * * *`; // 日落约18点
  }
  if (desc.includes(" midnight ") || desc.includes("午夜")) {
    return `0 0 * * *`;
  }
  if (desc.includes(" noon ") || desc.includes("正午")) {
    return `0 12 * * *`;
  }

  // 无法解析，返回原值
  console.warn(`[SchedulerSkill] Could not parse time description: "${description}", passing as-is`);
  return description;
}

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
      default: "moonshot-v1-8k",
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
        async ({ name, scheduleDescription, prompt, timezone: _timezone }) => {
          // 通过 MCP 调用 Python 调度器
          try {
            console.log(`[SchedulerSkill] Creating cron task: ${name}, schedule: ${scheduleDescription}`);

            // 将自然语言转换为 cron 表达式
            const cronExpression = parseTimeDescription(scheduleDescription);
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

              return `✅ 定时任务 "${name}" 创建成功！\n\n任务ID: ${taskId}\n调度: ${scheduleDescription}\n时区: ${_timezone || "Asia/Shanghai"}\n提示词: ${prompt.substring(0, 50)}...\n\n调度器正在重启以使任务生效，请等待5秒后刷新查看。`;
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

              return `✅ 智能检查任务 "${name}" 创建成功！\n\n任务ID: ${taskId}\n检查间隔: ${checkInterval} (${intervalSeconds}秒)\n触发条件: ${speakCondition}\n\n调度器正在重启以使任务生效，请等待5秒后刷新查看。`;
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
      console.log("[SchedulerSkill] 修复内容: 1) 创建任务后自动重启调度器 2) 晨报任务不再触发新闻搜索");
      console.log("[SchedulerSkill] 当前缓存任务数:", getTaskCache().length);
      return true;
    },

    destroy: async () => {
      console.log("[SchedulerSkill] 已关闭");
    },
  };
}
