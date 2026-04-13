/**
 * File Upload Component for Vector Database
 * 
 * Provides drag-and-drop file upload functionality
 * with progress bar and detailed error messages.
 */

import React, { useCallback, useState, useRef } from "react";
import { Upload, X, FileText, CheckCircle, AlertCircle, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

interface FileUploadProps {
  onUploadComplete?: (result: UploadResult) => void;
  userId?: string;
  collectionName?: string;
}

export interface UploadResult {
  success: boolean;
  documentsIndexed: number;
  filenames: string[];
  errors: string[];
}

interface FileWithPreview extends File {
  id: string;
  status: "pending" | "uploading" | "success" | "error";
  errorMessage?: string;
  progress?: number;
}

const API_BASE_URL = "/rag";

const SUPPORTED_FORMATS = [
  ".txt", ".md", ".markdown",
  ".pdf",
  ".docx",
  ".html", ".htm",
  ".json", ".csv"
];

// 错误提示映射
const ERROR_MESSAGES: Record<string, string> = {
  "process_timeout": "⏱️ 处理超时：文件太大或包含复杂内容\n💡 建议：\n• 压缩图片后重新保存\n• 转换为纯文本(.txt/.md)格式\n• 分割成多个小文件(<500KB)",
  "format_check": "📄 格式不支持\n💡 提示：.doc 旧格式请用 Word 另存为 .docx",
  "process_error": "❌ 文档解析失败\n💡 可能原因：文件损坏、加密或包含特殊格式",
  "empty_result": "📭 文档内容为空\n💡 检查文件是否包含可提取的文本",
  "not a zip file": "📄 不是有效的 .docx 格式\n💡 可能是 .doc 旧格式，请转换后重试",
};

function getErrorMessage(error: string): string {
  // 匹配关键词
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return message;
    }
  }
  // 文件大小限制
  if (error.includes("太大") || error.includes("2MB")) {
    return `📦 ${error}\n💡 建议：\n• 删除图片后保存\n• 分割文档\n• 转换为纯文本`;
  }
  return `❌ ${error}`;
}

export function FileUpload({ 
  onUploadComplete, 
  userId = "default",
  collectionName 
}: FileUploadProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const validateFile = (file: File): string | null => {
    const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_FORMATS.includes(extension)) {
      return `不支持的文件格式: ${extension}`;
    }
    if (file.size > 2 * 1024 * 1024) {
      return `文件太大(${(file.size/1024/1024).toFixed(1)}MB)，超过2MB限制`;
    }
    return null;
  };

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;

    const filesArray = Array.from(newFiles);
    const validFiles: FileWithPreview[] = [];

    filesArray.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        toast.error(getErrorMessage(error));
      } else {
        validFiles.push(Object.assign(file, { 
          id: generateId(), 
          status: "pending" as const,
          progress: 0
        }));
      }
    });

    setFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [addFiles]
  );

  const uploadFiles = async () => {
    if (files.length === 0) {
      toast.error("请先选择要上传的文件");
      return;
    }

    setIsUploading(true);
    setOverallProgress(0);
    
    // 标记所有文件为上传中
    setFiles(prev => prev.map(f => ({ ...f, status: "uploading", progress: 10 })));
    
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("user_id", userId);
    if (collectionName) formData.append("collection_name", collectionName);

    // 模拟进度更新
    const progressInterval = setInterval(() => {
      setOverallProgress(prev => Math.min(prev + 5, 90));
      setFiles(prev => prev.map(f => 
        f.status === "uploading" ? { ...f, progress: Math.min((f.progress || 0) + 10, 90) } : f
      ));
    }, 1000);

    try {
      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setOverallProgress(100);
      setFiles(prev => prev.map(f => ({ ...f, progress: 100 })));

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `上传失败: ${response.status}`);
      }

      const result: UploadResult = await response.json();
      
      // 更新文件状态
      const updatedFiles = files.map((file) => {
        const successFile = result.filenames.find(f => file.name.includes(f) || f.includes(file.name));
        const errorFile = result.errors.find(e => e.includes(file.name));
        
        if (successFile) {
          return { ...file, status: "success" as const, progress: 100 };
        } else if (errorFile) {
          return { 
            ...file, 
            status: "error" as const, 
            errorMessage: getErrorMessage(errorFile),
            progress: 0 
          };
        }
        return file;
      });
      setFiles(updatedFiles);

      if (result.success && result.documentsIndexed > 0) {
        toast.success(`成功索引 ${result.documentsIndexed} 个文档块`);
      }

      if (result.errors.length > 0) {
        result.errors.forEach((error) => {
          const fileName = error.split(":")[0];
          toast.error(getErrorMessage(error), { duration: 8000 });
        });
      }

      if (onUploadComplete) {
        onUploadComplete(result);
      }

      // 成功后2秒清空
      if (result.success && result.errors.length === 0) {
        setTimeout(() => {
          setFiles([]);
          setOverallProgress(0);
        }, 2000);
      }
    } catch (error) {
      clearInterval(progressInterval);
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      toast.error(getErrorMessage(errorMsg));
      setFiles(prev => prev.map(f => ({ 
        ...f, 
        status: "error" as const, 
        errorMessage: getErrorMessage(errorMsg),
        progress: 0 
      })));
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusIcon = (status: FileWithPreview["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "uploading":
        return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileStatusColor = (status: FileWithPreview["status"]) => {
    switch (status) {
      case "success":
        return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
      case "error":
        return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
      case "uploading":
        return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
      default:
        return "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700";
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6
          cursor-pointer transition-all duration-200
          flex flex-col items-center justify-center gap-2
          ${isDragging 
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" 
            : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
          }
          ${files.length > 0 ? "bg-gray-50 dark:bg-gray-800/50" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept={SUPPORTED_FORMATS.join(",")}
        />
        
        <Upload className={`w-8 h-8 ${isDragging ? "text-blue-500" : "text-gray-400"}`} />
        
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            点击或拖拽文件上传
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            PDF, Word(.docx), TXT, Markdown, HTML | 最大 2MB
          </p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              已选择 {files.length} 个文件
            </span>
            {!isUploading && (
              <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                清空
              </Button>
            )}
          </div>
          
          {/* Overall Progress */}
          {isUploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>总进度</span>
                <span>{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>
          )}
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className={`rounded-lg border transition-colors overflow-hidden ${getFileStatusColor(file.status)}`}
              >
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getStatusIcon(file.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  
                  {!isUploading && file.status !== "success" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                {/* File Progress */}
                {file.status === "uploading" && (
                  <div className="px-3 pb-3">
                    <Progress value={file.progress} className="h-1.5" />
                  </div>
                )}
                
                {/* Error Message */}
                {file.status === "error" && file.errorMessage && (
                  <div className="px-3 pb-3">
                    <div className="bg-red-100/50 dark:bg-red-900/20 p-2 rounded text-xs text-red-700 dark:text-red-400 whitespace-pre-line">
                      <div className="flex items-start gap-1.5">
                        <FileWarning className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{file.errorMessage}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Upload Button */}
          <Button
            onClick={uploadFiles}
            disabled={isUploading || files.length === 0 || files.every(f => f.status === "success")}
            className="w-full"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                处理中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                开始上传并索引
              </>
            )}
          </Button>
        </Card>
      )}
    </div>
  );
}

export default FileUpload;
