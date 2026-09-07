import { useEffect, useRef, useState } from 'react';
import { Upload, X, CheckCircle2, Image as ImageIcon, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface UploadedImage {
  url: string;
  verificationProof: string;
}

interface AdvancedMediaUploadProps {
  onImagesUploaded: (images: UploadedImage[]) => void;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 6 * 1024 * 1024;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AllowedMimeType = (typeof ALLOWED_TYPES)[number];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`تعذر قراءة الصورة ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function AdvancedMediaUpload({ onImagesUploaded }: AdvancedMediaUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const previewsRef = useRef(previews);
  const uploadImage = trpc.storage.uploadImage.useMutation();

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => () => {
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (incoming.length === 0) return;

    const invalidType = incoming.find((file) => !ALLOWED_TYPES.includes(file.type as AllowedMimeType));
    if (invalidType) {
      toast.error(`نوع الملف غير مدعوم: ${invalidType.name}`);
      return;
    }
    const oversized = incoming.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      toast.error(`حجم الصورة ${oversized.name} يتجاوز 6 ميجابايت.`);
      return;
    }
    if (selectedFiles.length + incoming.length > MAX_FILES) {
      toast.error(`يمكن اختيار ${MAX_FILES} صور كحد أقصى.`);
      return;
    }
    const totalSize = [...selectedFiles, ...incoming].reduce((total, file) => total + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      toast.error('إجمالي الصور يجب ألا يتجاوز 10 ميجابايت.');
      return;
    }

    setSelectedFiles((current) => [...current, ...incoming]);
    setPreviews((current) => [...current, ...incoming.map((file) => URL.createObjectURL(file))]);
    toast.success(`تم اختيار ${incoming.length} صورة`);
  };

  const handleRemove = (index: number) => {
    const preview = previews[index];
    if (preview) URL.revokeObjectURL(preview);
    setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPreviews((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleClear = () => {
    previews.forEach((preview) => URL.revokeObjectURL(preview));
    setSelectedFiles([]);
    setPreviews([]);
    setUploadProgress(0);
  };

  const handleStartUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('يرجى اختيار صور أولاً');
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);
    try {
      const uploadedImages: UploadedImage[] = [];
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        if (!file) continue;
        const contentBase64 = await fileToBase64(file);
        const uploaded = await uploadImage.mutateAsync({
          fileName: file.name,
          mimeType: file.type as AllowedMimeType,
          contentBase64,
        });
        uploadedImages.push({ url: uploaded.url, verificationProof: uploaded.verificationProof });
        setUploadProgress(Math.round(((index + 1) / selectedFiles.length) * 100));
      }
      onImagesUploaded(uploadedImages);
      toast.success('تم فحص الصور الأصلية ورفعها إلى التخزين الآمن بنجاح.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر رفع الصور حالياً.');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 bg-slate-900/60 border border-slate-800 p-6 rounded-3xl" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">رفع صور الإعلان</h3>
            <p className="text-xs text-slate-400">تُفحص الصور تلقائياً للتأكد من أنها واقعية وأصلية قبل حفظها ونشر العرض.</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-xl border border-cyan-500/20">
          <Shield className="w-3.5 h-3.5" /> فحص أصالة محمي
        </div>
      </div>

      <div className="border-2 border-dashed border-slate-700 hover:border-amber-500/50 transition-all rounded-2xl p-8 text-center bg-slate-950/40 relative cursor-pointer group">
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={isUploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
            <ImageIcon className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-200">اسحب الصور وأفلتها هنا، أو اضغط للاختيار</p>
            <p className="text-xs text-slate-400 mt-1">PNG وJPG وWEBP، حتى 5 صور و10 ميجابايت إجمالاً. تُرفض الصور الترويجية أو المولدة آلياً.</p>
          </div>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-300">معاينة الصور المختارة ({previews.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {previews.map((src, idx) => (
              <div key={`${src}-${idx}`} className="relative group rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video">
                <img src={src} alt={`معاينة الصورة ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  disabled={isUploading}
                  aria-label={`حذف الصورة ${idx + 1}`}
                  className="absolute top-2 left-2 bg-red-600/90 hover:bg-red-700 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {isUploading && (
            <div className="space-y-2 bg-slate-950 p-4 rounded-2xl border border-slate-800" aria-live="polite">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>جاري فحص الصور ثم رفعها إلى التخزين الآمن...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2 bg-slate-800" />
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClear} disabled={isUploading}>
              إلغاء الكل
            </Button>
            <Button
              type="button"
              onClick={handleStartUpload}
              disabled={isUploading}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold gap-2"
            >
              {isUploading ? 'جاري الرفع...' : 'رفع الصور وحفظها'}
              {!isUploading && <CheckCircle2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
