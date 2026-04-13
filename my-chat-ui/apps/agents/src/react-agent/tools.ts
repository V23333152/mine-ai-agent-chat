/**
 * This file defines the tools available to the ReAct agent.
 * Tools are functions that the agent can use to interact with external systems or perform specific tasks.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchDocuments } from "./retrieval_tool.js";
import {
  getEnabledMCPTools,
  connectMCPServer,
  disconnectAllMCPServers,
  MCPServerConfig,
  MCPToolConfig,
  setMCPToolEnabled,
  getConnectionStatuses,
} from "./mcp_manager.js";
import {
  searchPOI,
  searchNearby,
  geocode,
  walkingRoute,
  drivingRoute,
  transitRoute,
  travelPlanner,
  isAmapKeyConfigured,
} from "./amap-tools.js";

// ========== Skill System Integration ==========
import {
  initializeSkillManager,
  reloadSkillManager,
  getAllTools as getAllSkillTools,
  getSkillStatus,
  setSkillEnabled,
  shutdownSkillManager,
  onSkillLoaded,
} from "../skills/index.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REGISTRY_FILE = path.join(__dirname, "../skills/registry.json");

// Track registry file modification time for hot reload
let lastRegistryMtime: number | null = null;

async function checkAndReloadSkills(): Promise<void> {
  try {
    const stats = await fs.stat(REGISTRY_FILE);
    const currentMtime = stats.mtimeMs;

    if (lastRegistryMtime === null) {
      lastRegistryMtime = currentMtime;
      return;
    }

    if (currentMtime !== lastRegistryMtime) {
      console.log("[Tools] Registry file changed, reloading skills...");
      lastRegistryMtime = currentMtime;
      await reloadSkillManager();
    }
  } catch (error) {
    // Registry file might not exist yet
  }
}

/**
 * Base tools always available to the agent
 */
const BASE_TOOLS: any[] = [
  searchDocuments,  // Search uploaded documents
];

// Debug: Log environment variable status (will show in LangGraph CLI logs)
console.log("[Web Search] Environment check:");
console.log("[Web Search] TAVILY_API_KEY exists:", !!process.env.TAVILY_API_KEY);
console.log("[Web Search] TAVILY_API_KEY length:", process.env.TAVILY_API_KEY?.length || 0);

/**
 * Web search tool using Tavily API
 * This tool performs web searches and returns truncated results to fit within token limits.
 */
