import { useFavorites } from "@/hooks/useFavorites";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

export interface FavoriteButtonProps {
  listingId: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}

const SIZE = {
  sm: "w-9 h-9 rounded-xl text-sm",
  md: "w-10 h-10 rounded-xl",
  lg: "w-12 h-12 rounded-2xl",
} as const;

const ICON = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
} as const;

export function FavoriteButton({
  listingId,
  size = "md",
  className = "",
  showLabel = false,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { t } = useLanguage();
  const active = isFavorite(listingId) as boolean;

  return (
    <button
      type="button"
      aria-label={active ? "remove-from-favorites" : "add-to-favorites"}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(listingId);
        toast.success(active ? t("favorite.removed") : t("favorite.added"));
      }}
      className={`relative flex items-center justify-center gap-1.5 transition-all border backdrop-blur-md ${
        active
          ? "bg-red-500/15 border-red-500/40 text-red-500 hover:bg-red-500/25"
          : "bg-slate-950/70 border-slate-700 text-slate-300 hover:text-white hover:border-amber-500/50"
      } ${SIZE[size]} ${className}`}
    >
      <Heart
        className={`${ICON[size]} ${active ? "fill-red-500" : ""}`}
      />
      {showLabel && (
        <span className="text-xs font-bold">
          {active ? t("favorite.in") : t("favorite.add")}
        </span>
      )}
    </button>
  );
}
