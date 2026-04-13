/**
 * Context Selector - 动态上下文选择系统
 * 
 * 根据当前查询智能选择最相关的上下文信息
 */

import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  ContextLayer,
  ContextLayerType,
  LongTermMemory,
  RAGContext,
  estimateTokenCount,
} from "./context_layers.js";

/**
 * 选择配置
 */
export interface SelectionConfig {
  maxTotalTokens: number;
  minRelevanceScore: number;
  maxMemories: number;
  maxRAGDocs: number;
  enableSemanticRanking: boolean;
  recencyWeight: number; // 0-1，越大越重视最近的记忆
  importanceWeight: number; // 0-1，越大越重视重要性
}

/**
 * 默认选择配置
 */
export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  maxTotalTokens: 6000,
  minRelevanceScore: 0.3,
  maxMemories: 10,
  maxRAGDocs: 5,
  enableSemanticRanking: true,
  recencyWeight: 0.4,
  importanceWeight: 0.6,
};

/**
 * 可评分项接口
 */
export interface ScorableItem {
  content: string;
  relevanceScore: number;
  timestamp?: number;
  importance?: number;
  metadata?: Record<string, any>;
}

/**
 * 选择结果
 */
export interface SelectionResult<T> {
  selected: T[];
  totalTokens: number;
  selectionMethod: "relevance" | "recency" | "importance" | "hybrid";
  scores: Map<string, number>;
}

/**
 * 上下文选择器类
 */
export class ContextSelector {
  private config: SelectionConfig;

  constructor(config: Partial<SelectionConfig> = {}) {
    this.config = { ...DEFAULT_SELECTION_CONFIG, ...config };
  }

  /**
   * 计算文本相似度（简单的余弦相似度实现）
   * 注意：这只是一个简化的实现，实际项目中可以使用 embedding
   */
  calculateSimilarity(text1: string, text2: string): number {
    // 分词并转换为小写
    const tokenize = (text: string): string[] => {
      return text
        .toLowerCase()
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 0);
    };

    const tokens1 = tokenize(text1);
    const tokens2 = tokenize(text2);

    // 构建词频向量
    const allTokens = new Set([...tokens1, ...tokens2]);
    const freq1 = new Map<string, number>();
    const freq2 = new Map<string, number>();

    tokens1.forEach((t) => freq1.set(t, (freq1.get(t) || 0) + 1));
    tokens2.forEach((t) => freq2.set(t, (freq2.get(t) || 0) + 1));

    // 计算点积和模
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    allTokens.forEach((token) => {
      const f1 = freq1.get(token) || 0;
      const f2 = freq2.get(token) || 0;
      dotProduct += f1 * f2;
      norm1 += f1 * f1;
      norm2 += f2 * f2;
    });

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 计算综合相关性分数
   */
  calculateCompositeScore(
    item: ScorableItem,
    query: string,
    currentTime: number = Date.now()
  ): number {
    // 文本相似度分数
    const similarityScore = this.calculateSimilarity(item.content, query);

    // 时效性分数（越新分数越高）
    let recencyScore = 0.5; // 默认中等时效性
    if (item.timestamp) {
      const age = currentTime - item.timestamp;
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
      recencyScore = Math.max(0, 1 - age / maxAge);
    }

    // 重要性分数
    const importanceScore = (item.importance || 5) / 10;

    // 加权综合
    const compositeScore =
      similarityScore * 0.5 +
      recencyScore * this.config.recencyWeight * 0.3 +
      importanceScore * this.config.importanceWeight * 0.2;

    return Math.min(1, Math.max(0, compositeScore));
  }

