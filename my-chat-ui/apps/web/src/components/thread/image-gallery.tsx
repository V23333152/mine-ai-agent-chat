"use client";

import { useState, useRef, MouseEvent as ReactMouseEvent, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, Download, Columns, Grid3X3, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Portal 容器组件
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  if (!mounted) return null;
  
  return createPortal(children, document.body);
}

export interface GalleryImage {
  id: string;
  src: string;
  alt?: string;
  name?: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  onRemove?: (id: string) => void;
  onReference?: (imageId: string, region: { x: number; y: number; width: number; height: number } | null) => void;
}

// 图片引用选择器
function ImageReferenceSelector({
  image,
  onConfirm,
  onCancel,
}: {
  image: GalleryImage;
  onConfirm: (region: { x: number; y: number; width: number; height: number }) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSelection({ startX: x, startY: y, endX: x, endY: y });
    setIsDragging(true);
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current || !selection) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setSelection({ ...selection, endX: x, endY: y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    if (!selection) return;
    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);
    
    if (width > 5 && height > 5) {
      onConfirm({ x, y, width, height });
    }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[2147483647] flex flex-col bg-black/95">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 pt-20 bg-black/50 border-b border-white/10">
        <h3 className="text-white font-medium">选择图片区域引用</h3>
        <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={!selection}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
            >
              确认选择
            </button>
            <button
              onClick={onCancel}
              className="p-2 text-white hover:bg-white/10 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
      </div>
      
      {/* 图片选择区域 */}
      <div
        ref={containerRef}
        className="flex-1 relative cursor-crosshair select-none flex items-center justify-center p-4 bg-black"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={image.src}
          alt={image.alt}
          className="max-w-full max-h-[calc(100vh-180px)] object-contain"
          draggable={false}
        />
        
        {selection && (
          <div
            className="absolute border-2 border-blue-400 bg-blue-400/20"
            style={{
              left: `${Math.min(selection.startX, selection.endX)}%`,
              top: `${Math.min(selection.startY, selection.endY)}%`,
              width: `${Math.abs(selection.endX - selection.startX)}%`,
              height: `${Math.abs(selection.endY - selection.startY)}%`,
            }}
          />
        )}
      </div>
      
      {/* 底部提示 */}
      <div className="px-4 py-3 bg-black/50 border-t border-white/10">
        <p className="text-white/60 text-sm text-center">
          拖拽选择图片区域，或点击「确认选择」引用整张图片
        </p>
      </div>
    </div>
    </Portal>
  );
}

