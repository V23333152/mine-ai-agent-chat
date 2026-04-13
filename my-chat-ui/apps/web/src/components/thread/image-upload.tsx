import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface ImageAttachment {
  id: string;
  file: File;
  preview: string;
  base64?: string;
}

interface ImageUploadProps {
  images: ImageAttachment[];
  onImagesChange: (images: ImageAttachment[]) => void;
  disabled?: boolean;
}

export function ImageUpload({ images, onImagesChange, disabled }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  const generateId = () => `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Extract base64 part (remove data:image/xxx;base64, prefix)
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const compressImage = async (file: File, maxWidth = 1920, maxHeight = 1080, quality = 0.8): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        
        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setProcessing(true);
    const newImages: ImageAttachment[] = [];

    for (const file of Array.from(files)) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} 不是图片文件`);
        continue;
      }

      // Validate file size (max 10MB before compression)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} 超过 10MB 限制`);
        continue;
      }

      try {
        // Compress image
        const compressed = await compressImage(file);
        
        // Convert to base64
        const base64 = await fileToBase64(compressed);
        
        // Create preview URL
        const preview = URL.createObjectURL(compressed);

        newImages.push({
          id: generateId(),
          file: compressed,
          preview,
          base64,
        });

        toast.success(`已添加 ${file.name}`);
      } catch (error) {
        toast.error(`处理 ${file.name} 失败`);
        console.error(error);
      }
    }

    onImagesChange([...images, ...newImages]);
    setProcessing(false);

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };



  return (
    <div className="flex flex-col gap-2">
      {/* 图片预览已移至输入框上方，此处仅保留上传按钮 */}

      {/* Upload Button - 缩小 */}
      <div className="flex items-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={disabled || processing}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-gray-500 hover:text-gray-700 h-7 px-2 text-xs"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || processing}
        >
          {processing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
          <span className="ml-1">图片</span>
        </Button>
      </div>
    </div>
  );
}
