/**
 * Context Manager - 上下文管理器
 * 
 * 核心管理类，整合分层、压缩、选择功能
 * 提供统一的上下文管理接口
 */

import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  ContextLayer,
  ContextLayerType,
  LayeredContext,
  UserProfile,
  LongTermMemory,
  RAGContext,
  createContextLayer,
  createEmptyLayeredContext,
  formatUserProfile,
  formatLongTermMemories,
  formatRAGContext,
  estimateTokenCount,
} from "./context_layers.js";
import {
  ContextCompressor,
  CompressionConfig,
  DEFAULT_COMPRESSION_CONFIG,
} from "./context_compressor.js";
import {
  ContextSelector,
  SelectionConfig,
  DEFAULT_SELECTION_CONFIG,
} from "./context_selector.js";

/**
 * 上下文管理器配置
 */
export interface ContextManagerConfig {
  maxTokens: number;
  enableCompression: boolean;
  enableSelection: boolean;
  enableUserProfile: boolean;
  compressionConfig?: Partial<CompressionConfig>;
  selectionConfig?: Partial<SelectionConfig>;
}

/**
 * 默认配置
 */
export const DEFAULT_CONTEXT_MANAGER_CONFIG: ContextManagerConfig = {
  maxTokens: 8000,
  enableCompression: true,
  enableSelection: true,
  enableUserProfile: true,
};

/**
 * 构建上下文的选项
 */
export interface BuildContextOptions {
  userId?: string;
  sessionId?: string;
  messages: BaseMessage[];
  userProfile?: UserProfile;
  longTermMemories?: LongTermMemory[];
  ragContext?: RAGContext;
  systemPrompt?: string;
  currentQuery?: string;
  customLayers?: ContextLayer[];
}

/**
 * 构建结果
 */
export interface BuildContextResult {
  messages: BaseMessage[];
  layeredContext: LayeredContext;
  metadata: {
    totalTokens: number;
    layerCount: number;
    compressionApplied: boolean;
    selectionApplied: boolean;
    layersInfo: Array<{
      type: ContextLayerType;
      tokenCount: number;
      isCompressed: boolean;
    }>;
  };
}

/**
 * 上下文管理器类
 */
