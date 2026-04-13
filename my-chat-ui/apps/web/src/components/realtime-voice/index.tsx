"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Phone, PhoneOff, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RealtimeVoiceProps {
  className?: string;
}

// WebSocket连接管理
export function useRealtimeVoice() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingAudioRef = useRef(false);

  // 连接WebSocket
  const connect = useCallback(() => {
    const ws = new WebSocket("ws://127.0.0.1:8888/ws/voice/realtime");
    
    ws.onopen = () => {
      setIsConnected(true);
      toast.success("实时语音已连接");
    };
    
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case "connected":
          console.log("会话ID:", data.session_id);
          break;
          
        case "transcript":
          setTranscript(data.text);
          setStatus("thinking");
          break;
          
        case "text":
          setAiText(data.text);
          break;
          
        case "audio":
          audioQueueRef.current.push(data.data);
          if (!isPlayingAudioRef.current) {
            playNextAudio();
          }
          break;
          
        case "status":
          setStatus(data.status);
          if (data.status === "speaking") {
            setIsPlaying(true);
          } else if (data.status === "idle") {
            setIsPlaying(false);
            isPlayingAudioRef.current = false;
          }
          break;
      }
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      setStatus("idle");
      toast.info("实时语音已断开");
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket错误:", error);
      toast.error("连接错误，请检查服务器是否启动");
    };
    
    wsRef.current = ws;
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setIsConnected(false);
    setIsRecording(false);
    setStatus("idle");
  }, []);

  // 播放音频队列
  const playNextAudio = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingAudioRef.current = false;
      setIsPlaying(false);
      return;
    }
    
    isPlayingAudioRef.current = true;
    setIsPlaying(true);
    
    const audioBase64 = audioQueueRef.current.shift();
    if (!audioBase64) return;
    
    try {
      const audioData = atob(audioBase64);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }
      
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        playNextAudio();
      };
      
      source.start();
    } catch (error) {
      console.error("播放音频失败:", error);
      playNextAudio();
    }
  }, []);

  // 开始录音
  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error("请先连接服务器");
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus"
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            wsRef.current?.send(JSON.stringify({
              type: "audio",
              data: base64
            }));
          };
          reader.readAsDataURL(event.data);
        }
      };
      
      mediaRecorder.start(500);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setStatus("listening");
      
    } catch (error) {
      console.error("启动录音失败:", error);
      toast.error("无法访问麦克风");
    }
  }, []);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [disconnect]);

  return {
    isConnected,
    isRecording,
    isPlaying,
    transcript,
    aiText,
    status,
    connect,
    disconnect,
    startRecording,
    stopRecording,
  };
}

// 主组件
export function RealtimeVoice({ className }: RealtimeVoiceProps) {
  const {
    isConnected,
    isRecording,
    isPlaying,
    transcript,
    aiText,
    status,
    connect,
    disconnect,
    startRecording,
    stopRecording,
  } = useRealtimeVoice();

  const [showText, setShowText] = useState(true);

  const statusColors = {
    idle: "bg-gray-400",
    listening: "bg-red-500 animate-pulse",
    thinking: "bg-yellow-500 animate-pulse",
    speaking: "bg-green-500",
  };

  const statusTexts = {
    idle: "待机中",
    listening: "聆听中...",
    thinking: "思考中...",
    speaking: "播放中...",
  };

  return (
    <div className={cn("flex flex-col items-center gap-4 p-4", className)}>
      {/* 状态指示器 */}
      <div className="flex items-center gap-3">
        <div className={cn("w-3 h-3 rounded-full", statusColors[status])} />
        <span className="text-sm text-gray-600">{statusTexts[status]}</span>
        {isConnected && (
          <span className="text-xs text-green-500">● 已连接</span>
        )}
      </div>

      {/* 主控制按钮 */}
      <div className="flex items-center gap-4">
        {!isConnected ? (
          <Button
            size="lg"
            className="rounded-full w-16 h-16 bg-blue-500 hover:bg-blue-600"
            onClick={connect}
          >
            <Phone className="w-6 h-6" />
          </Button>
        ) : (
          <Button
            size="lg"
            variant="destructive"
            className="rounded-full w-16 h-16"
            onClick={disconnect}
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
        )}

        {isConnected && (
          <Button
            size="lg"
            className={cn(
              "rounded-full w-16 h-16",
              isRecording 
                ? "bg-red-500 hover:bg-red-600 animate-pulse" 
                : "bg-gray-500 hover:bg-gray-600"
            )}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isConnected}
          >
            {isRecording ? (
              <MicOff className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </Button>
        )}
      </div>

      {/* 录音可视化 */}
      {isRecording && (
        <div className="flex items-center gap-1 h-8">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-red-400 rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 100}%`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* 文字显示区域 */}
      {showText && isConnected && (
        <div className="w-full max-w-md space-y-3 mt-4">
          {transcript && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-xs text-blue-500 mb-1">你说:</div>
              <div className="text-sm text-gray-700">{transcript}</div>
            </div>
          )}
          
          {aiText && (
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-xs text-green-500 mb-1">AI:</div>
              <div className="text-sm text-gray-700">{aiText}</div>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      {isConnected && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setShowText(!showText)}
        >
          <MessageSquare className="w-4 h-4 mr-1" />
          {showText ? "隐藏文字" : "显示文字"}
        </Button>
      )}

      {/* 使用说明 */}
      {!isConnected && (
        <div className="text-xs text-gray-400 text-center mt-4 max-w-xs">
          点击电话图标连接实时语音服务
          <br />
          支持实时对话、自动打断、流式播放
        </div>
      )}
    </div>
  );
}

export default RealtimeVoice;
