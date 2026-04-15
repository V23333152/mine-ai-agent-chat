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

// Test-only helper to reset internal state
export function __resetClients(): void {
  clients.clear();
  clientIdCounter = 0;
}
