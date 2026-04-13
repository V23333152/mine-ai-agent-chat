/**
 * Skill System Types
 * 定义 Skill 系统的核心类型接口
 */

import { StructuredTool } from "@langchain/core/tools";

/** Skill 类型 */
export type SkillType = "native" | "mcp" | "wasm" | "http";

/** Skill 配置项定义 */
export interface SkillConfigItem {
  name: string;
  type: "string" | "number" | "boolean" | "select";
  required: boolean;
  description: string;
  env?: string;  // 对应的环境变量名
  default?: any;
  options?: string[];  // 对于 select 类型
}

/** Skill 工具定义 */
export interface SkillToolDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  examples?: string[];
}

/** Skill 元数据 */
export interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  type: SkillType;
  tags?: string[];
  config?: SkillConfigItem[];
  tools?: SkillToolDefinition[];
  dependencies?: string[];
}

/** Skill 实例 */
export interface Skill {
  metadata: SkillMetadata;
  tools: StructuredTool[];
  enabled: boolean;
  config?: Record<string, any>;

  // 生命周期钩子
  initialize?: (config: Record<string, any>) => Promise<boolean>;
  destroy?: () => Promise<void>;
}

/** Skill 注册信息 */
export interface SkillRegistration {
  id: string;
  path: string;  // Skill 文件路径
  enabled: boolean;
  config?: Record<string, any>;
  loadedAt?: Date;
  error?: string;
}

/** Skill 注册表 */
export interface SkillRegistry {
  version: number;
  skills: Record<string, SkillRegistration>;
}

/** Skill 加载器接口 */
export interface SkillLoader {
  canLoad(metadata: SkillMetadata): boolean;
  load(registration: SkillRegistration): Promise<Skill>;
}

/** Skill 管理器状态 */
export interface SkillManagerState {
  skills: Map<string, Skill>;
  registry: SkillRegistry;
  isInitialized: boolean;
}
