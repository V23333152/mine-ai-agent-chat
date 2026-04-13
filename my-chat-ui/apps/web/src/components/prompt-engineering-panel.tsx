"use client";

import { useState, useEffect } from "react";
import {
  GitBranch,
  History,
  FlaskConical,
  ListOrdered,
  Save,
  Play,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  GitMerge,
  Tag,
  BarChart3,
  Check,
  X,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// 类型定义
interface FewShotExample {
  id: string;
  input: string;
  output: string;
  description?: string;
  tags?: string[];
}

interface PromptVersion {
  id: string;
  commitMessage: string;
  author: string;
  timestamp: number;
  branch: string;
  tags?: string[];
}

interface TestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput?: string;
  criteria: EvaluationCriteria[];
}

interface EvaluationCriteria {
  name: string;
  weight: number;
  type: string;
}

// Mock 数据存储
const STORAGE_KEYS = {
  fewShotExamples: "prompt-engineering-fewshot",
  versions: "prompt-engineering-versions",
  testCases: "prompt-engineering-testcases",
  testResults: "prompt-engineering-results",
};

// 标签页组件
export function PromptEngineeringPanel() {
  const [activeTab, setActiveTab] = useState("fewshot");

  return (
    <div className="w-full h-full bg-white rounded-lg shadow-sm border">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-purple-500" />
          Prompt Engineering 工作台
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Few-Shot 示例、版本控制、链式提示、效果评估
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-gray-50 p-0">
          <TabsTrigger
            value="fewshot"
            className="rounded-none data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-purple-500 px-4 py-2.5"
          >
            <ListOrdered className="w-4 h-4 mr-1.5" />
            Few-Shot 示例
          </TabsTrigger>
          <TabsTrigger
            value="version"
            className="rounded-none data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 px-4 py-2.5"
          >
            <GitBranch className="w-4 h-4 mr-1.5" />
            版本控制
          </TabsTrigger>
          <TabsTrigger
            value="chain"
            className="rounded-none data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-green-500 px-4 py-2.5"
          >
            <History className="w-4 h-4 mr-1.5" />
            链式提示
          </TabsTrigger>
          <TabsTrigger
            value="evaluate"
            className="rounded-none data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-orange-500 px-4 py-2.5"
          >
            <BarChart3 className="w-4 h-4 mr-1.5" />
            效果评估
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fewshot" className="m-0">
          <FewShotPanel />
        </TabsContent>
        <TabsContent value="version" className="m-0">
          <VersionControlPanel />
        </TabsContent>
        <TabsContent value="chain" className="m-0">
          <PromptChainPanel />
        </TabsContent>
        <TabsContent value="evaluate" className="m-0">
          <EvaluationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Few-Shot 示例面板
function FewShotPanel() {
  const [examples, setExamples] = useState<FewShotExample[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FewShotExample>>({});
  const { toast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.fewShotExamples);
    if (saved) {
      setExamples(JSON.parse(saved));
    }
  }, []);

  const saveExamples = (newExamples: FewShotExample[]) => {
    setExamples(newExamples);
    localStorage.setItem(STORAGE_KEYS.fewShotExamples, JSON.stringify(newExamples));
  };

  const addExample = () => {
    const newExample: FewShotExample = {
      id: `example_${Date.now()}`,
      input: "",
      output: "",
      description: "",
      tags: [],
    };
    saveExamples([...examples, newExample]);
    setIsEditing(newExample.id);
    setEditForm(newExample);
  };

  const updateExample = (id: string, updates: Partial<FewShotExample>) => {
    const updated = examples.map((e) =>
      e.id === id ? { ...e, ...updates } : e
    );
    saveExamples(updated);
  };

  const deleteExample = (id: string) => {
    saveExamples(examples.filter((e) => e.id !== id));
    toast({ title: "示例已删除" });
  };

  const saveEdit = () => {
    if (isEditing && editForm.input && editForm.output) {
      updateExample(isEditing, editForm);
      setIsEditing(null);
      setEditForm({});
      toast({ title: "示例已保存" });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-medium">Few-Shot 示例库</h3>
          <p className="text-sm text-gray-500">
            管理提示词示例，提升模型输出质量
          </p>
        </div>
        <Button onClick={addExample} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          添加示例
        </Button>
      </div>

      <div className="space-y-3">
        {examples.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed">
            <ListOrdered className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>暂无示例</p>
            <p className="text-sm">添加示例以启用 Few-Shot 学习</p>
          </div>
        ) : (
          examples.map((example) => (
            <div
              key={example.id}
              className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              {isEditing === example.id ? (
                <div className="space-y-3">
                  <Input
                    placeholder="描述（可选）"
                    value={editForm.description || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">输入 (Input)</Label>
                      <Textarea
                        value={editForm.input || ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, input: e.target.value })
                        }
                        className="mt-1 min-h-[100px]"
                        placeholder="用户输入示例..."
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">输出 (Output)</Label>
                      <Textarea
                        value={editForm.output || ""}
                        onChange={(e) =>
                          setEditForm({ ...editForm, output: e.target.value })
                        }
                        className="mt-1 min-h-[100px]"
                        placeholder="期望的模型输出..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit}>
                      <Save className="w-4 h-4 mr-1" />
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsEditing(null);
                        setEditForm({});
                      }}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {example.description && (
                        <span className="font-medium">{example.description}</span>
                      )}
                      {example.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsEditing(example.id);
                          setEditForm(example);
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteExample(example.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-50 p-3 rounded">
                      <span className="text-gray-500 text-xs block mb-1">Input</span>
                      <p className="line-clamp-3">{example.input}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <span className="text-gray-500 text-xs block mb-1">Output</span>
                      <p className="line-clamp-3">{example.output}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// 版本控制面板
function VersionControlPanel() {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [currentBranch, setCurrentBranch] = useState("main");
  const [branches, setBranches] = useState(["main", "feature/prompt-v2"]);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.versions);
    if (saved) {
      setVersions(JSON.parse(saved));
    }
  }, []);

  const commit = () => {
    if (!commitMessage) return;

    const newVersion: PromptVersion = {
      id: `v_${Date.now()}`,
      commitMessage,
      author: "User",
      timestamp: Date.now(),
      branch: currentBranch,
    };

    const updated = [newVersion, ...versions];
    setVersions(updated);
    localStorage.setItem(STORAGE_KEYS.versions, JSON.stringify(updated));
    setShowCommitDialog(false);
    setCommitMessage("");
    toast({ title: "版本已提交", description: commitMessage });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN");
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <select
            value={currentBranch}
            onChange={(e) => setCurrentBranch(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <Badge variant="outline" className="text-xs">
            {versions.filter((v) => v.branch === currentBranch).length} 个版本
          </Badge>
        </div>
        <Button size="sm" onClick={() => setShowCommitDialog(true)}>
          <Save className="w-4 h-4 mr-1" />
          提交版本
        </Button>
      </div>

      {showCommitDialog && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <Label>提交信息</Label>
          <div className="flex gap-2 mt-2">
            <Input
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="描述此次变更..."
              onKeyDown={(e) => e.key === "Enter" && commit()}
            />
            <Button onClick={commit} disabled={!commitMessage}>
              提交
            </Button>
            <Button variant="outline" onClick={() => setShowCommitDialog(false)}>
              取消
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {versions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>暂无版本历史</p>
          </div>
        ) : (
          versions
            .filter((v) => v.branch === currentBranch)
            .map((version, idx) => (
              <div
                key={version.id}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{version.commitMessage}</p>
                  <p className="text-xs text-gray-500">
                    {version.author} · {formatTime(version.timestamp)}
                  </p>
                </div>
                {idx === 0 && (
                  <Badge className="text-xs bg-green-100 text-green-700">当前</Badge>
                )}
                {version.tags?.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    <Tag className="w-3 h-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
}

// 链式提示面板
function PromptChainPanel() {
  const [nodes, setNodes] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const templates = [
    { id: "classification", name: "分类链", description: "理解 → 分类" },
    { id: "retrieval", name: "检索-生成链", description: "检索 → 生成回答" },
    { id: "review", name: "审查链", description: "生成 → 审查 → 改进" },
    { id: "multi-step", name: "多步推理", description: "分析 → 计划 → 执行 → 总结" },
  ];

  const loadTemplate = () => {
    if (!selectedTemplate) return;
    // Mock 加载模板
    const mockNodes = [
      { id: "1", name: "输入处理", type: "transform" },
      { id: "2", name: "主要处理", type: "prompt" },
      { id: "3", name: "输出格式化", type: "transform" },
    ];
    setNodes(mockNodes);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-medium">链式提示 (Prompt Chain)</h3>
          <p className="text-sm text-gray-500">构建多步骤提示词流程</p>
        </div>
      </div>

      <div className="flex gap-2">
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm flex-1"
        >
          <option value="">选择模板...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} - {t.description}
            </option>
          ))}
        </select>
        <Button onClick={loadTemplate} disabled={!selectedTemplate} size="sm">
          加载
        </Button>
      </div>

      {nodes.length > 0 ? (
        <div className="space-y-2">
          {nodes.map((node, idx) => (
            <div key={node.id} className="flex items-center gap-3">
              <div className="flex-1 border rounded-lg p-3 bg-white">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {node.type}
                  </Badge>
                  <span className="font-medium">{node.name}</span>
                </div>
              </div>
              {idx < nodes.length - 1 && (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          ))}
          <Button className="w-full mt-4" variant="outline">
            <Play className="w-4 h-4 mr-1" />
            运行链
          </Button>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed">
          <History className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>选择一个模板开始构建 Prompt Chain</p>
        </div>
      )}
    </div>
  );
}

// 效果评估面板
function EvaluationPanel() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.testCases);
    if (saved) {
      setTestCases(JSON.parse(saved));
    }
  }, []);

  const runEvaluation = async () => {
    setIsRunning(true);
    // Mock 评估
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setResults([
      { name: "准确性", score: 0.85 },
      { name: "完整性", score: 0.72 },
      { name: "相关性", score: 0.91 },
    ]);
    setIsRunning(false);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-medium">效果评估</h3>
          <p className="text-sm text-gray-500">测试提示词质量和性能</p>
        </div>
        <Button
          size="sm"
          onClick={runEvaluation}
          disabled={isRunning || testCases.length === 0}
        >
          {isRunning ? (
            <>
              <div className="w-4 h-4 mr-1 animate-spin rounded-full border-2 border-white border-t-transparent" />
              评估中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-1" />
              运行测试
            </>
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-medium text-green-800 mb-3">评估结果</h4>
          <div className="space-y-3">
            {results.map((r) => (
              <div key={r.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{r.name}</span>
                  <span className="font-medium">{(r.score * 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-green-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${r.score * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-green-200">
            <p className="text-sm text-green-700">
              <strong>总体评分：</strong>
              {(results.reduce((a, b) => a + b.score, 0) / results.length * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="font-medium">测试用例 ({testCases.length})</h4>
        {testCases.length === 0 ? (
          <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg border border-dashed">
            <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无测试用例</p>
          </div>
        ) : (
          testCases.map((tc) => (
            <div key={tc.id} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{tc.name}</p>
              <p className="text-gray-500 line-clamp-2">{tc.input}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default PromptEngineeringPanel;
