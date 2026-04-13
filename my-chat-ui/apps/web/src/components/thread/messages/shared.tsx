import {
  XIcon,
  SendHorizontal,
  RefreshCcw,
  Pencil,
  Copy,
  CopyCheck,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Loader2,
} from "lucide-react";
import { TooltipIconButton } from "../tooltip-icon-button";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { speak, stopSpeaking, getCurrentTTSModel } from "@/lib/tts";
import { toast } from "sonner";

// TTS 播放按钮组件
function TTSPlayButton({
  content,
  characterId,
  disabled,
}: {
  content: string;
  characterId: string;
  disabled: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handlePlay = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      return;
    }

    if (!content.trim()) {
      toast.error("没有可播放的内容");
      return;
    }

    setIsLoading(true);
    try {
      // 获取当前选择的模型
      const model = getCurrentTTSModel();
      
      const result = await speak({
        text: content,
        character: characterId,
        model: model,
      });

      if (result.success) {
        setIsPlaying(true);
        // 音频播放结束后重置状态
        setTimeout(() => setIsPlaying(false), 5000);
      } else {
        toast.error(result.error || "语音播放失败");
      }
    } catch (error) {
      toast.error("语音播放出错");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TooltipIconButton
      onClick={handlePlay}
      variant="ghost"
      tooltip={isPlaying ? "停止播放" : "播放语音"}
      disabled={disabled || isLoading}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Loader2 className="animate-spin" />
          </motion.div>
        ) : isPlaying ? (
          <motion.div
            key="playing"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <VolumeX className="text-blue-500" />
          </motion.div>
        ) : (
          <motion.div
            key="play"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Volume2 />
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipIconButton>
  );
}

function ContentCopyable({
  content,
  disabled,
}: {
  content: string;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipIconButton
      onClick={(e) => handleCopy(e)}
      variant="ghost"
      tooltip="Copy content"
      disabled={disabled}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.div
            key="check"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <CopyCheck className="text-green-500" />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Copy />
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipIconButton>
  );
}

export function BranchSwitcher({
  branch,
  branchOptions,
  onSelect,
  isLoading,
}: {
  branch: string | undefined;
  branchOptions: string[] | undefined;
  onSelect: (branch: string) => void;
  isLoading: boolean;
}) {
  if (!branchOptions || !branch) return null;
  const index = branchOptions.indexOf(branch);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-6 p-1"
        onClick={() => {
          const prevBranch = branchOptions[index - 1];
          if (!prevBranch) return;
          onSelect(prevBranch);
        }}
        disabled={isLoading}
      >
        <ChevronLeft />
      </Button>
      <span className="text-sm">
        {index + 1} / {branchOptions.length}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 p-1"
        onClick={() => {
          const nextBranch = branchOptions[index + 1];
          if (!nextBranch) return;
          onSelect(nextBranch);
        }}
        disabled={isLoading}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export function CommandBar({
  content,
  isHumanMessage,
  isAiMessage,
  isEditing,
  setIsEditing,
  handleSubmitEdit,
  handleRegenerate,
  isLoading,
  characterId,
}: {
  content: string;
  isHumanMessage?: boolean;
  isAiMessage?: boolean;
  isEditing?: boolean;
  setIsEditing?: React.Dispatch<React.SetStateAction<boolean>>;
  handleSubmitEdit?: () => void;
  handleRegenerate?: () => void;
  isLoading: boolean;
  characterId?: string;
}) {
  if (isHumanMessage && isAiMessage) {
    throw new Error(
      "Can only set one of isHumanMessage or isAiMessage to true, not both.",
    );
  }

  if (!isHumanMessage && !isAiMessage) {
    throw new Error(
      "One of isHumanMessage or isAiMessage must be set to true.",
    );
  }

  if (
    isHumanMessage &&
    (isEditing === undefined ||
      setIsEditing === undefined ||
      handleSubmitEdit === undefined)
  ) {
    throw new Error(
      "If isHumanMessage is true, all of isEditing, setIsEditing, and handleSubmitEdit must be set.",
    );
  }

  const showEdit =
    isHumanMessage &&
    isEditing !== undefined &&
    !!setIsEditing &&
    !!handleSubmitEdit;

  if (isHumanMessage && isEditing && !!setIsEditing && !!handleSubmitEdit) {
    return (
      <div className="flex items-center gap-2">
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Cancel edit"
          variant="ghost"
          onClick={() => {
            setIsEditing(false);
          }}
        >
          <XIcon />
        </TooltipIconButton>
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Submit"
          variant="secondary"
          onClick={handleSubmitEdit}
        >
          <SendHorizontal />
        </TooltipIconButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isAiMessage && characterId && (
        <TTSPlayButton 
          content={content} 
          characterId={characterId} 
          disabled={isLoading} 
        />
      )}
      <ContentCopyable content={content} disabled={isLoading} />
      {isAiMessage && !!handleRegenerate && (
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Refresh"
          variant="ghost"
          onClick={handleRegenerate}
        >
          <RefreshCcw />
        </TooltipIconButton>
      )}
      {showEdit && (
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Edit"
          variant="ghost"
          onClick={() => {
            setIsEditing?.(true);
          }}
        >
          <Pencil />
        </TooltipIconButton>
      )}
    </div>
  );
}
