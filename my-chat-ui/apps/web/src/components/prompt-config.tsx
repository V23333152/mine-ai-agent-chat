"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Check, Bot, Brain, Search, FileText, MessageSquare, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// 从后端共享类型
export type AgentType = "react" | "memory" | "research" | "retrieval";

export interface PromptConfig {
  id: string;
  name: string;
  agentType: AgentType;
  systemPrompt: string;
  description?: string;
  isDefault?: boolean;
}

// 默认提示词配置
export const DEFAULT_PROMPT_CONFIGS: PromptConfig[] = [
  {
    id: "default-react",
    name: "React Agent (默认)",
    agentType: "react",
    description: "通用对话 Agent，支持工具调用（RAG、图像生成、TTS等）",
    isDefault: true,
    systemPrompt: `You are a helpful AI assistant.

You have access to a vector database containing uploaded documents (current collection: "{vector_store_collection}"). When the user asks about specific content that might be in uploaded files, use the "search_documents" tool with collection_name="{vector_store_collection}" to retrieve relevant information from the current collection.

You can also generate images using the "generate_image" tool. Use this when:
- The user asks you to draw, create, or generate an image
- The user wants to visualize a concept or scene
- The user asks for a logo, illustration, or artwork
- Provide detailed, descriptive prompts for best results

IMPORTANT: When you generate an image, the tool will return a URL. You MUST include this URL in your response using markdown image syntax: ![描述](URL) so the user can see the image.

When using retrieved documents:
- Cite the source document name when referencing information
- Synthesize information from multiple documents if needed
- If no relevant documents are found, rely on your general knowledge

System time: {system_time}`,
  },
  {
    id: "default-memory",
    name: "Memory Agent (默认)",
    agentType: "memory",
    description: "带记忆功能的对话 Agent",
    isDefault: true,
    systemPrompt: `You are a helpful and friendly chatbot. Get to know the user! Ask questions! Be spontaneous!

User Info: {user_info}

System Time: {time}`,
  },
  {
    id: "default-research",
    name: "Research Agent (默认)",
    agentType: "research",
    description: "研究分析 Agent，支持深度检索",
    isDefault: true,
    systemPrompt: `You are a research assistant that can help with complex queries.

You have access to:
1. Web search for real-time information
2. Document retrieval from the vector database
3. Code interpreter for data analysis

Always cite your sources when providing information.

System time: {system_time}`,
  },
  {
    id: "default-retrieval",
    name: "Retrieval Agent (默认)",
    agentType: "retrieval",
    description: "专注于文档检索的 Agent",
    isDefault: true,
    systemPrompt: `You are a document retrieval assistant.

Your primary task is to search through uploaded documents and provide accurate answers based on their content.

Always cite the specific document names and sections when referencing information.

System time: {system_time}`,
  },
];

const STORAGE_KEY = "agent-prompt-configs";

// Agent 类型标签
const AGENT_TYPE_LABELS: Record<AgentType, { icon: React.ReactNode; label: string; color: string; description: string }> = {
  react: { 
    icon: <Bot className="w-4 h-4" />, 
    label: "React Agent", 
    color: "blue",
    description: "通用对话，支持工具调用"
  },
  memory: { 
    icon: <Brain className="w-4 h-4" />, 
    label: "Memory Agent", 
    color: "green",
    description: "带长期记忆的对话"
  },
  research: { 
    icon: <Search className="w-4 h-4" />, 
    label: "Research Agent", 
    color: "purple",
    description: "深度研究分析"
  },
  retrieval: { 
    icon: <FileText className="w-4 h-4" />, 
    label: "Retrieval Agent", 
    color: "orange",
    description: "文档检索专用"
  },
};

export function usePromptConfigs() {
  const [configs, setConfigs] = useState<PromptConfig[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 从 localStorage 加载配置
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfigs(parsed);
      } catch {
        initializeDefaultConfigs();
      }
    } else {
      initializeDefaultConfigs();
    }
    
    setLoaded(true);
  }, []);

  // 初始化默认配置
  const initializeDefaultConfigs = () => {
    console.log("[PromptConfig] Initializing default configs");
    setConfigs(DEFAULT_PROMPT_CONFIGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PROMPT_CONFIGS));
  };

  // 保存配置到 localStorage
  const saveConfigs = (newConfigs: PromptConfig[]) => {
    setConfigs(newConfigs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfigs));
  };

  // 更新配置
  const updateConfig = (id: string, updates: Partial<PromptConfig>) => {
    const newConfigs = configs.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    saveConfigs(newConfigs);
  };

  // 添加新配置
  const addConfig = (config: Omit<PromptConfig, "id">) => {
    const newConfig: PromptConfig = {
      ...config,
      id: `custom-${Date.now()}`,
    };
    const newConfigs = [...configs, newConfig];
    saveConfigs(newConfigs);
  };

  // 删除配置
  const removeConfig = (id: string) => {
    const newConfigs = configs.filter((c) => c.id !== id);
    saveConfigs(newConfigs);
  };

  // 按类型获取配置
  const getConfigsByType = (type: AgentType) => {
    return configs.filter((c) => c.agentType === type);
  };

  // 获取用于 Agent 的提示词配置
  const getPromptConfigForAgent = (): Record<AgentType, PromptConfig | undefined> => {
    return {
      react: configs.find((c) => c.agentType === "react" && !c.id.startsWith("custom-")),
      memory: configs.find((c) => c.agentType === "memory" && !c.id.startsWith("custom-")),
      research: configs.find((c) => c.agentType === "research" && !c.id.startsWith("custom-")),
      retrieval: configs.find((c) => c.agentType === "retrieval" && !c.id.startsWith("custom-")),
    };
  };

  // 重置为默认配置
  const resetToDefault = (id: string) => {
    const defaultConfig = DEFAULT_PROMPT_CONFIGS.find((c) => c.id === id);
    if (defaultConfig) {
      updateConfig(id, { systemPrompt: defaultConfig.systemPrompt });
    }
  };

  return {
    configs,
    loaded,
    addConfig,
    removeConfig,
    updateConfig,
    getConfigsByType,
    getPromptConfigForAgent,
    resetToDefault,
  };
}

