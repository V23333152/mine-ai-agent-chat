"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, Check, Bot, Volume2, ImageIcon, Sparkles, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// 模型类型
export type ModelType = "llm" | "tts" | "image";

// 预设 LLM 模型
export const PRESET_LLM_MODELS = [
  {
    id: "kimi-k2.5-vision",
    name: "Kimi K2.5 Vision",
    provider: "moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    vision: true,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    vision: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    vision: true,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    baseUrl: "",
    vision: true,
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    provider: "anthropic",
    baseUrl: "",
    vision: true,
  },
  {
    id: "glm-4v",
    name: "智谱 GLM-4V",
    provider: "zhipu",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    vision: true,
  },
  {
    id: "qwen-vl-max",
    name: "通义千问 VL Max",
    provider: "dashscope",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    vision: true,
  },
];

// 预设 TTS 模型
export const PRESET_TTS_MODELS = [
  {
    id: "qwen-tts",
    name: "千问 TTS（长文本）",
    provider: "dashscope",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
  },
  {
    id: "sovits",
    name: "GPT-SoVITS 本地",
    provider: "local",
    baseUrl: "http://127.0.0.1:8888",
  },
];

// 预设图像生成模型
export const PRESET_IMAGE_MODELS = [
  {
    id: "cogview-3",
    name: "智谱 CogView-3",
    provider: "zhipu",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    id: "dall-e-3",
    name: "DALL·E 3",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
  },
];

export interface ModelConfig {
  id: string;
  name: string;
  modelId: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  type: ModelType;
  vision?: boolean;
  isDefault?: boolean;
}

const STORAGE_KEY = "agent-all-model-configs";
const DEFAULT_CONFIG_KEY = "agent-default-configs";

// 默认配置
const DEFAULT_CONFIGS: ModelConfig[] = [
  {
    id: "default-llm",
    name: "Kimi K2.5 Vision (默认)",
    modelId: "kimi-k2.5-vision",
    provider: "moonshot",
    apiKey: "",
    baseUrl: "https://api.moonshot.cn/v1",
    type: "llm",
    vision: true,
    isDefault: true,
  },
  {
    id: "default-tts-qwen",
    name: "千问 TTS (默认)",
    modelId: "qwen-tts",
    provider: "dashscope",
    apiKey: "",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    type: "tts",
    isDefault: true,
  },
  {
    id: "default-tts-sovits",
    name: "GPT-SoVITS 本地 (默认)",
    modelId: "sovits",
    provider: "local",
    apiKey: "",
    baseUrl: "http://127.0.0.1:8888",
    type: "tts",
    isDefault: true,
  },
  {
    id: "default-image",
    name: "智谱 CogView-3 (默认)",
    modelId: "cogview-3",
    provider: "zhipu",
    apiKey: "",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    type: "image",
    isDefault: true,
  },
];

