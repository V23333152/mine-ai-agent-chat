import { initChatModel } from "langchain/chat_models/universal";

/**
 * Map of provider aliases to their actual LangChain provider names.
 * OpenAI-compatible APIs use 'openai' as the provider with a custom baseURL.
 */
const PROVIDER_MAP: Record<string, string> = {
  // Native LangChain providers
  openai: "openai",
  anthropic: "anthropic",
  azure_openai: "azure_openai",
  cohere: "cohere",
  google: "google-genai",
  ollama: "ollama",
  together: "together",
  fireworks: "fireworks",
  mistral: "mistralai",
  groq: "groq",
  bedrock: "bedrock",
  cerebras: "cerebras",
  deepseek: "deepseek",
  xai: "xai",
  perplexity: "perplexity",
  // OpenAI-compatible APIs - these map to 'openai' with custom baseURL
  moonshot: "openai",
  zhipu: "openai",
  dashscope: "openai",
  local: "openai",
};

/**
 * Check if a provider is OpenAI-compatible (uses OpenAI SDK with custom baseURL)
 */
function isOpenAICompatible(provider: string): boolean {
  return ["moonshot", "zhipu", "dashscope", "local"].includes(provider.toLowerCase());
}

/**
 * Load a chat model from a fully specified name.
 * @param fullySpecifiedName - String in the format 'provider/model' or just 'model'.
 * @param modelConfig - Optional model configuration from frontend.
 * @returns A Promise that resolves to a BaseChatModel instance.
 */
export async function loadChatModel(
  fullySpecifiedName: string,
  modelConfig?: { model: string; provider: string; apiKey: string; baseUrl: string } | null,
): Promise<ReturnType<typeof initChatModel>> {
  const index = fullySpecifiedName.indexOf("/");
  
  // Use frontend-provided config if available, otherwise fall back to env vars
  const apiKey = modelConfig?.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = modelConfig?.baseUrl || process.env.OPENAI_BASE_URL;
  
  // Determine the actual provider to use
  let modelProvider: string;
  let modelName: string;
  
  if (modelConfig?.provider) {
    // Use frontend-provided config
    const frontendProvider = modelConfig.provider.toLowerCase();
    
    if (isOpenAICompatible(frontendProvider)) {
      // For OpenAI-compatible APIs (Moonshot, Zhipu, etc.), use 'openai' provider
      modelProvider = "openai";
      modelName = modelConfig.model;
      console.log(`[loadChatModel] Using OpenAI-compatible API: ${modelConfig.model} (${frontendProvider})`);
    } else {
      // For native providers (Anthropic, etc.), use their actual provider name
      modelProvider = PROVIDER_MAP[frontendProvider] || frontendProvider;
      modelName = modelConfig.model;
      console.log(`[loadChatModel] Using native provider: ${modelConfig.model} (${modelProvider})`);
    }
  } else if (index !== -1) {
    // Parse from fullySpecifiedName (format: "provider/model")
    const parsedProvider = fullySpecifiedName.slice(0, index).toLowerCase();
    modelProvider = PROVIDER_MAP[parsedProvider] || parsedProvider;
    modelName = fullySpecifiedName.slice(index + 1);
  } else {
    // No provider specified
    modelName = fullySpecifiedName;
    modelProvider = baseUrl ? "openai" : "openai"; // Default to openai
  }
  
  // Build configuration object
  const config: Record<string, any> = {};
  
  if (apiKey) {
    config.apiKey = apiKey;
  }
  
  if (baseUrl) {
    config.configuration = {
      baseURL: baseUrl,
    };
  }
  
  // Check if this is a vision-capable model
  const isVisionModel = modelName.includes("vision") || 
                        modelName.includes("gpt-4o") ||
                        modelName.includes("claude-3") ||
                        modelName.includes("vl");
  
  if (isVisionModel) {
    console.log(`[loadChatModel] Loading vision-capable model: ${modelName}`);
  }
  
  console.log(`[loadChatModel] Final config: model=${modelName}, provider=${modelProvider}`);
  
  return await initChatModel(modelName, { 
    modelProvider,
    ...config,
  });
}

/**
 * Check if a model supports vision/multimodal inputs
 */
export function isVisionCapableModel(modelName: string): boolean {
  const visionModels = [
    "vision",
    "gpt-4o",
    "claude-3",
    "gemini-pro-vision",
    "qwen-vl",
    "yi-vl",
  ];
  return visionModels.some(vm => modelName.toLowerCase().includes(vm.toLowerCase()));
}
