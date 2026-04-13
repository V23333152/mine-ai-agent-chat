import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { MessagesAnnotation, StateGraph, Annotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";

import { ConfigurationSchema, ensureConfiguration } from "./configuration.js";
import { getTools, getMCPConnectionStatuses } from "./tools.js";
import { loadChatModel } from "./utils.js";

/**
 * Convert message content to format suitable for LangChain messages.
 * Handles multimodal content (text + images).
 */
function convertContentToLangChain(content: any): any {
  // If content is already a string, return as-is
  if (typeof content === 'string') {
    return content;
  }
  
  // If content is an array (multimodal), validate and format each part
  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      if (part.type === 'image_url') {
        return {
          type: 'image_url',
          image_url: typeof part.image_url === 'string' 
            ? part.image_url 
            : part.image_url?.url
        };
      }
      return part;
    });
  }
  
  return content;
}

// Maximum number of messages to keep in context (to avoid token limit)
// Increased to support multi-step tool calls with MCP (need ~25 for full chain)
const MAX_CONTEXT_MESSAGES = 30;

// Cache for tools to avoid recreating them on every call
let toolsCache: { tools: any[]; config: string } | null = null;

/**
 * Clear tools cache to force refresh (e.g., when skills are loaded)
 */
export function clearToolsCache(): void {
  console.log("[getCachedTools] Clearing tools cache");
  toolsCache = null;
}

// Extend state to include MCP status
const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,
  mcpStatus: Annotation<Record<string, { status: string; error?: string; toolCount: number }>>(),
});

/**
 * Trim messages to fit within token limits
 * Keeps system message and most recent messages
 * Preserves tool calls and their results
 */
function trimMessages(messages: BaseMessage[]): BaseMessage[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages;
  }
  
  // Always keep the most recent messages, but ensure we keep tool-related messages
  // Find the index where we should start slicing
  let startIndex = Math.max(0, messages.length - MAX_CONTEXT_MESSAGES);
  
  // Check if we're cutting in the middle of a tool call/result pair
  // If so, adjust to keep the complete pair
  const sliced = messages.slice(startIndex);
  
  // If first message is a tool result, find its corresponding tool call
  const firstMsg = sliced[0];
  if ((firstMsg as any).tool_call_id) {
    // This is a tool message, find the matching AI message with tool_calls
    for (let i = startIndex - 1; i >= 0; i--) {
      const msg = messages[i];
      if ((msg as AIMessage)?.tool_calls?.some((tc: any) => tc.id === (firstMsg as any).tool_call_id)) {
        // Found the matching tool call, include it
        startIndex = i;
        break;
      }
    }
  }
  
  return messages.slice(startIndex);
}

/**
 * Get cached or new tools based on configuration
 */