/**
 * 直接从 localStorage 获取提示词配置（用于提交时）
 */
export function getCurrentPromptConfigsFromStorage(): Record<AgentType, PromptConfig | undefined> {
  if (typeof window === "undefined") {
    return {
      react: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "react"),
      memory: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "memory"),
      research: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "research"),
      retrieval: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "retrieval"),
    };
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        react: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "react"),
        memory: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "memory"),
        research: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "research"),
        retrieval: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "retrieval"),
      };
    }

    const configs: PromptConfig[] = JSON.parse(saved);
    return {
      react: configs.find((c) => c.agentType === "react"),
      memory: configs.find((c) => c.agentType === "memory"),
      research: configs.find((c) => c.agentType === "research"),
      retrieval: configs.find((c) => c.agentType === "retrieval"),
    };
  } catch {
    return {
      react: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "react"),
      memory: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "memory"),
      research: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "research"),
      retrieval: DEFAULT_PROMPT_CONFIGS.find((c) => c.agentType === "retrieval"),
    };
  }
}

interface PromptConfigDialogProps {
  children?: React.ReactNode;
}

export function PromptConfigDialog({ children }: PromptConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentType>("react");
  const [editingConfig, setEditingConfig] = useState<PromptConfig | null>(null);
  const { configs, loaded, updateConfig, resetToDefault, getConfigsByType } = usePromptConfigs();

  if (!loaded) return null;

  const currentConfigs = getConfigsByType(activeTab);
  const typeLabel = AGENT_TYPE_LABELS[activeTab];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            提示词设置
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            提示词配置
          </DialogTitle>
        </DialogHeader>

        {/* Agent 类型切换 */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {(Object.keys(AGENT_TYPE_LABELS) as AgentType[]).map((type) => (
            <button
              key={type}
              onClick={() => {
                setActiveTab(type);
                setEditingConfig(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-md transition-all",
                activeTab === type
                  ? "bg-white shadow-sm font-medium"
                  : "hover:bg-white/50 text-gray-600"
              )}
            >
              {AGENT_TYPE_LABELS[type].icon}
              {AGENT_TYPE_LABELS[type].label}
            </button>
          ))}
        </div>

        {/* 当前类型的配置列表 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{typeLabel.label}</p>
              <p className="text-xs text-gray-500">{typeLabel.description}</p>
            </div>
            {!editingConfig && currentConfigs.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingConfig(currentConfigs[0])}
              >
                编辑提示词
              </Button>
            )}
          </div>

          {editingConfig ? (
            <PromptEditor
              config={editingConfig}
              onSave={(updates) => {
                updateConfig(editingConfig.id, updates);
                setEditingConfig(null);
              }}
              onCancel={() => setEditingConfig(null)}
              onReset={() => {
                if (editingConfig.isDefault) {
                  resetToDefault(editingConfig.id);
                }
              }}
            />
          ) : (
            <div className="space-y-3">
              {currentConfigs.map((config) => (
                <div
                  key={config.id}
                  className="p-4 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium">{config.name}</p>
                    {config.isDefault && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        默认
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{config.description}</p>
                  <div className="bg-gray-100 rounded p-3 text-xs text-gray-700 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {config.systemPrompt}
                  </div>
                </div>
              ))}
              
              {currentConfigs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>暂无配置</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 提示信息 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium mb-1">💡 提示词变量说明</p>
          <ul className="text-xs space-y-1 list-disc list-inside">
            <li><code>{"{vector_store_collection}"}</code> - 当前选中的文档集合名称</li>
            <li><code>{"{system_time}"}</code> - 当前系统时间（ISO格式）</li>
            <li><code>{"{user_info}"}</code> - 用户信息（Memory Agent）</li>
            <li><code>{"{time}"}</code> - 当前时间（Memory Agent）</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PromptEditorProps {
  config: PromptConfig;
  onSave: (updates: Partial<PromptConfig>) => void;
  onCancel: () => void;
  onReset: () => void;
}

function PromptEditor({ config, onSave, onCancel, onReset }: PromptEditorProps) {
  const [name, setName] = useState(config.name);
  const [description, setDescription] = useState(config.description || "");
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="space-y-2">
        <Label>配置名称</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="配置名称"
        />
      </div>

      <div className="space-y-2">
        <Label>描述</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="简短描述这个配置的用途"
        />
      </div>

      <div className="space-y-2">
        <Label>系统提示词 (System Prompt)</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="输入系统提示词..."
          className="min-h-[300px] font-mono text-sm"
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          取消
        </Button>
        {config.isDefault && (
          <Button variant="outline" className="flex-1" onClick={onReset}>
            重置默认
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={() =>
            onSave({ name, description, systemPrompt })
          }
          disabled={!name || !systemPrompt}
        >
          <Save className="w-4 h-4 mr-1" />
          保存
        </Button>
      </div>
    </div>
  );
}
