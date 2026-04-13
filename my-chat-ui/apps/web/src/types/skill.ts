/**
 * Skill 类型定义
 */

export interface SkillMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: "native" | "mcp" | "custom";
  tags: string[];
  config: SkillConfigItem[];
  tools: SkillToolInfo[];
}

export interface SkillConfigItem {
  name: string;
  type: "string" | "number" | "boolean" | "select" | "secret";
  required: boolean;
  description: string;
  default?: any;
  options?: string[];
  env?: string;
}

export interface SkillToolInfo {
  id: string;
  name: string;
  description: string;
  examples: string[];
}

export interface Skill {
  metadata: SkillMetadata;
  enabled: boolean;
  config: Record<string, any>;
  tools: any[];
}

export interface SkillRegistration {
  id: string;
  path: string;
  enabled: boolean;
  config?: Record<string, any>;
  error?: string;
}

export interface SkillRegistry {
  version: number;
  skills: Record<string, SkillRegistration>;
}

export interface SkillStatus {
  id: string;
  name: string;
  enabled: boolean;
  loaded: boolean;
  toolCount: number;
  error?: string;
}

export interface SkillUploadResult {
  success: boolean;
  message: string;
  skillId?: string;
}

export interface RemoteSkillSource {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  url: string;
  tags: string[];
  source?: string;
  downloads?: number;
  updatedAt?: string;
}
