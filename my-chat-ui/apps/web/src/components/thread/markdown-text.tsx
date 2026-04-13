"use client";

import "./markdown-styles.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { FC, memo, useState, useMemo } from "react";
import { CheckIcon, CopyIcon, Download, X, ZoomIn, Columns, Grid3X3, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { SyntaxHighlighter } from "@/components/thread/syntax-highlighter";

import { TooltipIconButton } from "@/components/thread/tooltip-icon-button";
import { cn } from "@/lib/utils";

import "katex/dist/katex.min.css";

// Extract all images from markdown content
function extractImages(content: string): Array<{ src: string; alt?: string }> {
  const images: Array<{ src: string; alt?: string }> = [];
  // 匹配 markdown 图片语法: ![alt](url)
  // 使用非贪婪匹配来处理 URL
  const regex = /!\[([^\]]*)\]\((.*?)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const alt = match[1].trim();
    const src = match[2].trim();
    // 只处理 http/https URL
    if (src.startsWith('http://') || src.startsWith('https://')) {
      images.push({ alt, src });
    }
  }
  return images;
}

// Replace image markdown with placeholders
function replaceImagesWithPlaceholders(content: string): string {
  let index = 0;
  return content.replace(/!\[([^\]]*)\]\((.*?)\)/g, (match, _alt, src) => {
    const trimmedSrc = src.trim();
    // 只处理 http/https URL
    if (trimmedSrc.startsWith('http://') || trimmedSrc.startsWith('https://')) {
      return `{{IMAGE_PLACEHOLDER_${index++}}}`;
    }
    return match; // 保留非 http URL 的原始格式
  });
}

