/**
 * Kimi-Audio 语音服务模块
 * 支持：TTS(文本转语音)、ASR(语音转文本)、音色管理
 */

import { writeFile, mkdir, access } from "fs/promises";
import { join } from "path";

// 音色配置接口
export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  // 音色参数
  params: {
    speed?: number;      // 语速 0.5-2.0
    pitch?: number;      // 音调 0.5-2.0
    volume?: number;     // 音量 0.5-2.0
    emotion?: string;    // 情感风格
  };
  // 模型路径或标识
  modelRef: string;
  // 是否内置
  isBuiltIn: boolean;
}

// 语音包管理器
export class VoicePackManager {
  private voicePacksDir: string;
  private voices: Map<string, VoiceProfile> = new Map();

  constructor(baseDir: string = "./voice_packs") {
    this.voicePacksDir = baseDir;
    this.initBuiltInVoices();
  }

  // 初始化内置音色
  private initBuiltInVoices() {
    const builtInVoices: VoiceProfile[] = [
      {
        id: "default",
        name: "默认音色",
        description: "标准普通话女声",
        params: { speed: 1.0, pitch: 1.0, volume: 1.0, emotion: "neutral" },
        modelRef: "kimi-audio-tts-v1",
        isBuiltIn: true,
      },
      {
        id: "warm",
        name: "温暖女声",
        description: "温柔亲切的女性声音",
        params: { speed: 0.9, pitch: 1.05, volume: 1.0, emotion: "warm" },
        modelRef: "kimi-audio-tts-v1",
        isBuiltIn: true,
      },
      {
        id: "professional",
        name: "专业男声",
        description: "稳重专业的男性声音",
        params: { speed: 1.0, pitch: 0.95, volume: 1.1, emotion: "professional" },
        modelRef: "kimi-audio-tts-v1",
        isBuiltIn: true,
      },
      {
        id: "energetic",
        name: "活力青年",
        description: "充满活力的年轻声音",
        params: { speed: 1.15, pitch: 1.1, volume: 1.0, emotion: "energetic" },
        modelRef: "kimi-audio-tts-v1",
        isBuiltIn: true,
      },
    ];

    for (const voice of builtInVoices) {
      this.voices.set(voice.id, voice);
    }
  }

  // 获取所有可用音色
  getAllVoices(): VoiceProfile[] {
    return Array.from(this.voices.values());
  }

  // 获取特定音色
  getVoice(id: string): VoiceProfile | undefined {
    return this.voices.get(id);
  }

  // 添加自定义音色（语音包）
  async addVoicePack(voice: VoiceProfile, modelData?: Buffer): Promise<void> {
    // 创建语音包目录
    const packDir = join(this.voicePacksDir, voice.id);
    await mkdir(packDir, { recursive: true });

    // 保存音色配置
    const configPath = join(packDir, "config.json");
    await writeFile(configPath, JSON.stringify(voice, null, 2));

    // 如果有模型数据，保存模型文件
    if (modelData) {
      const modelPath = join(packDir, "model.bin");
      await writeFile(modelPath, modelData);
    }

    // 注册音色
    this.voices.set(voice.id, voice);
  }

  // 加载已安装的语音包
  async loadInstalledPacks(): Promise<void> {
    try {
      await access(this.voicePacksDir);
      // 遍历语音包目录加载配置
      // 实际实现需要读取目录内容
    } catch {
      // 目录不存在，创建它
      await mkdir(this.voicePacksDir, { recursive: true });
    }
  }

  // 删除语音包
  async removeVoicePack(voiceId: string): Promise<boolean> {
    if (this.voices.has(voiceId)) {
      const voice = this.voices.get(voiceId)!;
      if (!voice.isBuiltIn) {
        this.voices.delete(voiceId);
        return true;
      }
    }
    return false;
  }
}

