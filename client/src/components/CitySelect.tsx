import { useId } from "react";
import { cn } from "@/lib/utils";
import { MOROCCO_REGIONS, cityLabelFr } from "@/data/moroccoCities";
import { useLanguage } from "@/contexts/LanguageContext";

type CitySelectProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  className?: string;
  includeAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
};

/**
 * Shared nationwide city dropdown organised as one <optgroup> per Moroccan
 * region. Option values are always the canonical Arabic city names so stored
 * data stays uniform across car and property listing forms.
 */
export function CitySelect({
  value,
  onChange,
  id,
  name,
  className,
  includeAll = false,
  allLabel,
  disabled,
}: CitySelectProps) {
  const { language } = useLanguage();
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const isFr = language === "fr";
  const labelFor = (city: string) => (isFr ? cityLabelFr(city) : city);

  const allLabelText =
    allLabel ?? (isFr ? "Toutes les villes" : language === "ar" ? "جميع المدن" : "All cities");

  return (
    <select
      id={selectId}
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={cn("w-full rounded-xl border bg-background p-3 text-sm", className)}
    >
      {includeAll && <option value="all">{allLabelText}</option>}
      {MOROCCO_REGIONS.map((region) => (
        <optgroup key={region.name} label={isFr ? region.nameFr : region.name}>
          {region.cities.map((city) => (
            <option key={city} value={city}>
              {labelFor(city)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}