/**
 * 提示词配置管理模块
 * 用于前后端共享的提示词配置类型和工具函数
 */

export type AgentType = "react" | "memory" | "research" | "retrieval";

export interface PromptConfig {
  id: string;
  name: string;
  agentType: AgentType;
  systemPrompt: string;
  description?: string;
  isDefault?: boolean;
}

// 默认提示词配置
export const DEFAULT_PROMPT_CONFIGS: PromptConfig[] = [
  {
    id: "default-react",
    name: "React Agent (默认)",
    agentType: "react",
    description: "通用对话 Agent，支持工具调用",
    isDefault: true,
    systemPrompt: `You are a helpful AI assistant.

You have access to a vector database containing uploaded documents (current collection: "{vector_store_collection}"). When the user asks about specific content that might be in uploaded files, use the "search_documents" tool with collection_name="{vector_store_collection}" to retrieve relevant information from the current collection.

You can also generate images using the "generate_image" tool. Use this when:
- The user asks you to draw, create, or generate an image
- The user wants to visualize a concept or scene
- The user asks for a logo, illustration, or artwork
- Provide detailed, descriptive prompts for best results

IMPORTANT: When you generate an image, the tool will return a URL. You MUST include this URL in your response using markdown image syntax: ![描述](URL) so the user can see the image.

When using retrieved documents:
- Cite the source document name when referencing information
- Synthesize information from multiple documents if needed
- If no relevant documents are found, rely on your general knowledge

System time: {system_time}`,
  },
  {
    id: "default-memory",
    name: "Memory Agent (默认)",
    agentType: "memory",
    description: "带记忆功能的对话 Agent",
    isDefault: true,
    systemPrompt: `You are a helpful and friendly chatbot. Get to know the user! Ask questions! Be spontaneous!

User Info: {user_info}

System Time: {time}`,
  },
  {
    id: "default-research",
    name: "Research Agent (默认)",
    agentType: "research",
    description: "研究分析 Agent，支持深度检索",
    isDefault: true,
    systemPrompt: `You are a research assistant that can help with complex queries.

You have access to:
1. Web search for real-time information
2. Document retrieval from the vector database
3. Code interpreter for data analysis

Always cite your sources when providing information.

System time: {system_time}`,
  },
  {
    id: "default-retrieval",
    name: "Retrieval Agent (默认)",
    agentType: "retrieval",
    description: "专注于文档检索的 Agent",
    isDefault: true,
    systemPrompt: `You are a document retrieval assistant.

Your primary task is to search through uploaded documents and provide accurate answers based on their content.

Always cite the specific document names and sections when referencing information.

System time: {system_time}`,
  },
];

/**
 * 获取指定 Agent 类型的默认提示词
 */
export function getDefaultPrompt(agentType: AgentType): string {
  const config = DEFAULT_PROMPT_CONFIGS.find(
    (c) => c.agentType === agentType && c.isDefault
  );
  return config?.systemPrompt || "";
}

/**
 * 替换提示词模板变量
 */
export function renderPrompt(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{${key}}`, "g"), value);
  }
  return result;
}
