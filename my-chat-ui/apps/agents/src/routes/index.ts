/**
 * HTTP Routes for Agent API
 * 提供RESTful API供前端调用
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import {
  getSkills,
  createSkill,
  deleteSkill,
  updateSkill,
  uploadSkill,
  getRemoteSkills,
  downloadRemoteSkill,
  handleCors,
} from "./skills.js";
import { getHotReloadManager } from "./hot-reload.js";
import {
  getTasks,
  createTask,
  deleteTask as deleteSchedulerTask,
  triggerTask,
  pauseTask,
  resumeTask,
  getStats,
  startSchedulerProcess,
  getConfig,
  updateConfig,
  getTaskHistory,
} from "./scheduler.js";
import { addSSEClient, broadcast } from "../services/notification-hub.js";
import { formatFeishuMessage, sendFeishuMessage } from "../services/feishu.js";

// 路由配置
const routes: Array<{
  method: string;
  pattern: RegExp;
  handler: (req: IncomingMessage, res: ServerResponse, params?: string) => Promise<void>;
}> = [
  // Skills API
  { method: "GET", pattern: /^\/api\/skills$/, handler: (req, res, id) => getSkills(req, res, id) },
  { method: "POST", pattern: /^\/api\/skills$/, handler: createSkill },
  { method: "DELETE", pattern: /^\/api\/skills$/, handler: (req, res) => deleteSkill(req, res, "") },
  { method: "PATCH", pattern: /^\/api\/skills$/, handler: updateSkill },
  { method: "POST", pattern: /^\/api\/skills\/upload$/, handler: uploadSkill },
  { method: "GET", pattern: /^\/api\/skills\/remote$/, handler: getRemoteSkills },
  { method: "POST", pattern: /^\/api\/skills\/remote$/, handler: downloadRemoteSkill },
  // Hot Reload API
  {
    method: "POST",
    pattern: /^\/api\/reload$/,
    handler: async (_req, res) => {
      try {
        const manager = getHotReloadManager();
        await manager.reload();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Reloaded successfully" }));
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: String(error) }));
      }
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/reload\/status$/,
    handler: async (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          hotReload: !!getHotReloadManager(),
        })
      );
    },
  },
  // Scheduler API
  { method: "GET", pattern: /^\/api\/scheduler\/tasks$/, handler: getTasks },
  { method: "POST", pattern: /^\/api\/scheduler\/tasks$/, handler: createTask },
  { method: "DELETE", pattern: /^\/api\/scheduler\/tasks\/(.+)$/, handler: deleteSchedulerTask },
  { method: "POST", pattern: /^\/api\/scheduler\/tasks\/(.+)\/trigger$/, handler: triggerTask },
  { method: "POST", pattern: /^\/api\/scheduler\/tasks\/(.+)\/pause$/, handler: pauseTask },
  { method: "POST", pattern: /^\/api\/scheduler\/tasks\/(.+)\/resume$/, handler: resumeTask },
  { method: "GET", pattern: /^\/api\/scheduler\/stats$/, handler: getStats },
  { method: "GET", pattern: /^\/api\/scheduler\/config$/, handler: getConfig },
  { method: "POST", pattern: /^\/api\/scheduler\/config$/, handler: updateConfig },
  { method: "GET", pattern: /^\/api\/scheduler\/tasks\/(.+)\/history$/, handler: getTaskHistory },
  // Notification API
  {
    method: "GET",
    pattern: /^\/api\/notifications\/stream$/,
    handler: async (_req, res) => {
      addSSEClient(res);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/notifications\/webhook$/,
    handler: async (req, res) => {
      try {
        let bodyStr = "";
        req.on("data", (chunk: Buffer) => { bodyStr += chunk.toString("utf-8"); });
        req.on("end", async () => {
          const body = JSON.parse(bodyStr);
          console.log("[Notification] Webhook received:", body);

          // Broadcast to SSE clients
          broadcast({
            type: "task_result",
            taskName: body.task_name || body.taskName,
            status: body.status,
            result: body.result,
            error: body.error,
            durationMs: body.duration_ms,
            receivedAt: new Date().toISOString(),
          });

          // Send to Feishu
          const receiveId = process.env.FEISHU_RECEIVE_ID;
          const receiveIdType = process.env.FEISHU_RECEIVE_ID_TYPE || "open_id";
          if (receiveId) {
            try {
              const message = formatFeishuMessage(body);
              console.log("[Notification] Sending Feishu message to", receiveIdType, receiveId);
              const feishuOk = await sendFeishuMessage(receiveId, receiveIdType, message);
              if (feishuOk) {
                console.log("[Notification] Feishu message sent successfully");
              } else {
                console.error("[Notification] Feishu message failed (returned false)");
              }
            } catch (e) {
              console.error("[Notification] Feishu send threw error:", e);
            }
          } else {
            console.log("[Notification] FEISHU_RECEIVE_ID not set, skipping Feishu");
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        });
      } catch (error) {
        console.error("[Notification] Webhook processing error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: String(error) }));
      }
    },
  },
];

// 处理请求
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // 处理 CORS - 为所有请求添加 CORS 头
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 处理 Skills CORS
  if (handleCors(req, res)) return;

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || "GET";

  console.log(`[API] ${method} ${pathname}`);

  // 查找匹配的路由
  for (const route of routes) {
    if (route.method === method) {
      const match = pathname.match(route.pattern);
      if (match) {
        try {
          // 提取路径参数
          const pathParam = match[1] || url.searchParams.get("id") || undefined;
          await route.handler(req, res, pathParam);
          return;
        } catch (error) {
          console.error("[API] Error handling request:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: String(error) }));
          return;
        }
      }
    }
  }

  // 404 处理
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: "Not found" }));
}

// 创建服务器
export function createAPIServer(port: number = 8889) {
  const server = createServer(handleRequest);

  server.listen(port, () => {
    console.log(`[API Server] Running on http://localhost:${port}`);
    console.log(`[API Server] Skills API available at http://localhost:${port}/api/skills`);
    console.log(`[API Server] Scheduler API available at http://localhost:${port}/api/scheduler`);

    // 启动调度器进程
    startSchedulerProcess();
  });

  return server;
}

export default createAPIServer;
