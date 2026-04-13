/**
 * Hot Reload Manager
 * 监听 Skill 文件变化并自动重启 LangGraph
 */

import { spawn } from "child_process";
import { watch, FSWatcher } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_DIR = path.join(__dirname, "../skills");

interface HotReloadOptions {
  langgraphPort?: number;
  onReload?: () => void;
  onError?: (error: Error) => void;
}

export class HotReloadManager {
  private watcher: FSWatcher | null = null;
  private isReloading = false;
  private options: HotReloadOptions;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(options: HotReloadOptions = {}) {
    this.options = {
      langgraphPort: 2024,
      ...options,
    };
  }

  /**
   * 启动文件监听
   */
  startWatching() {
    console.log("[HotReload] Starting file watcher...");
    console.log(`[HotReload] Watching: ${SKILLS_DIR}`);

    this.watcher = watch(
      SKILLS_DIR,
      { recursive: true, persistent: true },
      (eventType, filename) => {
        if (!filename) return;

        // 只监听 .ts 和 .json 文件
        if (!filename.endsWith(".ts") && !filename.endsWith(".json")) return;

        console.log(`[HotReload] File changed: ${filename} (${eventType})`);

        // 防抖处理，避免频繁重启
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
          this.reload();
        }, 1000);
      }
    );

    // 监听错误
    this.watcher.on("error", (error) => {
      console.error("[HotReload] Watcher error:", error);
      this.options.onError?.(error);
    });
  }

  /**
   * 执行热重载
   */
  async reload() {
    if (this.isReloading) {
      console.log("[HotReload] Already reloading, skipping...");
      return;
    }

    this.isReloading = true;
    console.log("[HotReload] Reloading...");

    try {
      // 1. 重新构建 agents 项目
      await this.rebuild();

      // 2. 通知回调
      this.options.onReload?.();

      console.log("[HotReload] Reload complete!");
    } catch (error) {
      console.error("[HotReload] Reload failed:", error);
      this.options.onError?.(error as Error);
    } finally {
      this.isReloading = false;
    }
  }

  /**
   * 重新构建项目
   */
  private rebuild(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log("[HotReload] Rebuilding...");

      const buildProcess = spawn("pnpm", ["run", "build:internal"], {
        cwd: path.join(__dirname, ".."),
        stdio: "pipe",
        shell: true,
      });

      let output = "";
      buildProcess.stdout?.on("data", (data) => {
        output += data.toString();
      });

      buildProcess.stderr?.on("data", (data) => {
        output += data.toString();
      });

      buildProcess.on("close", (code) => {
        if (code === 0) {
          console.log("[HotReload] Build successful");
          resolve();
        } else {
          reject(new Error(`Build failed with code ${code}\n${output}`));
        }
      });

      buildProcess.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * 停止监听
   */
  stop() {
    console.log("[HotReload] Stopping watcher...");
    this.watcher?.close();
    this.watcher = null;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

// 单例实例
let hotReloadManager: HotReloadManager | null = null;

export function getHotReloadManager(options?: HotReloadOptions): HotReloadManager {
  if (!hotReloadManager) {
    hotReloadManager = new HotReloadManager(options);
  }
  return hotReloadManager;
}

export function startHotReload(options?: HotReloadOptions) {
  const manager = getHotReloadManager(options);
  manager.startWatching();
  return manager;
}

export function stopHotReload() {
  hotReloadManager?.stop();
  hotReloadManager = null;
}
