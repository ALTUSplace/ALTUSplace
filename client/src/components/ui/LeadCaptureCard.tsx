import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Lead-capture fallback shown when a search/catalog slice has no results.
 *
 * The visitor describes what they want and the request is delivered to
 * trusted admins (in-app notification + email) and logged. There is no
 * self-service listing and deliberately no `wa.me` deep link — the operator
 * follows up. `variant` only changes copy/labels; both variants post to the
 * same `requestListing.create` mutation.
 */
type LeadCaptureVariant = "car" | "property";

/**
 * Mirrors the server-side `normalizeWhatsAppNumber` acceptance rules exactly so
 * the client refuses the same inputs the server would reject. Kept local rather
 * than imported because the normalizer lives in `server/` and is not part of the
 * client bundle.
 */
function isPhoneAcceptable(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!digits.length) return false;
  if (digits.startsWith("212")) return true;
  if (digits.startsWith("0")) return true;
  if (digits.length <= 9) return true;
  if (digits.length >= 10 && digits.length <= 15) return true;
  return false;
}

export function LeadCaptureCard({
  variant,
  className,
}: {
  variant: LeadCaptureVariant;
  className?: string;
}) {
  const { t, direction } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [item, setItem] = useState("");
  const [city, setCity] = useState("");

  const isCar = variant === "car";

  const heading = isCar ? t("leadGenCarHeading") : t("leadGenPropertyHeading");
  const subtext = isCar ? t("leadGenCarSubtext") : t("leadGenPropertySubtext");
  const cta = isCar ? t("leadGenCarCta") : t("leadGenPropertyCta");
  const modalTitle = isCar
    ? t("leadGenModalTitleCar")
    : t("leadGenModalTitleProperty");
  const itemLabel = isCar ? t("leadGenFieldCarModel") : t("leadGenFieldProperty");
  const itemPlaceholder = isCar
    ? t("leadGenFieldCarModelPlaceholder")
    : t("leadGenFieldPropertyPlaceholder");

  const inputClassName =
    "mt-1 w-full rounded-xl border border-border-default bg-bg-muted px-4 py-3 text-sm text-ink-primary placeholder:text-ink-secondary focus:border-accent-clay focus:outline-none";

  const createRequest = trpc.requestListing.create.useMutation({
    onSuccess: () => {
      toast.success(t("leadGenSuccessToast"));
      setName("");
      setPhone("");
      setItem("");
      setCity("");
      setOpen(false);
    },
    onError: () => {
      toast.error(t("leadGenErrorToast"));
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isPhoneAcceptable(phone)) {
      toast.error(t("leadGenErrorToast"));
      return;
    }
    createRequest.mutate({
      name: name.trim(),
      phone: phone.trim(),
      carModel: item.trim(),
      city: city.trim(),
    });
  };

  return (
    <div
      className={`mt-8 rounded-2xl border border-dashed border-border-default bg-bg-surface p-10 text-center ${className ?? ""}`}
    >
      <p className="text-lg font-bold text-ink-primary sm:text-xl">{heading}</p>
      <p className="mt-2 text-sm text-ink-secondary">{subtext}</p>
      <Button type="button" className="mt-6" onClick={() => setOpen(true)}>
        {cta}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={direction} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription>{subtext}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-bold text-ink-secondary">
              {t("leadGenFieldName")}
              <input
                type="text"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("leadGenFieldNamePlaceholder")}
                className={inputClassName}
              />
            </label>

            <label className="block text-xs font-bold text-ink-secondary">
              {t("leadGenFieldPhone")}
              <input
                type="tel"
                required
                dir="ltr"
                inputMode="tel"
                maxLength={20}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={t("leadGenFieldPhonePlaceholder")}
                className={`${inputClassName} text-start`}
              />
            </label>

            <label className="block text-xs font-bold text-ink-secondary">
              {itemLabel}
              <input
                type="text"
                required
                maxLength={120}
                value={item}
                onChange={(event) => setItem(event.target.value)}
                placeholder={itemPlaceholder}
                className={inputClassName}
              />
            </label>

            <label className="block text-xs font-bold text-ink-secondary">
              {t("leadGenFieldCity")}
              <input
                type="text"
                required
                maxLength={80}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder={t("leadGenFieldCityPlaceholder")}
                className={inputClassName}
              />
            </label>

            <Button
              type="submit"
              disabled={createRequest.isPending}
              className="w-full"
            >
              {createRequest.isPending ? t("leadGenSubmitting") : t("leadGenSubmit")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
