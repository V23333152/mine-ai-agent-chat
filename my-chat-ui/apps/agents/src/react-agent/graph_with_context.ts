/**
 * React Agent with Context Engineering
 * 
 * 集成上下文工程的增强版 React Agent
 * 提供更智能的上下文管理能力
 */

import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph, Annotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { ConfigurationSchema, ensureConfiguration } from "./configuration.js";
import { getTools, getMCPConnectionStatuses } from "./tools.js";
import { loadChatModel } from "./utils.js";
import {
  ContextManager,
  createContextManager,
  type BuildContextResult,
  type ContextManagerConfig,
  type LongTermMemory,
  type RAGContext,
  type UserProfile,
} from "../context-engineering/index.js";

/**
 * 扩展的图状态
 */
const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  mcpStatus: Annotation<Record<string, { status: string; error?: string; toolCount: number }>>(),
  // 上下文工程相关状态
  contextMetadata: Annotation<{
    totalTokens: number;
    compressionApplied: boolean;
    selectionApplied: boolean;
    layerInfo: Array<{
      type: string;
      tokenCount: number;
      isCompressed: boolean;
    }>;
  } | null>(),
  userProfile: Annotation<UserProfile | null>(),
  retrievedMemories: Annotation<LongTermMemory[] | null>(),
  ragContext: Annotation<RAGContext | null>(),
});

// 缓存
let toolsCache: { tools: any[]; config: string } | null = null;
let contextManager: ContextManager | null = null;



/**
 * 获取缓存的工具
 */
async function getCachedTools(configuration: any): Promise<any[]> {
  const configKey = JSON.stringify({
    enableWebSearch: configuration.enableWebSearch,
    enableMCP: configuration.enableMCP,
    mcpServers: configuration.mcpServers,
    mcpToolConfigs: configuration.mcpToolConfigs,
    modelConfigs: configuration.modelConfigs,
  });

  if (toolsCache && toolsCache.config === configKey) {
    return toolsCache.tools;
  }

  const tools = await getTools(
    configuration.enableWebSearch,
    configuration.enableMCP,
    configuration.mcpServers,
    configuration.mcpToolConfigs,
    configuration.modelConfigs
  );

  toolsCache = { tools, config: configKey };
  return tools;
}

/**
 * 获取或创建上下文管理器
 */
function getContextManager(configuration: any): ContextManager {
  if (contextManager) {
    return contextManager;
  }

  const config: ContextManagerConfig = {
    maxTokens: configuration.contextEngineering?.maxTokens || 8000,
    enableCompression: configuration.contextEngineering?.enableCompression ?? true,
    enableSelection: configuration.contextEngineering?.enableSelection ?? true,
    enableUserProfile: configuration.contextEngineering?.enableUserProfile ?? true,
    compressionConfig: {
      preserveRecentMessages: configuration.contextEngineering?.preserveRecentMessages || 4,
      enableSummarization: configuration.contextEngineering?.enableSummarization ?? true,
    },
    selectionConfig: {
      maxMemories: configuration.contextEngineering?.maxMemories || 10,
      maxRAGDocs: configuration.contextEngineering?.maxRAGDocs || 5,
      recencyWeight: configuration.contextEngineering?.recencyWeight || 0.4,
      importanceWeight: configuration.contextEngineering?.importanceWeight || 0.6,
    },
  };

  contextManager = createContextManager(config);
  return contextManager;
}

/**
 * 检索长期记忆
 */
async function retrieveMemories(
  userId: string,
  query: string,
  config: RunnableConfig
): Promise<LongTermMemory[]> {
  try {
    // 从 store 中检索记忆
    const store = (config as any).store;
    if (!store) {
      return [];
    }

    const memories = await store.search(["memories", userId], {
      limit: 20,
      query,
    });

    return memories.map((mem: any) => ({
      id: mem.key,
      content: mem.value?.content || "",
      context: mem.value?.context || "",
      category: mem.value?.category,
      importance: mem.value?.importance || 5,
      createdAt: mem.createdAt || Date.now(),
      lastAccessed: mem.lastAccessed || Date.now(),
      accessCount: mem.value?.accessCount || 0,
    }));
  } catch (error) {
    console.warn("[retrieveMemories] Failed to retrieve memories:", error);
    return [];
  }
}

