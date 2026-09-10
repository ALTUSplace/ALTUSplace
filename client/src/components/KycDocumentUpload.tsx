import { useRef, useState, useCallback } from "react";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  Clock3,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CalendarClock,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DOCUMENT_TYPE_LABELS,
  KYC_STATUS_CONFIG,
  getKycStatusFromSubmission,
  requiredDocumentsFor,
} from "@/lib/kyc";
import type { KycDocumentType, KycStatus, BookingCategory } from "@/lib/kyc";

// Re-exported for legacy imports (KycVerification page, dashboards).
export type { KycDocumentType, KycStatus };
export { DOCUMENT_TYPE_LABELS, KYC_STATUS_CONFIG, getKycStatusFromSubmission };

interface KycDocumentUploadProps {
  documentType?: KycDocumentType;
  rentalCategory?: BookingCategory;
  onSuccess?: (submissionId: number) => void;
  compact?: boolean;
  showTypeSelector?: boolean;
  /** When true, only the documents valid for `rentalCategory` are selectable. */
  enforceCategoryDocuments?: boolean;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
type AllowedMimeType = (typeof ALLOWED_TYPES)[number];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export function KycDocumentUpload({
  documentType: initialDocType,
  rentalCategory,
  onSuccess,
  compact = false,
  showTypeSelector = true,
}: KycDocumentUploadProps) {
  const { language } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<KycDocumentType>(
    initialDocType ?? (rentalCategory === "car" ? "driving_license" : "cni"),
  );
  const [documentNumber, setDocumentNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const submissions = trpc.kyc.listMine.useQuery();
  const submit = trpc.kyc.submit.useMutation({
    onSuccess: async (data) => {
      setFile(null);
      setPreview(null);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
      await submissions.refetch();
      onSuccess?.(data.id);
      toast.success(
        language === "ar"
          ? "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0648\u062b\u064a\u0642\u062a\u0643 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0628\u0623\u0645\u0627\u0646."
          : "Votre document \u00e9t\u00e9 envoy\u00e9 pour v\u00e9rification.",
      );
    },
    onError: (error) => {
      setIsUploading(false);
      setUploadProgress(0);
      toast.error(error.message);
    },
  });

  const latestSubmission = submissions.data?.[0];
  const currentStatus = getKycStatusFromSubmission(latestSubmission?.status);
  const lang = language === "ar" ? "ar" : language === "fr" ? "fr" : "en";
  const statusInfo = KYC_STATUS_CONFIG[currentStatus];
  const StatusIcon = statusInfo.icon;

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      if (!ALLOWED_TYPES.includes(selectedFile.type as AllowedMimeType)) {
        toast.error(
          language === "ar"
            ? "\u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0641 \u063a\u064a\u0631 \u0645\u062f\u0639\u0648\u0645. \u0627\u0633\u062a\u062e\u062f\u0645 PDF \u0623\u0648 JPG \u0623\u0648 PNG."
            : "Type de fichier non support\u00e9. Utilisez PDF, JPG ou PNG.",
        );
        return;
      }
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast.error(
          language === "ar"
            ? "\u062d\u062c\u0645 \u0627\u0644\u0645\u0644\u0641 \u064a\u062c\u0628 \u0623\u0644\u0627 \u064a\u062a\u062c\u0627\u0648\u0632 8 \u0645\u064a\u063a\u0627\u0628\u0627\u064a\u062a."
            : "La taille du fichier ne doit pas d\u00e9passer 8 Mo.",
        );
        return;
      }
      setFile(selectedFile);
      if (selectedFile.type.startsWith("image/")) {
        setPreview(URL.createObjectURL(selectedFile));
      } else {
        setPreview(null);
      }
    },
    [language],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) handleFileSelect(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRemove = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error(language === "ar" ? "\u0627\u062e\u062a\u0631 \u0648\u062b\u064a\u0642\u0629 \u0642\u0628\u0644 \u0627\u0644\u0625\u0631\u0633\u0627\u0644." : "Choisissez un document avant l'envoi.");
      return;
    }
    setIsUploading(true);
    setUploadProgress(10);
    try {
      const contentBase64 = await fileToBase64(file);
      setUploadProgress(40);
      submit.mutate({
        applicantRole: "renter",
        documentType,
        fileName: file.name,
        mimeType: file.type as AllowedMimeType,
        contentBase64,
        ...(documentNumber.trim().length >= 4 ? { documentNumber: documentNumber.trim() } : {}),
        ...(expiryDate ? { expiryDate } : {}),
        ...(rentalCategory ? { categoryContext: rentalCategory } : {}),
      });
      setUploadProgress(80);
    } catch {
      setIsUploading(false);
      setUploadProgress(0);
      toast.error(language === "ar" ? "\u062a\u0639\u0630\u0631 \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0645\u0644\u0641." : "Impossible de pr\u00e9parer le fichier.");
    }
  };

  return (
    <div className={`space-y-4 ${compact ? "" : "rounded-2xl border bg-card p-5 shadow-sm"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-600" />
          <span className="text-sm font-bold">
            {language === "ar" ? "\u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0647\u0648\u064a\u0629" : "V\u00e9rification d'identit\u00e9"}
          </span>
        </div>
        <Badge variant="outline" className={`gap-1.5 text-xs font-semibold ${statusInfo.badgeClass}`}>
          <StatusIcon className="h-3 w-3" />
          {statusInfo.label[lang]}
        </Badge>
      </div>
      {showTypeSelector && !initialDocType && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">
            {language === "ar" ? "\u0646\u0648\u0639 \u0627\u0644\u0648\u062b\u064a\u0642\u0629" : "Type de document"}
          </label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(DOCUMENT_TYPE_LABELS) as KycDocumentType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDocumentType(type)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  documentType === type
                    ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "border-border bg-background text-muted-foreground hover:border-amber-300 hover:text-foreground"
                }`}
              >
                {DOCUMENT_TYPE_LABELS[type][lang]}
              </button>
            ))}
          </div>
          {rentalCategory && (
            <p className="text-[11px] text-muted-foreground">
              {language === "ar"
                ? rentalCategory === "car"
                  ? "\u064a\u064f\u0646\u0635\u062d \u0628\u0631\u062e\u0635\u0629 \u0627\u0644\u0642\u064a\u0627\u062f\u0629 \u0644\u062d\u062c\u0648\u0632\u0627\u062a \u0627\u0644\u0633\u064a\u0627\u0631\u0627\u062a."
                  : "\u064a\u064f\u0646\u0635\u062d \u0628\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062a\u0639\u0631\u064a\u0641 \u0627\u0644\u0648\u0637\u0646\u064a\u0629 \u0644\u062d\u062c\u0648\u0632\u0627\u062a \u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062a."
                : rentalCategory === "car"
                  ? "Le permis de conduire est recommand\u00e9 pour les r\u00e9servations de voitures."
                  : "La CNI est recommand\u00e9e pour les r\u00e9servations immobili\u00e8res."}
            </p>
          )}
        </div>
      )}
      {initialDocType && !showTypeSelector && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
          <FileText className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            {DOCUMENT_TYPE_LABELS[documentType][lang]}
          </span>
        </div>
      )}
      {documentType !== "commercial_register" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              {language === "ar" ? "رقم الوثيقة (اختياري)" : "Numéro du document (optionnel)"}
            </span>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={32}
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder={language === "ar" ? "****" : "****"}
              autoComplete="off"
              className="h-9"
            />
          </label>
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {language === "ar" ? "تاريخ الصلاحية" : "Date d'expiration"}
            </span>
            <Input
              type="date"
              value={expiryDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setExpiryDate(event.target.value)}
              className="h-9"
            />
          </label>
        </div>
      )}
      {currentStatus === "rejected" && latestSubmission?.rejectionReason && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-xs text-red-700 dark:text-red-400">{latestSubmission.rejectionReason}</p>
        </div>
      )}

      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-all hover:border-amber-500/50 hover:bg-amber-500/5 ${
            isUploading ? "pointer-events-none opacity-60" : ""
          } ${compact ? "min-h-24 p-4" : "min-h-32"}`}
        >
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" onChange={handleInputChange} className="hidden" />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <Upload className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold">
              {language === "ar"
                ? "\u0627\u0633\u062d\u0628 \u0648\u0623\u0641\u0644\u062a \u0627\u0644\u0648\u062b\u064a\u0642\u0629 \u0647\u0646\u0627\u060c \u0623\u0648 \u0627\u0636\u063a\u0637 \u0644\u0644\u0627\u062e\u062a\u064a\u0627\u0631"
                : "Glissez-d\u00e9posez le document ici, ou cliquez pour s\u00e9lectionner"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {language === "ar" ? "PDF \u0623\u0648 JPG \u0623\u0648 PNG\u060c \u0628\u062d\u062f \u0623\u0642\u0635\u0649 8 \u0645\u064a\u063a\u0627\u0628\u0627\u064a\u062a" : "PDF, JPG ou PNG, jusqu'\u00e0 8 Mo"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            {preview ? (
              <img src={preview} alt="Preview" className="h-16 w-16 rounded-lg object-cover border" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-red-50 dark:bg-red-950/20">
                <FileText className="h-8 w-8 text-red-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <button type="button" onClick={handleRemove} disabled={isUploading}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-100 hover:text-red-600 disabled:cursor-not-allowed dark:hover:bg-red-900/30">
              <X className="h-4 w-4" />
            </button>
          </div>

          {isUploading && (
            <div className="space-y-2 rounded-xl border bg-muted/20 p-3" aria-live="polite">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {language === "ar" ? "\u062c\u0627\u0631\u064a \u0627\u0644\u0631\u0641\u0639 \u0625\u0644\u0649 \u0627\u0644\u062a\u062e\u0632\u064a\u0646 \u0627\u0644\u0622\u0645\u0646..." : "T\u00e9l\u00e9chargement vers le stockage s\u00e9curis\u00e9..."}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
          {!isUploading && currentStatus !== "pending" && (
            <Button type="button" onClick={handleSubmit} disabled={submit.isPending}
              className="w-full gap-2 rounded-xl bg-amber-500 font-bold text-slate-950 hover:bg-amber-600">
              {submit.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />{language === "ar" ? "\u062c\u0627\u0631\u064a \u0627\u0644\u0625\u0631\u0633\u0627\u0644..." : "Envoi en cours..."}</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" />{language === "ar" ? "\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0648\u062b\u064a\u0642\u0629 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629" : "Envoyer le document"}</>
              )}
            </Button>
          )}
        </div>
      )}
      {!compact && (
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-emerald-600" />
          {language === "ar"
            ? "\u064a\u062a\u0645 \u062a\u0634\u0641\u064a\u0631 \u0645\u0644\u0641\u0627\u062a\u0643 \u0648\u062d\u0635\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u064a\u0647\u0627 \u0644\u0644\u0625\u062f\u0627\u0631\u0629 \u0641\u0642\u0637"
            : "Vos fichiers sont chiffr\u00e9s et l'acc\u00e8s est r\u00e9serv\u00e9 \u00e0 l'administration"}
        </div>
      )}
    </div>
  );
}