// Kimi-Audio TTS 服务
export class KimiAudioTTS {
  private apiKey: string;
  private baseURL: string;
  private voiceManager: VoicePackManager;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.MOONSHOT_API_KEY || "";
    this.baseURL = process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1";
    this.voiceManager = new VoicePackManager();
  }

  // 获取音色管理器
  getVoiceManager(): VoicePackManager {
    return this.voiceManager;
  }

  /**
   * 文本转语音
   * @param text 要转换的文本
   * @param voiceId 音色ID
   * @returns 音频数据 (Buffer 或 URL)
   */
  async synthesize(text: string, voiceId: string = "default"): Promise<Buffer | string> {
    const voice = this.voiceManager.getVoice(voiceId);
    if (!voice) {
      throw new Error(`音色 ${voiceId} 不存在`);
    }

    // 调用 Kimi-Audio API
    try {
      const response = await fetch(`${this.baseURL}/audio/speech`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "kimi-audio-tts",
          input: text,
          voice: voice.modelRef,
          // 音色参数
          speed: voice.params.speed,
          pitch: voice.params.pitch,
          volume: voice.params.volume,
          // 输出格式
          response_format: "mp3",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TTS API 错误: ${error}`);
      }

      // 获取音频数据
      const audioBuffer = await response.arrayBuffer();
      return Buffer.from(audioBuffer);
    } catch (error) {
      console.error("TTS 合成失败:", error);
      throw error;
    }
  }

  /**
   * 流式 TTS（用于长文本实时播放）
   */
  async *synthesizeStream(text: string, voiceId: string = "default"): AsyncGenerator<Buffer> {
    const voice = this.voiceManager.getVoice(voiceId);
    if (!voice) {
      throw new Error(`音色 ${voiceId} 不存在`);
    }

    // 分段处理长文本
    const segments = this.splitText(text);
    
    for (const segment of segments) {
      const audioData = await this.synthesize(segment, voiceId);
      if (Buffer.isBuffer(audioData)) {
        yield audioData;
      }
    }
  }

  // 文本分段（用于流式处理）
  private splitText(text: string, maxLength: number = 200): string[] {
    const segments: string[] = [];
    const sentences = text.split(/[。！？.!?]/);
    let currentSegment = "";

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if (currentSegment.length + trimmed.length > maxLength) {
        if (currentSegment) {
          segments.push(currentSegment);
          currentSegment = trimmed;
        } else {
          segments.push(trimmed);
        }
      } else {
        currentSegment += (currentSegment ? "。" : "") + trimmed;
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }
}

// Kimi-Audio ASR 服务
export class KimiAudioASR {
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.MOONSHOT_API_KEY || "";
    this.baseURL = process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1";
  }

  /**
   * 语音转文本
   * @param audioData 音频数据 (Buffer 或文件路径)
   * @param language 语言代码 (zh/en/auto)
   * @returns 识别的文本
   */
  async transcribe(audioData: Buffer, language: string = "zh"): Promise<string> {
    try {
      // 创建 multipart form data
      const formData = new FormData();
      formData.append("file", new Blob([audioData]), "audio.mp3");
      formData.append("model", "kimi-audio-asr");
      formData.append("language", language);

      const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ASR API 错误: ${error}`);
      }

      const result = await response.json();
      return result.text || "";
    } catch (error) {
      console.error("ASR 识别失败:", error);
      throw error;
    }
  }

  /**
   * 实时语音转文本（流式）
   * 用于实时对话场景
   */
  async *transcribeStream(audioStream: AsyncIterable<Buffer>): AsyncGenerator<string> {
    // 实现流式识别逻辑
    // 将音频流分段发送给 API
    for await (const chunk of audioStream) {
      const text = await this.transcribe(chunk);
      if (text) {
        yield text;
      }
    }
  }
}

// 统一的音频服务入口
export class AudioService {
  tts: KimiAudioTTS;
  asr: KimiAudioASR;

  constructor(apiKey?: string) {
    this.tts = new KimiAudioTTS(apiKey);
    this.asr = new KimiAudioASR(apiKey);
  }

  // 获取所有可用音色
  getAvailableVoices(): VoiceProfile[] {
    return this.tts.getVoiceManager().getAllVoices();
  }

  // 获取特定音色
  getVoice(voiceId: string): VoiceProfile | undefined {
    return this.tts.getVoiceManager().getVoice(voiceId);
  }
}

// 导出单例实例
let audioServiceInstance: AudioService | null = null;

export function getAudioService(): AudioService {
  if (!audioServiceInstance) {
    audioServiceInstance = new AudioService();
  }
  return audioServiceInstance;
}

export function initAudioService(apiKey?: string): AudioService {
  audioServiceInstance = new AudioService(apiKey);
  return audioServiceInstance;
}
