"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  speak, 
  stopSpeaking, 
  getCharacters, 
  getCurrentTTSModel,
  setCurrentTTSModel,
  type TTSCharacter,
  type TTSModelType
} from "@/lib/tts";

// 默认角色
const DEFAULT_CHARACTER = "芙宁娜_ZH";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export function VoiceInput({ onTranscript, className }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error("Failed to start recording:", error);
      toast.error("无法访问麦克风，请检查权限设置");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch("/api/asr", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("ASR request failed");
      }

      const data = await response.json();
      
      if (data.text) {
        onTranscript(data.text);
        toast.success("语音识别成功");
      } else {
        throw new Error("No transcript returned");
      }
    } catch (error) {
      console.error("ASR failed:", error);
      toast.error("语音识别失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {isRecording && (
        <div className="flex items-center gap-2 px-3 py-1 bg-red-50 rounded-full">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-red-600 font-mono">
            {formatTime(recordingTime)}
          </span>
        </div>
      )}

      <Button
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        className={cn(
          "h-9 w-9 rounded-full transition-all",
          isRecording && "animate-pulse"
        )}
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
        title={isRecording ? "停止录音" : "语音输入"}
      >
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isRecording ? (
          <Square className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}

// GPT-SoVITS 角色选择器
interface CharacterSelectorProps {
  value: string;
  onChange: (characterId: string) => void;
  className?: string;
}

export function CharacterSelector({ value, onChange, className }: CharacterSelectorProps) {
  const [characters, setCharacters] = useState<TTSCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceHealthy, setServiceHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    loadCharacters();
    checkServiceHealth();
  }, []);

  const checkServiceHealth = async () => {
    try {
      const response = await fetch("/api/tts/characters");
      if (response.ok) {
        const data = await response.json();
        // 后端直接返回数组
        const characters = Array.isArray(data) ? data : (data.characters || []);
        setServiceHealthy(characters.length > 0);
      } else {
        setServiceHealthy(false);
      }
    } catch {
      setServiceHealthy(false);
    }
  };

  const loadCharacters = async () => {
    try {
      const chars = await getCharacters();
      setCharacters(chars);
      
      // 如果没有获取到SoVITS角色，提示服务未启动
      if (chars.length === 0) {
        console.warn("未获取到SoVITS角色列表，服务可能未启动");
      }
    } catch {
      // 如果 API 失败，显示空列表
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "text-sm border rounded-md px-2 py-1 bg-background",
          (serviceHealthy === false || characters.length === 0) && "border-orange-300",
          className
        )}
        disabled={loading || characters.length === 0}
        title={serviceHealthy === false || characters.length === 0 ? "SoVITS服务未启动" : undefined}
      >
        {characters.length === 0 ? (
          <option value="">无可用角色</option>
        ) : (
          characters.map((char) => (
            <option key={char.id} value={char.id}>
              {char.name}
            </option>
          ))
        )}
      </select>
      {(serviceHealthy === false || characters.length === 0) && (
        <span className="text-xs text-orange-500" title="GPT-SoVITS服务未启动">
          ⚠️
        </span>
      )}
    </div>
  );
}

// TTS 模型选择器
interface TTSModelSelectorProps {
  value: "qwen" | "sovits";
  onChange: (model: "qwen" | "sovits") => void;
  className?: string;
}

function TTSModelSelector({ value, onChange, className }: TTSModelSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as "qwen" | "sovits")}
      className={cn(
        "text-xs border rounded-md px-2 py-1 bg-background h-8",
        className
      )}
      title="选择TTS模型"
    >
      <option value="qwen">千问-TTS（长文本）</option>
      <option value="sovits">芙宁娜（50字）</option>
    </select>
  );
}

// TTS 自动播放控制组件
interface TTSControlProps {
  enabled: boolean;
  onToggle: () => void;
  characterId: string;
  onCharacterChange: (characterId: string) => void;
  ttsModel: "qwen" | "sovits";
  onTTSModelChange: (model: "qwen" | "sovits") => void;
  className?: string;
}

export function TTSControl({ 
  enabled, 
  onToggle, 
  characterId, 
  onCharacterChange, 
  ttsModel,
  onTTSModelChange,
  className 
}: TTSControlProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={enabled ? "default" : "outline"}
        size="sm"
        className={cn(
          "h-8 px-2 rounded-full gap-1.5 text-xs",
          enabled && "bg-blue-500 hover:bg-blue-600 text-white"
        )}
        onClick={onToggle}
        title={enabled ? "关闭自动语音" : "开启自动语音"}
      >
        {enabled ? (
          <>
            <Volume2 className="w-3.5 h-3.5" />
            <span>语音开</span>
          </>
        ) : (
          <>
            <VolumeX className="w-3.5 h-3.5" />
            <span>语音关</span>
          </>
        )}
      </Button>
      
      {enabled && (
        <>
          <TTSModelSelector
            value={ttsModel}
            onChange={onTTSModelChange}
          />
          {ttsModel === "sovits" && (
            <CharacterSelector
              value={characterId}
              onChange={onCharacterChange}
              className="h-8 text-xs"
            />
          )}
        </>
      )}
    </div>
  );
}

// GPT-SoVITS TTS Hook
export function useSoVITSTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    // 停止音频播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    
    stopSpeaking();
    setIsPlaying(false);
  }, []);

  const play = useCallback(async (text: string, characterId: string = DEFAULT_CHARACTER, model?: "qwen" | "sovits") => {
    // 停止之前的播放
    stop();

    // 清理文本
    const cleanText = text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/[#>*_-]/g, "")
      .trim();

    if (!cleanText) return;

    setIsPlaying(true);

    // 获取当前模型（如果未指定）
    const currentModel = model || getCurrentTTSModel();

    try {
      // 使用选定的模型
      const result = await speak({
        text: cleanText,
        character: characterId,
        emotion: "default",
        speed: 1.0,
        model: currentModel,
      });

      if (result.success && result.audio_url) {
        // 等待音频加载并播放
        const audio = new Audio(result.audio_url);
        audioRef.current = audio;
        
        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
        };
        
        audio.onerror = () => {
          console.error("Audio playback error");
          setIsPlaying(false);
          audioRef.current = null;
          toast.error("音频播放失败");
        };
        
        await audio.play();
      } else {
        // SoVITS 失败，显示错误提示
        console.error("SoVITS TTS failed:", result.error);
        setIsPlaying(false);
        toast.error(result.error || "语音合成失败", {
          description: "请检查GPT-SoVITS服务是否已启动",
          duration: 5000,
        });
      }
    } catch (error) {
      console.error("TTS error:", error);
      setIsPlaying(false);
      toast.error("语音合成异常，请检查服务状态", {
        duration: 5000,
      });
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { play, stop, isPlaying };
}