// Multi-image gallery component - kept for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _ImageGallery({ images }: { images: Array<{ src: string; alt?: string }> }) {
  const [viewMode, setViewMode] = useState<'grid' | 'compare'>('grid');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [viewingImage, setViewingImage] = useState<{ src: string; alt?: string } | null>(null);

  if (images.length === 0) return null;

  const toggleSelection = (idx: number) => {
    setSelectedIndices(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const _handleDownload = async (src: string, _alt?: string) => {
    try {
      const response = await fetch(src, { mode: 'cors' });
      if (!response.ok) throw new Error('Network response was not ok');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = _alt || 'image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('图片下载成功');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('直接下载失败，请右键点击图片选择"另存为"');
      window.open(src, '_blank');
    }
  };

  if (images.length === 1) {
    // Single image - use simple viewer
    return (
      <div className="my-4">
        <div className="relative group inline-block">
          <img
            src={images[0].src}
            alt={images[0].alt}
            className="max-w-full max-h-96 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setViewingImage(images[0])}
          />
          <div 
            className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center cursor-pointer"
            onClick={() => setViewingImage(images[0])}
          >
            <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </div>
        {viewingImage && (
          <ImageViewer 
            src={viewingImage.src} 
            alt={viewingImage.alt} 
            onClose={() => setViewingImage(null)} 
          />
        )}
      </div>
    );
  }

  // Multiple images - gallery view
  return (
    <div className="my-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{images.length} 张图片</span>
        {images.length >= 2 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'grid' ? 'compare' : 'grid')}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-xs flex items-center gap-1"
            >
              {viewMode === 'grid' ? <Columns className="w-3.5 h-3.5" /> : <Grid3X3 className="w-3.5 h-3.5" />}
              {viewMode === 'grid' ? '对比模式' : '网格模式'}
            </button>
          </div>
        )}
      </div>

      {/* Gallery Grid */}
      <div className={cn(
        "grid gap-2",
        viewMode === 'grid' 
          ? images.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
          : selectedIndices.length >= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
      )}>
        {images.map((img, idx) => (
          <div
            key={idx}
            className={cn(
              "relative group rounded-lg overflow-hidden border",
              viewMode === 'compare' && selectedIndices.includes(idx)
                ? "ring-2 ring-blue-500 border-blue-500"
                : "border-gray-200 hover:border-gray-300",
              viewMode === 'compare' && selectedIndices.length >= 2 && !selectedIndices.includes(idx)
                ? "opacity-50"
                : ""
            )}
            onClick={() => viewMode === 'compare' ? toggleSelection(idx) : setViewingImage(img)}
          >
            <div className="aspect-square overflow-hidden">
              <img
                src={img.src}
                alt={img.alt}
                className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform"
              />
            </div>
            <div 
              className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setViewingImage(img);
              }}
            >
              <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Viewing Modal */}
      {viewingImage && (
        <ImageViewer 
          src={viewingImage.src} 
          alt={viewingImage.alt} 
          onClose={() => setViewingImage(null)} 
        />
      )}

      {/* Compare Modal */}
      {viewMode === 'compare' && selectedIndices.length >= 2 && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">图片对比</h3>
            <button 
              onClick={() => {
                setViewMode('grid');
                setSelectedIndices([]);
              }} 
              className="p-2 text-white hover:bg-white/10 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex gap-4 overflow-hidden">
            {selectedIndices.map((idx) => (
              <div key={idx} className="flex-1 flex flex-col">
                <p className="text-white/60 text-sm mb-2">图片 {idx + 1}</p>
                <div className="flex-1 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
                  <img
                    src={images[idx].src}
                    alt={images[idx].alt}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Image viewer modal component
function ImageViewer({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const handleDownload = async () => {
    try {
      // Try to fetch and download the image
      const response = await fetch(src, { mode: 'cors' });
      if (!response.ok) throw new Error('Network response was not ok');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = alt || 'generated-image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('图片下载成功');
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open image in new tab for manual save
      toast.error('直接下载失败，正在新窗口打开图片，请右键保存');
      window.open(src, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        
        {/* Download button */}
        <button
          onClick={handleDownload}
          className="absolute -top-10 right-12 p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          title="Download image"
        >
          <Download className="w-6 h-6" />
        </button>
        
        {/* Image */}
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain rounded-lg mx-auto"
        />
        
        {alt && (
          <p className="text-white text-center mt-4 text-sm opacity-80">{alt}</p>
        )}
      </div>
    </div>
  );
}

interface CodeHeaderProps {
  language?: string;
  code: string;
}

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

// 代码执行Hook
const useCodeExecution = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const execute = async (code: string) => {
    setIsExecuting(true);
    try {
      const response = await fetch("/code/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, session_id: "web_session" }),
      });
      const data = await response.json();
      setResult(data);
      return data;
    } catch (error) {
      setResult({ success: false, error: "执行服务未启动" });
      return null;
    } finally {
      setIsExecuting(false);
    }
  };

  return { isExecuting, result, execute, setResult };
};

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const { isExecuting, result, execute, setResult } = useCodeExecution();
  const [showResult, setShowResult] = useState(false);
  
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  const onExecute = async () => {
    setShowResult(true);
    await execute(code);
  };

  const isPython = language?.toLowerCase() === "python";

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-t-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
        <span className="lowercase [&>span]:text-xs">{language}</span>
        <div className="flex items-center gap-1">
          {isPython && (
            <TooltipIconButton 
              tooltip={isExecuting ? "执行中..." : "运行代码"} 
              onClick={onExecute}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <RotateCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 text-green-400" />
              )}
            </TooltipIconButton>
          )}
          <TooltipIconButton tooltip="Copy" onClick={onCopy}>
            {!isCopied && <CopyIcon />}
            {isCopied && <CheckIcon />}
          </TooltipIconButton>
        </div>
      </div>
      
      {/* 执行结果 */}
      {showResult && result && (
        <div className="border-t border-zinc-700">
          {result.success ? (
            <>
              {result.output && (
                <div className="p-3 bg-zinc-950 text-zinc-300 text-sm font-mono whitespace-pre-wrap border-b border-zinc-800">
                  {result.output}
                </div>
              )}
              {result.figures && result.figures.map((fig: string, idx: number) => (
                <img 
                  key={idx}
                  src={`data:image/png;base64,${fig}`}
                  alt={`Figure ${idx + 1}`}
                  className="max-w-full p-2"
                />
              ))}
              <div className="px-3 py-1 text-xs text-zinc-500 bg-zinc-900">
                执行时间: {result.execution_time?.toFixed(3)}s
              </div>
            </>
          ) : (
            <div className="p-3 bg-red-950/50 text-red-400 text-sm font-mono whitespace-pre-wrap border-b border-red-900/50">
              {result.error || "执行失败"}
            </div>
          )}
        </div>
      )}
    </>
  );
};

// Custom image component - images are now rendered via gallery, this is a fallback
function ImageComponent({ src: _src, alt: _alt }: { src?: string; alt?: string }) {
  // Images are handled by ImageGallery, this should not render
  return null;
}

const defaultComponents: any = {
  img: ImageComponent,
  h1: ({ className, ...props }: { className?: string }) => (
    <h1
      className={cn(
        "mb-8 scroll-m-20 text-4xl font-extrabold tracking-tight last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }: { className?: string }) => (
    <h2
      className={cn(
        "mb-4 mt-8 scroll-m-20 text-3xl font-semibold tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }: { className?: string }) => (
    <h3
      className={cn(
        "mb-4 mt-6 scroll-m-20 text-2xl font-semibold tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }: { className?: string }) => (
    <h4
      className={cn(
        "mb-4 mt-6 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }: { className?: string }) => (
    <h5
      className={cn(
        "my-4 text-lg font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }: { className?: string }) => (
    <h6
      className={cn("my-4 font-semibold first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  p: ({ className, ...props }: { className?: string }) => (
    <p
      className={cn("mb-5 mt-5 leading-7 first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  a: ({ className, ...props }: { className?: string }) => (
    <a
      className={cn(
        "text-primary font-medium underline underline-offset-4",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }: { className?: string }) => (
    <blockquote
      className={cn("border-l-2 pl-6 italic", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: { className?: string }) => (
    <ul
      className={cn("my-5 ml-6 list-disc [&>li]:mt-2", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }: { className?: string }) => (
    <ol
      className={cn("my-5 ml-6 list-decimal [&>li]:mt-2", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }: { className?: string }) => (
    <hr className={cn("my-5 border-b", className)} {...props} />
  ),
  table: ({ className, ...props }: { className?: string }) => (
    <table
      className={cn(
        "my-5 w-full border-separate border-spacing-0 overflow-y-auto",
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }: { className?: string }) => (
    <th
      className={cn(
        "bg-muted px-4 py-2 text-left font-bold first:rounded-tl-lg last:rounded-tr-lg [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: { className?: string }) => (
    <td
      className={cn(
        "border-b border-l px-4 py-2 text-left last:border-r [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }: { className?: string }) => (
    <tr
      className={cn(
        "m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
        className,
      )}
      {...props}
    />
  ),
  sup: ({ className, ...props }: { className?: string }) => (
    <sup
      className={cn("[&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }: { className?: string }) => (
    <div className="w-full overflow-hidden">
      <pre
        className={cn(
          "overflow-x-auto rounded-lg bg-black text-white w-full max-w-full",
          className,
        )}
        style={{ 
          wordBreak: "break-all",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word"
        }}
        {...props}
      />
    </div>
  ),
  code: ({
    className,
    children,
    ...props
  }: {
    className?: string;
    children: React.ReactNode;
  }) => {
    const match = /language-(\w+)/.exec(className || "");

    if (match) {
      const language = match[1];
      const code = String(children).replace(/\n$/, "");

      return (
        <>
          <CodeHeader language={language} code={code} />
          <SyntaxHighlighter language={language} className={className}>
            {code}
          </SyntaxHighlighter>
        </>
      );
    }

    return (
      <code className={cn("rounded font-semibold", className)} {...props}>
        {children}
      </code>
    );
  },
};

// Inline image component for rendering images within markdown content
function InlineImage({ src, alt }: { src: string; alt?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!src) return null;
  
  return (
    <>
      <div className="relative group inline-block my-4">
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-96 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => setIsOpen(true)}
          onError={(e) => {
            // If image fails to load, show error state
            (e.target as HTMLImageElement).style.display = 'none';
            const parent = (e.target as HTMLImageElement).parentElement;
            if (parent) {
              const errorDiv = document.createElement('div');
              errorDiv.className = 'p-4 bg-gray-100 rounded-lg border text-gray-500 text-sm';
              errorDiv.innerText = '图像加载失败';
              parent.appendChild(errorDiv);
            }
          }}
        />
        <div 
          className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center cursor-pointer"
          onClick={() => setIsOpen(true)}
        >
          <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      </div>
      
      {isOpen && (
        <ImageViewer 
          src={src} 
          alt={alt} 
          onClose={() => setIsOpen(false)} 
        />
      )}
    </>
  );
}

const MarkdownTextImpl: FC<{ children: string }> = ({ children }) => {
  // Extract images and create content without inline images
  const { images, contentWithoutImages } = useMemo(() => {
    const images = extractImages(children);
    const contentWithoutImages = replaceImagesWithPlaceholders(children);
    return { images, contentWithoutImages };
  }, [children]);

  // Split content by placeholders and render
  const parts = contentWithoutImages.split(/\{\{IMAGE_PLACEHOLDER_(\d+)\}\}/);
  
  return (
    <div className="markdown-content">
      {parts.map((part, idx) => {
        // Check if this part is a placeholder index
        if (idx % 2 === 1) {
          // This is a placeholder index - render the corresponding image inline
          const imageIndex = parseInt(part, 10);
          const image = images[imageIndex];
          if (image) {
            return <InlineImage key={`img-${idx}`} src={image.src} alt={image.alt} />;
          }
          return null;
        }
        
        // Render markdown content
        if (part.trim()) {
          return (
            <ReactMarkdown
              key={idx}
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={defaultComponents}
            >
              {part}
            </ReactMarkdown>
          );
        }
        return null;
      })}
    </div>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
