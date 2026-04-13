/**
 * Context Compressor - 上下文压缩与摘要系统
 * 
 * 实现上下文的智能压缩，包括：
 * 1. 对话历史摘要
 * 2. 长文档压缩
 * 3. 重复信息消除
 * 4. 基于重要性的内容筛选
 */

import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ContextLayer, ContextLayerType, estimateTokenCount } from "./context_layers.js";
import { initChatModel } from "langchain/chat_models/universal";

/**
 * 压缩配置选项
 */
export interface CompressionConfig {
  maxTokens: number;
  targetTokens: number;
  preserveRecentMessages: number; // 保留最近的 N 条消息不压缩
  enableSummarization: boolean;
  summarizationModel?: string;
}

/**
 * 默认压缩配置
 */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  maxTokens: 8000,
  targetTokens: 6000,
  preserveRecentMessages: 4,
  enableSummarization: true,
  summarizationModel: "anthropic/claude-3-5-haiku-latest",
};

/**
 * 对话摘要结果
 */
export interface ConversationSummary {
  summary: string;
  keyPoints: string[];
  userIntent: string;
  remainingMessages: BaseMessage[];
  originalMessageCount: number;
  compressedTokenCount: number;
}

/**
 * 压缩后的上下文
 */
export interface CompressedContext {
  layer: ContextLayer;
  originalTokenCount: number;
  compressedTokenCount: number;
  compressionRatio: number;
  compressionMethod: "summary" | "truncation" | "selection" | "none";
  metadata: {
    originalMessageCount?: number;
    summaryGenerated?: boolean;
    keyPoints?: string[];
  };
}

/**
 * 上下文压缩器类
 */
