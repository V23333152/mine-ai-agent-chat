/**
 * Skill Manager
 * 统一管理和加载 Skills
 */

import { StructuredTool } from "@langchain/core/tools";
import {
  Skill,
  SkillRegistration,
  SkillRegistry,
  SkillManagerState,
} from "./types.js";
import { createAmapSkill } from "./amap-lbs/index.js";
import { createWeatherSkill } from "./weather/index.js";
import { createSchedulerSkill } from "./scheduler/index.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REGISTRY_FILE = path.join(__dirname, "registry.json");

// Skill 工厂注册表
const skillFactories: Record<string, (config?: Record<string, any>) => Promise<Skill>> = {
  "amap-lbs": createAmapSkill,
  "weather": createWeatherSkill,
  "ai-scheduler": createSchedulerSkill,
};

// 状态
const state: SkillManagerState = {
  skills: new Map(),
  registry: { version: 1, skills: {} },
  isInitialized: false,
};

// Skill 加载完成后的回调列表
const onSkillLoadedCallbacks: Array<() => void> = [];

/**
 * 注册 Skill 加载完成回调
 */
export function onSkillLoaded(callback: () => void): void {
  onSkillLoadedCallbacks.push(callback);
}

/**
 * 触发 Skill 加载完成回调
 */
function notifySkillLoaded(): void {
  for (const callback of onSkillLoadedCallbacks) {
    try {
      callback();
    } catch (e) {
      console.error("[SkillManager] Skill loaded callback error:", e);
    }
  }
}

/**
 * 从文件加载注册表
 */
async function loadRegistryFromFile(): Promise<SkillRegistry> {
  try {
    const data = await fs.readFile(REGISTRY_FILE, "utf-8");
    const registry = JSON.parse(data);
    console.log("[SkillManager] Loaded registry from file:", REGISTRY_FILE);
    return registry;
  } catch (error) {
    console.log("[SkillManager] No registry file found, using default");
    return createDefaultRegistry();
  }
}

/**
 * 保存注册表到文件
 */
async function saveRegistryToFile(): Promise<void> {
  try {
    await fs.writeFile(REGISTRY_FILE, JSON.stringify(state.registry, null, 2));
  } catch (error) {
    console.error("[SkillManager] Failed to save registry:", error);
  }
}

/**
 * 初始化 Skill 管理器
 */
