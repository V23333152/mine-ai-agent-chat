import { validate } from "uuid";
import { getApiKey } from "@/lib/api-key";
import { Thread } from "@langchain/langgraph-sdk";
import { useQueryState } from "nuqs";
import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useState,
  Dispatch,
  SetStateAction,
  useEffect,
} from "react";
import { createClient } from "./client";

// Default values from environment variables
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = import.meta.env.VITE_ASSISTANT_ID || "agent";

interface ThreadContextType {
  getThreads: () => Promise<Thread[]>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoading: boolean;
  setThreadsLoading: Dispatch<SetStateAction<boolean>>;
  deleteThread: (threadId: string) => Promise<void>;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

function getThreadSearchMetadata(
  assistantId: string,
): { graph_id: string } | { assistant_id: string } {
  if (validate(assistantId)) {
    return { assistant_id: assistantId };
  } else {
    return { graph_id: assistantId };
  }
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [apiUrlParam] = useQueryState("apiUrl");
  const [assistantIdParam] = useQueryState("assistantId");
  
  // Use URL param first, then env var, then default
  const apiUrl = apiUrlParam || DEFAULT_API_URL;
  const assistantId = assistantIdParam || DEFAULT_ASSISTANT_ID;
  
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log("[ThreadProvider] Config:", { apiUrl, assistantId, apiUrlParam, assistantIdParam });
  }, [apiUrl, assistantId, apiUrlParam, assistantIdParam]);

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    if (!apiUrl || !assistantId) {
      console.log("[ThreadProvider] Missing config, returning empty threads");
      return [];
    }
    console.log("[ThreadProvider] Fetching threads for:", { apiUrl, assistantId });
    const client = createClient(apiUrl, getApiKey() ?? undefined);

    try {
      const threads = await client.threads.search({
        metadata: {
          ...getThreadSearchMetadata(assistantId),
        },
        limit: 100,
      });
      console.log("[ThreadProvider] Fetched threads:", threads.length);
      return threads;
    } catch (error) {
      console.error("[ThreadProvider] Failed to fetch threads:", error);
      throw error;
    }
  }, [apiUrl, assistantId]);

  const deleteThread = useCallback(async (threadId: string): Promise<void> => {
    if (!apiUrl) {
      console.error("[ThreadProvider] Cannot delete: missing apiUrl");
      throw new Error("API URL not configured");
    }
    
    console.log("[ThreadProvider] Deleting thread:", threadId);
    const client = createClient(apiUrl, getApiKey() ?? undefined);
    
    try {
      await client.threads.delete(threadId);
      console.log("[ThreadProvider] Thread deleted successfully:", threadId);
      
      // Update local state
      setThreads((prev) => prev.filter((t) => t.thread_id !== threadId));
    } catch (error) {
      console.error("[ThreadProvider] Failed to delete thread:", error);
      throw error;
    }
  }, [apiUrl]);

  const value = {
    getThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
    deleteThread,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }
  return context;
}