  /**
   * 选择最相关的长期记忆
   */
  selectMemories(
    memories: LongTermMemory[],
    query: string,
    options?: { maxItems?: number; maxTokens?: number }
  ): SelectionResult<LongTermMemory> {
    const maxItems = options?.maxItems || this.config.maxMemories;
    const maxTokens = options?.maxTokens || this.config.maxTotalTokens / 3;

    // 计算每个记忆的综合分数
    const scoredMemories = memories.map((mem) => ({
      memory: mem,
      score: this.calculateCompositeScore(
        {
          content: mem.content,
          relevanceScore: 0,
          timestamp: mem.lastAccessed,
          importance: mem.importance,
        },
        query
      ),
    }));

    // 按分数排序
    scoredMemories.sort((a, b) => b.score - a.score);

    // 选择满足条件的记忆
    const selected: LongTermMemory[] = [];
    let totalTokens = 0;
    const scores = new Map<string, number>();

    for (const { memory, score } of scoredMemories) {
      if (selected.length >= maxItems) break;
      if (score < this.config.minRelevanceScore) continue;

      const tokens = estimateTokenCount(memory.content);
      if (totalTokens + tokens > maxTokens) break;

      selected.push(memory);
      totalTokens += tokens;
      scores.set(memory.id, score);

      // 更新访问统计
      memory.accessCount++;
      memory.lastAccessed = Date.now();
    }

    return {
      selected,
      totalTokens,
      selectionMethod: "hybrid",
      scores,
    };
  }

  /**
   * 选择最相关的 RAG 文档
   */
  selectRAGDocuments(
    ragContext: RAGContext,
    query: string,
    options?: { maxItems?: number; maxTokens?: number }
  ): SelectionResult<RAGContext["documents"][0]> {
    const maxItems = options?.maxItems || this.config.maxRAGDocs;
    const maxTokens = options?.maxTokens || this.config.maxTotalTokens / 3;

    // 结合向量检索的相似度和关键词相似度
    const scoredDocs = ragContext.documents.map((doc) => {
      const keywordScore = this.calculateSimilarity(doc.content, query);
      // 综合分数：向量分数 * 0.7 + 关键词分数 * 0.3
      const combinedScore = doc.relevanceScore * 0.7 + keywordScore * 0.3;

      return {
        doc,
        score: combinedScore,
      };
    });

    // 按分数排序
    scoredDocs.sort((a, b) => b.score - a.score);

    // 选择文档
    const selected: RAGContext["documents"][0][] = [];
    let totalTokens = 0;
    const scores = new Map<string, number>();

    for (const { doc, score } of scoredDocs) {
      if (selected.length >= maxItems) break;

      const tokens = estimateTokenCount(doc.content);
      if (totalTokens + tokens > maxTokens) {
        // 尝试截断文档
        const truncatedContent = this.truncateDocument(doc.content, maxTokens - totalTokens);
        if (truncatedContent) {
          selected.push({
            ...doc,
            content: truncatedContent,
          });
          totalTokens += estimateTokenCount(truncatedContent);
          scores.set(doc.source, score);
        }
        break;
      }

      selected.push(doc);
      totalTokens += tokens;
      scores.set(doc.source, score);
    }

    return {
      selected,
      totalTokens,
      selectionMethod: "relevance",
      scores,
    };
  }

  /**
   * 截断文档内容
   */
  private truncateDocument(content: string, maxTokens: number): string | null {
    const avgCharsPerToken = 2; // 中文字符估算
    const maxChars = maxTokens * avgCharsPerToken;

    if (maxChars < 50) return null; // 太短则不添加

    // 尝试在句子边界截断
    const sentences = content.split(/[。！？.!?]/);
    let result = "";

    for (const sentence of sentences) {
      if (estimateTokenCount(result + sentence) > maxTokens) {
        break;
      }
      result += sentence + "。";
    }

    return result || content.slice(0, maxChars) + "...";
  }

  /**
   * 从对话历史中提取关键信息
   */
  extractKeyInformation(messages: BaseMessage[]): string[] {
    const keyInfo: string[] = [];
    const humanMessages = messages.filter((m) => m.getType() === "human");

    // 提取用户提到的关键实体（简化实现）
    const entityPatterns = [
      /我(?:叫|是|的?名字是)\s*([^，。,.\n]+)/,
      /我喜欢\s*([^，。,.\n]+)/,
      /我在\s*([^，。,.\n]+?)\s*(?:工作|学习|住)/,
      /我是\s*([^，。,.\n]+?)\s*(?:工程师|学生|老师|医生)/,
    ];

    for (const message of humanMessages.slice(-10)) {
      const content = (message as HumanMessage).content as string;

      for (const pattern of entityPatterns) {
        const match = content.match(pattern);
        if (match && !keyInfo.includes(match[1])) {
          keyInfo.push(match[1]);
        }
      }
    }

    return keyInfo;
  }