export function useModelConfigs() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [defaultIds, setDefaultIds] = useState<Record<ModelType, string>>({
    llm: "kimi-k2.5-vision",
    tts: "qwen-tts",
    image: "cogview-3",
  });
  const [loaded, setLoaded] = useState(false);

  // 从 localStorage 加载配置
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedDefault = localStorage.getItem(DEFAULT_CONFIG_KEY);
    
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
    
    if (savedDefault) {
      try {
        setDefaultIds(JSON.parse(savedDefault));
      } catch {
        // 使用默认
      }
    }
    
    setLoaded(true);
  }, []);

  // 初始化默认配置
  const initializeDefaultConfigs = () => {
    console.log("[ModelConfig] Initializing default configs");
    setConfigs(DEFAULT_CONFIGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIGS));
    localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify({
      llm: "kimi-k2.5-vision",
      tts: "qwen-tts",
      image: "cogview-3",
    }));
    console.log("[ModelConfig] Default configs saved to localStorage");
  };

  // 保存配置到 localStorage
  const saveConfigs = (newConfigs: ModelConfig[]) => {
    console.log("[ModelConfig] Saving configs:", newConfigs.map(c => ({ id: c.id, name: c.name, hasKey: !!c.apiKey })));
    setConfigs(newConfigs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfigs));
  };
  
  // 更新配置（用于编辑 API Key 等）
  const updateConfig = (id: string, updates: Partial<ModelConfig>) => {
    const newConfigs = configs.map((c) => 
      c.id === id ? { ...c, ...updates } : c
    );
    saveConfigs(newConfigs);
  };

  // 设置默认模型
  const setDefault = (type: ModelType, modelId: string) => {
    console.log(`[ModelConfig] Setting default ${type} to ${modelId}`);
    const newDefaults = { ...defaultIds, [type]: modelId };
    setDefaultIds(newDefaults);
    localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(newDefaults));
    console.log("[ModelConfig] New defaults saved:", newDefaults);
  };

  // 添加新配置
  const addConfig = (config: Omit<ModelConfig, "id">) => {
    const newConfig: ModelConfig = {
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
  const getConfigsByType = (type: ModelType) => {
    return configs.filter((c) => c.type === type);
  };

  // 获取默认配置
  const getDefaultConfig = (type: ModelType): ModelConfig | undefined => {
    return configs.find((c) => c.modelId === defaultIds[type] && c.type === type);
  };

  // 获取 Agent 的模型配置
  const getAgentModelConfig = () => {
    const config = getDefaultConfig("llm");
    if (!config) return null;
    
    return {
      model: config.modelId,
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };
  };

  // 获取 TTS 配置
  const getTTSConfig = () => {
    const config = getDefaultConfig("tts");
    if (!config) return null;
    
    return {
      model: config.modelId,
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };
  };

  // 获取图像生成配置
  const getImageConfig = () => {
    const config = getDefaultConfig("image");
    if (!config) return null;
    
    return {
      model: config.modelId,
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };
  };

  return {
    configs,
    defaultIds,
    loaded,
    addConfig,
    removeConfig,
    setDefault,
    updateConfig,
    getConfigsByType,
    getDefaultConfig,
    getAgentModelConfig,
    getTTSConfig,
    getImageConfig,
  };
}

/**
 * 直接从 localStorage 获取当前模型配置
 * 用于确保提交时总是使用最新配置
 */
export function getCurrentModelConfigsFromStorage() {
  if (typeof window === "undefined") {
    return {
      llm: { model: "kimi-k2.5-vision", provider: "moonshot", apiKey: "", baseUrl: "https://api.moonshot.cn/v1" },
      tts: { model: "qwen-tts", provider: "dashscope", apiKey: "", baseUrl: "https://dashscope.aliyuncs.com/api/v1" },
      image: { model: "cogview-3", provider: "zhipu", apiKey: "", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
    };
  }

  try {
    const configsJson = localStorage.getItem(STORAGE_KEY);
    const defaultsJson = localStorage.getItem(DEFAULT_CONFIG_KEY);
    
    if (!configsJson || !defaultsJson) {
      // 返回默认配置
      return {
        llm: { model: "kimi-k2.5-vision", provider: "moonshot", apiKey: "", baseUrl: "https://api.moonshot.cn/v1" },
        tts: { model: "qwen-tts", provider: "dashscope", apiKey: "", baseUrl: "https://dashscope.aliyuncs.com/api/v1" },
        image: { model: "cogview-3", provider: "zhipu", apiKey: "", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
      };
    }

    const configs: ModelConfig[] = JSON.parse(configsJson);
    const defaultIds: Record<ModelType, string> = JSON.parse(defaultsJson);

    const getConfig = (type: ModelType) => {
      const config = configs.find((c) => c.modelId === defaultIds[type] && c.type === type);
      if (!config) {
        // 返回该类型的默认配置
        if (type === "llm") return { model: "kimi-k2.5-vision", provider: "moonshot", apiKey: "", baseUrl: "https://api.moonshot.cn/v1" };
        if (type === "tts") return { model: "qwen-tts", provider: "dashscope", apiKey: "", baseUrl: "https://dashscope.aliyuncs.com/api/v1" };
        if (type === "image") return { model: "cogview-3", provider: "zhipu", apiKey: "", baseUrl: "https://open.bigmodel.cn/api/paas/v4" };
      }
      return {
        model: config!.modelId,
        provider: config!.provider,
        apiKey: config!.apiKey,
        baseUrl: config!.baseUrl,
      };
    };

    return {
      llm: getConfig("llm"),
      tts: getConfig("tts"),
      image: getConfig("image"),
    };
  } catch {
    // 返回默认配置
    return {
      llm: { model: "kimi-k2.5-vision", provider: "moonshot", apiKey: "", baseUrl: "https://api.moonshot.cn/v1" },
      tts: { model: "qwen-tts", provider: "dashscope", apiKey: "", baseUrl: "https://dashscope.aliyuncs.com/api/v1" },
      image: { model: "cogview-3", provider: "zhipu", apiKey: "", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
    };
  }
}

interface ModelConfigDialogProps {
  children?: React.ReactNode;
}

export function ModelConfigDialog({ children }: ModelConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModelType>("llm");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null);
  const { configs, defaultIds, addConfig, removeConfig, setDefault, updateConfig, loaded, getConfigsByType } =
    useModelConfigs();

  // 新增模型表单状态
  const [newModel, setNewModel] = useState({
    name: "",
    modelId: "",
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    type: "llm" as ModelType,
    vision: true,
  });

  // 当进入编辑模式时，填充表单
  useEffect(() => {
    if (editingConfig && showAddForm) {
      setNewModel({
        name: editingConfig.name,
        modelId: editingConfig.modelId,
        provider: editingConfig.provider,
        apiKey: editingConfig.apiKey,
        baseUrl: editingConfig.baseUrl,
        type: editingConfig.type,
        vision: editingConfig.vision ?? true,
      });
    }
  }, [editingConfig, showAddForm]);

  if (!loaded) return null;

  // 保存模型（新增或编辑）
  const handleSave = () => {
    if (!newModel.name || !newModel.modelId) return;
    
    if (editingConfig) {
      // 编辑模式
      updateConfig(editingConfig.id, {
        name: newModel.name,
        modelId: newModel.modelId,
        provider: newModel.provider,
        apiKey: newModel.apiKey,
        baseUrl: newModel.baseUrl,
        vision: newModel.vision,
      });
    } else {
      // 新增模式
      addConfig(newModel);
    }
    
    setShowAddForm(false);
    setEditingConfig(null);
    setNewModel({
      name: "",
      modelId: "",
      provider: "openai",
      apiKey: "",
      baseUrl: "",
      type: activeTab,
      vision: activeTab === "llm",
    });
  };
  
  // 取消编辑
  const handleCancel = () => {
    setShowAddForm(false);
    setEditingConfig(null);
    setNewModel({
      name: "",
      modelId: "",
      provider: "openai",
      apiKey: "",
      baseUrl: "",
      type: activeTab,
      vision: activeTab === "llm",
    });
  };

  // 根据类型获取预设
  const getPresets = () => {
    switch (activeTab) {
      case "llm": return PRESET_LLM_MODELS;
      case "tts": return PRESET_TTS_MODELS;
      case "image": return PRESET_IMAGE_MODELS;
      default: return [];
    }
  };

  // 从预设填充
  const fillFromPreset = (presetId: string) => {
    const presets = getPresets();
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setNewModel({
        ...newModel,
        name: preset.name,
        modelId: preset.id,
        provider: preset.provider,
        baseUrl: preset.baseUrl || "",
        vision: "vision" in preset ? (preset.vision as boolean) : false,
      });
    }
  };

  // 类型标签
  const typeLabels: Record<ModelType, { icon: React.ReactNode; label: string; color: string }> = {
    llm: { icon: <Bot className="w-4 h-4" />, label: "对话模型", color: "blue" },
    tts: { icon: <Volume2 className="w-4 h-4" />, label: "语音合成", color: "green" },
    image: { icon: <ImageIcon className="w-4 h-4" />, label: "图像生成", color: "purple" },
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="gap-2">
            <Sparkles className="w-4 h-4" />
            模型设置
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            AI 模型配置
          </DialogTitle>
        </DialogHeader>

        {/* 功能类型切换 */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {(Object.keys(typeLabels) as ModelType[]).map((type) => (
            <button
              key={type}
              onClick={() => {
                setActiveTab(type);
                setShowAddForm(false);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-md transition-all",
                activeTab === type
                  ? "bg-white shadow-sm font-medium"
                  : "hover:bg-white/50 text-gray-600"
              )}
            >
              {typeLabels[type].icon}
              {typeLabels[type].label}
            </button>
          ))}
        </div>

        {/* 模型列表 */}
        {!showAddForm ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                选择默认{typeLabels[activeTab].label}：
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingConfig(null);
                  setShowAddForm(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                添加
              </Button>
            </div>
            
            {/* API Key 提示 */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              💡 提示：点击模型右侧的「设置」按钮，配置 API Key 后即可使用
            </div>

            {getConfigsByType(activeTab).map((config) => (
              <div
                key={config.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-colors",
                  defaultIds[activeTab] === config.modelId
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer",
                      defaultIds[activeTab] === config.modelId
                        ? "border-blue-500"
                        : "border-gray-300"
                    )}
                    onClick={() => setDefault(activeTab, config.modelId)}
                  >
                    {defaultIds[activeTab] === config.modelId && (
                      <Check className="w-3 h-3 text-blue-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{config.name}</p>
                    <p className="text-xs text-gray-500">
                      {config.provider}
                      {config.vision && " · 支持视觉"}
                      {config.apiKey ? " · 已配置 Key" : config.isDefault ? "" : " · 需配置 Key"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* 编辑按钮 - 所有配置都可以编辑 */}
                  <button
                    onClick={() => {
                      setEditingConfig(config);
                      setShowAddForm(true);
                    }}
                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"
                    title="编辑配置"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {!config.isDefault && (
                    <button
                      onClick={() => removeConfig(config.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 预设选择 - 仅在新增时显示 */}
            {!editingConfig && (
              <div className="space-y-2">
                <Label>选择预设</Label>
                <Select
                  value=""
                  onValueChange={fillFromPreset}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择预设或自定义" />
                  </SelectTrigger>
                  <SelectContent>
                    {getPresets().map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-sm text-gray-500 mb-4">
                {editingConfig ? `编辑配置：${editingConfig.name}` : "自定义配置："}
              </p>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>名称</Label>
                  <Input
                    value={newModel.name}
                    onChange={(e) =>
                      setNewModel({ ...newModel, name: e.target.value })
                    }
                    placeholder={`例如：${activeTab === "llm" ? "GPT-4o" : activeTab === "tts" ? "自定义TTS" : "自定义图像模型"}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label>模型 ID</Label>
                  <Input
                    value={newModel.modelId}
                    onChange={(e) =>
                      setNewModel({ ...newModel, modelId: e.target.value })
                    }
                    placeholder="例如：gpt-4o"
                  />
                </div>

                <div className="space-y-2">
                  <Label>提供商</Label>
                  <Select
                    value={newModel.provider}
                    onValueChange={(v) =>
                      setNewModel({ ...newModel, provider: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="moonshot">Moonshot (Kimi)</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      <SelectItem value="zhipu">智谱 AI</SelectItem>
                      <SelectItem value="dashscope">阿里云 (DashScope)</SelectItem>
                      <SelectItem value="local">本地服务</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={newModel.apiKey}
                    onChange={(e) =>
                      setNewModel({ ...newModel, apiKey: e.target.value })
                    }
                    placeholder="sk-..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Base URL（可选）</Label>
                  <Input
                    value={newModel.baseUrl}
                    onChange={(e) =>
                      setNewModel({ ...newModel, baseUrl: e.target.value })
                    }
                    placeholder="https://api.example.com/v1"
                  />
                </div>

                {activeTab === "llm" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="vision"
                      checked={newModel.vision}
                      onChange={(e) =>
                        setNewModel({ ...newModel, vision: e.target.checked })
                      }
                      className="rounded"
                    />
                    <Label htmlFor="vision" className="cursor-pointer">
                      支持视觉/多模态
                    </Label>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancel}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!newModel.name || !newModel.modelId}
                    className="flex-1"
                  >
                    {editingConfig ? "保存" : "添加"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