async function getCachedTools(configuration: any): Promise<any[]> {
  const configKey = JSON.stringify({
    enableWebSearch: configuration.enableWebSearch,
    enableMCP: configuration.enableMCP,
    mcpServers: configuration.mcpServers,
    mcpToolConfigs: configuration.mcpToolConfigs,
    modelConfigs: configuration.modelConfigs,
  });

  console.log("[getCachedTools] Configuration:", {
    enableWebSearch: configuration.enableWebSearch,
    enableMCP: configuration.enableMCP,
    modelConfigs: configuration.modelConfigs,
    ttsConfig: configuration.modelConfigs?.tts,
  });

  if (toolsCache && toolsCache.config === configKey) {
    console.log("[getCachedTools] Using cached tools");
    return toolsCache.tools;
  }

  console.log("[getCachedTools] Creating new tools");
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

// Define the function that calls the model
async function callModel(
  state: typeof GraphState.State,
  config: RunnableConfig,
): Promise<Partial<typeof GraphState.State>> {
  /** Call the LLM powering our agent. **/
  const configuration = ensureConfiguration(config);

  // Get tools based on configuration (async to support MCP)
  const tools = await getCachedTools(configuration);
  console.log(`[callModel] Loaded ${tools.length} tools:`, tools.map((t: any) => t.name).join(', '));

  // Get MCP connection statuses
  const mcpStatus = getMCPConnectionStatuses();

  // Log current messages
  console.log(`[callModel] Current messages count: ${state.messages.length}`);
  const lastMessage = state.messages[state.messages.length - 1];
  console.log(`[callModel] Last message type: ${lastMessage?.getType?.()}`);
  
  // Debug: Check if last message has multimodal content
  if (lastMessage) {
    const content = (lastMessage as any).content;
    console.log(`[callModel] Last message content type: ${typeof content}`);
    if (Array.isArray(content)) {
      console.log(`[callModel] Last message has ${content.length} content parts`);
      content.forEach((part: any, idx: number) => {
        console.log(`[callModel] Content part ${idx}: type=${part.type}, keys=${Object.keys(part).join(',')}`);
      });
    } else if (typeof content === 'string') {
      console.log(`[callModel] Last message content (first 100 chars): ${content.substring(0, 100)}`);
    }
  }

  // Feel free to customize the prompt, model, and other logic!
  // Use frontend-provided model config if available
  const llmConfig = configuration.modelConfigs?.llm;
  const effectiveModel = llmConfig?.model || configuration.model;
  console.log(`[callModel] Using model: ${effectiveModel}`, llmConfig ? '(from frontend config)' : '(from env/default)');
  const model = (await loadChatModel(effectiveModel, llmConfig)).bindTools(tools);

  // Process messages to ensure multimodal content is properly formatted
  const processedMessages = state.messages.map((msg: BaseMessage) => {
    // If it's a human message with array content, ensure proper format
    if (msg.getType() === 'human' && Array.isArray((msg as any).content)) {
      const convertedContent = convertContentToLangChain((msg as any).content);
      return new HumanMessage({ content: convertedContent });
    }
    return msg;
  });

  // Trim messages to avoid exceeding token limit
  const trimmedMessages = trimMessages(processedMessages);
  
  if (state.messages.length > MAX_CONTEXT_MESSAGES) {
    console.log(`[callModel] Trimmed messages from ${state.messages.length} to ${trimmedMessages.length}`);
  }

  const response = await model.invoke([
    {
      role: "system",
      content: configuration.systemPromptTemplate.replace(
        "{system_time}",
        new Date().toISOString(),
      ),
    },
    ...trimmedMessages,
  ]);

  // We return a list, because this will get added to the existing list
  return { messages: [response], mcpStatus };
}

// Define the function that determines whether to continue or not
function routeModelOutput(state: typeof GraphState.State): string {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  const toolCalls = (lastMessage as AIMessage)?.tool_calls;
  
  console.log(`[routeModelOutput] Last message type: ${lastMessage?.getType?.()}`);
  const toolCallCount = toolCalls?.length || 0;
  console.log(`[routeModelOutput] Tool calls count: ${toolCallCount}`);
  if (toolCallCount > 0) {
    console.log(`[routeModelOutput] Tool calls:`, toolCalls?.map((tc: any) => tc.name).join(', '));
    return "tools";
  }
  // Otherwise end the graph.
  else {
    console.log(`[routeModelOutput] No tool calls, ending graph`);
    return "__end__";
  }
}

// Define the tools node that uses dynamic tools based on configuration
async function toolsNode(
  state: typeof GraphState.State,
  config: RunnableConfig,
): Promise<Partial<typeof GraphState.State>> {
  const configuration = ensureConfiguration(config);
  const tools = await getCachedTools(configuration);
  console.log(`[toolsNode] Processing ${tools.length} tools`);
  
  // Log the last AI message to see what tool calls are being made
  const lastMessage = state.messages[state.messages.length - 1];
  if ((lastMessage as AIMessage)?.tool_calls) {
    const toolCalls = (lastMessage as AIMessage).tool_calls;
    console.log(`[toolsNode] Tool calls to execute:`);
    for (const tc of toolCalls || []) {
      console.log(`[toolsNode]   - ${tc.name}:`, JSON.stringify(tc.args));
    }
  }
  
  const toolNode = new ToolNode(tools);
  const result = await toolNode.invoke({ messages: state.messages }, config);
  console.log(`[toolsNode] Tool execution complete, result messages: ${result.messages.length}`);
  
  // Log all result messages
  for (const msg of result.messages) {
    const toolMsg = msg as any;
    if (toolMsg.tool_call_id) {
      console.log(`[toolsNode] Result for ${toolMsg.name}:`, toolMsg.content?.substring(0, 200));
    }
  }
  
  // Preserve mcpStatus from state
  return { messages: result.messages, mcpStatus: state.mcpStatus };
}

// Define a new graph. We use the extended GraphState to include MCP status
const workflow = new StateGraph(GraphState, ConfigurationSchema)
  // Define the two nodes we will cycle between
  .addNode("callModel", callModel)
  .addNode("tools", toolsNode)
  // Set the entrypoint as `callModel`
  // This means that this node is the first one called
  .addEdge("__start__", "callModel")
  .addConditionalEdges(
    // First, we define the edges' source node. We use `callModel`.
    // This means these are the edges taken after the `callModel` node is called.
    "callModel",
    // Next, we pass in the function that will determine the sink node(s), which
    // will be called after the source node is called.
    routeModelOutput,
  )
  // This means that after `tools` is called, `callModel` node is called next.
  .addEdge("tools", "callModel");

// Finally, we compile it!
// This compiles it into a graph you can invoke and deploy.
export const graph = workflow.compile({
  interruptBefore: [], // if you want to update the state before calling the tools
  interruptAfter: [],
});
