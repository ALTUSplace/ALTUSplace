import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Matches admin.moderateListing and kyc.review, which both cap the reason at 500. */
export const REJECT_REASON_MAX = 500;

export type RejectReasonDialogProps = {
  open: boolean;
  /** What is being rejected, e.g. "رفض طلب التحقق #3". */
  title: string;
  /** One-line identity of the subject, so two similar rows cannot be confused. */
  subject?: string;
  /** True while the confirming mutation is in flight. */
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

/**
 * Mandatory-reason dialog for a destructive moderation decision.
 *
 * Extracted from AdminDashboard so the queue page and the legacy listings tab
 * collect a reason through exactly one component. The reason is enforced a
 * second time server-side by a `.refine()` on the mutation input — this dialog
 * is UX, not the security boundary, and the comment in each caller says so.
 *
 * The submit button is disabled while the trimmed reason is empty. That is
 * convenience only: an empty string still reaches the server as a validation
 * failure if this dialog is bypassed or this button is re-enabled.
 *
 * NOT covered by tests. The repo has no DOM and no React-testing library, so
 * the disabled-while-blank behaviour, the reset-on-reopen behaviour, and the
 * trimmed value passed to `onConfirm` are all unverified by anything in CI.
 */
export function RejectReasonDialog({
  open,
  title,
  subject,
  pending = false,
  onCancel,
  onConfirm,
}: RejectReasonDialogProps) {
  const [reason, setReason] = useState("");

  // Reset on every open. Without this, a half-typed reason survives a cancel
  // and silently pre-fills the next, unrelated rejection -- which would then be
  // submitted against a row the author never read.
  useEffect(() => {
    if (open) setReason("");
  }, [open, subject]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && !pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-red-600">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {subject ? <p className="font-bold text-ink-primary">{subject}</p> : null}
          <p className="text-xs text-slate-500">
            سيُحفظ السبب في سجل التدقيق ولا يمكن التراجع عن هذا الإجراء.
          </p>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="سبب الرفض (مثال: صور غير واضحة، بيانات ناقصة)..."
            rows={4}
            maxLength={REJECT_REASON_MAX}
            aria-label={title}
          />
          <p className="text-end text-xs text-slate-500">
            {reason.length}/{REJECT_REASON_MAX}
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            إلغاء
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmed)}
          >
            تأكيد الرفض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}