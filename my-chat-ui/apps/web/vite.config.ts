import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const UNIFIED_API_URL = "http://127.0.0.1:8888";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // TTS相关 (保留原路径)
      "/api/tts": {
        target: UNIFIED_API_URL,
        changeOrigin: true,
      },
      "/tts": {
        target: UNIFIED_API_URL,
        changeOrigin: true,
      },
      "/characters": {
        target: UNIFIED_API_URL,
        changeOrigin: true,
      },
      "/audio": {
        target: UNIFIED_API_URL,
        changeOrigin: true,
      },
      
      // 代码解释器
      "/code": {
        target: UNIFIED_API_URL,
        changeOrigin: true,
      },
      
      // RAG向量数据库
      "/rag": {
        target: UNIFIED_API_URL,
        changeOrigin: true,
      },
      
      // WebSocket实时语音
      "/ws": {
        target: UNIFIED_API_URL,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
