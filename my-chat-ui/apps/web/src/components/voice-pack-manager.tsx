"use client";

import { useState, useEffect } from "react";
import { Volume2, Trash2, Plus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// 音色配置类型
interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  params: {
    speed: number;
    pitch: number;
    volume: number;
    emotion: string;
  };
  isBuiltIn: boolean;
}

// 内置音色列表
const BUILTIN_VOICES: VoiceProfile[] = [
  {
    id: "default",
    name: "默认音色",
    description: "标准普通话女声，适合日常对话",
    params: { speed: 1.0, pitch: 1.0, volume: 1.0, emotion: "neutral" },
    isBuiltIn: true,
  },
  {
    id: "warm",
    name: "温暖女声",
    description: "温柔亲切的女性声音，适合情感交流",
    params: { speed: 0.9, pitch: 1.05, volume: 1.0, emotion: "warm" },
    isBuiltIn: true,
  },
  {
    id: "professional",
    name: "专业男声",
    description: "稳重专业的男性声音，适合商务场景",
    params: { speed: 1.0, pitch: 0.95, volume: 1.1, emotion: "professional" },
    isBuiltIn: true,
  },
  {
    id: "energetic",
    name: "活力青年",
    description: "充满活力的年轻声音，适合轻松话题",
    params: { speed: 1.15, pitch: 1.1, volume: 1.0, emotion: "energetic" },
    isBuiltIn: true,
  },
];

interface VoicePackManagerProps {
  currentVoiceId: string;
  onVoiceChange: (voiceId: string) => void;
  className?: string;
}

export function VoicePackManager({
  currentVoiceId,
  onVoiceChange,
  className,
}: VoicePackManagerProps) {
  const [voices, setVoices] = useState<VoiceProfile[]>(BUILTIN_VOICES);
  const [isLoading, setIsLoading] = useState(false);

  // 从本地存储加载自定义语音包
  useEffect(() => {
    const savedPacks = localStorage.getItem("voicePacks");
    if (savedPacks) {
      try {
        const customVoices = JSON.parse(savedPacks);
        setVoices([...BUILTIN_VOICES, ...customVoices]);
      } catch {
        console.error("Failed to load voice packs");
      }
    }
  }, []);

  // 试听音色
  const previewVoice = async (voice: VoiceProfile) => {
    setIsLoading(true);
    try {
      // 调用 TTS API 生成试听音频
      const response = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `你好，我是${voice.name}，这是我的声音。`,
          voiceId: voice.id,
        }),
      });

      if (!response.ok) throw new Error("TTS failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();

      audio.onended = () => {
        URL.revokeObjectURL(url);
      };
    } catch {
      toast.error("试听失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 删除自定义语音包
  const deleteVoicePack = (voiceId: string) => {
    const updatedVoices = voices.filter((v) => v.id !== voiceId);
    setVoices(updatedVoices);
    
    // 保存到本地存储
    const customVoices = updatedVoices.filter((v) => !v.isBuiltIn);
    localStorage.setItem("voicePacks", JSON.stringify(customVoices));
    
    toast.success("语音包已删除");
  };

  return (
    <div className={cn("p-4", className)}>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Volume2 className="w-5 h-5" />
        语音包管理
      </h3>

      <div className="space-y-3">
        {voices.map((voice) => (
          <div
            key={voice.id}
            className={cn(
              "p-3 rounded-lg border transition-all cursor-pointer",
              currentVoiceId === voice.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            )}
            onClick={() => onVoiceChange(voice.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{voice.name}</span>
                  {voice.isBuiltIn && (
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                      内置
                    </span>
                  )}
                  {currentVoiceId === voice.id && (
                    <span className="text-xs bg-blue-100 px-2 py-0.5 rounded text-blue-600">
                      当前使用
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{voice.description}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>语速: {voice.params.speed}x</span>
                  <span>音调: {voice.params.pitch}x</span>
                  <span>音量: {voice.params.volume}x</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    previewVoice(voice);
                  }}
                  disabled={isLoading}
                >
                  <Play className="w-4 h-4" />
                </Button>

                {!voice.isBuiltIn && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteVoicePack(voice.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 预留：添加自定义语音包 */}
      <div className="mt-4 p-3 border border-dashed border-gray-300 rounded-lg text-center">
        <p className="text-sm text-gray-500 mb-2">更多语音包 Coming Soon</p>
        <Button variant="outline" size="sm" disabled>
          <Plus className="w-4 h-4 mr-1" />
          导入语音包
        </Button>
      </div>
    </div>
  );
}