export class ContextCompressor {
  private config: CompressionConfig;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  }

  /**
   * 压缩单个上下文层级
   */
  async compressLayer(layer: ContextLayer): Promise<CompressedContext> {
    const originalTokens = layer.tokenCount || estimateTokenCount(layer.content);

    // 如果内容已经在目标范围内，不需要压缩
    if (originalTokens <= this.config.targetTokens / 4) {
      return {
        layer,
        originalTokenCount: originalTokens,
        compressedTokenCount: originalTokens,
        compressionRatio: 1,
        compressionMethod: "none",
        metadata: {},
      };
    }

    switch (layer.type) {
      case ContextLayerType.SHORT_TERM_MEMORY:
        return this.compressConversationLayer(layer);
      case ContextLayerType.RAG_CONTEXT:
        return this.compressRAGLayer(layer);
      case ContextLayerType.LONG_TERM_MEMORY:
        return this.compressMemoryLayer(layer);
      default:
        // 其他类型使用简单的截断
        return this.truncateLayer(layer, originalTokens);
    }
  }

  /**
   * 压缩对话历史层级
   */
  private async compressConversationLayer(
    layer: ContextLayer
  ): Promise<CompressedContext> {
    if (!layer.messages || layer.messages.length <= this.config.preserveRecentMessages) {
      return {
        layer,
        originalTokenCount: layer.tokenCount || estimateTokenCount(layer.content),
        compressedTokenCount: layer.tokenCount || estimateTokenCount(layer.content),
        compressionRatio: 1,
        compressionMethod: "none",
        metadata: {},
      };
    }

    const messages = layer.messages;
    const originalTokens = layer.tokenCount || estimateTokenCount(layer.content);

    // 保留最近的消息
    const recentMessages = messages.slice(-this.config.preserveRecentMessages);
    const messagesToSummarize = messages.slice(0, -this.config.preserveRecentMessages);

    let summaryText = "";
    let keyPoints: string[] = [];

    if (this.config.enableSummarization && messagesToSummarize.length > 0) {
      try {
        const summary = await this.summarizeConversation(messagesToSummarize);
        summaryText = summary.summary;
        keyPoints = summary.keyPoints;
      } catch (error) {
        console.warn("[ContextCompressor] Summarization failed, using truncation:", error);
        // 如果摘要失败，使用简单的截断
        summaryText = this.createSimpleSummary(messagesToSummarize);
      }
    } else {
      summaryText = this.createSimpleSummary(messagesToSummarize);
    }

    // 构建压缩后的消息列表
    const compressedMessages: BaseMessage[] = [
      new SystemMessage({
        content: `[此前对话摘要]\n${summaryText}`,
      }),
      ...recentMessages,
    ];

    const compressedContent = compressedMessages
      .map((m) => `${m.getType()}: ${(m as any).content}`)
      .join("\n");
    const compressedTokens = estimateTokenCount(compressedContent);

    const compressedLayer: ContextLayer = {
      ...layer,
      content: compressedContent,
      messages: compressedMessages,
      isCompressed: true,
      tokenCount: compressedTokens,
    };

    return {
      layer: compressedLayer,
      originalTokenCount: originalTokens,
      compressedTokenCount: compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      compressionMethod: "summary",
      metadata: {
        originalMessageCount: messages.length,
        summaryGenerated: this.config.enableSummarization,
        keyPoints,
      },
    };
  }

  /**
   * 使用 LLM 生成对话摘要
   */
  private async summarizeConversation(
    messages: BaseMessage[]
): Promise<{ summary: string; keyPoints: string[]; userIntent: string }> {
    const llm = await initChatModel(this.config.summarizationModel);

    const conversationText = messages
      .map((m) => {
        const role = m.getType() === "human" ? "用户" : "助手";
        return `${role}: ${(m as any).content}`;
      })
      .join("\n");

    const prompt = `请对以下对话进行摘要，提取关键信息：

${conversationText}

请提供：
1. 简要摘要（2-3句话）
2. 关键要点（3-5点）
3. 用户的主要意图或目标

请以 JSON 格式返回：
{
  "summary": "摘要文本",
  "keyPoints": ["要点1", "要点2", ...],
  "userIntent": "用户意图"
}`;

    try {
      const response = await llm.invoke([{ role: "user", content: prompt }]);
      const content = (response as any).content as string;

      // 尝试解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || content.slice(0, 500),
          keyPoints: parsed.keyPoints || [],
          userIntent: parsed.userIntent || "",
        };
      }
    } catch (error) {
      console.warn("[ContextCompressor] Failed to parse summary JSON:", error);
    }

    // 返回简单摘要
    return {
      summary: this.createSimpleSummary(messages),
      keyPoints: [],
      userIntent: "",
    };
  }

  /**
   * 创建简单摘要（当 LLM 不可用时使用）
   */
  private createSimpleSummary(messages: BaseMessage[]): string {
    const humanMessages = messages.filter((m) => m.getType() === "human");
    const aiMessages = messages.filter((m) => m.getType() === "ai");

    const keyExchanges: string[] = [];
    const step = Math.max(1, Math.floor(messages.length / 3));

    for (let i = 0; i < messages.length; i += step) {
      const msg = messages[i];
      const content = (msg as any).content as string;
      const preview = content.slice(0, 100) + (content.length > 100 ? "..." : "");
      const role = msg.getType() === "human" ? "用户" : "助手";
      keyExchanges.push(`${role}: ${preview}`);
    }

    return `对话包含 ${humanMessages.length} 轮用户提问和 ${aiMessages.length} 轮助手回复。\n关键交互:\n${keyExchanges.join("\n")}`;
  }

  /**
   * 压缩 RAG 上下文层级
   */
  private compressRAGLayer(layer: ContextLayer): CompressedContext {
    const originalTokens = layer.tokenCount || estimateTokenCount(layer.content);

    // 解析文档
    const docs = this.parseRAGDocuments(layer.content);
    if (docs.length === 0) {
      return {
        layer,
        originalTokenCount: originalTokens,
        compressedTokenCount: originalTokens,
        compressionRatio: 1,
        compressionMethod: "none",
        metadata: {},
      };
    }

    // 按相关性排序并选择最重要的文档
    const sortedDocs = docs.sort((a, b) => b.relevance - a.relevance);
    let currentTokens = 0;
    const selectedDocs: typeof docs = [];

    for (const doc of sortedDocs) {
      const docTokens = estimateTokenCount(doc.content);
      if (currentTokens + docTokens > this.config.targetTokens / 4) {
        break;
      }
      selectedDocs.push(doc);
      currentTokens += docTokens;
    }

    // 构建压缩后的内容
    const compressedContent = selectedDocs
      .map((doc, idx) => `[${idx + 1}] 来源: ${doc.source}\n${doc.content}`)
      .join("\n\n");

    const compressedTokens = estimateTokenCount(compressedContent);

    const compressedLayer: ContextLayer = {
      ...layer,
      content: compressedContent,
      isCompressed: true,
      tokenCount: compressedTokens,
    };

    return {
      layer: compressedLayer,
      originalTokenCount: originalTokens,
      compressedTokenCount: compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      compressionMethod: "selection",
      metadata: {
        originalMessageCount: docs.length,
        summaryGenerated: false,
      },
    };
  }

  /**
   * 解析 RAG 文档内容
   */
  private parseRAGDocuments(content: string): Array<{
    content: string;
    source: string;
    relevance: number;
  }> {
    const docs: Array<{ content: string; source: string; relevance: number }> = [];

    // 简单的文档解析逻辑
    const docRegex = /\[文档?\s*(\d+)\]\s*来源:\s*([^\n]+)\n([\s\S]*?)(?=\[文档?\s*\d+\]|$)/g;
    let match;

    while ((match = docRegex.exec(content)) !== null) {
      docs.push({
        source: match[2].trim(),
        content: match[3].trim(),
        relevance: 1, // 默认相关性
      });
    }

    // 如果没有匹配到，尝试简单分割
    if (docs.length === 0 && content.includes("来源:")) {
      const parts = content.split(/\n(?=来源:|\[)/);
      parts.forEach((part, idx) => {
        if (part.trim()) {
          docs.push({
            source: `文档_${idx + 1}`,
            content: part.trim(),
            relevance: 1,
          });
        }
      });
    }

    return docs;
  }

  /**
   * 压缩长期记忆层级
   */
  private compressMemoryLayer(layer: ContextLayer): CompressedContext {
    const originalTokens = layer.tokenCount || estimateTokenCount(layer.content);

    // 解析记忆项
    const memories = this.parseMemories(layer.content);
    if (memories.length === 0) {
      return {
        layer,
        originalTokenCount: originalTokens,
        compressedTokenCount: originalTokens,
        compressionRatio: 1,
        compressionMethod: "none",
        metadata: {},
      };
    }

    // 按重要性排序并选择
    const sortedMemories = memories.sort((a, b) => b.importance - a.importance);
    let currentTokens = 0;
    const selectedMemories: typeof memories = [];

    for (const mem of sortedMemories) {
      const memTokens = estimateTokenCount(mem.content);
      if (currentTokens + memTokens > this.config.targetTokens / 6) {
        break;
      }
      selectedMemories.push(mem);
      currentTokens += memTokens;
    }

    // 构建压缩后的内容
    const compressedContent = selectedMemories
      .map((mem, idx) => `[${idx + 1}] ${mem.content}${mem.context ? ` (背景: ${mem.context})` : ""}`)
      .join("\n");

    const compressedTokens = estimateTokenCount(compressedContent);

    const compressedLayer: ContextLayer = {
      ...layer,
      content: compressedContent,
      isCompressed: true,
      tokenCount: compressedTokens,
    };

    return {
      layer: compressedLayer,
      originalTokenCount: originalTokens,
      compressedTokenCount: compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      compressionMethod: "selection",
      metadata: {
        originalMessageCount: memories.length,
      },
    };
  }

  /**
   * 解析记忆内容
   */
  private parseMemories(content: string): Array<{
    content: string;
    context?: string;
    importance: number;
  }> {
    const memories: Array<{ content: string; context?: string; importance: number }> = [];

    // 简单的记忆解析逻辑
    const memRegex = /\[(\d+)\]\s*(.+?)(?:\s*\(背景:\s*([^)]+)\))?\s*$/gm;
    let match;

    while ((match = memRegex.exec(content)) !== null) {
      memories.push({
        content: match[2].trim(),
        context: match[3]?.trim(),
        importance: 5, // 默认重要性
      });
    }

    return memories;
  }

  /**
   * 简单截断层级内容
   */
  private truncateLayer(layer: ContextLayer, originalTokens: number): CompressedContext {
    const targetLength = Math.floor(
      (layer.content.length * this.config.targetTokens) / originalTokens / 4
    );

    const truncatedContent = layer.content.slice(0, targetLength) + "\n...[内容已截断]";
    const compressedTokens = estimateTokenCount(truncatedContent);

    const compressedLayer: ContextLayer = {
      ...layer,
      content: truncatedContent,
      isCompressed: true,
      tokenCount: compressedTokens,
    };

    return {
      layer: compressedLayer,
      originalTokenCount: originalTokens,
      compressedTokenCount: compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      compressionMethod: "truncation",
      metadata: {},
    };
  }

  /**
   * 批量压缩多个层级
   */
  async compressLayers(layers: ContextLayer[]): Promise<CompressedContext[]> {
    // 按优先级排序，低优先级的先压缩
    const sortedLayers = [...layers].sort((a, b) => b.priority - a.priority);

    const results: CompressedContext[] = [];
    for (const layer of sortedLayers) {
      const compressed = await this.compressLayer(layer);
      results.push(compressed);
    }

    return results;
  }
}

/**
 * 创建上下文压缩器实例的工厂函数
 */
export function createContextCompressor(
  config?: Partial<CompressionConfig>
): ContextCompressor {
  return new ContextCompressor(config);
}
