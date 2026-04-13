/**
 * 通义千问 TTS 客户端封装（直接调用版）
 * 注意：推荐使用 tts.ts 中的 speak() 函数，它使用后端代理支持长文本分段合成
 *
 * 此文件保留用于直接调用场景，但受限于300字上限
 */

// import { playAudio } from "./tts"; // 未使用，已注释

export interface TTSQwenOptions {
  text: string;
  voice?: string; // 音色ID
  speed?: number;
}

export interface TTSResult {
  success: boolean;
  audio_url?: string;
  error?: string;
}

const API_KEY = "sk-e40494c523b74914aa9e40114a29032e";

/**
 * 使用通义千问生成语音（直接调用版，限300字）
 * 如需长文本支持，请使用 tts.ts 中的 speak() 函数
 */
export async function generateSpeechQwen(options: TTSQwenOptions): Promise<TTSResult> {
  try {
    // 直接调用版限制300字（千问API限制）
    // 长文本请使用 tts.ts -> speak()，后端会自动分段合并
    const text = options.text.length > 300
      ? options.text.substring(0, 300) + "..."
      : options.text;

    const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/tts/text2speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "sambert-zhimeng-v1", // 最接近芙宁娜的活泼少女音
        input: { text },
        parameters: {
          sample_rate: 48000,
          format: "wav",
          speed: options.speed || 1.0,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const data = await response.json();

    if (data.output?.audio_url) {
      // 直接播放云端返回的音频URL
      const audio = new Audio(data.output.audio_url);
      audio.play().catch(err => console.error("[TTS] 播放失败:", err));
      return { success: true, audio_url: data.output.audio_url };
    }

    return { success: false, error: "音频生成失败" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "TTS服务异常"
    };
  }
}

/**
 * 千问可用音色列表
 */
export const QWEN_VOICES = [
  { id: "zhimeng", name: "知萌", description: "活泼可爱少女音（最接近芙宁娜）" },
  { id: "zhiyue", name: "知悦", description: "温柔亲切女声" },
  { id: "zhiyu", name: "知雨", description: "年轻活泼女声" },
  { id: "zhibo", name: "知波", description: "成熟稳重女声" },
];
