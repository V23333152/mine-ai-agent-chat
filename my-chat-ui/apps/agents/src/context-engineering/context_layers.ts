/**
 * Context Layers - 上下文分层系统
 * 
 * 定义不同类型的上下文层级，实现结构化的上下文管理
 */

import { BaseMessage } from "@langchain/core/messages";

/**
 * 上下文层级枚举
 * 按优先级从高到低排列
 */
export enum ContextLayerType {
  SYSTEM = "system",           // 系统提示词（最高优先级）
  USER_PROFILE = "user_profile", // 用户画像和长期偏好
  LONG_TERM_MEMORY = "long_term_memory", // 长期记忆
  RAG_CONTEXT = "rag_context", // RAG检索的文档上下文
  SHORT_TERM_MEMORY = "short_term_memory", // 短期记忆（对话历史）
  CURRENT_INPUT = "current_input", // 当前用户输入
}

/**
 * 上下文层级的优先级（数字越小优先级越高）
 */
export const LAYER_PRIORITY: Record<ContextLayerType, number> = {
  [ContextLayerType.SYSTEM]: 0,
  [ContextLayerType.USER_PROFILE]: 1,
  [ContextLayerType.LONG_TERM_MEMORY]: 2,
  [ContextLayerType.RAG_CONTEXT]: 3,
  [ContextLayerType.SHORT_TERM_MEMORY]: 4,
  [ContextLayerType.CURRENT_INPUT]: 5,
};

/**
 * 单个上下文层级的接口
 */
export interface ContextLayer {
  type: ContextLayerType;
  content: string;
  messages?: BaseMessage[];
  metadata?: Record<string, any>;
  priority: number;
  tokenCount?: number;
  timestamp: number;
  isCompressed?: boolean;
  relevanceScore?: number; // 与当前查询的相关性分数
}

/**
 * 用户画像信息
 */
export interface UserProfile {
  userId: string;
  preferences: string[];
  interests: string[];
  communicationStyle: string;
  expertiseAreas: string[];
  avoidTopics: string[];
  lastUpdated: number;
  customAttributes: Record<string, any>;
}

/**
 * 长期记忆项
 */
export interface LongTermMemory {
  id: string;
  content: string;
  context: string;
  category?: string;
  importance: number; // 1-10
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  embedding?: number[];
}

/**
 * RAG 文档上下文
 */
export interface RAGContext {
  documents: {
    content: string;
    source: string;
    pageNumber?: number;
    relevanceScore: number;
    metadata?: Record<string, any>;
  }[];
  query: string;
  totalResults: number;
}

/**
 * 分层上下文容器
 */
export interface LayeredContext {
  layers: Map<ContextLayerType, ContextLayer>;
  totalTokens: number;
  maxTokens: number;
  userId: string;
  sessionId: string;
  timestamp: number;
}

/**
 * 创建空的层状上下文
 */
export function createEmptyLayeredContext(
  userId: string,
  sessionId: string,
  maxTokens: number = 8000
): LayeredContext {
  return {
    layers: new Map(),
    totalTokens: 0,
    maxTokens,
    userId,
    sessionId,
    timestamp: Date.now(),
  };
}

/**
 * 创建上下文层级
 */
export function createContextLayer(
  type: ContextLayerType,
  content: string,
  options?: {
    messages?: BaseMessage[];
    metadata?: Record<string, any>;
    tokenCount?: number;
    isCompressed?: boolean;
    relevanceScore?: number;
  }
): ContextLayer {
  return {
    type,
    content,
    priority: LAYER_PRIORITY[type],
    timestamp: Date.now(),
    ...options,
  };
}

/**
 * 按优先级排序上下文层级
 */
export function sortLayersByPriority(
  layers: ContextLayer[]
): ContextLayer[] {
  return [...layers].sort((a, b) => a.priority - b.priority);
}

/**
 * 格式化用户画像为文本
 */
export function formatUserProfile(profile: UserProfile): string {
  const parts = [
    `## 用户画像`,
    `- 交流风格: ${profile.communicationStyle}`,
    `- 兴趣领域: ${profile.interests.join(", ") || "暂无"}`,
    `- 专业领域: ${profile.expertiseAreas.join(", ") || "暂无"}`,
    `- 偏好: ${profile.preferences.join(", ") || "暂无"}`,
  ];

  if (profile.avoidTopics.length > 0) {
    parts.push(`- 避免话题: ${profile.avoidTopics.join(", ")}`);
  }

  // 添加自定义属性
  Object.entries(profile.customAttributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      parts.push(`- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
    }
  });

  return parts.join("\n");
}

/**
 * 格式化长期记忆为文本
 */
export function formatLongTermMemories(
  memories: LongTermMemory[],
  maxItems: number = 10
): string {
  if (memories.length === 0) return "";

  const selectedMemories = memories
    .sort((a, b) => {
      // 按重要性和最近访问时间排序
      const scoreA = a.importance * 0.6 + (a.accessCount / 100) * 0.4;
      const scoreB = b.importance * 0.6 + (b.accessCount / 100) * 0.4;
      return scoreB - scoreA;
    })
    .slice(0, maxItems);

  const parts = ["## 相关记忆"];
  selectedMemories.forEach((mem, idx) => {
    parts.push(`[${idx + 1}] ${mem.content}`);
    if (mem.context) {
      parts.push(`    背景: ${mem.context}`);
    }
  });

  return parts.join("\n");
}

/**
 * 格式化 RAG 上下文为文本
 */
export function formatRAGContext(ragContext: RAGContext): string {
  if (ragContext.documents.length === 0) return "";

  const parts = [
    `## 参考文档 (查询: "${ragContext.query}")`,
    "",
  ];

  ragContext.documents.forEach((doc, idx) => {
    parts.push(`[文档 ${idx + 1}] 来源: ${doc.source}`);
    if (doc.pageNumber) {
      parts[parts.length - 1] += ` (第${doc.pageNumber}页)`;
    }
    parts.push(doc.content);
    parts.push("");
  });

  return parts.join("\n");
}

/**
 * 计算文本的近似 token 数量
 * 使用简单的启发式：中文 ≈ 1 token/字，英文 ≈ 0.25 tokens/字
 */
export function estimateTokenCount(text: string): number {
  let count = 0;
  for (const char of text) {
    // CJK 字符
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char)) {
      count += 1;
    } else if (/[a-zA-Z]/.test(char)) {
      count += 0.25;
    } else if (/[0-9]/.test(char)) {
      count += 0.25;
    } else {
      count += 0.5;
    }
  }
  return Math.ceil(count);
}