const webSearchTool = tool(
  async ({ query }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    
    if (!apiKey) {
      return "ERROR: TAVILY_API_KEY is not set. Please configure the API key to use web search.";
    }

    try {
      // Call Tavily API directly with reduced content
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          search_depth: "basic", // Use basic search for less content
          max_results: 3, // Reduce results
          include_answer: false,
          include_raw_content: false, // Don't include raw content to save tokens
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return `Web search failed: ${error}`;
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        return "No web search results found.";
      }

      // Format and truncate results
      const formattedResults = data.results.map((result: any, index: number) => {
        const title = result.title || "No title";
        const content = (result.content || "").substring(0, 300); // Limit each result to 300 chars
        const url = result.url || "";
        return `[${index + 1}] ${title}\n${content}${result.content?.length > 300 ? "..." : ""}\nSource: ${url}`;
      });

      return `Web search results for "${query}":\n\n${formattedResults.join("\n\n")}`;
    } catch (error) {
      return `Web search error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
  {
    name: "web_search",
    description: "Search the internet for current information. Use for news, current events, or facts not in uploaded documents.",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  }
);

// Debug: Log image generation environment
console.log("[Image Generation] Environment check:");
console.log("[Image Generation] ZHIPU_API_KEY exists:", !!process.env.ZHIPU_API_KEY);

/**
 * Create image generation tool with dynamic configuration
 */
function createImageGenerationTool(config?: { model: string; provider: string; apiKey: string; baseUrl: string }) {
  return tool(
    async ({ prompt, size }) => {
      // Handle null values from API
      const finalSize = size ?? "1024x1024";
      
      // Use frontend config if available, otherwise fall back to env
      const apiKey = config?.apiKey || process.env.ZHIPU_API_KEY;
      const modelId = config?.model || "cogview-3";
      const baseUrl = config?.baseUrl || "https://open.bigmodel.cn/api/paas/v4";
      
      if (!apiKey) {
        return "ERROR: API Key 未设置。请在模型配置中设置图像生成模型的 API Key。";
      }

      try {
        console.log(`[Image Generation] Generating image with ${modelId} (${finalSize}): ${prompt.substring(0, 50)}...`);
        
        // Call image generation API
        const response = await fetch(`${baseUrl}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            prompt: prompt,
            size: finalSize,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || await response.text();
          console.error("[Image Generation] API error:", errorMsg);
          return `图像生成失败: ${errorMsg}`;
        }

        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
          return "ERROR: 未能生成图像。";
        }

        const imageUrl = data.data[0].url;
        
        console.log(`[Image Generation] Successfully generated image with ${modelId}`);
        
        return `图像生成成功！

**图像URL：** ${imageUrl}

**Markdown格式（请复制到你的回复中）：**
![生成的图像](${imageUrl})

**提示词：** ${prompt}`;
      } catch (error) {
        console.error("[Image Generation] Error:", error);
        return `图像生成错误: ${error instanceof Error ? error.message : "未知错误"}`;
      }
    },
    {
      name: "generate_image",
      description: `根据文本描述生成图像。
当用户要求你以下操作时，请使用此工具：
- 画/创建/生成图像、图片或艺术作品
- 可视化概念或场景
- 创建标志、插图或设计
- 展示某物的外观

请提供详细、描述性的提示词以获得最佳效果。请包含以下细节：
- 主题内容（图像中有什么）
- 风格（写实、卡通、油画等）
- 颜色和光照
- 构图和视角`,
      schema: z.object({
        prompt: z.string().describe("要生成的图像的详细描述。请具体说明主题、风格、颜色和构图。"),
        size: z.enum(["1024x1024", "1792x1024", "1024x1792"]).nullable().describe("图像尺寸：正方形(1024x1024)、横屏(1792x1024)或竖屏(1024x1792)。默认: 1024x1024"),
      }),
    }
  );
}

// Debug: Log TTS service environment
console.log("[TTS Service] Environment check:");
console.log("[TTS Service] GPT-SoVITS endpoint: http://127.0.0.1:8880");

/**
 * Create TTS tool with dynamic configuration
 */
