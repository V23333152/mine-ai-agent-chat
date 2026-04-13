/**
 * Code Editor Component
 * 在线代码编辑器，支持编辑 Skill 代码
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, RotateCcw, FileCode, FileJson } from "lucide-react";

interface CodeEditorProps {
  skillId: string;
  initialCode?: string;
  initialMetadata?: string;
  onSave?: (code: string, metadata: string) => void;
}

export function CodeEditor({
  skillId: _skillId,
  initialCode = "",
  initialMetadata = "",
  onSave,
}: CodeEditorProps) {
  const [activeTab, setActiveTab] = useState<"code" | "metadata">("code");
  const [code, setCode] = useState(initialCode);
  const [metadata, setMetadata] = useState(initialMetadata);
  const [isSaving, setIsSaving] = useState(false);

  // 当初始值变化时更新
  useEffect(() => {
    setCode(initialCode);
    setMetadata(initialMetadata);
  }, [initialCode, initialMetadata]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 验证 JSON 格式
      if (activeTab === "metadata") {
        JSON.parse(metadata);
      }

      onSave?.(code, metadata);
      toast.success("保存成功");
    } catch (error) {
      toast.error("保存失败: " + (error instanceof Error ? error.message : "未知错误"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCode(initialCode);
    setMetadata(initialMetadata);
    toast.info("已重置到上次保存的内容");
  };

  // 简单的语法高亮（仅用于显示）
  const highlightCode = (text: string) => {
    return text
      .replace(/\b(import|export|const|let|var|function|class|interface|type|return|async|await|if|else|for|while|try|catch)\b/g, '<span style="color: #c678dd;">$1</span>')
      .replace(/\b(string|number|boolean|any|void|Promise)\b/g, '<span style="color: #e5c07b;">$1</span>')
      .replace(/(".*?"|'.*?'|`.*?`)/g, '<span style="color: #98c379;">$1</span>')
      .replace(/\/\/.*$/gm, '<span style="color: #5c6370;">$&</span>')
      .replace(/\b(\d+)\b/g, '<span style="color: #d19a66;">$1</span>');
  };

  return (
    <div className="space-y-4">
      {/* 标签切换 */}
      <div className="flex items-center gap-2 border-b">
        <button
          onClick={() => setActiveTab("code")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "code"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileCode className="w-4 h-4" />
          index.ts
        </button>
        <button
          onClick={() => setActiveTab("metadata")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "metadata"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileJson className="w-4 h-4" />
          metadata.json
        </button>
      </div>

      {/* 编辑器区域 */}
      <Card className="relative">
        <div className="flex">
          {/* 行号 */}
          <div className="bg-gray-50 dark:bg-gray-900 px-3 py-4 text-right text-gray-400 text-sm font-mono select-none border-r">
            {(activeTab === "code" ? code : metadata)
              .split("\n")
              .map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
          </div>

          {/* 代码编辑区 */}
          <textarea
            value={activeTab === "code" ? code : metadata}
            onChange={(e) =>
              activeTab === "code" ? setCode(e.target.value) : setMetadata(e.target.value)
            }
            className="flex-1 p-4 font-mono text-sm resize-none outline-none bg-white dark:bg-gray-950"
            style={{
              minHeight: "400px",
              tabSize: 2,
            }}
            spellCheck={false}
          />
        </div>
      </Card>

      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {activeTab === "code" ? (
            <>
              {code.split("\n").length} 行 | {code.length} 字符
            </>
          ) : (
            <>
              {metadata.split("\n").length} 行 | {metadata.length} 字符
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            重置
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* 提示 */}
      <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-900 p-3 rounded">
        <p className="font-medium mb-1">提示：</p>
        <ul className="list-disc list-inside space-y-1">
          <li>代码修改后需要点击保存</li>
          <li>如果启用了热重载，保存后会自动重新构建</li>
          <li>metadata.json 必须是有效的 JSON 格式</li>
        </ul>
      </div>
    </div>
  );
}

export default CodeEditor;
