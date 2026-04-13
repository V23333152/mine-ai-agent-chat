/**
 * Skill Tester Component
 * 测试 Skill 工具的界面
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Play,
  Loader2,
  Terminal,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Skill } from "@/types/skill";

interface SkillTesterProps {
  skill: Skill;
}

interface TestResult {
  toolId: string;
  toolName: string;
  input: string;
  output: string;
  success: boolean;
  duration: number;
  error?: string;
}

export function SkillTester({ skill }: SkillTesterProps) {
  const [testInputs, setTestInputs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<TestResult[]>([]);
  const [loadingTools, setLoadingTools] = useState<Set<string>>(new Set());

  const runTest = async (toolId: string, toolName: string) => {
    const input = testInputs[toolId] || "";
    if (!input.trim()) {
      toast.error("请输入测试参数");
      return;
    }

    setLoadingTools((prev) => new Set(prev).add(toolId));
    const startTime = Date.now();

    try {
      // TODO: 调用 LangGraph Agent 执行工具测试
      // 模拟 API 调用
      const response = await fetch("http://localhost:2024/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistant_id: "agent",
          input: {
            messages: [
              {
                role: "user",
                content: `测试工具: ${toolName}\n参数: ${input}`,
              },
            ],
          },
          config: {
            configurable: {
              skill_test_mode: true,
              skill_id: skill.metadata.id,
              tool_id: toolId,
            },
          },
        }),
      });

      // 由于 LangGraph API 可能不支持直接测试，这里使用模拟结果
      // 实际项目中应该实现一个专门的测试端点
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockResult = `工具 "${toolName}" 执行成功！\n输入: ${input}\n输出: 这是模拟的执行结果。在实际部署后，这里会显示真实的工具执行结果。`;

      const result: TestResult = {
        toolId,
        toolName,
        input,
        output: mockResult,
        success: true,
        duration: Date.now() - startTime,
      };

      setResults((prev) => [result, ...prev]);
      toast.success(`工具 "${toolName}" 测试完成`);
    } catch (error) {
      const result: TestResult = {
        toolId,
        toolName,
        input,
        output: "",
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "未知错误",
      };

      setResults((prev) => [result, ...prev]);
      toast.error(`工具 "${toolName}" 测试失败`);
    } finally {
      setLoadingTools((prev) => {
        const next = new Set(prev);
        next.delete(toolId);
        return next;
      });
    }
  };

  const runAllTests = async () => {
    for (const tool of skill.metadata.tools) {
      if (testInputs[tool.id]?.trim()) {
        await runTest(tool.id, tool.name);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* 工具测试列表 */}
      <div className="space-y-3">
        {skill.metadata.tools.map((tool) => (
          <Card key={tool.id} className="p-4">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Terminal className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    {tool.name}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {tool.id}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {tool.description}
                </p>

                {/* 示例 */}
                {tool.examples.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    <span className="font-medium">示例: </span>
                    {tool.examples.join(", ")}
                  </div>
                )}

                {/* 测试输入 */}
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="输入测试参数..."
                    value={testInputs[tool.id] || ""}
                    onChange={(e) =>
                      setTestInputs((prev) => ({
                        ...prev,
                        [tool.id]: e.target.value,
                      }))
                    }
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => runTest(tool.id, tool.name)}
                    disabled={loadingTools.has(tool.id)}
                  >
                    {loadingTools.has(tool.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        测试
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 批量测试按钮 */}
      {skill.metadata.tools.length > 1 && (
        <Button variant="outline" className="w-full" onClick={runAllTests}>
          <Play className="w-4 h-4 mr-2" />
          运行所有测试
        </Button>
      )}

      {/* 测试结果 */}
      {results.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            测试结果 ({results.length})
          </h3>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  result.success
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className="font-medium">{result.toolName}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {result.duration}ms
                  </span>
                </div>

                <div className="mt-2 text-sm">
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">输入: </span>
                    {result.input}
                  </div>

                  {result.success ? (
                    <pre className="mt-2 p-2 bg-white dark:bg-gray-800 rounded text-xs overflow-x-auto">
                      {result.output}
                    </pre>
                  ) : (
                    <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/40 rounded text-red-700 dark:text-red-300 text-xs">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      {result.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default SkillTester;