function createTextToSpeechTool(config?: { model: string; provider: string; apiKey: string; baseUrl: string }) {
  console.log("[createTextToSpeechTool] Creating TTS tool with config:", config);
  
  // 根据配置确定模型类型
  const modelId = config?.model || "sovits";
  const baseUrl = config?.baseUrl || (modelId === "qwen-tts" || modelId.includes("qwen") ? "https://dashscope.aliyuncs.com/api/v1" : "http://127.0.0.1:8880");
  const isLocal = modelId === "sovits" || config?.provider === "local";
  const isQwen = modelId === "qwen-tts" || modelId.includes("qwen");
  
  // 动态生成工具描述
  const getDescription = () => {
    if (isQwen) {
      return `将文本转换为语音（TTS）。使用千问 TTS 服务。

使用场景：
- 用户希望听到 AI 的语音回复
- 需要语音播报信息
- 为视障用户提供语音辅助

注意：千问 TTS 使用默认音色，不支持角色选择。

参数说明：
- text: 要转换为语音的文本内容
- character: （千问 TTS 忽略此参数）
- emotion: （千问 TTS 忽略此参数）
- speed: （千问 TTS 忽略此参数）`;
    } else {
      return `将文本转换为语音（TTS）。使用本地 GPT-SoVITS 语音合成服务，支持高质量的角色语音。

使用场景：
- 用户希望听到 AI 的语音回复
- 需要语音播报信息
- 为视障用户提供语音辅助

可用角色：
- 芙宁娜_ZH: 原神角色芙宁娜，活泼可爱的少女音（推荐）

参数说明：
- text: 要转换为语音的文本内容
- character: 角色ID，目前支持 "芙宁娜_ZH"
- emotion: 情感风格，默认 "default"
- speed: 语速，范围 0.5-2.0，默认 1.0`;
    }
  };
  
  return tool(
    async ({ text, character, emotion, speed }) => {
      // Handle null values from API
      const finalCharacter = character ?? "芙宁娜_ZH";
      const finalEmotion = emotion ?? "default";
      const finalSpeed = speed ?? 1.0;
      
      // Use frontend config if available (这些变量在函数开头已定义)
      const apiKey = config?.apiKey || "";
      
      console.log(`[TTS] Using model=${modelId}, baseUrl=${baseUrl}, isLocal=${isLocal}, isQwen=${isQwen}, text="${text.substring(0, 30)}..."`);
      
      // 千问TTS不需要character参数，如果传了也忽略
      if (isQwen && character) {
        console.log(`[TTS] Qwen TTS ignores character parameter: ${character}`);
      }
      
      try {
        let response;
        
        if (isQwen) {
          // 千问 TTS API (阿里云 DashScope)
          response = await fetch(`${baseUrl}/services/audio/tts`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "sambert-zhichu-v1",  // 千问默认音色
              input: {
                text: text,
              },
              parameters: {
                sample_rate: 48000,
                format: "mp3",
              },
            }),
          });
        } else {
          // 本地 GPT-SoVITS API
          response = await fetch(`${baseUrl}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              character: finalCharacter,
              emotion: finalEmotion,
              speed: finalSpeed,
              model: modelId,
            }),
          });
        }
        
        if (!response.ok) {
          const error = await response.text();
          console.error(`[TTS] HTTP error: ${response.status}, ${error}`);
          return `TTS 服务错误 (HTTP ${response.status}): ${error}`;
        }
        
        const result = await response.json();
        console.log(`[TTS] Response:`, result);
        
        if (isQwen) {
          // 千问 TTS 响应格式
          if (result.output?.audio_url || result.output?.wav_url) {
            const audioUrl = result.output.audio_url || result.output.wav_url;
            return `🔊 TTS 合成成功！

**文本**: ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}
**模型**: 千问 TTS
**音频URL**: ${audioUrl}

💡 提示：前端将自动播放生成的语音。`;
          } else {
            return `TTS 合成失败: ${result.message || "未知错误"}`;
          }
        } else {
          // 本地 GPT-SoVITS 响应格式
          if (result.success && result.audio_url) {
            return `🔊 TTS synthesis successful!

**文本**: ${text.substring(0, 100)}${text.length > 100 ? "..." : ""}
**角色**: ${finalCharacter}
**音频URL**: ${result.audio_url}

💡 提示：前端将自动播放生成的语音。`;
          } else {
            return `TTS 合成失败: ${result.error || "未知错误"}`;
          }
        }
      } catch (error) {
        const serviceName = isLocal ? "GPT-SoVITS" : (isQwen ? "千问 TTS" : "TTS");
        const errorMsg = error instanceof Error ? error.message : "未知错误";
        console.error(`[TTS] Error:`, error);
        return `${serviceName} 服务连接失败: ${errorMsg}。请确保服务已启动。`;
      }
    },
    {
      name: "text_to_speech",
      description: getDescription() + `\n\n当前配置: ${isQwen ? "千问 TTS (云)" : "GPT-SoVITS (本地)"}`,
      schema: z.object({
        text: z.string().describe("要转换为语音的文本内容"),
        character: z.string().nullable().describe(isQwen ? "（千问TTS忽略此参数）" : "角色ID，目前支持 '芙宁娜_ZH'"),
        emotion: z.string().nullable().describe(isQwen ? "（千问TTS忽略此参数）" : "情感风格，默认 default"),
        speed: z.number().nullable().describe(isQwen ? "（千问TTS忽略此参数）" : "语速 0.5-2.0，默认 1.0"),
      }),
    }
  );
}

/**
 * Code Interpreter - Execute Python code
 * Supports: data analysis, visualization, calculations
 */
const codeInterpreterTool = tool(
  async ({ code }) => {
    console.log(`[Code Interpreter] Executing code:\n${code.substring(0, 200)}...`);
    
    try {
      const response = await fetch("http://127.0.0.1:8888/code/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          session_id: "agent_session"
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        return `代码执行服务错误: ${error}`;
      }
      
      const result = await response.json();
      
      if (result.success) {
        let output = `✅ 代码执行成功！\n\n**执行时间**: ${result.execution_time.toFixed(3)}秒\n\n`;
        
        if (result.output) {
          output += `**输出**:\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
        }
        
        if (result.figures && result.figures.length > 0) {
          output += `**生成的图片**: ${result.figures.length} 张\n`;
          result.figures.forEach((fig: string, idx: number) => {
            output += `![图表${idx + 1}](data:image/png;base64,${fig.substring(0, 50)}...)\n`;
          });
        }
        
        return output;
      } else {
        return `❌ 代码执行失败:\n\n**错误**:\n\`\`\`\n${result.error || "未知错误"}\n\`\`\``;
      }
    } catch (error) {
      return `代码执行服务连接失败: ${error instanceof Error ? error.message : "未知错误"}。请确保代码执行服务已启动（端口 8882）。`;
    }
  },
  {
    name: "execute_python_code",
    description: `执行Python代码进行数据分析、计算或可视化。

使用场景：
- 数学计算和统计分析
- 数据处理和转换
- 生成图表和可视化
- 文件格式转换
- 算法验证

支持库：
- numpy (np): 数值计算
- pandas (pd): 数据处理
- matplotlib (plt): 数据可视化
- PIL: 图像处理

限制：
- 执行时间最多30秒
- 不能访问网络
- 不能执行系统命令
- 不能访问本地文件系统（除临时工作目录外）

输出格式：
- 使用 print() 输出文本结果
- 使用 plt.savefig() 保存图表
- 图表会自动显示给用户`,
    schema: z.object({
      code: z.string().describe("要执行的Python代码"),
    }),
  }
);