  /**
   * 动态调整各层级的 token 分配
   */
  calculateTokenAllocation(
    _layers: ContextLayer[],
    query: string
  ): Map<ContextLayerType, number> {
    const allocation = new Map<ContextLayerType, number>();
    const totalTokens = this.config.maxTotalTokens;

    // 基础分配比例
    const baseAllocation: Record<ContextLayerType, number> = {
      [ContextLayerType.SYSTEM]: 0.1,
      [ContextLayerType.USER_PROFILE]: 0.1,
      [ContextLayerType.LONG_TERM_MEMORY]: 0.15,
      [ContextLayerType.RAG_CONTEXT]: 0.25,
      [ContextLayerType.SHORT_TERM_MEMORY]: 0.3,
      [ContextLayerType.CURRENT_INPUT]: 0.1,
    };

    // 根据查询类型动态调整
    const queryLower = query.toLowerCase();
    const isDocumentQuery =
      /文档|文件|资料|article|document|file/i.test(queryLower);
    const isMemoryQuery = /记得|以前|上次|previous|remember/i.test(queryLower);
    const isTechnicalQuery = /代码|技术|编程|code|technical/i.test(queryLower);

    if (isDocumentQuery) {
      // 增加 RAG 上下文分配
      baseAllocation[ContextLayerType.RAG_CONTEXT] = 0.4;
      baseAllocation[ContextLayerType.SHORT_TERM_MEMORY] = 0.15;
    } else if (isMemoryQuery) {
      // 增加长期记忆分配
      baseAllocation[ContextLayerType.LONG_TERM_MEMORY] = 0.3;
      baseAllocation[ContextLayerType.SHORT_TERM_MEMORY] = 0.2;
    } else if (isTechnicalQuery) {
      // 技术查询增加当前输入和系统提示的权重
      baseAllocation[ContextLayerType.SYSTEM] = 0.15;
      baseAllocation[ContextLayerType.CURRENT_INPUT] = 0.15;
    }

    // 归一化并计算实际 token 数
    const totalRatio = Object.values(baseAllocation).reduce((a, b) => a + b, 0);

    for (const [type, ratio] of Object.entries(baseAllocation)) {
      allocation.set(
        type as ContextLayerType,
        Math.floor((ratio / totalRatio) * totalTokens)
      );
    }

    return allocation;
  }

  /**
   * 选择最优的上下文组合
   */
  selectOptimalContext(
    layers: ContextLayer[],
    query: string
  ): {
    selectedLayers: ContextLayer[];
    totalTokens: number;
    allocation: Map<ContextLayerType, number>;
  } {
    const allocation = this.calculateTokenAllocation(layers, query);
    const selectedLayers: ContextLayer[] = [];
    let totalTokens = 0;

    // 按优先级处理各层级
    const sortedLayers = [...layers].sort((a, b) => a.priority - b.priority);

    for (const layer of sortedLayers) {
      const maxTokens = allocation.get(layer.type) || 1000;
      const layerTokens = layer.tokenCount || estimateTokenCount(layer.content);

      if (layerTokens <= maxTokens) {
        // 完全包含
        selectedLayers.push(layer);
        totalTokens += layerTokens;
      } else {
        // 需要截断（这里只做标记，实际截断由 compressor 处理）
        selectedLayers.push({
          ...layer,
          metadata: {
            ...layer.metadata,
            maxTokens,
            needsTruncation: true,
          },
        });
        totalTokens += maxTokens;
      }
    }

    return {
      selectedLayers,
      totalTokens,
      allocation,
    };
  }
}

/**
 * 创建上下文选择器实例
 */
export function createContextSelector(
  config?: Partial<SelectionConfig>
): ContextSelector {
  return new ContextSelector(config);
}