// 图片查看器（单张）
function ImageViewer({
  image,
  onClose,
  onReference,
}: {
  image: GalleryImage;
  onClose: () => void;
  onReference?: () => void;
}) {
  const handleDownload = async () => {
    try {
      const response = await fetch(image.src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.name || 'image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/95 p-4" onClick={onClose}>
      <div className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* 工具栏 - 浮动在图片右上角 */}
        <div className="absolute -top-12 right-0 flex items-center gap-1 bg-black/60 px-2 py-1 rounded-full">
          {onReference && (
            <button
              onClick={onReference}
              className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
              title="引用图片"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
            title="下载"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 图片显示区域 */}
        <div className="flex items-center justify-center">
          <img
            src={image.src}
            alt={image.alt}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        </div>
        
        {/* 底部文件名 */}
        {image.name && (
          <div className="mt-3 text-center">
            <p className="text-white text-sm opacity-80">{image.name}</p>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}

// 对比模式
function CompareMode({
  images,
  onClose,
}: {
  images: GalleryImage[];
  onClose: () => void;
}) {
  if (images.length < 2) return null;

  return (
    <Portal>
    <div className="fixed inset-0 z-[2147483647] flex flex-col bg-black/95">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 pt-20 bg-black/50 border-b border-white/10">
        <h3 className="text-white font-medium">图片对比</h3>
        <button onClick={onClose} className="p-2 text-white hover:bg-white/10 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="flex-1 flex gap-4 overflow-hidden p-4">
        {images.map((img, idx) => (
          <div key={img.id} className="flex-1 flex flex-col">
            <p className="text-white/60 text-sm mb-2">图片 {idx + 1}</p>
            <div className="flex-1 bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={img.src}
                alt={img.alt}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
    </Portal>
  );
}

export function ImageGallery({ images, onRemove, onReference }: ImageGalleryProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [viewingImage, setViewingImage] = useState<GalleryImage | null>(null);
  const [selectingImage, setSelectingImage] = useState<GalleryImage | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (images.length === 0) return null;

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleReference = (image: GalleryImage) => {
    setSelectingImage(image);
  };

  const handleRegionSelect = (region: { x: number; y: number; width: number; height: number }) => {
    if (selectingImage && onReference) {
      onReference(selectingImage.id, region);
    }
    setSelectingImage(null);
  };

  const handleFullImageReference = () => {
    if (selectingImage && onReference) {
      onReference(selectingImage.id, null);
    }
    setSelectingImage(null);
  };

  const selectedImages = images.filter(img => selectedIds.includes(img.id));

  return (
    <div className="w-full">
      {/* 工具栏 */}
      {images.length > 1 && (
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{images.length} 张图片</span>
            {selectedIds.length > 0 && (
              <span className="text-xs text-blue-500">已选择 {selectedIds.length} 张</span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {images.length >= 2 && (
              <button
                type="button"
                onClick={() => setIsCompareMode(true)}
                className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                title="对比模式"
              >
                <Columns className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-1 text-gray-500 hover:bg-gray-100 rounded"
              title={viewMode === 'grid' ? '列表视图' : '网格视图'}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 图片网格 - 固定小尺寸 */}
      <div className={cn(
        "flex flex-wrap gap-1.5 max-h-28 overflow-y-auto",
        viewMode === 'list' && "flex-col"
      )}>
        {images.map((image) => (
          <div
            key={image.id}
            className={cn(
              "relative group rounded overflow-hidden border transition-all flex-shrink-0",
              selectedIds.includes(image.id) 
                ? "border-blue-500 ring-2 ring-blue-500" 
                : "border-gray-200 hover:border-gray-300",
              viewMode === 'grid' ? "w-16 h-16" : "w-full h-16"
            )}
            onClick={() => toggleSelection(image.id)}
          >
            {/* 固定小尺寸图片容器 */}
            <div className="relative overflow-hidden w-full h-full">
              <img
                src={image.src}
                alt={image.alt}
                className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingImage(image);
                }}
              />
              
              {/* 悬停遮罩 */}
              <div 
                className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingImage(image);
                }}
              >
                <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
              
              {/* 删除按钮 */}
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(image.id);
                  }}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              
              {/* 引用按钮 */}
              {onReference && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReference(image);
                  }}
                  className="absolute bottom-0.5 right-0.5 p-0.5 bg-blue-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500"
                  title="引用图片"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              )}
            </div>
            
            {image.name && viewMode === 'list' && (
              <div className="p-1.5 bg-white">
                <p className="text-xs text-gray-600 truncate">{image.name}</p>
              </div>
            )}
          </div>
        ))}
      </div>



      {/* 查看器 */}
      {viewingImage && (
        <ImageViewer
          image={viewingImage}
          onClose={() => setViewingImage(null)}
          onReference={onReference ? () => handleReference(viewingImage) : undefined}
        />
      )}

      {/* 引用选择器 */}
      {selectingImage && (
        <ImageReferenceSelector
          image={selectingImage}
          onConfirm={handleRegionSelect}
          onCancel={handleFullImageReference}
        />
      )}

      {/* 对比模式 */}
      {isCompareMode && selectedImages.length >= 2 ? (
        <CompareMode
          images={selectedImages}
          onClose={() => setIsCompareMode(false)}
        />
      ) : isCompareMode && (
        <Portal>
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <p className="text-gray-600 mb-4">请至少选择 2 张图片进行对比</p>
            <button
              onClick={() => setIsCompareMode(false)}
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              知道了
            </button>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