/**
 * Get available voices tool
 * Returns list of available GPT-SoVITS characters
 */
const getVoicesTool = tool(
  async () => {
    try {
      const response = await fetch("http://127.0.0.1:8880/characters");
      
      if (!response.ok) {
        return "获取角色列表失败：服务未响应";
      }
      
      const characters = await response.json();
      
      if (!Array.isArray(characters) || characters.length === 0) {
        return "暂无可用语音角色，请检查 GPT-SoVITS 服务状态。";
      }
      
      const voiceList = characters.map((c: any) => 
        `- **${c.name}** (${c.id}): ${c.description}\n  - 语言: ${c.language} | 情感: ${c.emotions?.join(", ") || "默认"}`
      ).join("\n\n");
      
      return `🎭 可用语音角色列表（共 ${characters.length} 个）：

${voiceList}

使用 \"text_to_speech\" 工具时，通过 character 参数选择角色。`;
    } catch (error) {
      return `获取角色列表失败: ${error instanceof Error ? error.message : "未知错误"}。请确保 GPT-SoVITS 服务已启动（端口 8880）。`;
    }
  },
  {
    name: "get_available_voices",
    description: "获取所有可用的 GPT-SoVITS 语音角色列表。在使用 text_to_speech 前可以调用此工具查看可用选项。",
    schema: z.object({}),
  }
);

// Debug: Log Amap configuration status
console.log("[Amap] Configuration check:");
console.log("[Amap] Key configured:", isAmapKeyConfigured());

/**
 * 高德地图 POI 搜索工具
 */
const amapSearchTool = tool(
  async ({ keywords, city }) => {
    if (!isAmapKeyConfigured()) {
      return "❌ 高德地图 API Key 未配置。请设置 AMAP_WEBSERVICE_KEY 环境变量后重试。";
    }
    
    const result = await searchPOI(keywords, city);
    
    if (result.success && result.data) {
      const pois = result.data.slice(0, 5).map((poi, index) => 
        `${index + 1}. **${poi.name}**\n   📍 ${poi.address}\n   📞 ${poi.tel || '无电话'}\n   🏷️ ${poi.type}`
      ).join('\n\n');
      
      return `🔍 搜索「${keywords}」${city ? `（${city}）` : ''}：\n\n${pois}\n\n共找到 ${result.data.length} 个结果`;
    } else {
      return `❌ 搜索失败：${result.message}`;
    }
  },
  {
    name: "amap_poi_search",
    description: `使用高德地图搜索POI（地点）。当用户需要搜索地址、地点、餐厅、酒店等时使用。

使用场景：
- 搜索餐厅、美食
- 搜索酒店、住宿
- 搜索景点、旅游地点
- 搜索商场、超市
- 搜索任何具体地点

参数说明：
- keywords: 搜索关键词，如"肯德基"、"酒店"、"天安门"
- city: 可选，限定搜索城市，如"北京"、"上海"`,
    schema: z.object({
      keywords: z.string().describe("搜索关键词，如餐厅名称、地点名称等"),
      city: z.string().optional().describe("可选，限定搜索的城市名称"),
    }),
  }
);

