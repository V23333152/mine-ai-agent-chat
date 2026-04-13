"use client";


import { X, Maximize2 } from "lucide-react";
import { useState } from "react";

export interface ImageReferenceData {
  imageId: string;
  src: string;
  name?: string;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

interface ImageReferenceProps {
  reference: ImageReferenceData;
  onRemove?: () => void;
  onView?: () => void;
}

export function ImageReference({ reference, onRemove, onView }: ImageReferenceProps) {
  const [, setIsHovered] = useState(false);

  return (
    <div 
      className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 max-w-[200px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 缩略图 */}
      <div className="relative w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-gray-100">
        <img 
          src={reference.src} 
          alt="引用图片" 
          className="w-full h-full object-cover"
        />
        
        {/* 选中区域高亮 */}
        {reference.region && (
          <div
            className="absolute border border-blue-400 bg-blue-400/30"
            style={{
              left: `${reference.region.x}%`,
              top: `${reference.region.y}%`,
              width: `${reference.region.width}%`,
              height: `${reference.region.height}%`,
            }}
          />
        )}
      </div>
      
      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-blue-700 font-medium truncate">
          {reference.name || '图片'}
        </p>
        <p className="text-[10px] text-blue-500/70">
          {reference.region ? '区域引用' : '完整引用'}
        </p>
      </div>
      
      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        {onView && (
          <button
            onClick={onView}
            className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-1 text-blue-400 hover:text-red-500 hover:bg-blue-100 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// 图片引用查看器
export function ImageReferenceViewer({
  reference,
  onClose,
}: {
  reference: ImageReferenceData;
  onClose: () => void;
}) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-2 text-white hover:bg-white/10 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>
        
        {/* 图片 */}
        <div className="relative">
          <img
            src={reference.src}
            alt="引用图片"
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
          
          {/* 选中区域 */}
          {reference.region && (
            <div
              className="absolute border-2 border-blue-400 bg-blue-400/20"
              style={{
                left: `${reference.region.x}%`,
                top: `${reference.region.y}%`,
                width: `${reference.region.width}%`,
                height: `${reference.region.height}%`,
              }}
            >
              {/* 标签 */}
              <div className="absolute -top-6 left-0 px-2 py-0.5 bg-blue-500 text-white text-xs rounded">
                引用区域
              </div>
            </div>
          )}
        </div>
        
        {/* 信息 */}
        <div className="mt-4 text-center">
          <p className="text-white font-medium">{reference.name || '图片'}</p>
          {reference.region && (
            <p className="text-white/60 text-sm mt-1">
              区域: {reference.region.x.toFixed(1)}%, {reference.region.y.toFixed(1)}% 
              ({reference.region.width.toFixed(1)}% × {reference.region.height.toFixed(1)}%)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// 引用图片列表
interface ImageReferenceListProps {
  references: ImageReferenceData[];
  onRemove?: (index: number) => void;
}

export function ImageReferenceList({ references, onRemove }: ImageReferenceListProps) {
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  if (references.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 my-2">
      {references.map((ref, idx) => (
        <ImageReference
          key={`${ref.imageId}-${idx}`}
          reference={ref}
          onRemove={onRemove ? () => onRemove(idx) : undefined}
          onView={() => setViewingIndex(idx)}
        />
      ))}
      
      {viewingIndex !== null && (
        <ImageReferenceViewer
          reference={references[viewingIndex]}
          onClose={() => setViewingIndex(null)}
        />
      )}
    </div>
  );
}
