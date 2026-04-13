/**
 * TTS (文本转语音) 客户端封装
 * 支持 GPT-SoVITS 本地模型 和 千问 API 代理
 */

export interface TTSOptions {
  text: string;
  character?: string;
  emotion?: string;
  speed?: number;
  model?: "qwen" | "sovits";
}

export interface TTSResult {
  success: boolean;
  audio_url?: string;
  error?: string;
}

// SoVITS 角色类型
export interface TTSCharacter {
  id: string;
  name: string;
  description: string;
  language: string;
  emotions: string[];
}

// 当前模型类型
export type TTSModelType = "qwen" | "sovits";

// 获取可用角色列表
export async function getCharacters(): Promise<TTSCharacter[]> {
  try {
    const response = await fetch("/api/tts/characters");
    if (response.ok) {
      const data = await response.json();
      // 后端可能直接返回数组或包装在 characters 字段中
      return Array.isArray(data) ? data : (data.characters || []);
    }
    return [];
  } catch {
    return [];
  }
}

// 从 localStorage 读取/保存模型选择
export function getCurrentTTSModel(): TTSModelType {
  return (localStorage.getItem("tts:model") as TTSModelType) || "sovits";
}

export function setCurrentTTSModel(model: TTSModelType): void {
  localStorage.setItem("tts:model", model);
}

// 模型配置
export const TTS_MODEL_CONFIG = {
  qwen: {
    name: "千问-TTS",
    description: "阿里云千问3-TTS-Flash，支持长文本自动分段，芊悦音色",
    maxLength: 2000,  // 支持长文本，自动分段合成
  },
  sovits: {
    name: "本地GPT",
    description: "本地GPT-SoVITS模型，限50字，芙宁娜角色音",
    maxLength: 50,
  },
};

/**
 * 统一的 TTS 接口
 */
export async function speak(options: TTSOptions): Promise<TTSResult> {
  const model = options.model || getCurrentTTSModel();
  
  // 清理文本
  const cleanText = options.text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[#>*_\-]/g, "")
    .trim();
  
  const config = TTS_MODEL_CONFIG[model];
  const text = cleanText.length > config.maxLength 
    ? cleanText.substring(0, config.maxLength)
    : cleanText;

  if (!text) {
    return { success: false, error: "没有可播放的内容" };
  }

  console.log(`[TTS] 使用 ${config.name}，文本长度: ${text.length}`);

  try {
    const endpoint = model === "qwen" ? "/tts/qwen" : "/tts";
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        character: options.character || "芙宁娜_ZH",
        emotion: options.emotion || "default",
        speed: options.speed || 1.0,
        language: "zh",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `${config.name}错误: ${error}` };
    }

    const data = await response.json();
    
    if (data.success && data.audio_url) {
      // 转换音频路径（统一后端使用简化路径）
      const audioUrl = data.audio_url.startsWith("/audio/") 
        ? data.audio_url  // 统一后端直接返回完整路径
        : data.audio_url;
      
      // 播放音频
      const audio = new Audio(audioUrl);
      audio.play().catch(err => console.error("[TTS] 播放失败:", err));
      
      return { success: true, audio_url: audioUrl };
    }

    return { success: false, error: data.message || "语音生成失败" };
  } catch (error) {
    console.error("[TTS] 异常:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "TTS服务异常"
    };
  }
}

/**
 * 停止播放
 */
export function stopSpeaking(): void {
  document.querySelectorAll("audio").forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
}
