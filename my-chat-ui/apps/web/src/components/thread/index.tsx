import { v4 as uuidv4 } from "uuid";
import { ReactNode, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useState, FormEvent } from "react";
import { Button } from "../ui/button";
import { Checkpoint, Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import { LangGraphLogoSVG } from "../icons/langgraph";
import { TooltipIconButton } from "./tooltip-icon-button";
import {
  ArrowDown,
  PanelRightOpen,
  PanelRightClose,
  SquarePen,
  Database,
  X,
  Globe,
  Server,
  Plus,
  ArrowUp,
  ImagePlus,
  Eye,
  EyeOff,
  Settings,
  Square,
  Volume2,
  Sparkles,
  MessageSquare,
  Puzzle,
  Phone,
  Clock,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import ThreadHistory from "./history";
import { VectorStoreManager } from "@/components/vector-store";
import { SkillManager } from "@/components/skills";
import { SchedulerPanel } from "@/components/scheduler";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { GitHubSVG } from "../icons/github";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MCPManager, MCPServerConfig, MCPToolConfig } from "@/components/mcp";
import { ImageAttachment } from "./image-upload";
import { ImageGallery } from "./image-gallery";
import { ModelConfigDialog, useModelConfigs, getCurrentModelConfigsFromStorage } from "@/components/model-config";
import { PromptConfigDialog, getCurrentPromptConfigsFromStorage } from "@/components/prompt-config";
import { ImageReferenceList, ImageReferenceData } from "./image-reference";
import { VoiceInput, useSoVITSTTS, CharacterSelector } from "./voice-input";
import { RealtimeVoice } from "@/components/realtime-voice";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div ref={context.contentRef} className={props.contentClassName}>
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="w-4 h-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

function OpenGitHubRepo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="https://github.com/langchain-ai/agent-chat-ui"
            target="_blank"
            className="flex items-center justify-center"
          >
            <GitHubSVG width="24" height="24" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Open GitHub repo</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Thread() {
  const [threadId, setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [hideToolCalls, setHideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );
  const [vectorStoreOpen, setVectorStoreOpen] = useQueryState(
    "vectorStoreOpen",
    parseAsBoolean.withDefault(false),
  );
  const [skillManagerOpen, setSkillManagerOpen] = useQueryState(
    "skillManagerOpen",
    parseAsBoolean.withDefault(false),
  );
  const [mcpManagerOpen, setMcpManagerOpen] = useQueryState(
    "mcpManagerOpen",
    parseAsBoolean.withDefault(false),
  );
  const [schedulerOpen, setSchedulerOpen] = useQueryState(
    "schedulerOpen",
    parseAsBoolean.withDefault(false),
  );
  const [webSearchEnabled, setWebSearchEnabled] = useQueryState(
    "webSearch",
    parseAsBoolean.withDefault(false),
  );
  // TTS State (GPT-SoVITS)
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    return localStorage.getItem("tts:sovits:enabled") === "true";
  });
  const [ttsCharacter, setTtsCharacter] = useState(() => {
    return localStorage.getItem("tts:sovits:character") || "芙宁娜_ZH";
  });
  
  // Vector Store Collection State
  const [selectedCollection, setSelectedCollection] = useState(() => {
    return localStorage.getItem("vectorstore:collection") || "default";
  });
  
  // Persist collection selection
  useEffect(() => {
    localStorage.setItem("vectorstore:collection", selectedCollection);
  }, [selectedCollection]);
  
  // Realtime Voice State
  const [realtimeVoiceOpen, setRealtimeVoiceOpen] = useQueryState(
    "realtimeVoice",
    parseAsBoolean.withDefault(false),
  );
  
  // Persist TTS state
  useEffect(() => {
    localStorage.setItem("tts:sovits:enabled", ttsEnabled.toString());
  }, [ttsEnabled]);
  
  useEffect(() => {
    localStorage.setItem("tts:sovits:character", ttsCharacter);
  }, [ttsCharacter]);
  
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const [imageReferences, setImageReferences] = useState<ImageReferenceData[]>([]);
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  
  // TTS: Track played message IDs to prevent duplicate playback
  const [playedMessageIds, setPlayedMessageIds] = useState<Set<string>>(new Set());

  // MCP State
  const [mcpEnabled, setMcpEnabled] = useState(() => {
    return localStorage.getItem("mcp:enabled") === "true";
  });
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>(() => {
    const saved = localStorage.getItem("mcp:servers");
    if (saved) {
      return JSON.parse(saved);
    }
    // 默认 MCP 服务器配置
    return [
      {
        id: "ai_scheduler",
        name: "AI Scheduler",
        transportType: "stdio",
        command: "python",
        args: ["mcp_scheduler_wrapper.py"],
        env: {
          SCHEDULER_CONFIG: "./scheduler.yaml",
          PYTHONIOENCODING: "utf-8"
        },
        enabled: true
      }
    ];
  });
  const [mcpToolConfigs, setMcpToolConfigs] = useState<MCPToolConfig[]>(() => {
    const saved = localStorage.getItem("mcp:toolConfigs");
    return saved ? JSON.parse(saved) : [];
  });

  // Persist MCP state to localStorage
  useEffect(() => {
    localStorage.setItem("mcp:enabled", mcpEnabled.toString());
  }, [mcpEnabled]);

  useEffect(() => {
    localStorage.setItem("mcp:servers", JSON.stringify(mcpServers));
  }, [mcpServers]);

  useEffect(() => {
    localStorage.setItem("mcp:toolConfigs", JSON.stringify(mcpToolConfigs));
  }, [mcpToolConfigs]);

  const stream = useStreamContext();
  const isLoading = stream.isLoading;
  const values = stream.values;

  // 合并 stream.messages（实时流式）和 stream.values.messages（历史消息）
  const messages = useMemo(() => {
    const streamMsgs = stream.messages || [];
    const stateMsgs = stream.values?.messages || [];

    console.log("[Thread] Messages debug:", {
      streamMsgsCount: streamMsgs.length,
      stateMsgsCount: stateMsgs.length,
      streamMsgsSample: streamMsgs[0]?.type,
      stateMsgsSample: stateMsgs[0]?.type,
      threadId,
      hasValues: !!stream.values,
      isLoading,
    });

    // 关键逻辑：当 threadId 存在时，优先使用 state 中的消息（历史消息）
    // 因为 stream.messages 可能是之前对话的残留数据
    if (threadId && stateMsgs.length > 0) {
      console.log("[Thread] Using state.messages (historical thread)", stateMsgs.length);
      return stateMsgs;
    }

    // 如果没有 threadId（新对话），使用 stream.messages
    if (!threadId && streamMsgs.length > 0) {
      console.log("[Thread] Using stream.messages (new thread)");
      return streamMsgs;
    }

    // 流式传输进行中时，使用 stream.messages
    if (isLoading && streamMsgs.length > 0) {
      console.log("[Thread] Using stream.messages (streaming)");
      return streamMsgs;
    }

    // 默认返回 state 中的消息（可能是空的）
    console.log("[Thread] Using state.messages (default)", stateMsgs.length);
    return stateMsgs;
  }, [stream.messages, stream.values?.messages, threadId, isLoading]);
  
  // GPT-SoVITS TTS Player
  const ttsPlayer = useSoVITSTTS();

  // Debug: Monitor threadId changes and stream state
  useEffect(() => {
    console.log("[Thread] ThreadId changed:", threadId);
    console.log("[Thread] Stream state:", {
      messagesCount: stream.messages.length,
      valuesMessagesCount: stream.values?.messages?.length,
      historyCount: stream.history?.length,
      hasValues: !!stream.values,
    });
  }, [threadId, stream.messages, stream.values, stream.history]);

  // Auto-play TTS when AI message arrives
  useEffect(() => {
    if (!ttsEnabled || isLoading) return;
    
    // Find the last AI message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.type === "ai" && lastMessage.content && lastMessage.id!) {
      // Skip if already played
      if (playedMessageIds.has(lastMessage.id!)) {
        return;
      }
      
      // Only play if it's a new message (not tool calls)
      const toolCalls = lastMessage.additional_kwargs?.tool_calls;
      const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
      if (!hasToolCalls && typeof lastMessage.content === "string") {
        // Mark as played immediately to prevent duplicate playback
        setPlayedMessageIds(prev => new Set(prev).add(lastMessage.id!));
        
        // Small delay to ensure the message is fully rendered
        const timer = setTimeout(() => {
          // Get TTS config from new model config system
          const ttsConfig = getCurrentModelConfigsFromStorage().tts;
          const ttsModelType = ttsConfig.model === "sovits" ? "sovits" : "qwen";
          ttsPlayer.play(lastMessage.content as string, ttsCharacter!, ttsModelType);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [messages, ttsEnabled, ttsCharacter, isLoading, ttsPlayer, playedMessageIds]);
  
  // Extract MCP status from stream values
  const mcpStatuses = values?.mcpStatus || {};
  
  // Debug logging
  useEffect(() => {
    console.log("[Thread] isLoading changed:", isLoading);
  }, [isLoading]);

  const lastError = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    try {
      const message = (stream.error as any).message;
      if (!message || lastError.current === message) {
        // Message has already been logged. do not modify ref, return early.
        return;
      }

      // Message is defined, and it has not been logged yet. Save it, and send the error
      lastError.current = message;
      toast.error("An error occurred. Please try again.", {
        description: (
          <p>
            <strong>Error:</strong> <code>{message}</code>
          </p>
        ),
        richColors: true,
        closeButton: true,
      });
    } catch {
      // no-op
    }
  }, [stream.error]);

  // TODO: this should be part of the useStream hook
  const prevMessageLength = useRef(0);
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    console.log("[Thread] Submit triggered, isLoading:", isLoading, "input:", input, "images:", attachedImages.length);
    
    // Allow submit if there's text input or images
    if ((!input.trim() && attachedImages.length === 0) || isLoading) {
      console.log("[Thread] Submit blocked, isLoading:", isLoading, "hasInput:", !!input.trim(), "hasImages:", attachedImages.length > 0);
      return;
    }
    setFirstTokenReceived(false);

    // Build message content with images if present
    let messageContent: any = input;
    
    if (attachedImages.length > 0) {
      // Multi-modal content format for vision models
      messageContent = [
        { type: "text", text: input || "请分析这张图片" },
        ...attachedImages.map(img => ({
          type: "image_url",
          image_url: {
            url: `data:${img.file.type};base64,${img.base64}`,
          },
        })),
      ];
    }

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: messageContent,
    };

    const toolMessages = ensureToolCallsHaveResponses(stream.messages);
    const submitMessages = [...toolMessages, newHumanMessage];
    console.log("[Thread] Submitting messages:", submitMessages.length, "toolMessages:", toolMessages.length);
    
    stream.submit(
      { messages: submitMessages },
      {
        streamMode: ["values"],
        optimisticValues: (prev) => {
          console.log("[Thread] Optimistic values, prev messages:", prev.messages?.length ?? 0);
          return {
            ...prev,
            messages: [
              ...(prev.messages ?? []),
              ...toolMessages,
              newHumanMessage,
            ],
          };
        },
        // Pass configuration to enable/disable features
        config: {
          configurable: {
            enableWebSearch: webSearchEnabled,
            enableMCP: mcpEnabled,
            mcpServers: mcpServers,
            mcpToolConfigs: mcpToolConfigs,
            vectorStoreCollection: selectedCollection,
            // Model configurations - always read from localStorage to get latest
            modelConfigs: (() => {
              const configs = getCurrentModelConfigsFromStorage();
              console.log("[Thread] Sending modelConfigs:", configs);
              return configs;
            })(),
            // Prompt configurations - always read from localStorage to get latest
            promptConfig: (() => {
              const configs = getCurrentPromptConfigsFromStorage();
              console.log("[Thread] Sending promptConfig:", configs);
              return configs;
            })(),
          },
        },
      },
    );

    setInput("");
    // Clear attached images after submit
    attachedImages.forEach(img => URL.revokeObjectURL(img.preview));
    setAttachedImages([]);
    setImageReferences([]);
  };

  const handleRegenerate = (
    parentCheckpoint: Checkpoint | null | undefined,
  ) => {
    // Do this so the loading state is correct
    prevMessageLength.current = prevMessageLength.current - 1;
    setFirstTokenReceived(false);
    stream.submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ["values"],
    });
  };

  const chatStarted = !!threadId || !!messages.length;
  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  return (
    <div className="flex w-full h-screen overflow-hidden overflow-x-hidden">
      {/* Chat History Sidebar - Left */}
      <div className="relative lg:flex hidden">
        <motion.div
          className="absolute h-full border-r bg-white dark:bg-gray-900 overflow-hidden z-20"
          style={{ width: 300 }}
          animate={
            isLargeScreen
              ? { x: chatHistoryOpen ? 0 : -300 }
              : { x: chatHistoryOpen ? 0 : -300 }
          }
          initial={{ x: -300 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div className="relative h-full" style={{ width: 300 }}>
            <ThreadHistory />
          </div>
        </motion.div>
      </div>

      {/* Main Chat Area */}
      <motion.div
        className={cn(
          "flex-1 flex flex-col min-w-0 overflow-hidden relative",
          !chatStarted && "grid-rows-[1fr]",
        )}
        layout={isLargeScreen}
        animate={{
          marginLeft: chatHistoryOpen ? (isLargeScreen ? 300 : 0) : 0,
          width: isLargeScreen
            ? (() => {
                let subtractWidth = 0;
                if (chatHistoryOpen) subtractWidth += 300;
                if (vectorStoreOpen) subtractWidth += 480;
                if (skillManagerOpen) subtractWidth += 480;
                if (schedulerOpen) subtractWidth += 560;
                if (mcpManagerOpen) subtractWidth += 400;
                if (realtimeVoiceOpen) subtractWidth += 400;
                return subtractWidth > 0 ? `calc(100% - ${subtractWidth}px)` : "100%";
              })()
            : "100%",
        }}
        transition={
          isLargeScreen
            ? { type: "spring", stiffness: 300, damping: 30 }
            : { duration: 0 }
        }
      >
        {!chatStarted && (
          <div className="absolute top-0 left-0 w-full flex items-center justify-between gap-3 p-2 pl-4 z-10">
            <div className="flex items-center gap-2">
              {(!chatHistoryOpen || !isLargeScreen) && (
                <Button
                  className="hover:bg-gray-100"
                  variant="ghost"
                  onClick={() => setChatHistoryOpen((p) => !p)}
                >
                  {chatHistoryOpen ? (
                    <PanelRightOpen className="size-5" />
                  ) : (
                    <PanelRightClose className="size-5" />
                  )}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="实时语音对话"
                variant={realtimeVoiceOpen ? "default" : "ghost"}
                onClick={() => setRealtimeVoiceOpen((p) => !p)}
              >
                <Phone className="size-5" />
              </TooltipIconButton>
              
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="MCP Servers"
                variant="ghost"
                onClick={() => setMcpManagerOpen((p) => !p)}
              >
                <Server className="size-5" />
              </TooltipIconButton>
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="Vector Database"
                variant="ghost"
                onClick={() => setVectorStoreOpen((p) => !p)}
              >
                <Database className="size-5" />
              </TooltipIconButton>
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="Skill Manager"
                variant="ghost"
                onClick={() => setSkillManagerOpen((p) => !p)}
              >
                <Puzzle className="size-5" />
              </TooltipIconButton>
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="定时任务"
                variant="ghost"
                onClick={() => setSchedulerOpen((p) => !p)}
              >
                <Clock className="size-5" />
              </TooltipIconButton>
              <OpenGitHubRepo />
            </div>
          </div>
        )}
        {chatStarted && (
          <div className="flex items-center justify-between gap-3 p-2 z-10 relative">
            <div className="flex items-center justify-start gap-2 relative">
              <div className="absolute left-0 z-10">
                {(!chatHistoryOpen || !isLargeScreen) && (
                  <Button
                    className="hover:bg-gray-100"
                    variant="ghost"
                    onClick={() => setChatHistoryOpen((p) => !p)}
                  >
                    {chatHistoryOpen ? (
                      <PanelRightOpen className="size-5" />
                    ) : (
                      <PanelRightClose className="size-5" />
                    )}
                  </Button>
                )}
              </div>
              <motion.button
                className="flex gap-2 items-center cursor-pointer"
                onClick={() => setThreadId(null)}
                animate={{
                  marginLeft: !chatHistoryOpen ? 48 : 0,
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
              >
                <LangGraphLogoSVG width={32} height={32} />
                <span className="text-xl font-semibold tracking-tight">
                  Agent Chat
                </span>
              </motion.button>
            </div>

            <div className="flex items-center gap-4">
              {/* 当前向量库集合显示 */}
              <div 
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full text-sm cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                onClick={() => setVectorStoreOpen(true)}
                title="点击打开向量库面板"
              >
                <Database className="w-4 h-4" />
                <span className="max-w-[100px] truncate">
                  {selectedCollection === "default" ? "默认知识库" : selectedCollection}
                </span>
              </div>
              
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="MCP Servers"
                variant="ghost"
                onClick={() => setMcpManagerOpen((p) => !p)}
              >
                <Server className="size-5" />
              </TooltipIconButton>
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="Vector Database"
                variant="ghost"
                onClick={() => setVectorStoreOpen((p) => !p)}
              >
                <Database className="size-5" />
              </TooltipIconButton>
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="Skill Manager"
                variant="ghost"
                onClick={() => setSkillManagerOpen((p) => !p)}
              >
                <Puzzle className="size-5" />
              </TooltipIconButton>
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="定时任务"
                variant="ghost"
                onClick={() => setSchedulerOpen((p) => !p)}
              >
                <Clock className="size-5" />
              </TooltipIconButton>
              <div className="flex items-center">
                <OpenGitHubRepo />
              </div>
              <TooltipIconButton
                size="lg"
                className="p-4"
                tooltip="New thread"
                variant="ghost"
                onClick={() => setThreadId(null)}
              >
                <SquarePen className="size-5" />
              </TooltipIconButton>
            </div>

            <div className="absolute inset-x-0 top-full h-5 bg-gradient-to-b from-background to-background/0" />
          </div>
        )}

        <StickToBottom className="relative flex-1 overflow-hidden">
          <StickyToBottomContent
            className={cn(
              "absolute px-4 inset-0 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
              !chatStarted && "flex flex-col items-stretch mt-[25vh]",
              chatStarted && "grid grid-rows-[1fr_auto]",
            )}
            contentClassName="pt-8 pb-32 max-w-3xl mx-auto flex flex-col gap-4 w-full"
            content={
              <>
                {messages
                  .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
                  .map((message, index) =>
                    message.type === "human" ? (
                      <HumanMessage
                        key={message.id || `${message.type}-${index}`}
                        message={message}
                        isLoading={isLoading}
                      />
                    ) : (
                      <AssistantMessage
                        key={message.id || `${message.type}-${index}`}
                        message={message}
                        isLoading={isLoading}
                        handleRegenerate={handleRegenerate}
                        characterId={ttsCharacter}
                        ttsEnabled={ttsEnabled}
                      />
                    ),
                  )}
                {/* Special rendering case where there are no AI/tool messages, but there is an interrupt.
                    We need to render it outside of the messages list, since there are no messages to render */}
                {hasNoAIOrToolMessages && !!stream.interrupt && (
                  <AssistantMessage
                    key="interrupt-msg"
                    message={undefined}
                    isLoading={isLoading}
                    handleRegenerate={handleRegenerate}
                    characterId={ttsCharacter}
                    ttsEnabled={ttsEnabled}
                  />
                )}
                {isLoading && !firstTokenReceived && (
                  <AssistantMessageLoading />
                )}
              </>
            }
            footer={
              <div className="sticky flex flex-col items-center gap-8 bottom-0 bg-white w-full">
                {!chatStarted && (
                  <div className="flex gap-3 items-center">
                    <LangGraphLogoSVG className="flex-shrink-0 h-8" />
                    <h1 className="text-2xl font-semibold tracking-tight">
                      Agent Chat
                    </h1>
                  </div>
                )}

                <ScrollToBottom className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 animate-in fade-in-0 zoom-in-95" />

                <div className="w-full px-4">
                  <div className="bg-muted rounded-2xl border shadow-xs mx-auto mb-8 w-full max-w-3xl relative z-10">
                    <form
                      onSubmit={handleSubmit}
                      className="grid grid-rows-[auto_1fr_auto] gap-2 w-full"
                    >
                    {/* 图片引用显示 */}
                    {imageReferences.length > 0 && (
                      <div className="px-3 pt-3">
                        <ImageReferenceList
                          references={imageReferences}
                          onRemove={(idx) => setImageReferences(prev => prev.filter((_, i) => i !== idx))}
                        />
                      </div>
                    )}
                    
                    {/* Image Gallery - 替换原来的预览 */}
                    {attachedImages.length > 0 && (
                      <div className="px-3 pt-3">
                        <ImageGallery
                          images={attachedImages.map(img => ({
                            id: img.id,
                            src: img.preview,
                            name: img.file.name,
                          }))}
                          onRemove={(id) => {
                            const img = attachedImages.find(i => i.id === id);
                            if (img) URL.revokeObjectURL(img.preview);
                            setAttachedImages(prev => prev.filter(i => i.id !== id));
                          }}
                          onReference={(imageId, region) => {
                            const img = attachedImages.find(i => i.id === imageId);
                            if (img) {
                              setImageReferences(prev => [...prev, {
                                imageId,
                                src: img.preview,
                                name: img.file.name,
                                region,
                              }]);
                            }
                          }}
                        />
                      </div>
                    )}

                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.metaKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          const el = e.target as HTMLElement | undefined;
                          const form = el?.closest("form");
                          form?.requestSubmit();
                        }
                      }}
                      placeholder={`使用 "${selectedCollection === "default" ? "默认知识库" : selectedCollection}" 回答您的问题...`}
                      className="p-3.5 pb-0 border-none bg-transparent field-sizing-content shadow-none ring-0 outline-none focus:outline-none focus:ring-0 resize-none"
                    />

                    {/* 底部工具栏 - 仿截图设计 */}
                    <div className="flex items-center justify-between p-3">
                      {/* 左侧加号菜单 */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-gray-100 border border-gray-300"
                            disabled={isLoading}
                          >
                            <Plus className="w-5 h-5 text-gray-600" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-48 p-2">
                          <div className="flex flex-col gap-1">
                            {/* 图片上传 */}
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              id="image-upload-input"
                              onChange={async (e) => {
                                const files = e.target.files;
                                if (!files) return;
                                
                                const newImages: ImageAttachment[] = [];
                                for (const file of Array.from(files)) {
                                  if (!file.type.startsWith('image/')) {
                                    toast.error(`${file.name} 不是图片文件`);
                                    continue;
                                  }
                                  if (file.size > 20 * 1024 * 1024) {
                                    toast.error(`${file.name} 超过 20MB 限制`);
                                    continue;
                                  }
                                  
                                  try {
                                    const reader = new FileReader();
                                    const base64 = await new Promise<string>((resolve) => {
                                      reader.onload = () => resolve((reader.result as string).split(',')[1]);
                                      reader.readAsDataURL(file);
                                    });
                                    
                                    newImages.push({
                                      id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                      file,
                                      preview: URL.createObjectURL(file),
                                      base64,
                                    });
                                  } catch (error) {
                                    toast.error(`处理 ${file.name} 失败`);
                                  }
                                }
                                
                                setAttachedImages([...attachedImages, ...newImages]);
                                if (newImages.length > 0) {
                                  toast.success(`已添加 ${newImages.length} 张图片`);
                                }
                                (e.target as HTMLInputElement).value = '';
                              }}
                            />
                            <label
                              htmlFor="image-upload-input"
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg cursor-pointer text-sm"
                            >
                              <ImagePlus className="w-4 h-4 text-gray-500" />
                              文件和图片
                            </label>
                            
                            {/* 隐藏工具调用 */}
                            <button
                              type="button"
                              onClick={() => setHideToolCalls(!hideToolCalls)}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg text-sm w-full text-left"
                            >
                              {hideToolCalls ? (
                                <EyeOff className="w-4 h-4 text-gray-500" />
                              ) : (
                                <Eye className="w-4 h-4 text-gray-500" />
                              )}
                              {hideToolCalls ? '显示工具调用' : '隐藏工具调用'}
                            </button>
                            
                            {/* 网络搜索 */}
                            <button
                              type="button"
                              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg text-sm w-full text-left"
                            >
                              <Globe className="w-4 h-4 text-gray-500" />
                              联网搜索
                              {webSearchEnabled && <span className="ml-auto text-blue-500">✓</span>}
                            </button>
                            
                            {/* MCP */}
                            <button
                              type="button"
                              onClick={() => setMcpEnabled(!mcpEnabled)}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg text-sm w-full text-left"
                            >
                              <Settings className="w-4 h-4 text-gray-500" />
                              MCP 工具
                              {mcpEnabled && <span className="ml-auto text-blue-500">✓</span>}
                            </button>
                            
                            <div className="border-t my-1" />
                            
                            {/* 模型配置 */}
                            <ModelConfigDialog>
                              <button
                                type="button"
                                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg text-sm w-full text-left"
                              >
                                <Sparkles className="w-4 h-4 text-gray-500" />
                                AI 模型设置
                              </button>
                            </ModelConfigDialog>
                            
                            {/* 提示词配置 */}
                            <PromptConfigDialog>
                              <button
                                type="button"
                                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg text-sm w-full text-left"
                              >
                                <MessageSquare className="w-4 h-4 text-gray-500" />
                                提示词设置
                              </button>
                            </PromptConfigDialog>
                            
                            <div className="border-t my-1" />
                            
                            {/* 自动语音播报开关 */}
                            <button
                              type="button"
                              onClick={() => setTtsEnabled(!ttsEnabled)}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-lg text-sm w-full text-left"
                            >
                              <Volume2 className="w-4 h-4 text-gray-500" />
                              自动语音播报 (AI回复)
                              {ttsEnabled && <span className="ml-auto text-blue-500">✓</span>}
                            </button>
                            
                            {/* 角色选择已移至顶部标题栏 */}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* 语音输入按钮 */}
                      <VoiceInput
                        onTranscript={(text) => {
                          setInput((prev) => prev + text);
                          toast.success("语音识别成功");
                        }}
                      />

                      {/* 右侧发送/停止按钮 */}
                      {stream.isLoading ? (
                        <Button
                          type="button"
                          onClick={() => stream.stop()}
                          size="icon"
                          className="h-8 w-8 rounded-full bg-gray-200 hover:bg-gray-300 text-red-500"
                        >
                          <Square className="w-3 h-3 fill-current" />
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          size="icon"
                          className="h-8 w-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!input.trim() && attachedImages.length === 0}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    </form>
                  </div>
                </div>
              </div>
            }
          />
        </StickToBottom>
      </motion.div>


      {/* Skill Manager Sidebar - Right (Desktop) */}
      <div className="relative lg:flex hidden">
        <motion.div
          className="absolute right-0 h-full border-l bg-white dark:bg-gray-900 overflow-hidden z-20"
          style={{ width: 480 }}
          animate={{ x: skillManagerOpen ? 0 : 480 }}
          initial={{ x: 480 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="relative h-full flex flex-col" style={{ width: 480 }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Skill 管理
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSkillManagerOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <SkillManager userId="default" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Skill Manager Sidebar - Mobile */}
      {isLargeScreen ? null : (
        <Sheet
          open={!!skillManagerOpen}
          onOpenChange={(open) => setSkillManagerOpen(open)}
        >
          <SheetContent side="right" className="w-[350px]">
            <SheetHeader>
              <SheetTitle>Skill 管理</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-4">
              <SkillManager userId="default" />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Vector Store Sidebar - Right (Desktop) */}
      <div className="relative lg:flex hidden">
        <motion.div
          className="absolute right-0 h-full border-l bg-white dark:bg-gray-900 overflow-hidden z-20"
          style={{ width: 480 }}
          animate={{ x: vectorStoreOpen ? 0 : 480 }}
          initial={{ x: 480 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="relative h-full flex flex-col" style={{ width: 480 }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                向量数据库
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setVectorStoreOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <VectorStoreManager 
                userId="default"
                currentCollection={selectedCollection}
                onCollectionChange={setSelectedCollection}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Vector Store Sidebar - Mobile */}
      {isLargeScreen ? null : (
        <Sheet
          open={!!vectorStoreOpen}
          onOpenChange={(open) => setVectorStoreOpen(open)}
        >
          <SheetContent side="right" className="w-[350px]">
            <SheetHeader>
              <SheetTitle>向量数据库</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-4">
              <VectorStoreManager 
                userId="default"
                currentCollection={selectedCollection}
                onCollectionChange={setSelectedCollection}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* MCP Manager Sidebar - Right (Desktop) */}
      <div className="relative lg:flex hidden">
        <motion.div
          className="absolute right-0 h-full border-l bg-white dark:bg-gray-900 overflow-hidden z-20"
          style={{ width: 400 }}
          animate={{ x: mcpManagerOpen ? 0 : 400 }}
          initial={{ x: 400 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="relative h-full flex flex-col" style={{ width: 400 }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                MCP Servers
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMcpManagerOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <MCPManager
                servers={mcpServers}
                toolConfigs={mcpToolConfigs}
                enabled={mcpEnabled}
                onServersChange={setMcpServers}
                onToolConfigsChange={setMcpToolConfigs}
                onEnabledChange={setMcpEnabled}
                serverStatuses={mcpStatuses}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Realtime Voice Sidebar - Desktop */}
      <div className="relative lg:flex hidden">
        <motion.div
          className="absolute right-0 h-full border-l bg-white dark:bg-gray-900 overflow-hidden z-20"
          style={{ width: 400 }}
          animate={{ x: realtimeVoiceOpen ? 0 : 400 }}
          initial={{ x: 400 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="relative h-full flex flex-col" style={{ width: 400 }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                实时语音对话
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRealtimeVoiceOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <RealtimeVoice />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Realtime Voice Sidebar - Mobile */}
      {isLargeScreen ? null : (
        <Sheet
          open={!!realtimeVoiceOpen}
          onOpenChange={(open) => setRealtimeVoiceOpen(open)}
        >
          <SheetContent side="right" className="w-[350px]">
            <SheetHeader>
              <SheetTitle>实时语音对话</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-4">
              <RealtimeVoice />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* MCP Manager Sidebar - Mobile */}
      {isLargeScreen ? null : (
        <Sheet
          open={!!mcpManagerOpen}
          onOpenChange={(open) => setMcpManagerOpen(open)}
        >
          <SheetContent side="right" className="w-[350px]">
            <SheetHeader>
              <SheetTitle>MCP Servers</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-4">
              <MCPManager
                servers={mcpServers}
                toolConfigs={mcpToolConfigs}
                enabled={mcpEnabled}
                onServersChange={setMcpServers}
                onToolConfigsChange={setMcpToolConfigs}
                onEnabledChange={setMcpEnabled}
                serverStatuses={mcpStatuses}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Scheduler Sidebar - Desktop */}
      <div className="relative lg:flex hidden">
        <motion.div
          className="absolute right-0 h-full border-l bg-white dark:bg-gray-900 overflow-hidden z-20"
          style={{ width: 560 }}
          animate={{ x: schedulerOpen ? 0 : 560 }}
          initial={{ x: 560 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="relative h-full flex flex-col" style={{ width: 560 }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                定时任务调度器
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSchedulerOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <SchedulerPanel />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Scheduler Sidebar - Mobile */}
      {isLargeScreen ? null : (
        <Sheet
          open={!!schedulerOpen}
          onOpenChange={(open) => setSchedulerOpen(open)}
        >
          <SheetContent side="right" className="w-[350px]">
            <SheetHeader>
              <SheetTitle>定时任务调度器</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-4">
              <SchedulerPanel />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
