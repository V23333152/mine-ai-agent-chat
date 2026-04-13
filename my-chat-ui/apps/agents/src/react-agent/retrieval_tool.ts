/**
 * Retrieval tool for querying vector database.
 * This allows the agent to search uploaded documents.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// RAG 服务地址配置
// Unified Backend 运行在宿主机 8888 端口
const RETRIEVAL_API_URL = process.env.RETRIEVAL_API_URL || "http://127.0.0.1:8888/rag";

// 从环境变量或配置获取当前集合名称
const DEFAULT_COLLECTION = process.env.DEFAULT_VECTOR_COLLECTION || "default";

/**
 * Tool to search uploaded documents in the vector database.
 */
export const searchDocuments = tool(
  async ({ query, user_id = "default", collection_name, k = 5 }) => {
    try {
      // 使用传入的集合名称或默认值
      const targetCollection = collection_name || DEFAULT_COLLECTION;
      
      console.log(`[RAG Tool] Searching collection: ${targetCollection}, query: ${query}`);
      console.log(`[RAG Tool] API URL: ${RETRIEVAL_API_URL}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      const response = await fetch(`${RETRIEVAL_API_URL}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query, 
          user_id, 
          collection_name: targetCollection,
          k 
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        console.error(`[RAG Tool] Search failed: ${error}`);
        return `Search failed: HTTP ${response.status} - ${error}`;
      }

      const result = await response.json();
      
      if (result.documents.length === 0) {
        return `No relevant documents found in collection "${targetCollection}".`;
      }

      // Format results
      const formattedDocs = result.documents.map((doc: any, index: number) => {
        const source = doc.metadata?.source || "Unknown";
        const collection = doc.metadata?.collection || "default";
        return `[${index + 1}] From ${source} (collection: ${collection}):\n${doc.content.substring(0, 500)}${doc.content.length > 500 ? "..." : ""}`;
      });

      return `Found ${result.documents.length} relevant documents in "${targetCollection}":\n\n${formattedDocs.join("\n\n")}`;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          console.error(`[RAG Tool] Error: Request timeout`);
          return `Error searching documents: Request timeout (10s). Please check if the RAG service is running at ${RETRIEVAL_API_URL}`;
        }
        console.error(`[RAG Tool] Error: ${error.message}`);
        return `Error searching documents: ${error.message}. Please ensure the unified backend is running at ${RETRIEVAL_API_URL}`;
      }
      console.error(`[RAG Tool] Unknown error: ${error}`);
      return `Error searching documents: Unknown error`;
    }
  },
  {
    name: "search_documents",
    description: "Search uploaded documents in the vector database for relevant information. Use this when the user asks about content from uploaded files. You can specify which collection to search.",
    schema: z.object({
      query: z.string().describe("The search query to find relevant documents"),
      user_id: z.string().nullable().optional().describe("User identifier (default: default)"),
      collection_name: z.string().nullable().optional().describe("Vector collection to search (default: default)"),
      k: z.number().nullable().optional().describe("Number of documents to retrieve (default: 5)"),
    }),
  }
);