/**
 * 高德地图周边搜索工具
 */
const amapNearbyTool = tool(
  async ({ keywords, location, radius }) => {
    if (!isAmapKeyConfigured()) {
      return "❌ 高德地图 API Key 未配置。请设置 AMAP_WEBSERVICE_KEY 环境变量后重试。";
    }
    
    // 如果location是地址名称，先进行地理编码
    let coordinates = location;
    if (!location.includes(',')) {
      const geoResult = await geocode(location);
      if (!geoResult.success || !geoResult.location) {
        return `❌ 无法解析地址「${location}」，请检查地址是否正确。`;
      }
      coordinates = `${geoResult.location.lng},${geoResult.location.lat}`;
    }
    
    const result = await searchNearby(keywords, coordinates, radius);
    
    if (result.success && result.data) {
      const pois = result.data.slice(0, 5).map((poi, index) => 
        `${index + 1}. **${poi.name}**\n   📍 ${poi.address}\n   📏 距离: ${poi.distance}米\n   📞 ${poi.tel || '无电话'}`
      ).join('\n\n');
      
      return `📍 「${location}」周边搜索「${keywords}」（${radius}米范围内）：\n\n${pois}\n\n共找到 ${result.data.length} 个结果`;
    } else {
      return `❌ 周边搜索失败：${result.message}`;
    }
  },
  {
    name: "amap_nearby_search",
    description: `搜索指定位置周边的POI。当用户需要找"附近"、"周边"的地点时使用。

使用场景：
- 搜索某个地点周边的美食
- 搜索酒店附近的景点
- 搜索当前位置周边的设施

参数说明：
- keywords: 搜索关键词，如"美食"、"酒店"、"加油站"
- location: 中心位置，可以是坐标"经度,纬度"或地址名称如"西直门"
- radius: 搜索半径（米），默认1000`,
    schema: z.object({
      keywords: z.string().describe("搜索关键词"),
      location: z.string().describe("中心位置，如\"116.353138,39.939385\"或\"西直门\""),
      radius: z.number().default(1000).describe("搜索半径（米），默认1000"),
    }),
  }
);

/**
 * 高德地图路线规划工具
 */
const amapRouteTool = tool(
  async ({ origin, destination, routeType, city }) => {
    if (!isAmapKeyConfigured()) {
      return "❌ 高德地图 API Key 未配置。请设置 AMAP_WEBSERVICE_KEY 环境变量后重试。";
    }
    
    // 解析起点和终点坐标
    let originCoords = origin;
    let destCoords = destination;
    
    // 如果输入不是坐标格式，进行地理编码
    if (!origin.includes(',')) {
      const geoResult = await geocode(origin);
      if (!geoResult.success || !geoResult.location) {
        return `❌ 无法解析起点「${origin}」，请检查地址是否正确。`;
      }
      originCoords = `${geoResult.location.lng},${geoResult.location.lat}`;
    }
    
    if (!destination.includes(',')) {
      const geoResult = await geocode(destination);
      if (!geoResult.success || !geoResult.location) {
        return `❌ 无法解析终点「${destination}」，请检查地址是否正确。`;
      }
      destCoords = `${geoResult.location.lng},${geoResult.location.lat}`;
    }
    
    let result;
    switch (routeType) {
      case 'walking':
        result = await walkingRoute(originCoords, destCoords);
        break;
      case 'driving':
        result = await drivingRoute(originCoords, destCoords);
        break;
      case 'transit':
        if (!city) {
          return "❌ 公交路线规划需要提供城市参数";
        }
        result = await transitRoute(originCoords, destCoords, city);
        break;
      default:
        return `❌ 不支持的路线类型：${routeType}`;
    }
    
    if (result.success && result.data) {
      const route = result.data;
      const distanceKm = (parseInt(route.distance) / 1000).toFixed(1);
      const durationMin = Math.round(parseInt(route.duration) / 60);
      
      let steps = '';
      if (route.steps && route.steps.length > 0) {
        steps = '\n\n详细路线：\n' + route.steps.slice(0, 5).map((step: any, index: number) => 
          `${index + 1}. ${step.instruction}`
        ).join('\n');
        if (route.steps.length > 5) {
          steps += '\n...（更多步骤省略）';
        }
      }
      
      return `🗺️ ${routeType === 'walking' ? '🚶步行' : routeType === 'driving' ? '🚗驾车' : '🚌公交'}路线\n\n` +
             `起点：${origin}\n` +
             `终点：${destination}\n` +
             `距离：${distanceKm} 公里\n` +
             `预计时间：${durationMin} 分钟${steps}`;
    } else {
      return `❌ 路线规划失败：${result.message}`;
    }
  },
  {
    name: "amap_route_planning",
    description: `使用高德地图规划路线。当用户需要规划从A到B的路线时使用。

使用场景：
- 规划步行路线
- 规划驾车路线
- 规划公交路线
- 询问"从XX到XX怎么走"

参数说明：
- origin: 起点，可以是地址名称或坐标"经度,纬度"
- destination: 终点，可以是地址名称或坐标"经度,纬度"
- routeType: 路线类型：walking（步行）、driving（驾车）、transit（公交）
- city: 公交路线规划时需要提供城市名称`,
    schema: z.object({
      origin: z.string().describe("起点地址或坐标"),
      destination: z.string().describe("终点地址或坐标"),
      routeType: z.enum(["walking", "driving", "transit"]).default("walking").describe("路线类型"),
      city: z.string().optional().describe("公交路线规划时的城市名称"),
    }),
  }
);