export class ContextManager {
  private config: ContextManagerConfig;
  private compressor: ContextCompressor;
  private selector: ContextSelector;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, ...config };
    this.compressor = new ContextCompressor({
      ...DEFAULT_COMPRESSION_CONFIG,
      maxTokens: this.config.maxTokens,
      targetTokens: Math.floor(this.config.maxTokens * 0.75),
      ...config.compressionConfig,
    });
    this.selector = new ContextSelector({
      ...DEFAULT_SELECTION_CONFIG,
      maxTotalTokens: Math.floor(this.config.maxTokens * 0.75),
      ...config.selectionConfig,
    });
  }

  /**
   * 构建完整的上下文
   */
  async buildContext(options: BuildContextOptions): Promise<BuildContextResult> {
    const userId = options.userId || "default";
    const sessionId = options.sessionId || this.generateSessionId();
    const currentQuery = options.currentQuery || this.extractCurrentQuery(options.messages);

    // 创建分层上下文容器
    let layeredContext = createEmptyLayeredContext(
      userId,
      sessionId,
      this.config.maxTokens
    );

    // 构建各层级
    const layers: ContextLayer[] = [];

    // 1. 系统提示层（最高优先级）
    if (options.systemPrompt) {
      const systemLayer = createContextLayer(
        ContextLayerType.SYSTEM,
        options.systemPrompt,
        {
          tokenCount: estimateTokenCount(options.systemPrompt),
        }
      );
      layers.push(systemLayer);
      layeredContext.layers.set(ContextLayerType.SYSTEM, systemLayer);
    }

    // 2. 用户画像层
    if (this.config.enableUserProfile && options.userProfile) {
      const profileText = formatUserProfile(options.userProfile);
      const profileLayer = createContextLayer(
        ContextLayerType.USER_PROFILE,
        profileText,
        {
          metadata: { profile: options.userProfile },
          tokenCount: estimateTokenCount(profileText),
        }
      );
      layers.push(profileLayer);
      layeredContext.layers.set(ContextLayerType.USER_PROFILE, profileLayer);
    }

    // 3. 长期记忆层
    if (options.longTermMemories && options.longTermMemories.length > 0) {
      // 如果启用选择，先进行记忆选择
      let selectedMemories = options.longTermMemories;
      if (this.config.enableSelection && currentQuery) {
        const selectionResult = this.selector.selectMemories(
          options.longTermMemories,
          currentQuery
        );
        selectedMemories = selectionResult.selected;
      }

      const memoryText = formatLongTermMemories(selectedMemories);
      if (memoryText) {
        const memoryLayer = createContextLayer(
          ContextLayerType.LONG_TERM_MEMORY,
          memoryText,
          {
            metadata: { memories: selectedMemories },
            tokenCount: estimateTokenCount(memoryText),
          }
        );
        layers.push(memoryLayer);
        layeredContext.layers.set(ContextLayerType.LONG_TERM_MEMORY, memoryLayer);
      }
    }

    // 4. RAG 上下文层
    if (options.ragContext && options.ragContext.documents.length > 0) {
      // 如果启用选择，先进行文档选择
      let selectedRAGContext = options.ragContext;
      if (this.config.enableSelection && currentQuery) {
        const selectionResult = this.selector.selectRAGDocuments(
          options.ragContext,
          currentQuery
        );
        selectedRAGContext = {
          ...options.ragContext,
          documents: selectionResult.selected,
          totalResults: selectionResult.selected.length,
        };
      }

      const ragText = formatRAGContext(selectedRAGContext);
      if (ragText) {
        const ragLayer = createContextLayer(
          ContextLayerType.RAG_CONTEXT,
          ragText,
          {
            metadata: { ragContext: selectedRAGContext },
            tokenCount: estimateTokenCount(ragText),
          }
        );
        layers.push(ragLayer);
        layeredContext.layers.set(ContextLayerType.RAG_CONTEXT, ragLayer);
      }
    }

    // 5. 对话历史层
    if (options.messages.length > 0) {
      const conversationText = options.messages
        .map((m) => `${m.getType()}: ${(m as any).content}`)
        .join("\n");

      const conversationLayer = createContextLayer(
        ContextLayerType.SHORT_TERM_MEMORY,
        conversationText,
        {
          messages: options.messages,
          tokenCount: estimateTokenCount(conversationText),
        }
      );
      layers.push(conversationLayer);
      layeredContext.layers.set(ContextLayerType.SHORT_TERM_MEMORY, conversationLayer);
    }

    // 6. 自定义层级
    if (options.customLayers) {
      for (const customLayer of options.customLayers) {
        layers.push(customLayer);
        layeredContext.layers.set(customLayer.type, customLayer);
      }
    }

    // 计算当前总 token
    const currentTokens = layers.reduce(
      (sum, layer) => sum + (layer.tokenCount || 0),
      0
    );
    layeredContext.totalTokens = currentTokens;

    // 应用压缩（如果需要）
    let compressionApplied = false;
    if (this.config.enableCompression && currentTokens > this.config.maxTokens * 0.8) {
      const compressedLayers = await this.compressor.compressLayers(layers);

      // 更新分层上下文
      for (const compressed of compressedLayers) {
        if (compressed.compressionMethod !== "none") {
          layeredContext.layers.set(compressed.layer.type, compressed.layer);
          compressionApplied = true;
        }
      }

      // 重新计算总 token
      layeredContext.totalTokens = compressedLayers.reduce(
        (sum, c) => sum + c.compressedTokenCount,
        0
      );
    }

    // 构建最终的 LangChain 消息列表
    const finalMessages = this.buildFinalMessages(layeredContext, options.messages);

    // 计算最终 token 数
    const finalTokens = finalMessages.reduce(
      (sum, msg) => sum + estimateTokenCount((msg as any).content || ""),
      0
    );

    // 构建元数据
    const layersInfo = Array.from(layeredContext.layers.values()).map((layer) => ({
      type: layer.type,
      tokenCount: layer.tokenCount || 0,
      isCompressed: layer.isCompressed || false,
    }));

    return {
      messages: finalMessages,
      layeredContext,
      metadata: {
        totalTokens: finalTokens,
        layerCount: layers.length,
        compressionApplied,
        selectionApplied: this.config.enableSelection,
        layersInfo,
      },
    };
  }

  /**
   * 构建最终的 LangChain 消息列表
   */
  private buildFinalMessages(
    layeredContext: LayeredContext,
    originalMessages: BaseMessage[]
  ): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // 1. 添加系统提示（合并系统层和用户画像层）
    const systemLayer = layeredContext.layers.get(ContextLayerType.SYSTEM);
    const profileLayer = layeredContext.layers.get(ContextLayerType.USER_PROFILE);

    let systemContent = "";
    if (systemLayer) {
      systemContent = systemLayer.content;
    }
    if (profileLayer) {
      systemContent += systemContent ? "\n\n" + profileLayer.content : profileLayer.content;
    }

    if (systemContent) {
      messages.push(new SystemMessage({ content: systemContent }));
    }

    // 2. 添加长期记忆作为系统上下文
    const memoryLayer = layeredContext.layers.get(ContextLayerType.LONG_TERM_MEMORY);
    if (memoryLayer) {
      messages.push(
        new SystemMessage({
          content: `[用户记忆]\n${memoryLayer.content}`,
        })
      );
    }

    // 3. 添加 RAG 上下文作为系统上下文
    const ragLayer = layeredContext.layers.get(ContextLayerType.RAG_CONTEXT);
    if (ragLayer) {
      messages.push(
        new SystemMessage({
          content: ragLayer.content,
        })
      );
    }

    // 4. 添加对话历史
    const conversationLayer = layeredContext.layers.get(ContextLayerType.SHORT_TERM_MEMORY);
    if (conversationLayer && conversationLayer.messages) {
      // 如果已压缩，使用压缩后的消息
      if (conversationLayer.isCompressed) {
        messages.push(...conversationLayer.messages);
      } else {
        messages.push(...originalMessages);
      }
    } else {
      messages.push(...originalMessages);
    }

    return messages;
  }

  /**
   * 提取当前查询
   */
  private extractCurrentQuery(messages: BaseMessage[]): string {
    const lastHumanMessage = [...messages]
      .reverse()
      .find((m) => m.getType() === "human");

    if (lastHumanMessage) {
      const content = (lastHumanMessage as HumanMessage).content;
      return typeof content === "string" ? content : JSON.stringify(content);
    }

    return "";
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ContextManagerConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新压缩器和选择器的配置
    if (config.compressionConfig) {
      this.compressor = new ContextCompressor({
        ...DEFAULT_COMPRESSION_CONFIG,
        maxTokens: this.config.maxTokens,
        targetTokens: Math.floor(this.config.maxTokens * 0.75),
        ...config.compressionConfig,
      });
    }

    if (config.selectionConfig) {
      this.selector = new ContextSelector({
        ...DEFAULT_SELECTION_CONFIG,
        maxTotalTokens: Math.floor(this.config.maxTokens * 0.75),
        ...config.selectionConfig,
      });
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): ContextManagerConfig {
    return { ...this.config };
  }

  /**
   * 分析上下文使用情况
   */
  analyzeContextUsage(layeredContext: LayeredContext): {
    totalTokens: number;
    layerBreakdown: Record<string, { tokens: number; percentage: number }>;
    recommendations: string[];
  } {
    const breakdown: Record<string, { tokens: number; percentage: number }> = {};
    const recommendations: string[] = [];

    for (const [type, layer] of layeredContext.layers) {
      const tokens = layer.tokenCount || 0;
      const percentage = (tokens / layeredContext.totalTokens) * 100;
      breakdown[type] = { tokens, percentage };

      // 生成建议
      if (percentage > 50) {
        recommendations.push(`${type} 占用超过 50% 的上下文，建议压缩或优化`);
      }
      if (layer.isCompressed) {
        recommendations.push(`${type} 已被压缩，可能影响信息完整性`);
      }
    }

    if (layeredContext.totalTokens > this.config.maxTokens * 0.9) {
      recommendations.push("上下文接近最大限制，建议启用更激进的压缩策略");
    }

    return {
      totalTokens: layeredContext.totalTokens,
      layerBreakdown: breakdown,
      recommendations,
    };
  }
}

/**
 * 创建上下文管理器实例
 */
export function createContextManager(
  config?: Partial<ContextManagerConfig>
): ContextManager {
  return new ContextManager(config);
}

// 导出所有类型和函数
export * from "./context_layers.js";
export * from "./context_compressor.js";
export * from "./context_selector.js";
