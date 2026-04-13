"use client";

import { useState, useCallback } from "react";
import { Play, RotateCcw, Copy, Check, Terminal, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CodeBlockProps {
  code: string;
  language?: string;
  executable?: boolean;
  onExecute?: (code: string) => void;
  className?: string;
}

interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  figures?: string[];
  execution_time: number;
}

// 代码块组件
export function CodeBlock({ 
  code, 
  language = "python", 
  executable = true,
  className 
}: CodeBlockProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  // 执行代码
  const executeCode = useCallback(async () => {
    setIsExecuting(true);
    setShowOutput(true);
    
    try {
      const response = await fetch("/code/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          session_id: "user_session"
        })
      });
      
      const data = await response.json();
      setResult(data);
      
      if (data.success) {
        toast.success(`代码执行成功 (${data.execution_time.toFixed(2)}s)`);
      } else {
        toast.error("代码执行失败");
      }
    } catch (error) {
      toast.error("执行服务未启动");
      setResult({
        success: false,
        output: "",
        error: "无法连接到代码执行服务，请确保后端已启动",
        execution_time: 0
      });
    } finally {
      setIsExecuting(false);
    }
  }, [code]);

  // 复制代码
  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("代码已复制");
  }, [code]);

  return (
    <div className={cn("rounded-lg overflow-hidden border bg-gray-50 dark:bg-gray-900", className)}>
      {/* 代码头部 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {language}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          {executable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={executeCode}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <RotateCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span className="ml-1 text-xs">运行</span>
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={copyCode}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
      
      {/* 代码内容 */}
      <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-800 dark:text-gray-200">
        <code>{code}</code>
      </pre>
      
      {/* 执行结果 */}
      {showOutput && result && (
        <div className="border-t">
          {/* 输出 */}
          {result.output && (
            <div className="p-4 bg-white dark:bg-gray-950">
              <div className="text-xs text-gray-500 mb-2">输出:</div>
              <pre className="text-sm font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {result.output}
              </pre>
            </div>
          )}
          
          {/* 错误 */}
          {result.error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border-t border-red-100">
              <div className="text-xs text-red-500 mb-2">错误:</div>
              <pre className="text-sm font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap overflow-x-auto">
                {result.error}
              </pre>
            </div>
          )}
          
          {/* 图片 */}
          {result.figures && result.figures.length > 0 && (
            <div className="p-4 bg-white dark:bg-gray-950 border-t">
              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                生成的图片:
              </div>
              <div className="grid grid-cols-1 gap-4">
                {result.figures.map((fig, idx) => (
                  <img
                    key={idx}
                    src={`data:image/png;base64,${fig}`}
                    alt={`Figure ${idx + 1}`}
                    className="max-w-full h-auto rounded border"
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* 执行时间 */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 border-t">
            执行时间: {result.execution_time.toFixed(3)}s
          </div>
        </div>
      )}
    </div>
  );
}

// 内联代码执行按钮（用于AI消息中的代码）
export function InlineCodeExecute({ code }: { code: string }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const execute = useCallback(async () => {
    setIsExecuting(true);
    setExpanded(true);
    
    try {
      const response = await fetch("/code/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          session_id: "user_session"
        })
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        output: "",
        error: "执行服务未启动",
        execution_time: 0
      });
    } finally {
      setIsExecuting(false);
    }
  }, [code]);

  return (
    <div className="my-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={execute}
          disabled={isExecuting}
        >
          {isExecuting ? (
            <RotateCcw className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Play className="w-3 h-3 mr-1" />
          )}
          运行代码
        </Button>
        
        {result && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "隐藏结果" : "查看结果"}
          </Button>
        )}
      </div>
      
      {expanded && result && (
        <div className="mt-2 rounded border bg-white dark:bg-gray-950">
          {result.output && (
            <pre className="p-3 text-sm font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap border-b">
              {result.output}
            </pre>
          )}
          
          {result.error && (
            <pre className="p-3 text-sm font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap border-b bg-red-50 dark:bg-red-950/30">
              {result.error}
            </pre>
          )}
          
          {result.figures && result.figures.map((fig, idx) => (
            <img
              key={idx}
              src={`data:image/png;base64,${fig}`}
              alt={`Figure ${idx + 1}`}
              className="max-w-full h-auto p-3"
            />
          ))}
          
          <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 dark:bg-gray-900">
            {result.execution_time.toFixed(3)}s
          </div>
        </div>
      )}
    </div>
  );
}

// 代码解释器面板（侧边栏）
export function CodeInterpreterPanel({ className }: { className?: string }) {
  const [code, setCode] = useState(`# 在这里输入Python代码\n\nimport numpy as np\nimport matplotlib.pyplot as plt\n\n# 示例：绘制正弦波\nx = np.linspace(0, 2*np.pi, 100)\ny = np.sin(x)\n\nplt.figure(figsize=(8, 4))\nplt.plot(x, y)\nplt.title('Sine Wave')\nplt.xlabel('x')\nplt.ylabel('sin(x)')\nplt.grid(True)\nplt.savefig('sine_wave.png')\nplt.show()\n\nprint("图表已生成!")`);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex-1 overflow-auto p-4">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full h-64 p-4 font-mono text-sm bg-gray-50 dark:bg-gray-900 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="输入Python代码..."
          spellCheck={false}
        />
        
        <CodeBlock 
          code={code} 
          executable={true}
          className="mt-4"
        />
      </div>
      
      <div className="p-4 border-t bg-gray-50 dark:bg-gray-900">
        <div className="text-xs text-gray-500">
          <p className="font-medium mb-1">支持的库:</p>
          <p>numpy, pandas, matplotlib, PIL</p>
          <p className="mt-2 text-gray-400">执行时间限制: 30秒</p>
        </div>
      </div>
    </div>
  );
}

export default CodeBlock;
