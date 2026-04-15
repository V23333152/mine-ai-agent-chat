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