export async function initializeSkillManager(registry?: SkillRegistry): Promise<void> {
  if (state.isInitialized) {
    console.log("[SkillManager] Already initialized");
    return;
  }

  console.log("[SkillManager] Initializing...");

  // 加载注册表（优先从文件加载）
  if (registry) {
    state.registry = registry;
  } else {
    state.registry = await loadRegistryFromFile();
  }

  // 加载所有启用的 Skills
  for (const [id, registration] of Object.entries(state.registry.skills)) {
    if (registration.enabled) {
      try {
        await loadSkill(id, registration.config);
      } catch (error) {
        console.error(`[SkillManager] Failed to load skill ${id}:`, error);
        registration.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  state.isInitialized = true;
  console.log(`[SkillManager] Initialized with ${state.skills.size} skills`);
}

/**
 * 创建默认注册表
 */
function createDefaultRegistry(): SkillRegistry {
  return {
    version: 1,
    skills: {
      "amap-lbs": {
        id: "amap-lbs",
        path: "./amap-lbs",
        enabled: !!process.env.AMAP_WEBSERVICE_KEY,
        config: {
          apiKey: process.env.AMAP_WEBSERVICE_KEY,
        },
      },
      "weather": {
        id: "weather",
        path: "./weather",
        enabled: false, // 需要配置天气 API Key
        config: {},
      },
      "ai-scheduler": {
        id: "ai-scheduler",
        path: "./scheduler",
        enabled: true, // 默认启用
        config: {
          apiKey: process.env.MOONSHOT_API_KEY,
          defaultModel: "moonshot-v1-8k",
          notifyUIEnabled: true,
        },
      },
    },
  };
}

/**
 * 加载单个 Skill
 */
export async function loadSkill(
  skillId: string,
  config?: Record<string, any>
): Promise<Skill | null> {
  console.log(`[SkillManager] loadSkill called for ${skillId}`);

  // 检查是否已加载
  if (state.skills.has(skillId)) {
    console.log(`[SkillManager] Skill ${skillId} already loaded`);
    return state.skills.get(skillId)!;
  }

  // 获取 factory
  const factory = skillFactories[skillId];
  if (!factory) {
    console.error(`[SkillManager] No factory found for skill ${skillId}`);
    console.error(`[SkillManager] Available factories:`, Object.keys(skillFactories));
    return null;
  }
  console.log(`[SkillManager] Found factory for ${skillId}`);

  try {
    console.log(`[SkillManager] Loading skill ${skillId} with config:`, config);
    const skill = await factory(config);

    // 执行初始化钩子
    if (skill.initialize) {
      const success = await skill.initialize(config || {});
      if (!success) {
        console.error(`[SkillManager] Skill ${skillId} initialization failed`);
        return null;
      }
    }

    state.skills.set(skillId, skill);
    console.log(`[SkillManager] Skill ${skillId} loaded successfully with ${skill.tools.length} tools`);

    // 触发加载完成回调
    notifySkillLoaded();

    return skill;
  } catch (error) {
    console.error(`[SkillManager] Failed to load skill ${skillId}:`, error);
    throw error;
  }
}

/**
 * 卸载 Skill
 */
export async function unloadSkill(skillId: string): Promise<void> {
  const skill = state.skills.get(skillId);
  if (!skill) {
    console.log(`[SkillManager] Skill ${skillId} not loaded`);
    return;
  }

  // 执行销毁钩子
  if (skill.destroy) {
    await skill.destroy();
  }

  state.skills.delete(skillId);
  console.log(`[SkillManager] Skill ${skillId} unloaded`);
}

/**
 * 获取所有已加载的 Skills
 */
export function getLoadedSkills(): Skill[] {
  return Array.from(state.skills.values());
}

/**
 * 获取所有 Tools（用于 Agent）
 */
export function getAllTools(): StructuredTool[] {
  const tools: StructuredTool[] = [];
  for (const skill of state.skills.values()) {
    if (skill.enabled) {
      tools.push(...skill.tools);
    }
  }
  return tools;
}

/**
 * 获取 Skill 状态
 */
export function getSkillStatus(): Array<{
  id: string;
  name: string;
  enabled: boolean;
  loaded: boolean;
  toolCount: number;
  error?: string;
}> {
  const result: Array<{
    id: string;
    name: string;
    enabled: boolean;
    loaded: boolean;
    toolCount: number;
    error?: string;
  }> = [];

  for (const [id, registration] of Object.entries(state.registry.skills)) {
    const skill = state.skills.get(id);
    result.push({
      id,
      name: skill?.metadata.name || id,
      enabled: registration.enabled,
      loaded: !!skill,
      toolCount: skill?.tools.length || 0,
      error: registration.error,
    });
  }

  return result;
}

/**
 * 注册新的 Skill
 */
export function registerSkill(registration: SkillRegistration): void {
  state.registry.skills[registration.id] = registration;
  console.log(`[SkillManager] Registered skill ${registration.id}`);
}

/**
 * 启用/禁用 Skill
 */
export async function setSkillEnabled(skillId: string, enabled: boolean): Promise<void> {
  const registration = state.registry.skills[skillId];
  if (!registration) {
    throw new Error(`Skill ${skillId} not registered`);
  }

  registration.enabled = enabled;

  // 保存到文件
  await saveRegistryToFile();

  if (enabled) {
    if (!state.skills.has(skillId)) {
      await loadSkill(skillId, registration.config);
    }
  } else {
    if (state.skills.has(skillId)) {
      await unloadSkill(skillId);
    }
  }
}

/**
 * 关闭 Skill 管理器
 */
export async function shutdownSkillManager(): Promise<void> {
  console.log("[SkillManager] Shutting down...");

  for (const skill of state.skills.values()) {
    if (skill.destroy) {
      await skill.destroy();
    }
  }

  state.skills.clear();
  state.isInitialized = false;
  console.log("[SkillManager] Shutdown complete");
}

/**
 * 重新加载 Skill 管理器（用于热重载）
 */
export async function reloadSkillManager(): Promise<void> {
  console.log("[SkillManager] Reloading...");

  // 先关闭所有 skill
  for (const [, skill] of state.skills.entries()) {
    if (skill.destroy) {
      await skill.destroy();
    }
  }
  state.skills.clear();

  // 重新加载注册表
  state.registry = await loadRegistryFromFile();

  // 重新加载所有启用的 Skills
  for (const [id, registration] of Object.entries(state.registry.skills)) {
    if (registration.enabled) {
      try {
        await loadSkill(id, registration.config);
      } catch (error) {
        console.error(`[SkillManager] Failed to reload skill ${id}:`, error);
        registration.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  console.log(`[SkillManager] Reloaded with ${state.skills.size} skills`);
}