/**
 * 高德地图旅游规划工具
 */
const amapTravelTool = tool(
  async ({ city, interests }) => {
    if (!isAmapKeyConfigured()) {
      return "❌ 高德地图 API Key 未配置。请设置 AMAP_WEBSERVICE_KEY 环境变量后重试。";
    }
    
    const interestList = interests.split(',').map(i => i.trim());
    const result = await travelPlanner(city, interestList);
    
    if (result.success && result.data) {
      const pois = result.data.slice(0, 8).map((poi: any, index: number) => 
        `${index + 1}. **${poi.name}**\n   📍 ${poi.address}\n   🏷️ ${poi.type}`
      ).join('\n\n');
      
      return `🗺️ ${city}旅游规划\n\n为您推荐的地点：\n\n${pois}\n\n共推荐 ${result.data.length} 个地点\n\n` +
             (result.mapLink ? `📍 查看地图：${result.mapLink}` : '');
    } else {
      return `❌ 旅游规划失败：${result.message}`;
    }
  },
  {
    name: "amap_travel_planner",
    description: `使用高德地图规划旅游行程。当用户需要规划某城市的旅游路线时使用。

使用场景：
- 规划一日游
- 推荐景点
- 规划游览路线

参数说明：
- city: 城市名称，如"北京"、"上海"
- interests: 兴趣点类型，逗号分隔，如"景点,美食,酒店"`,
    schema: z.object({
      city: z.string().describe("城市名称"),
      interests: z.string().default("景点,美食").describe("兴趣点类型，逗号分隔"),
    }),
  }
);

// Track MCP initialization state
let mcpInitialized = false;
let mcpInitPromise: Promise<void> | null = null;

// Track Skill Manager initialization state
let skillManagerInitialized = false;

// 注册 Skill 加载回调，在 Skill 加载完成后清除 tools 缓存
onSkillLoaded(() => {
  console.log("[Tools] Skill loaded, clearing tools cache to include new tools");
  // 使用动态导入避免循环依赖
  import("./graph.js")
    .then(({ clearToolsCache }) => {
      clearToolsCache();
    })
    .catch((e) => {
      console.error("[Tools] Failed to clear tools cache:", e);
    });
});

/**
 * Initialize MCP servers based on configuration
 */
