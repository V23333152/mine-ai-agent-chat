 import { Button } from "@/components/ui/button";
import { useThreads } from "@/providers/Thread";
import { Thread } from "@langchain/langgraph-sdk";
import { useEffect, useState } from "react";

import { getContentString } from "../utils";
import { useQueryState, parseAsBoolean } from "nuqs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelRightOpen, PanelRightClose, RefreshCw, Settings, Trash2 } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ThreadItem({
  thread,
  isActive,
  onClick,
  onDelete,
}: {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  let itemText = thread.thread_id;
  if (
    typeof thread.values === "object" &&
    thread.values &&
    "messages" in thread.values &&
    Array.isArray(thread.values.messages) &&
    thread.values.messages?.length > 0
  ) {
    const firstMessage = thread.values.messages[0];
    itemText = getContentString(firstMessage.content);
  }

  return (
    <>
      <div
        className={`group relative flex items-center w-full px-1 rounded-lg transition-colors overflow-hidden ${
          isActive ? "bg-gray-100" : "hover:bg-gray-50"
        }`}
      >
        <Button
          variant="ghost"
          className="text-left items-start justify-start font-normal flex-1 h-10 px-3 min-w-0"
          onClick={onClick}
        >
          <p className="truncate text-sm w-full">{itemText}</p>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 mr-1 shrink-0 bg-inherit"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteDialog(true);
          }}
        >
          <Trash2 className="size-4 text-muted-foreground hover:text-red-500" />
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除对话</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个对话吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ThreadList({
  threads,
  onThreadClick,
}: {
  threads: Thread[];
  onThreadClick?: (threadId: string) => void;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { deleteThread } = useThreads();

  if (threads.length === 0) {
    return (
      <div className="h-full flex flex-col w-full items-center justify-center px-4 text-center">
        <p className="text-muted-foreground text-sm">暂无历史对话</p>
        <p className="text-muted-foreground text-xs mt-1">开始一个新的对话吧</p>
      </div>
    );
  }

  const handleDelete = async (threadIdToDelete: string) => {
    try {
      await deleteThread(threadIdToDelete);
      toast.success("对话已删除");
      // If the deleted thread is the current one, clear the threadId
      if (threadId === threadIdToDelete) {
        setThreadId(null);
      }
    } catch (error) {
      toast.error("删除失败: " + (error instanceof Error ? error.message : "未知错误"));
    }
  };

  return (
    <div className="h-full flex flex-col w-full gap-1 items-start justify-start overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
      {threads.map((t) => (
        <ThreadItem
          key={t.thread_id}
          thread={t}
          isActive={t.thread_id === threadId}
          onClick={() => {
            onThreadClick?.(t.thread_id);
            if (t.thread_id === threadId) return;
            setThreadId(t.thread_id);
          }}
          onDelete={() => handleDelete(t.thread_id)}
        />
      ))}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="h-full flex flex-col w-full gap-2 items-start justify-start overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
      {Array.from({ length: 30 }).map((_, i) => (
        <Skeleton key={`skeleton-${i}`} className="w-[280px] h-10" />
      ))}
    </div>
  );
}

// Default values from environment variables (same as ThreadProvider)
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = import.meta.env.VITE_ASSISTANT_ID || "agent";

export default function ThreadHistory() {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [apiUrlParam] = useQueryState("apiUrl");
  const [assistantIdParam] = useQueryState("assistantId");
  
  // Use URL param first, then env var, then default (same logic as ThreadProvider)
  const apiUrl = apiUrlParam || DEFAULT_API_URL;
  const assistantId = assistantIdParam || DEFAULT_ASSISTANT_ID;

  const { getThreads, threads, setThreads, threadsLoading, setThreadsLoading } =
    useThreads();

  const isConfigured = !!(apiUrl && assistantId);

  // Debug logging
  useEffect(() => {
    console.log("[ThreadHistory] Config state:", {
      apiUrl,
      assistantId,
      isConfigured,
      threadsCount: threads.length,
      threadsLoading
    });
  }, [apiUrl, assistantId, isConfigured, threads.length, threadsLoading]);

  // Load threads when component mounts or config changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isConfigured) {
      console.log("[ThreadHistory] Not configured, skipping load");
      return;
    }
    
    const loadThreads = async () => {
      console.log("[ThreadHistory] Loading threads...");
      setThreadsLoading(true);
      try {
        const data = await getThreads();
        console.log("[ThreadHistory] Loaded threads:", data.length);
        setThreads(data);
      } catch (error) {
        console.error("[ThreadHistory] Failed to load threads:", error);
        toast.error("加载历史记录失败: " + (error instanceof Error ? error.message : "未知错误"));
      } finally {
        setThreadsLoading(false);
      }
    };
    
    loadThreads();
  }, [isConfigured, getThreads, setThreads, setThreadsLoading]);

  return (
    <>
      <div className="hidden lg:flex flex-col border-r-[1px] border-slate-300 items-start justify-start gap-6 h-screen w-[300px] shrink-0 shadow-inner-right">
        <div className="flex items-center justify-between w-full pt-1.5 px-4">
          <div className="flex items-center gap-1">
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
            <Button
              className="hover:bg-gray-100"
              variant="ghost"
              size="icon"
              onClick={async () => {
                setThreadsLoading(true);
                try {
                  const data = await getThreads();
                  setThreads(data);
                  toast.success(`已加载 ${data.length} 个对话`);
                } catch (error) {
                  toast.error("刷新失败");
                } finally {
                  setThreadsLoading(false);
                }
              }}
              disabled={threadsLoading}
            >
              <RefreshCw className={`size-4 ${threadsLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Thread History
          </h1>
        </div>
        {!isConfigured ? (
          <div className="flex flex-col items-center justify-center px-6 text-center h-full gap-4">
            <Settings className="size-12 text-muted-foreground/50" />
            <div>
              <p className="text-muted-foreground font-medium">未配置 API</p>
              <p className="text-muted-foreground text-sm mt-1">
                请先配置 API URL 和 Assistant ID
              </p>
            </div>
          </div>
        ) : threadsLoading ? (
          <ThreadHistoryLoading />
        ) : (
          <ThreadList threads={threads} />
        )}
      </div>
      {!isLargeScreen && (
        <Sheet
          open={!!chatHistoryOpen}
          onOpenChange={(open) => setChatHistoryOpen(open)}
        >
          <SheetContent side="left" className="w-[300px]">
            <SheetHeader>
              <SheetTitle>Thread History</SheetTitle>
            </SheetHeader>
            {/* Refresh button placed below header to avoid conflict with X close button */}
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-sm text-muted-foreground">
                {threads.length > 0 ? `${threads.length} 个对话` : "暂无对话"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={async () => {
                  setThreadsLoading(true);
                  try {
                    const data = await getThreads();
                    setThreads(data);
                    toast.success(`已加载 ${data.length} 个对话`);
                  } catch (error) {
                    toast.error("刷新失败");
                  } finally {
                    setThreadsLoading(false);
                  }
                }}
                disabled={threadsLoading}
              >
                <RefreshCw className={`size-4 mr-1 ${threadsLoading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>
            {threadsLoading ? (
              <ThreadHistoryLoading />
            ) : (
              <ThreadList
                threads={threads}
                onThreadClick={() => setChatHistoryOpen((o) => !o)}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
