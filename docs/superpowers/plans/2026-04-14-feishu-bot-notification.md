# 飞书 Bot 任务通知同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI Scheduler 定时任务执行完成后，实时将结果同步推送到 Web 前端（SSE）和飞书 Bot。

**Architecture:** Python MCP 在任务执行后通过 webhook 回调 Agents api-server；Agents 维护 SSE 客户端并向所有在线前端推送，同时调用飞书自建应用 API 发消息。

**Tech Stack:** TypeScript (Node HTTP + SSE), Python (MCP webhook), React (EventSource), 飞书开放平台 API

---

## File Structure

| File | Responsibility |
|------|----------------|
| `ai-scheduler-skill/src/scheduler_skill/mcp/server.py` | MCP 创建任务时注入 `webhook_url` 到 `TaskConfig` |
| `my-chat-ui/apps/agents/src/services/notification-hub.ts` | SSE 客户端管理 + 消息广播 |
| `my-chat-ui/apps/agents/src/services/feishu.ts` | 飞书 tenant_access_token 获取与消息发送 |
| `my-chat-ui/apps/agents/src/routes/index.ts` | 注册 `GET /api/notifications/stream` 和 `POST /api/notifications/webhook` 路由 |
| `my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx` | 前端 EventSource 连接 + toast 展示 |

---

## Task 1: Python MCP 注入 webhook_url

**Files:**
- Modify: `ai-scheduler-skill/src/scheduler_skill/mcp/server.py`

- [ ] **Step 0: Verify exact locations in server.py**

  Run:
  ```bash
  grep -n "def _handle_schedule_cron\|def _handle_schedule_heartbeat\|TaskConfig(" ai-scheduler-skill/src/scheduler_skill/mcp/server.py
  ```
  Expected: you should see `_handle_schedule_cron` and `_handle_schedule_heartbeat` function definitions, each containing a `TaskConfig(...)` call. Locate those `TaskConfig(...)` calls inside the two functions for the edits below. `import os` is already present at the top of the file.

- [ ] **Step 1: Modify `_handle_schedule_cron` 注入 webhook_url**

  在 `_handle_schedule_cron` 内的 `TaskConfig(...)` 调用中加入 `webhook_url=os.getenv("AGENTS_WEBHOOK_URL")`：

  ```python
  config = TaskConfig(
      name=args["name"],
      mode=ScheduleMode.CRON,
      prompt=args["prompt"],
      cron=CronConfig(
          schedule=args["schedule"],
          timezone=args.get("timezone", "UTC")
      ),
      model=ModelConfig(model=args.get("model") or self.scheduler.config.default_model.model),
      description=args.get("description"),
      webhook_url=os.getenv("AGENTS_WEBHOOK_URL"),
  )
  ```

- [ ] **Step 2: Modify `_handle_schedule_heartbeat` 注入 webhook_url**

  在 `config = TaskConfig(...)` 调用中加入 `webhook_url=os.getenv("AGENTS_WEBHOOK_URL")`：

  ```python
  config = TaskConfig(
      name=args["name"],
      mode=ScheduleMode.HEARTBEAT,
      heartbeat=HeartbeatConfig(
          interval=args["interval"],
          speak_conditions=[args.get("speak_condition", "has_alert")],
          silent_hours=tuple(args.get("silent_hours", [23, 7])),
      ),
      webhook_url=os.getenv("AGENTS_WEBHOOK_URL"),
  )
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add ai-scheduler-skill/src/scheduler_skill/mcp/server.py
  git commit -m "feat(mcp): inject AGENTS_WEBHOOK_URL into TaskConfig for cron and heartbeat"
  ```

---

## Task 2: Agents Node 通知中心 (notification-hub.ts)

**Files:**
- Create: `my-chat-ui/apps/agents/src/services/notification-hub.ts`
- Test: `my-chat-ui/apps/agents/src/services/notification-hub.test.ts`

