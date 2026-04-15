# 飞书 Bot 任务通知同步设计

## 目标（方案 A - MVP）
实现定时任务（AI Scheduler）执行完成后，实时将执行结果同步推送到：
1. Web 前端（通过 SSE 实时流）
2. 飞书 Bot（企业自建应用）

**范围限定**：不包含飞书 bot 作为完整对话界面，仅做任务执行后的单向通知同步。

---

## 架构

```
Python MCP (ai-scheduler-skill)
   │
   │ 任务执行完成后
   ▼
POST webhook ──► Agents api-server (8890)
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
      SSE 流      飞书 Bot API    （预留：其他推送）
        │
        ▼
   Web Frontend (SchedulerPanel)
```

---

## 组件与改动点

### 1. Python MCP 侧（ai-scheduler-skill）
- **文件**：`src/scheduler_skill/mcp/server.py`
- **改动**：在 `_handle_schedule_cron` 和 `_handle_schedule_heartbeat` 创建 `TaskConfig` 时，注入 `webhook_url`（读取环境变量 `AGENTS_WEBHOOK_URL`）。
- **说明**：`scheduler.py` 已内置 `_send_webhook` 和 `TaskConfig.webhook_url` 字段，只需确保创建时赋值即可。

### 2. Agents Node 侧（my-chat-ui/apps/agents）
- **新增 `src/services/notification-hub.ts`**
  - 维护 SSE 客户端连接列表（`Map<string, ServerResponse>`）
  - 提供 `addSSEClient(res)`、`removeSSEClient(id)`、`broadcast(notification)`
  - 每次 MCP webhook 到达时，向所有在线 SSE 客户端推送 JSON 消息

- **新增 `src/services/feishu.ts`**
  - `getTenantAccessToken(appId, appSecret)`：调用飞书开放平台 `auth/v3/tenant_access_token/internal`，带内存缓存（按 expires_in 复用）
  - `sendMessage(receiveId, receiveIdType, content)`：调用 `im.v1/message` 发送文本消息
  - 所有凭据通过环境变量注入，代码中不留任何明文

- **修改 `src/routes/index.ts`（或直接在 `api-server.ts` 挂载）**
  - `GET /api/notifications/stream`：SSE 端点，返回 `text/event-stream`，保持长连接。EventSource 默认自动重连，前端收到消息后应通过 `notification.id` 做去重，避免重复 toast
  - `POST /api/notifications/webhook`：接收 MCP webhook，解析后同时调用 `broadcast()` 和 `sendFeishuMessage()`

### 3. Web 前端（my-chat-ui/apps/web）
- **修改 `src/components/scheduler/SchedulerPanel.tsx`**
  - 组件 `useEffect` 中创建 `EventSource('http://localhost:8890/api/notifications/stream')`
  - 监听 `message` 事件，使用 `toast` 展示任务执行结果（任务名、状态、耗时、摘要）
  - 组件卸载时 `eventSource.close()`

### 4. 配置（环境变量）
所有敏感信息均通过环境变量注入，不落入代码仓库：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `AGENTS_WEBHOOK_URL` | MCP 回调 Agents 的 webhook URL | `http://localhost:8890/api/notifications/webhook` |
| `FEISHU_APP_ID` | 飞书自建应用 App ID | `cli_xxx` |
| `FEISHU_APP_SECRET` | 飞书自建应用 App Secret | 仅通过环境变量注入 |
| `FEISHU_RECEIVE_ID` | 接收者的 open_id / chat_id | 仅通过环境变量注入 |
| `FEISHU_RECEIVE_ID_TYPE` | 接收者类型 | `open_id`（默认）或 `chat_id` |

---

## 数据流示例

1. **任务触发** → MCP `_execute_task` 完成早报生成
2. **MCP** `await self._send_webhook(AGENTS_WEBHOOK_URL, execution_result)`，`execution_result` 中已包含 `duration_ms`（由 `_execute_task` 计算）
3. **Agents** `POST /api/notifications/webhook` 收到：
   ```json
   {
     "task_name": "morning-briefing",
     "status": "success",
     "result": "今天天气晴朗，适宜出行。",
     "duration_ms": 2300
   }
   ```
4. **Agents** 同时执行：
   - `broadcast({ type: "task_result", ... })` 给所有 SSE 客户端
   - `sendFeishuMessage("✅ 晨报任务执行完成\n今天天气晴朗，适宜出行。")`
5. **Web 端** toast 弹出通知；**飞书** 用户收到消息

---

## 错误处理

| 场景 | 策略 |
|------|------|
| MCP webhook 发送失败 | 只打印 error log，不重试，不阻塞任务执行 |
| 飞书 token 获取失败 | SSE 仍正常广播；飞书消息丢弃并记录日志 |
| SSE 客户端断网/关闭 | `res.on('close')` 自动从列表移除 |
| 飞书 API 限流/返回非 200 | 打印返回体，本次不重试 |

---

## 安全与扩展性

- **凭据隔离**：`FEISHU_APP_SECRET`、`FEISHU_RECEIVE_ID` 绝不写入代码或设计文档，仅通过环境变量注入。
- **扩展接口**：`notification-hub.ts` 的 `broadcast()` 为预留接口，后续可轻松接入 WebSocket、邮件、短信等通道。
- **向后兼容**：如果环境变量未配置，SSE 端点仍然可用，飞书发送逻辑优雅降级（跳过并 warn）。

---

## 后续可选扩展（超出 MVP）

- 在 Scheduler 设置面板中增加"飞书接收 ID"输入框，支持前端动态配置
- 将飞书 bot 升级为完整对话界面（双向对话、调用 tools、管理任务）
