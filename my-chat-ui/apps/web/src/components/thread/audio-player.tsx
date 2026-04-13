"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  className?: string;
}

export function AudioPlayer({ src, className }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      setProgress((audio.currentTime / audio.duration) * 100);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setProgress(0);
    });

    audio.addEventListener("error", () => {
      setError("音频加载失败");
      setIsLoading(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        setError(null);
      } catch (err) {
        setError("播放失败");
        toast.error("音频播放失败");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audio_${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("音频下载成功");
    } catch {
      toast.error("下载失败");
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className={cn("flex items-center gap-2 text-red-500 text-sm", className)}>
        <VolumeX className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 bg-muted rounded-lg p-2", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={togglePlay}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={handleDownload}
        title="下载音频"
      >
        <Download className="w-4 h-4" />
      </Button>
    </div>
  );
}

// 音频消息组件 - 在对话中显示
interface AudioMessageProps {
  audioUrl?: string;
  text?: string;
  voiceName?: string;
}

export function AudioMessage({ audioUrl, text, voiceName }: AudioMessageProps) {
  if (!audioUrl) return null;

  return (
    <div className="my-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
      <div className="flex items-center gap-2 mb-2">
        <Volume2 className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-blue-700">
          {voiceName ? `语音回复 (${voiceName})` : "语音回复"}
        </span>
      </div>
      <AudioPlayer src={audioUrl} />
      {text && (
        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{text}</p>
      )}
    </div>
  );
}