- [ ] **Step 1: Write failing test for notification hub**

  Create `my-chat-ui/apps/agents/src/services/notification-hub.test.ts`:

  ```typescript
  import { describe, it, expect, vi } from "vitest";
  import { addSSEClient, removeSSEClient, broadcast, getClientCount } from "./notification-hub.js";

  describe("notification-hub", () => {
    it("should add and remove clients", () => {
      const res = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
      const id = addSSEClient(res);
      expect(getClientCount()).toBe(1);
      removeSSEClient(id);
      expect(getClientCount()).toBe(0);
    });

    it("should broadcast to all clients", () => {
      const res1 = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
      const res2 = { write: vi.fn(), end: vi.fn(), on: vi.fn() } as any;
      addSSEClient(res1);
      addSSEClient(res2);
      broadcast({ type: "task_result", taskName: "test" });
      expect(res1.write).toHaveBeenCalled();
      expect(res2.write).toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd my-chat-ui/apps/agents && npx vitest run src/services/notification-hub.test.ts`
  Expected: FAIL with module not found

- [ ] **Step 3: Implement notification-hub.ts**

  Create `my-chat-ui/apps/agents/src/services/notification-hub.ts`:

  ```typescript
  import { ServerResponse } from "http";

  interface Notification {
    id?: string;
    type: string;
    [key: string]: any;
  }

  const clients = new Map<string, ServerResponse>();
  let clientIdCounter = 0;

  export function addSSEClient(res: ServerResponse): string {
    const id = `sse-${++clientIdCounter}`;
    clients.set(id, res);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    res.on("close", () => {
      clients.delete(id);
      console.log(`[NotificationHub] Client ${id} disconnected, remaining: ${clients.size}`);
    });

    console.log(`[NotificationHub] Client ${id} connected, total: ${clients.size}`);
    return id;
  }

  export function removeSSEClient(id: string): void {
    const res = clients.get(id);
    if (res) {
      res.end();
      clients.delete(id);
    }
  }

  export function broadcast(notification: Notification): void {
    if (clients.size === 0) return;
    const payload = `data: ${JSON.stringify({ ...notification, id: notification.id || `${Date.now()}-${Math.random().toString(36).slice(2)}` })}\n\n`;
    for (const [id, res] of clients) {
      try {
        res.write(payload);
      } catch (e) {
        console.error(`[NotificationHub] Failed to write to client ${id}:`, e);
        clients.delete(id);
      }
    }
  }

  export function getClientCount(): number {
    return clients.size;
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd my-chat-ui/apps/agents && npx vitest run src/services/notification-hub.test.ts`
  Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add my-chat-ui/apps/agents/src/services/notification-hub.ts
  git add my-chat-ui/apps/agents/src/services/notification-hub.test.ts
  git commit -m "feat(agents): add notification hub with SSE client management"
  ```

---

## Task 3: 飞书服务 (feishu.ts)

**Files:**
- Create: `my-chat-ui/apps/agents/src/services/feishu.ts`
- Test: `my-chat-ui/apps/agents/src/services/feishu.test.ts`

- [ ] **Step 1: Write failing test for feishu token formatting**

  Create `my-chat-ui/apps/agents/src/services/feishu.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { formatFeishuMessage } from "./feishu.js";

  describe("feishu", () => {
    it("should format task success message", () => {
      const msg = formatFeishuMessage({
        task_name: "早报",
        status: "success",
        result: "今天晴",
        duration_ms: 1200,
      });
      expect(msg).toContain("早报");
      expect(msg).toContain("今天晴");
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `cd my-chat-ui/apps/agents && npx vitest run src/services/feishu.test.ts`
  Expected: FAIL with module not found

- [ ] **Step 3: Implement feishu.ts**

  Create `my-chat-ui/apps/agents/src/services/feishu.ts`:

  ```typescript
  interface TaskNotification {
    task_name: string;
    status: string;
    result?: string;
    error?: string;
    duration_ms?: number;
  }

  let cachedToken: { token: string; expiresAt: number } | null = null;

  export function formatFeishuMessage(notification: TaskNotification): string {
    const statusEmoji = notification.status === "success" ? "✅" : notification.status === "failed" ? "❌" : "⚠️";
    const durationText = notification.duration_ms ? `（耗时 ${(notification.duration_ms / 1000).toFixed(2)}s）` : "";
    const content = notification.result || notification.error || "无输出";
    return `${statusEmoji} 任务「${notification.task_name}」执行完成 ${durationText}\n\n${content}`;
  }

  export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string | null> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60000) {
      return cachedToken.token;
    }

    try {
      const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        console.error("[Feishu] Failed to get token:", data);
        return null;
      }
      cachedToken = {
        token: data.tenant_access_token,
        expiresAt: now + data.expire * 1000,
      };
      return cachedToken.token;
    } catch (e) {
      console.error("[Feishu] Token fetch error:", e);
      return null;
    }
  }

  export async function sendFeishuMessage(
    receiveId: string,
    receiveIdType: string,
    content: string
  ): Promise<boolean> {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      console.warn("[Feishu] Missing FEISHU_APP_ID or FEISHU_APP_SECRET, skipping message");
      return false;
    }

    const token = await getTenantAccessToken(appId, appSecret);
    if (!token) return false;

    try {
      const res = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=" + encodeURIComponent(receiveIdType), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: "text",
          content: JSON.stringify({ text: content }),
        }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        console.error("[Feishu] Send message failed:", data);
        return false;
      }
      console.log("[Feishu] Message sent successfully");
      return true;
    } catch (e) {
      console.error("[Feishu] Send message error:", e);
      return false;
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `cd my-chat-ui/apps/agents && npx vitest run src/services/feishu.test.ts`
  Expected: PASS (1 test)

- [ ] **Step 5: Create .env.example template**

  Create `my-chat-ui/apps/agents/.env.example`：

  ```bash
  # Scheduler Notification Webhook
  AGENTS_WEBHOOK_URL=http://localhost:8890/api/notifications/webhook

  # Feishu Bot Credentials
  FEISHU_APP_ID=your_app_id
  FEISHU_APP_SECRET=your_app_secret
  FEISHU_RECEIVE_ID=your_receive_id
  FEISHU_RECEIVE_ID_TYPE=open_id
  ```

  ```bash
  git add my-chat-ui/apps/agents/.env.example
  git commit -m "docs: add Feishu notification env vars template"
  ```

- [ ] **Step 6: Commit feishu service**

  ```bash
  git add my-chat-ui/apps/agents/src/services/feishu.ts
  git add my-chat-ui/apps/agents/src/services/feishu.test.ts
  git commit -m "feat(agents): add Feishu bot integration with token caching"
  ```

---

## Task 4: Agents 路由注册 SSE + Webhook

**Files:**
- Modify: `my-chat-ui/apps/agents/src/routes/index.ts`

- [ ] **Step 0: Verify routing structure**

  Read the first 90 lines of `my-chat-ui/apps/agents/src/routes/index.ts` to confirm it contains a `const routes = [...]` array where each element has `method`, `pattern` (RegExp), and `handler` fields. The existing Scheduler API routes end around line 86.

- [ ] **Step 1: Import services and add routes**

  在 `my-chat-ui/apps/agents/src/routes/index.ts` 顶部增加 import：

  ```typescript
  import { addSSEClient, broadcast } from "../services/notification-hub.js";
  import { formatFeishuMessage, sendFeishuMessage } from "../services/feishu.js";
  ```

  在 `routes` 数组末尾（Scheduler API 之后）追加：

  ```typescript
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
            const message = formatFeishuMessage(body);
            await sendFeishuMessage(receiveId, receiveIdType, message);
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
  ```

- [ ] **Step 2: Manual smoke test**

  1. 确认构建输出存在：`ls my-chat-ui/apps/agents/dist/api-server.js`（若不存在，先运行 `cd my-chat-ui/apps/agents && pnpm build`）
  2. 启动 api-server：`cd my-chat-ui/apps/agents && API_PORT=8890 node dist/api-server.js`
  3. 另一个终端连接 SSE：`curl -N http://localhost:8890/api/notifications/stream`
  4. 再开一个终端发送 webhook：`curl -X POST http://localhost:8890/api/notifications/webhook -H "Content-Type: application/json" -d '{"task_name":"test","status":"success","result":"hello","duration_ms":1200}'`
  5. 期望：SSE 终端收到 `data: {...}` 行

- [ ] **Step 3: Commit**

  ```bash
  git add my-chat-ui/apps/agents/src/routes/index.ts
  git commit -m "feat(agents): register notification SSE and webhook routes"
  ```

---

## Task 5: Web 前端 SSE 连接与 Toast 展示

**Files:**
- Modify: `my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx`

- [ ] **Step 1: Add SSE connection logic with useRef deduplication**

  确认 `SchedulerPanel.tsx` 已导入 `useRef` 和 `toast`（当前文件已有 `import { toast } from "sonner"` 和 React hooks，通常只需把 `useRef` 加到现有的 `react` import 中）：

  ```typescript
  import { useState, useEffect, useCallback, useRef } from "react";
  // toast 已由 "sonner" 导入，无需额外改动
  ```

  在组件内添加（SSE URL 复用已有的 `API_BASE_URL`，避免硬编码端口不一致）：

  ```typescript
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sseUrl = `${API_BASE_URL.replace("/api", "")}/api/notifications/stream`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") return;
        if (data.id && seenIdsRef.current.has(data.id)) return;

        if (data.id) {
          seenIdsRef.current.add(data.id);
        }

        if (data.type === "task_result") {
          const statusEmoji = data.status === "success" ? "✅" : data.status === "failed" ? "❌" : "⚠️";
          const durationText = data.durationMs ? `（${(data.durationMs / 1000).toFixed(2)}s）` : "";
          toast(`${statusEmoji} 任务「${data.taskName}」执行完成 ${durationText}`, {
            description: data.result || data.error || "无输出",
            duration: 6000,
          });
        }
      } catch (e) {
        console.error("[SchedulerPanel] Failed to parse SSE message:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("[SchedulerPanel] SSE error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, []);
  ```

- [ ] **Step 2: Build and verify**

  Run: `cd my-chat-ui/apps/web && pnpm build`
  Expected: Build succeeds with no new TypeScript errors

- [ ] **Step 3: Commit**

  ```bash
  git add my-chat-ui/apps/web/src/components/scheduler/SchedulerPanel.tsx
  git commit -m "feat(web): connect to notification SSE and show task results in toast"
  ```

---

## Task 6: 集成测试（端到端验证）

**Files:**
- N/A (manual integration test)

- [ ] **Step 1: 配置环境变量**

  复制模板并填入真实凭据：

  ```bash
  cd my-chat-ui/apps/agents
  cp .env.example .env
  # 编辑 .env，将占位符替换为真实值
  ```

  确保 `.env` 文件包含（值由你本地环境提供，不写入代码仓库）：
  - `AGENTS_WEBHOOK_URL`
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_RECEIVE_ID`
  - `FEISHU_RECEIVE_ID_TYPE`

- [ ] **Step 2: 构建并启动完整链路**

  1. 重新编译 agents：`cd my-chat-ui/apps/agents && pnpm build`
  2. 启动 api-server：`cd my-chat-ui/apps/agents && API_PORT=8889 node dist/api-server.js`（MCP Python 进程会由 `startSchedulerProcess()` 自动拉起，无需手动启动）
  3. 启动 web：`cd my-chat-ui && pnpm dev`

- [ ] **Step 3: 触发测试任务**

  通过 web 创建或手动触发一个定时任务（如早报），等待其执行完成。

- [ ] **Step 4: 验证三个端点**

  - Web 前端：toast 弹出任务执行结果
  - 飞书：配置的接收用户收到文本消息
  - api-server 日志：出现 `[Notification] Webhook received:` 和 `[Feishu] Message sent successfully`

- [ ] **Step 5: 确认无 secrets 被意外提交**

  ```bash
  git status
  # 确保 .env 不在 staged 列表中
  ```

---

## Task 7: 清理与收尾

- [ ] **Step 1: 确保 `.env` 在 `.gitignore` 中**

  Run:
  ```bash
  cd my-chat-ui/apps/agents && (grep -q "^\.env" .gitignore || echo ".env" >> .gitignore) && (grep -q "^\.env\.local" .gitignore || echo ".env.local" >> .gitignore)
  ```

- [ ] **Step 2: 运行全部 agents 测试**

  Run: `cd my-chat-ui/apps/agents && npx vitest run src/services/`
  Expected: All PASS

- [ ] **Step 3: Final commit**

  ```bash
  git status
  # Ensure no secrets staged
  git commit -m "feat: integrate Feishu bot notifications for scheduler task results"
  ```