/**
 * 检索 RAG 文档
 */
async function retrieveRAGDocuments(
  query: string,
  configuration: any
): Promise<RAGContext | null> {
  // 如果未启用 RAG，返回 null
  if (!configuration.enableRAG) {
    return null;
  }

  try {
    // 这里应该调用实际的 RAG 检索 API
    // 简化实现，实际项目中需要连接到 RAG 后端
    const response = await fetch(`${configuration.ragApiUrl || "http://localhost:8000"}/api/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        user_id: configuration.userId || "default",
        k: configuration.contextEngineering?.maxRAGDocs || 5,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      documents: data.documents.map((doc: any) => ({
        content: doc.content,
        source: doc.metadata?.source || "Unknown",
        pageNumber: doc.metadata?.page_number,
        relevanceScore: doc.metadata?.score || 0.5,
        metadata: doc.metadata,
      })),
      query,
      totalResults: data.total || data.documents.length,
    };
  } catch (error) {
    console.warn("[retrieveRAGDocuments] RAG retrieval failed:", error);
    return null;
  }
}

/**
 * 获取或创建用户画像
 */
async function getUserProfile(
  userId: string,
  config: RunnableConfig
): Promise<UserProfile | null> {
  try {
    const store = (config as any).store;
    if (!store) {
      return null;
    }

    const profile = await store.get(["profiles", userId], "main");
    if (profile?.value) {
      return {
        userId,
        ...profile.value,
        lastUpdated: profile.updatedAt || Date.now(),
      };
    }

    return null;
  } catch (error) {
    console.warn("[getUserProfile] Failed to get user profile:", error);
    return null;
  }
}

/**
 * 模型调用节点 - 集成上下文工程
 */
async function callModel(
  state: typeof GraphState.State,
  config: RunnableConfig
): Promise<Partial<typeof GraphState.State>> {
  const configuration = ensureConfiguration(config);
  const userId = configuration.userId || "default";

  console.log("[callModel] Starting with Context Engineering...");

  // 获取工具
  const tools = await getCachedTools(configuration);
  console.log(`[callModel] Loaded ${tools.length} tools`);

  // 获取 MCP 状态
  const mcpStatus = getMCPConnectionStatuses();

  // 获取当前查询
  const lastMessage = state.messages[state.messages.length - 1];
  const currentQuery = lastMessage?.getType() === "human"
    ? (lastMessage as HumanMessage).content as string
    : "";

  // 检索长期记忆
  let memories: LongTermMemory[] = [];
  if (configuration.contextEngineering?.enableLongTermMemory !== false) {
    memories = await retrieveMemories(userId, currentQuery, config);
    console.log(`[callModel] Retrieved ${memories.length} memories`);
  }

  // 检索 RAG 文档
  let ragContext: RAGContext | null = null;
  if (configuration.contextEngineering?.enableRAG) {
    ragContext = await retrieveRAGDocuments(currentQuery, configuration);
    console.log(`[callModel] Retrieved ${ragContext?.documents?.length || 0} RAG documents`);
  }

  // 获取用户画像
  const userProfile = configuration.contextEngineering?.enableUserProfile !== false
    ? await getUserProfile(userId, config)
    : null;

  // 使用上下文管理器构建上下文
  const contextManager = getContextManager(configuration);

  const buildResult: BuildContextResult = await contextManager.buildContext({
    userId,
    messages: state.messages,
    userProfile: userProfile || undefined,
    longTermMemories: memories.length > 0 ? memories : undefined,
    ragContext: ragContext || undefined,
    systemPrompt: configuration.systemPromptTemplate.replace(
      "{system_time}",
      new Date().toISOString()
    ),
    currentQuery,
  });

  console.log(`[callModel] Context built: ${buildResult.metadata.totalTokens} tokens`);
  console.log(`[callModel] Layers: ${buildResult.metadata.layerCount}`);
  console.log(`[callModel] Compression applied: ${buildResult.metadata.compressionApplied}`);

  // 加载模型
  const llmConfig = configuration.modelConfigs?.llm;
  const effectiveModel = llmConfig?.model || configuration.model;
  console.log(`[callModel] Using model: ${effectiveModel}`);

  const model = (await loadChatModel(effectiveModel, llmConfig)).bindTools(tools);

  // 使用构建好的上下文调用模型
  const response = await model.invoke(buildResult.messages);

  // 返回结果和元数据
  return {
    messages: [response],
    mcpStatus,
    contextMetadata: {
      totalTokens: buildResult.metadata.totalTokens,
      compressionApplied: buildResult.metadata.compressionApplied,
      selectionApplied: buildResult.metadata.selectionApplied,
      layerInfo: buildResult.metadata.layersInfo,
    },
    userProfile,
    retrievedMemories: memories,
    ragContext,
  };
}

/**
 * 路由模型输出
 */
function routeModelOutput(state: typeof GraphState.State): string {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  const toolCalls = (lastMessage as AIMessage)?.tool_calls;

  if (toolCalls && toolCalls.length > 0) {
    console.log(`[routeModelOutput] Routing to tools: ${toolCalls.map((tc: any) => tc.name).join(", ")}`);
    return "tools";
  }

  console.log("[routeModelOutput] No tool calls, ending graph");
  return "__end__";
}

/**
 * 工具节点
 */
async function toolsNode(
  state: typeof GraphState.State,
  config: RunnableConfig
): Promise<Partial<typeof GraphState.State>> {
  const configuration = ensureConfiguration(config);
  const tools = await getCachedTools(configuration);

  console.log(`[toolsNode] Executing ${tools.length} tools`);

  const toolNode = new ToolNode(tools);
  const result = await toolNode.invoke({ messages: state.messages }, config);

  // 保留其他状态
  return {
    messages: result.messages,
    mcpStatus: state.mcpStatus,
    contextMetadata: state.contextMetadata,
    userProfile: state.userProfile,
    retrievedMemories: state.retrievedMemories,
    ragContext: state.ragContext,
  };
}

/**
 * 保存记忆节点（可选）
 */
async function saveMemoryNode(
  state: typeof GraphState.State,
  config: RunnableConfig
): Promise<Partial<typeof GraphState.State>> {
  const configuration = ensureConfiguration(config);

  // 只在启用长期记忆时执行
  if (configuration.contextEngineering?.enableLongTermMemory === false) {
    return {};
  }

  try {
    const store = (config as any).store;
    if (!store) {
      return {};
    }

    const userId = configuration.userId || "default";

    // 从对话中提取值得保存的信息
    const lastExchange = state.messages.slice(-2);
    const humanMsg = lastExchange.find((m) => m.getType() === "human");
    const aiMsg = lastExchange.find((m) => m.getType() === "ai");

    if (humanMsg && aiMsg) {
      // 这里可以添加更复杂的逻辑来判断是否值得保存
      const content = (humanMsg as HumanMessage).content as string;

      // 简单启发式：如果用户提到个人信息，保存到记忆
      if (/我(?:叫|是|喜欢|在|来自)/.test(content)) {
        const memoryId = `mem_${Date.now()}`;
        await store.put(["memories", userId], memoryId, {
          content: content.slice(0, 500),
          context: "用户提到的个人信息",
          createdAt: Date.now(),
        });
        console.log(`[saveMemoryNode] Saved memory: ${memoryId}`);
      }
    }
  } catch (error) {
    console.warn("[saveMemoryNode] Failed to save memory:", error);
  }

  return {};
}

// 构建工作流
const workflow = new StateGraph(GraphState, ConfigurationSchema)
  .addNode("callModel", callModel)
  .addNode("tools", toolsNode)
  .addNode("saveMemory", saveMemoryNode)
  .addEdge("__start__", "callModel")
  .addConditionalEdges("callModel", routeModelOutput)
  .addEdge("tools", "callModel")
  .addEdge("saveMemory", "__end__");

// 编译图
export const graph = workflow.compile({
  interruptBefore: [],
  interruptAfter: [],
});

graph.name = "ReactAgentWithContextEngineering";
