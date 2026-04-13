/**
 * Context Engineering - 上下文工程模块
 * 
 * 提供完整的上下文管理能力，包括：
 * - 上下文分层管理 (Context Layers)
 * - 上下文压缩与摘要 (Context Compression)
 * - 动态上下文选择 (Context Selection)
 * - 统一上下文管理器 (Context Manager)
 */

// 核心导出
export { ContextManager, createContextManager } from "./context_manager.js";
export { ContextCompressor, createContextCompressor } from "./context_compressor.js";
export { ContextSelector, createContextSelector } from "./context_selector.js";

// 类型导出
export {
  // 分层相关
  ContextLayerType,
  LAYER_PRIORITY,
  type ContextLayer,
  type UserProfile,
  type LongTermMemory,
  type RAGContext,
  type LayeredContext,
  createContextLayer,
  createEmptyLayeredContext,
  formatUserProfile,
  formatLongTermMemories,
  formatRAGContext,
  estimateTokenCount,
} from "./context_layers.js";

// 压缩相关
export {
  DEFAULT_COMPRESSION_CONFIG,
  type CompressionConfig,
  type ConversationSummary,
  type CompressedContext,
} from "./context_compressor.js";

// 选择相关
export {
  DEFAULT_SELECTION_CONFIG,
  type SelectionConfig,
  type ScorableItem,
  type SelectionResult,
} from "./context_selector.js";

// 管理器相关
export {
  DEFAULT_CONTEXT_MANAGER_CONFIG,
  type ContextManagerConfig,
  type BuildContextOptions,
  type BuildContextResult,
} from "./context_manager.js";
