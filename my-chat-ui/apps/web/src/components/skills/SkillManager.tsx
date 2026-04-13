/**
 * Skill Manager Component
 *
 * 功能：
 * - 查看所有已安装的 Skills
 * - 启用/禁用 Skills
 * - 创建新 Skill
 * - 从本地上传 Skill
 * - 从远程下载 Skill
 * - 删除 Skill
 * - 配置 Skill 参数
 */

import { useState, useEffect, useCallback } from "react";
import {
  Puzzle,
  Plus,
  Trash2,
  RefreshCw,
  Upload,
  Download,
  Globe,
  Settings,
  CheckCircle,
  Search,
  MoreVertical,
  Cpu,
  Tag,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Code,
  Play,
  Zap,
  FileCode,
} from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { SkillTester } from "./SkillTester";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Skill, RemoteSkillSource } from "@/types/skill";

const API_BASE_URL = "http://localhost:8889/api/skills";

interface SkillManagerProps {
  userId?: string;
}

export function SkillManager({ userId: _userId = "default" }: SkillManagerProps) {
  // Skills 状态
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("local");

  // 远程 Skills
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkillSource[]>([]);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [remoteSearchQuery, setRemoteSearchQuery] = useState("");

  // 创建 Skill 对话框
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSkillId, setNewSkillId] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // 上传对话框
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 删除确认
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);

  // 配置对话框
  const [configuringSkill, setConfiguringSkill] = useState<Skill | null>(null);
  const [skillConfig, setSkillConfig] = useState<Record<string, any>>({});

  // 热重载状态
  const [hotReloadEnabled, setHotReloadEnabled] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // 代码编辑器
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editorCode, setEditorCode] = useState("");
  const [editorMetadata, setEditorMetadata] = useState("");

  // 测试器
  const [testingSkill, setTestingSkill] = useState<Skill | null>(null);

  // 加载本地 Skills
  const fetchSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(API_BASE_URL);
      const data = await response.json();

      if (data.success) {
        // 转换后端格式到前端格式
        const skills = data.skills.map((s: any) => ({
          metadata: s.metadata || {
            id: s.id,
            name: s.id,
            version: "1.0.0",
            description: "暂无描述",
            author: "unknown",
            type: "custom",
            tags: [],
            config: [],
            tools: [],
          },
          enabled: s.enabled || false,
          config: s.config || {},
          tools: [],
        }));
        setSkills(skills);
      } else {
        toast.error(data.error || "加载失败");
      }
    } catch (error) {
      toast.error("加载 Skills 失败，请确保 API 服务器已启动");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 加载远程 Skills
  const fetchRemoteSkills = useCallback(async () => {
    setIsLoadingRemote(true);
    try {
      const response = await fetch(`${API_BASE_URL}/remote`);
      const data = await response.json();

      if (data.success) {
        setRemoteSkills(data.skills);
      } else {
        toast.error(data.error || "加载失败");
      }
    } catch (error) {
      toast.error("加载远程 Skills 失败");
      console.error(error);
    } finally {
      setIsLoadingRemote(false);
    }
  }, []);

  // 检查热重载状态
  const checkHotReloadStatus = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:8889/api/reload/status");
      const data = await response.json();
      setHotReloadEnabled(data.hotReload);
    } catch (error) {
      console.error("Failed to check hot reload status:", error);
      setHotReloadEnabled(false);
    }
  }, []);

  // 手动触发重载
  const handleManualReload = async () => {
    setIsReloading(true);
    try {
      const response = await fetch("http://localhost:8889/api/reload", {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        toast.success("Skills 重载成功");
        fetchSkills();
      } else {
        toast.error(data.error || "重载失败");
      }
    } catch (error) {
      toast.error("重载请求失败");
      console.error(error);
    } finally {
      setIsReloading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchSkills();
    checkHotReloadStatus();
  }, [fetchSkills, checkHotReloadStatus]);

  // 切换 Skill 启用状态
  const toggleSkill = async (skillId: string, enabled: boolean) => {
    try {
      const response = await fetch(API_BASE_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: skillId, enabled }),
      });

      const data = await response.json();

      if (data.success) {
        setSkills(prev =>
          prev.map(s =>
            s.metadata.id === skillId ? { ...s, enabled } : s
          )
        );
        toast.success(`${enabled ? "启用" : "禁用"} Skill 成功`);
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch (error) {
      toast.error("请求失败");
      console.error(error);
    }
  };

  // 创建新 Skill
  const handleCreateSkill = async () => {
    if (!newSkillId.trim() || !newSkillName.trim()) {
      toast.error("请输入 Skill ID 和名称");
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newSkillId.trim(),
          name: newSkillName.trim(),
          description: newSkillDesc.trim(),
          type: "custom",
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("创建 Skill 成功");
        setShowCreateDialog(false);
        setNewSkillId("");
        setNewSkillName("");
        setNewSkillDesc("");
        fetchSkills();
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch (error) {
      toast.error("创建失败");
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  // 上传 Skill
  const handleUploadSkill = async () => {
    if (!uploadFile) {
      toast.error("请选择文件");
      return;
    }

    setIsUploading(true);
    try {
      const content = await uploadFile.text();
      const filename = uploadFile.name;

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          content,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("上传 Skill 成功");
        setShowUploadDialog(false);
        setUploadFile(null);
        fetchSkills();
      } else {
        toast.error(data.error || "上传失败");
      }
    } catch (error) {
      toast.error("上传失败");
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  // 下载远程 Skill
  const handleDownloadSkill = async (skill: RemoteSkillSource) => {
    try {
      const response = await fetch(`${API_BASE_URL}/remote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: skill.id,
          skillInfo: skill,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("下载 Skill 成功");
        fetchSkills();
        fetchRemoteSkills();
      } else {
        toast.error(data.error || "下载失败");
      }
    } catch (error) {
      toast.error("下载失败");
      console.error(error);
    }
  };

  // 删除 Skill
  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;

    try {
      const response = await fetch(`${API_BASE_URL}?id=${skillToDelete}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("删除 Skill 成功");
        setSkillToDelete(null);
        fetchSkills();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (error) {
      toast.error("删除失败");
      console.error(error);
    }
  };

  // 打开代码编辑器
  const handleOpenEditor = async (skill: Skill) => {
    try {
      // 获取技能文件内容
      const response = await fetch(`http://localhost:8889/api/skills?id=${skill.metadata.id}`);
      const data = await response.json();

      if (data.success && data.skill) {
        setEditorCode(data.skill.code || "// 代码加载中...");
        setEditorMetadata(JSON.stringify(data.skill.metadata, null, 2));
        setEditingSkill(skill);
      } else {
        // 使用模拟数据
        setEditorCode(`// ${skill.metadata.name}\n// 代码编辑器演示\n\nexport async function execute(params: any) {\n  // 实现逻辑\n  return { success: true };\n}`);
        setEditorMetadata(JSON.stringify(skill.metadata, null, 2));
        setEditingSkill(skill);
      }
    } catch (error) {
      // 使用模拟数据
      setEditorCode(`// ${skill.metadata.name}\n// 代码编辑器演示\n\nexport async function execute(params: any) {\n  // 实现逻辑\n  return { success: true };\n}`);
      setEditorMetadata(JSON.stringify(skill.metadata, null, 2));
      setEditingSkill(skill);
    }
  };

  // 保存代码编辑
  const handleSaveCode = async (code: string, metadata: string) => {
    if (!editingSkill) return;

    try {
      const response = await fetch("http://localhost:8889/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSkill.metadata.id,
          code,
          metadata: JSON.parse(metadata),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("代码保存成功");
        fetchSkills();
        return true;
      } else {
        toast.error(data.error || "保存失败");
        return false;
      }
    } catch (error) {
      toast.error("保存请求失败");
      console.error(error);
      return false;
    }
  };

  // 保存 Skill 配置
  const handleSaveConfig = async () => {
    if (!configuringSkill) return;

    try {
      const response = await fetch(`${API_BASE_URL}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: configuringSkill?.metadata?.id,
          config: skillConfig,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("保存配置成功");
        setConfiguringSkill(null);
        fetchSkills();
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch (error) {
      toast.error("保存失败");
      console.error(error);
    }
  };

  // 过滤本地 Skills
  const filteredSkills = skills.filter(
    (s) =>
      s.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.metadata.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.metadata.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  // 获取类型颜色
  const getTypeColor = (type: string) => {
    switch (type) {
      case "native":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
      case "mcp":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
      case "custom":
        return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <div className="w-full space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="local" className="flex items-center gap-2">
            <Puzzle className="w-4 h-4" />
            本地 Skills ({skills.length})
          </TabsTrigger>
          <TabsTrigger value="remote" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            远程市场
          </TabsTrigger>
        </TabsList>

        {/* 本地 Skills 标签 */}
        <TabsContent value="local" className="space-y-4">
          {/* 工具栏 */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索 Skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowUploadDialog(true)}
                  className="flex-1 sm:flex-none"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  上传
                </Button>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="flex-1 sm:flex-none"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  新建
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fetchSkills}
                  disabled={isLoading}
                  title="刷新"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleManualReload}
                  disabled={isReloading}
                  title={hotReloadEnabled ? "热重载已启用 - 点击手动重载" : "手动重载 Skills"}
                >
                  <Zap className={`w-4 h-4 ${hotReloadEnabled ? "text-green-500" : ""} ${isReloading ? "animate-pulse" : ""}`} />
                </Button>
              </div>
            </div>
          </Card>

          {/* Skills 列表 */}
          <div className="grid gap-3">
            {filteredSkills.length === 0 ? (
              <Card className="p-8 text-center">
                <Puzzle className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">
                  {searchQuery ? "没有找到匹配的 Skills" : "暂无 Skills"}
                </p>
                {!searchQuery && (
                  <Button
                    variant="link"
                    onClick={() => setShowCreateDialog(true)}
                    className="mt-2"
                  >
                    创建你的第一个 Skill
                  </Button>
                )}
              </Card>
            ) : (
              filteredSkills.map((skill) => (
                <Card
                  key={skill.metadata.id}
                  className={`p-4 transition-all ${
                    (skill as any).enabled
                      ? "border-green-200 dark:border-green-800"
                      : "border-gray-200 dark:border-gray-700 opacity-70"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* 图标 */}
                    <div
                      className={`p-2 rounded-lg ${
                        (skill as any).enabled
                          ? "bg-green-100 dark:bg-green-900"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      <Cpu
                        className={`w-5 h-5 ${
                          (skill as any).enabled
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-500"
                        }`}
                      />
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {skill.metadata.name}
                        </h3>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${getTypeColor(skill.metadata.type)}`}
                        >
                          {skill.metadata.type}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          v{skill.metadata.version}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {skill.metadata.description || "暂无描述"}
                      </p>

                      {/* 标签 */}
                      {skill.metadata.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {skill.metadata.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs"
                            >
                              <Tag className="w-3 h-3 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* 工具列表 */}
                      {expandedSkill === skill.metadata.id && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <h4 className="text-sm font-medium mb-2">包含的工具：</h4>
                          <div className="space-y-2">
                            {skill.metadata.tools.map((tool) => (
                              <div
                                key={tool.id}
                                className="text-sm p-2 bg-white dark:bg-gray-700 rounded border"
                              >
                                <div className="font-medium">{tool.name}</div>
                                <div className="text-gray-500">{tool.description}</div>
                              </div>
                            ))}
                          </div>

                          {/* 配置项 */}
                          {skill.metadata.config.length > 0 && (
                            <div className="mt-3">
                              <h4 className="text-sm font-medium mb-2">配置项：</h4>
                              <div className="space-y-2">
                                {skill.metadata.config.map((cfg) => (
                                  <div
                                    key={cfg.name}
                                    className="text-sm p-2 bg-white dark:bg-gray-700 rounded border"
                                  >
                                    <div className="font-medium">
                                      {cfg.name}
                                      {cfg.required && (
                                        <span className="text-red-500">*</span>
                                      )}
                                    </div>
                                    <div className="text-gray-500">
                                      {cfg.description}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setExpandedSkill(
                            expandedSkill === skill.metadata.id
                              ? null
                              : skill.metadata.id
                          )
                        }
                      >
                        {expandedSkill === skill.metadata.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditor(skill)}
                        title="编辑代码"
                      >
                        <Code className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTestingSkill(skill)}
                        title="测试 Skill"
                      >
                        <Play className="w-4 h-4" />
                      </Button>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-40 p-1" align="end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              setConfiguringSkill(skill);
                              setSkillConfig(skill.config || {});
                            }}
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            配置
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-red-600"
                            onClick={() => setSkillToDelete(skill.metadata.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除
                          </Button>
                        </PopoverContent>
                      </Popover>

                      <Switch
                        checked={(skill as any).enabled}
                        onCheckedChange={(checked) =>
                          toggleSkill(skill.metadata.id, checked)
                        }
                      />
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* 远程市场标签 */}
        <TabsContent value="remote" className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索远程 Skills..."
                  value={remoteSearchQuery}
                  onChange={(e) => setRemoteSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchRemoteSkills()}
                  className="pl-9"
                />
              </div>
              <Button
                onClick={fetchRemoteSkills}
                disabled={isLoadingRemote}
              >
                {isLoadingRemote ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Globe className="w-4 h-4 mr-2" />
                    获取
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* 远程 Skills 列表 */}
          <div className="grid gap-3">
            {remoteSkills.length === 0 ? (
              <Card className="p-8 text-center">
                <Globe className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">
                  {isLoadingRemote
                    ? "加载中..."
                    : "点击获取按钮加载远程 Skills"}
                </p>
              </Card>
            ) : (
              remoteSkills.map((skill) => (
                <Card key={skill.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                      <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {skill.name}
                        </h3>
                        <span className="text-xs text-gray-500">
                          v{skill.version}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          @{skill.author}
                        </Badge>
                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {skill.description}
                      </p>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {skill.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      disabled={(skill as any).installed}
                      onClick={() => handleDownloadSkill(skill)}
                    >
                      {(skill as any).installed ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {(skill as any).enabled ? "已启用" : "已安装"}
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          安装
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 创建 Skill 对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建新 Skill</DialogTitle>
            <DialogDescription>
              创建一个新的自定义 Skill
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Skill ID</label>
              <Input
                placeholder="my-skill（英文，用于标识）"
                value={newSkillId}
                onChange={(e) => setNewSkillId(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">名称</label>
              <Input
                placeholder="我的 Skill"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">描述</label>
              <Input
                placeholder="描述这个 Skill 的功能..."
                value={newSkillDesc}
                onChange={(e) => setNewSkillDesc(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreateSkill} disabled={isCreating}>
              {isCreating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 上传对话框 */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>上传 Skill</DialogTitle>
            <DialogDescription>
              从本地上传 Skill 文件（.ts, .js, 或 .json）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Input
              type="file"
              accept=".ts,.js,.json"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            />

            {uploadFile && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm">
                  <strong>文件名：</strong> {uploadFile.name}
                </p>
                <p className="text-sm">
                  <strong>大小：</strong> {(uploadFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUploadDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleUploadSkill}
              disabled={!uploadFile || isUploading}
            >
              {isUploading ? "上传中..." : "上传"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={!!skillToDelete} onOpenChange={() => setSkillToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              确认删除
            </DialogTitle>
            <DialogDescription>
              确定要删除 Skill "{skillToDelete}" 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSkillToDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteSkill}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 配置对话框 */}
      <Dialog
        open={!!configuringSkill}
        onOpenChange={() => setConfiguringSkill(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>配置 {configuringSkill?.metadata.name}</DialogTitle>
            <DialogDescription>配置 Skill 的参数</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {configuringSkill?.metadata?.config?.length === 0 ? (
              <p className="text-gray-500 text-center py-4">此 Skill 无需配置</p>
            ) : (
              configuringSkill?.metadata.config.map((cfg) => (
                <div key={cfg.name}>
                  <label className="text-sm font-medium">
                    {cfg.name}
                    {cfg.required && (
                      <span className="text-red-500">*</span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 mb-1">{cfg.description}</p>
                  <Input
                    type={cfg.type === "secret" ? "password" : "text"}
                    placeholder={cfg.default || ""}
                    value={skillConfig[cfg.name] || ""}
                    onChange={(e) =>
                      setSkillConfig((prev) => ({
                        ...prev,
                        [cfg.name]: e.target.value,
                      }))
                    }
                  />
                  {cfg.env && (
                    <p className="text-xs text-gray-400 mt-1">
                      也可通过环境变量 {cfg.env} 设置
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfiguringSkill(null)}>
              取消
            </Button>
            <Button onClick={handleSaveConfig}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 代码编辑器对话框 */}
      <Dialog
        open={!!editingSkill}
        onOpenChange={() => setEditingSkill(null)}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="w-5 h-5" />
              编辑 {editingSkill?.metadata.name}
            </DialogTitle>
            <DialogDescription>
              编辑 Skill 的代码和元数据
            </DialogDescription>
          </DialogHeader>

          {editingSkill && (
            <CodeEditor
              skillId={editingSkill.metadata.id}
              initialCode={editorCode}
              initialMetadata={editorMetadata}
              onSave={handleSaveCode}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 测试器对话框 */}
      <Dialog
        open={!!testingSkill}
        onOpenChange={() => setTestingSkill(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              测试 {testingSkill?.metadata.name}
            </DialogTitle>
            <DialogDescription>
              测试 Skill 的工具功能
            </DialogDescription>
          </DialogHeader>

          {testingSkill && <SkillTester skill={testingSkill} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SkillManager;
