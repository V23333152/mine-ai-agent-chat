/**
 * Define the configurable parameters for the agent.
 */
import { Annotation } from "@langchain/langgraph";
import { SYSTEM_PROMPT_TEMPLATE, SYSTEM_PROMPT_WITH_WEB_SEARCH, SYSTEM_PROMPT_WITH_MCP } from "./prompts.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { MCPServerConfig, MCPToolConfig } from "./mcp_manager.js";
import { PromptConfig } from "../shared/prompt-config.js";

/**
 * Context Engineering 配置
 */
export interface ContextEngineeringConfig {
  /** 最大上下文 token 数 */
  maxTokens: number;
  /** 是否启用上下文压缩 */
  enableCompression: boolean;
  /** 是否启用上下文选择 */
  enableSelection: boolean;
  /** 是否启用用户画像 */
  enableUserProfile: boolean;
  /** 是否启用长期记忆 */
  enableLongTermMemory: boolean;
  /** 保留最近消息数（不压缩） */
  preserveRecentMessages: number;
  /** 是否启用摘要生成 */
  enableSummarization: boolean;
  /** 最大记忆数量 */
  maxMemories: number;
  /** 最大 RAG 文档数量 */
  maxRAGDocs: number;
  /** 时效性权重 (0-1) */
  recencyWeight: number;
  /** 重要性权重 (0-1) */
  importanceWeight: number;
  /** 是否启用 RAG */
  enableRAG: boolean;
  /** RAG API 地址 */
  ragApiUrl: string;
}

/**
 * 默认 Context Engineering 配置
 */
export const DEFAULT_CONTEXT_ENGINEERING_CONFIG: ContextEngineeringConfig = {
  maxTokens: 8000,
  enableCompression: true,
  enableSelection: true,
  enableUserProfile: true,
  enableLongTermMemory: true,
  preserveRecentMessages: 4,
  enableSummarization: true,
  maxMemories: 10,
  maxRAGDocs: 5,
  recencyWeight: 0.4,
  importanceWeight: 0.6,
  enableRAG: true,
  ragApiUrl: "http://localhost:8000",
};

export const ConfigurationSchema = Annotation.Root({
  /**
   * The system prompt to be used by the agent.
   */
  systemPromptTemplate: Annotation<string>,

  /**
   * The name of the language model to be used by the agent.
   * Format: "provider/model" or just "model"
   * Examples: 
   *   - "openai/gpt-4"
   *   - "moonshot-v1-8k" (will use OPENAI_BASE_URL if set)
   *   - "kimi-k2.5-vision" (Kimi K2.5 多模态视觉模型)
   *   - "gpt-4o" (OpenAI 多模态模型)
   */
  model: Annotation<string>,

  /**
   * Whether to enable web search functionality.
   * When enabled, the agent can use Tavily search to retrieve information from the internet.
   */
  enableWebSearch: Annotation<boolean>,

  /**
   * MCP server configurations.
   * Each server defines how to connect to an MCP server.
   */
  mcpServers: Annotation<MCPServerConfig[]>,

  /**
   * MCP tool configurations.
   * Defines which tools from which servers are enabled.
   */
  mcpToolConfigs: Annotation<MCPToolConfig[]>,

  /**
   * Whether to enable MCP tools globally.
   */
  enableMCP: Annotation<boolean>,

  /**
   * Vector store collection name for document retrieval.
   */
  vectorStoreCollection: Annotation<string>,
  
  /**
   * Model configurations for different AI capabilities.
   */
  modelConfigs: Annotation<{
    llm?: { model: string; provider: string; apiKey: string; baseUrl: string };
    tts?: { model: string; provider: string; apiKey: string; baseUrl: string };
    image?: { model: string; provider: string; apiKey: string; baseUrl: string };
  } | null>(),
  
  /**
   * Prompt configuration for customizing system prompts.
   */
  promptConfig: Annotation<{
    react?: PromptConfig;
    memory?: PromptConfig;
    research?: PromptConfig;
    retrieval?: PromptConfig;
  } | null>(),

  /**
   * Context Engineering configuration.
   * Controls advanced context management features.
   */
  contextEngineering: Annotation<ContextEngineeringConfig>(),

  /**
   * User ID for personalized context.
   */
  userId: Annotation<string>(),
});

export function ensureConfiguration(
  config: RunnableConfig,
): typeof ConfigurationSchema.State {
  /**
   * Ensure the defaults are populated.
   */
  const configurable = config.configurable ?? {};
  
  // Get model from environment or use default
  // 支持多模态视觉模型: kimi-k2.5-vision
  const defaultModel = process.env.DEFAULT_MODEL || "kimi-k2.5-vision";
  
  // Determine feature flags
  const enableWebSearch = configurable.enableWebSearch ?? false;
  const enableMCP = configurable.enableMCP ?? false;
  
  // Get vector store collection
  const vectorStoreCollection = configurable.vectorStoreCollection ?? "default";

  // Default AI Scheduler MCP server configuration
  const defaultMCPServers: MCPServerConfig[] = [
    {
      id: "ai_scheduler",
      name: "AI Scheduler",
      transportType: "stdio",
      command: "python",
      args: ["mcp_scheduler_wrapper.py"],
      env: {
        SCHEDULER_CONFIG: "./scheduler.yaml",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
        PYTHONIOENCODING: "utf-8"
      },
      enabled: true
    }
  ];

  // Merge user-provided MCP servers with defaults
  const userMCPServers = configurable.mcpServers ?? [];
  const mergedMCPServers = [...defaultMCPServers, ...userMCPServers.filter((s: MCPServerConfig) => s.id !== "ai_scheduler")];
  
  // Get model configurations from frontend or use default
  const modelConfigs = configurable.modelConfigs;
  
  // Get prompt configuration from frontend
  const promptConfig = configurable.promptConfig;
  const customReactPrompt = promptConfig?.react?.systemPrompt;
  
  // Get Context Engineering configuration
  const contextEngineering: ContextEngineeringConfig = {
    ...DEFAULT_CONTEXT_ENGINEERING_CONFIG,
    ...configurable.contextEngineering,
  };
  
  // Choose the appropriate prompt template
  let promptTemplate = SYSTEM_PROMPT_TEMPLATE;
  if (enableMCP) {
    promptTemplate = SYSTEM_PROMPT_WITH_MCP;
  } else if (enableWebSearch) {
    promptTemplate = SYSTEM_PROMPT_WITH_WEB_SEARCH;
  }
  
  // If custom prompt is provided for react agent, use it
  if (customReactPrompt) {
    promptTemplate = customReactPrompt;
    console.log("[Configuration] Using custom React prompt from frontend");
  }
  
  // Replace collection placeholder in prompt template
  const processedPromptTemplate = promptTemplate.replace(
    /{vector_store_collection}/g, 
    vectorStoreCollection
  );
  
  return {
    systemPromptTemplate:
      configurable.systemPromptTemplate ?? processedPromptTemplate,
    model: configurable.model ?? defaultModel,
    enableWebSearch: enableWebSearch,
    enableMCP: enableMCP,
    mcpServers: mergedMCPServers,
    mcpToolConfigs: configurable.mcpToolConfigs ?? [],
    vectorStoreCollection: vectorStoreCollection,
    modelConfigs: modelConfigs,
    promptConfig: promptConfig,
    contextEngineering: contextEngineering,
    userId: configurable.userId ?? "default",
  };
}