async function initializeMCP(
  enableMCP: boolean,
  mcpServers: MCPServerConfig[],
  mcpToolConfigs: MCPToolConfig[]
): Promise<void> {
  if (!enableMCP || mcpServers.length === 0) {
    // Disconnect all MCP servers if disabled
    if (mcpInitialized) {
      await disconnectAllMCPServers();
      mcpInitialized = false;
    }
    return;
  }

  // Avoid concurrent initialization
  if (mcpInitPromise) {
    return mcpInitPromise;
  }

  mcpInitPromise = (async () => {
    try {
      console.log("[MCP] Initializing MCP servers...");
      
      // Disconnect existing connections first
      await disconnectAllMCPServers();

      // Connect to each server
      const connectionResults: Array<{ id: string; success: boolean; error?: string }> = [];
      for (const serverConfig of mcpServers) {
        if (serverConfig.enabled) {
          try {
            await connectMCPServer(serverConfig);
            connectionResults.push({ id: serverConfig.id, success: true });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[MCP] Failed to connect to server ${serverConfig.id}:`, error);
            connectionResults.push({ id: serverConfig.id, success: false, error: errorMsg });
          }
        }
      }
      
      // Log connection summary
      const failedCount = connectionResults.filter(r => !r.success).length;
      if (failedCount > 0) {
        console.warn(`[MCP] ${failedCount}/${connectionResults.length} servers failed to connect`);
      }

      // Apply tool configurations
      for (const toolConfig of mcpToolConfigs) {
        setMCPToolEnabled(toolConfig.serverId, toolConfig.toolName, toolConfig.enabled);
      }

      mcpInitialized = true;
      console.log("[MCP] Initialization complete");
    } finally {
      mcpInitPromise = null;
    }
  })();

  return mcpInitPromise;
}

/**
 * Get the list of tools based on configuration
 * @param enableWebSearch - Whether to enable web search functionality
 * @param enableMCP - Whether to enable MCP tools
 * @param mcpServers - MCP server configurations
 * @param mcpToolConfigs - MCP tool configurations
 * @param modelConfigs - Model configurations from frontend
 * @returns Array of tools available to the agent
 */
export async function getTools(
  enableWebSearch: boolean = false,
  enableMCP: boolean = false,
  mcpServers: MCPServerConfig[] = [],
  mcpToolConfigs: MCPToolConfig[] = [],
  modelConfigs?: {
    llm?: { model: string; provider: string; apiKey: string; baseUrl: string };
    tts?: { model: string; provider: string; apiKey: string; baseUrl: string };
    image?: { model: string; provider: string; apiKey: string; baseUrl: string };
  } | null
): Promise<any[]> {
  console.log("[getTools] Called with modelConfigs:", JSON.stringify(modelConfigs, null, 2));
  const tools = [...BASE_TOOLS];

  // Add web search if enabled
  if (enableWebSearch) {
    tools.push(webSearchTool);
  }

  // Add image generation tool with dynamic config
  const imageConfig = modelConfigs?.image;
  const hasImageKey = imageConfig?.apiKey || process.env.ZHIPU_API_KEY;
  if (hasImageKey) {
    tools.push(createImageGenerationTool(imageConfig));
    console.log(`[Tools] Added image generation tool (${imageConfig?.model || "cogview-3"})`);
  }

  // Add TTS tool with dynamic config
  const ttsConfig = modelConfigs?.tts;
  console.log("[Tools] Full modelConfigs:", JSON.stringify(modelConfigs, null, 2));
  console.log("[Tools] TTS Config:", ttsConfig);
  
  // Always add TTS tool with proper config (fallback to defaults if not provided)
  const effectiveTtsConfig = ttsConfig || { 
    model: "qwen-tts", 
    provider: "dashscope", 
    apiKey: "", 
    baseUrl: "https://dashscope.aliyuncs.com/api/v1" 
  };
  console.log("[Tools] Effective TTS Config:", effectiveTtsConfig);
  
  tools.push(createTextToSpeechTool(effectiveTtsConfig));
  tools.push(getVoicesTool);
  console.log(`[Tools] Added TTS tools (${effectiveTtsConfig.model})`);

  // Add Code Interpreter (always available - calls local service)
  tools.push(codeInterpreterTool);
  console.log("[Tools] Added Code Interpreter");

  // Add MCP tools if enabled
  if (enableMCP && mcpServers.length > 0) {
    await initializeMCP(enableMCP, mcpServers, mcpToolConfigs);
    const mcpTools = getEnabledMCPTools();
    tools.push(...mcpTools);
    console.log(`[Tools] Added ${mcpTools.length} MCP tools:`);
    for (const tool of mcpTools) {
      console.log(`[Tools]   - ${tool.name}`);
    }
  }

  // Add Amap tools if API key is configured (legacy - will be replaced by Skill system)
  if (isAmapKeyConfigured()) {
    tools.push(amapSearchTool);
    tools.push(amapNearbyTool);
    tools.push(amapRouteTool);
    tools.push(amapTravelTool);
    console.log("[Tools] Added Amap tools (高德地图) - legacy mode");
  } else {
    console.log("[Tools] Amap tools not added (AMAP_WEBSERVICE_KEY not set)");
  }

  // ========== Skill System Integration ==========
  // Initialize skill manager on first call
  if (!skillManagerInitialized) {
    try {
      await initializeSkillManager();
      skillManagerInitialized = true;
      console.log("[Tools] Skill Manager initialized successfully");
    } catch (error) {
      console.error("[Tools] Failed to initialize Skill Manager:", error);
    }
  }

  // Add tools from Skill system
  if (skillManagerInitialized) {
    try {
      // Check if registry has changed and reload if needed
      await checkAndReloadSkills();

      const skillTools = getAllSkillTools();
      console.log(`[Tools] Skill system: ${skillManagerInitialized}, tools count: ${skillTools.length}`);

      if (skillTools.length > 0) {
        tools.push(...skillTools);
        console.log(`[Tools] Added ${skillTools.length} tools from Skill system:`);

        // Log all skill tools for debugging
        skillTools.forEach((t: any) => {
          console.log(`[Tools]   - ${t.name}: ${t.description?.substring(0, 60)}...`);
        });

        // Log loaded skills for debugging
        const skillStatus = getSkillStatus();
        console.log(`[Tools] Skill status count: ${skillStatus.length}`);
        for (const status of skillStatus) {
          console.log(`[Tools]   - Skill ${status.id}: enabled=${status.enabled}, loaded=${status.loaded}, tools=${status.toolCount}`);
        }
      } else {
        console.log("[Tools] No Skill tools available - checking skill status:");
        const skillStatus = getSkillStatus();
        skillStatus.forEach((status) => {
          console.log(`[Tools]   - ${status.id}: enabled=${status.enabled}, loaded=${status.loaded}, error=${status.error || 'none'}`);
        });
      }
    } catch (error) {
      console.error("[Tools] Failed to get Skill tools:", error);
    }
  } else {
    console.log("[Tools] Skill Manager not initialized yet");
  }

  return tools;
}

/**
 * Synchronous version for backward compatibility
 * Note: This won't include MCP tools until async initialization completes
 */
export function getToolsSync(enableWebSearch: boolean = false): any[] {
  const tools = [...BASE_TOOLS];
  if (enableWebSearch) {
    tools.push(webSearchTool);
  }
  // Note: TTS tools are now always included in async version
  // Sync version doesn't include them to avoid breaking changes
  return tools;
}

/**
 * Export an array of all available tools (for backward compatibility)
 * Add new tools to this array to make them available to the agent
 *
 * Note: You can create custom tools by implementing the Tool interface from @langchain/core/tools
 * and add them to this array.
 * See https://js.langchain.com/docs/how_to/custom_tools/#tool-function for more information.
 */
export const TOOLS = BASE_TOOLS;

/**
 * Get MCP connection statuses for all servers
 * Returns a record of serverId -> { status, error?, toolCount }
 */
export function getMCPConnectionStatuses(): Record<string, { status: string; error?: string; toolCount: number }> {
  return getConnectionStatuses();
}

/**
 * Get Skill system status for all registered skills
 * Returns array of skill status info
 */
export function getSkillSystemStatus(): Array<{
  id: string;
  name: string;
  enabled: boolean;
  loaded: boolean;
  toolCount: number;
  error?: string;
}> {
  return getSkillStatus();
}

/**
 * Enable or disable a skill at runtime
 * @param skillId - The ID of the skill to toggle
 * @param enabled - Whether to enable or disable the skill
 * @returns Promise that resolves to true if successful
 */
export async function toggleSkill(skillId: string, enabled: boolean): Promise<boolean> {
  try {
    await setSkillEnabled(skillId, enabled);
    return true;
  } catch (error) {
    console.error(`[Tools] Failed to toggle skill ${skillId}:`, error);
    return false;
  }
}

/**
 * Shutdown the skill manager (call on application exit)
 */
export async function shutdownSkills(): Promise<void> {
  await shutdownSkillManager();
  skillManagerInitialized = false;
}
