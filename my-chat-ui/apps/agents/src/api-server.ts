/**
 * Standalone API Server for Skills Management
 * 独立运行的API服务器，供前端管理Skills
 *
 * 启动方式: pnpm tsx src/api-server.ts
 */

import "dotenv/config";
import { createAPIServer } from "./routes/index.js";
import { startHotReload, stopHotReload } from "./routes/hot-reload.js";
import { initializeSkillManager } from "./skills/index.js";

const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 8889;
const ENABLE_HOT_RELOAD = false;

console.log("[API Server] Starting...");
console.log(`[API Server] Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`[API Server] Hot Reload: ${ENABLE_HOT_RELOAD ? "enabled" : "disabled"}`);

await initializeSkillManager();
console.log("[API Server] Skill manager initialized");

const server = createAPIServer(PORT);

// 启动热重载
if (ENABLE_HOT_RELOAD) {
  startHotReload({
    onReload: () => {
      console.log("[API Server] Skills reloaded successfully");
    },
    onError: (error) => {
      console.error("[API Server] Hot reload error:", error);
    },
  });
}

// 优雅关闭
process.on("SIGINT", () => {
  console.log("\n[API Server] Shutting down...");
  stopHotReload();
  server.close(() => {
    console.log("[API Server] Closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n[API Server] Shutting down...");
  stopHotReload();
  server.close(() => {
    console.log("[API Server] Closed");
    process.exit(0);
  });
});
