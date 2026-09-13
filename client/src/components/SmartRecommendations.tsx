import { useEffect, useMemo, useState } from "react";
import { Zap, MapPin, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { OptimizedImage } from "@/components/OptimizedImage";
import { readBrandPreference } from "@/config/brand";
import { useLanguage } from "@/contexts/LanguageContext";

type LocalSignals = {
  favorites: string[];
  recentCities: string[];
};

const readSignals = (): LocalSignals => {
  if (typeof window === "undefined") return { favorites: [], recentCities: [] };
  try {
    const favoritesRaw = readBrandPreference("favorites");
    const recentRaw = readBrandPreference("recentViewed");
    const favorites = favoritesRaw ? JSON.parse(favoritesRaw) : [];
    const recent = recentRaw ? JSON.parse(recentRaw) : [];
    return {
      favorites: Array.isArray(favorites) ? favorites.map(String) : [],
      recentCities: Array.isArray(recent)
        ? recent.filter((entry) => entry && typeof entry.city === "string").map((entry) => entry.city)
        : [],
    };
  } catch {
    return { favorites: [], recentCities: [] };
  }
};

export function SmartRecommendations() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const { data: listings, isLoading } = trpc.listings.list.useQuery({});
  const [signals, setSignals] = useState<LocalSignals>({ favorites: [], recentCities: [] });

  useEffect(() => {
    setSignals(readSignals());
  }, []);

  const recommendations = useMemo(() => {
    if (!listings) return [];
    return listings
      .map((item) => {
        const id = String(item.id);
        const favorite = signals.favorites.includes(id);
        const sameCity = signals.recentCities.includes(item.city);
        const score = (favorite ? 2 : 0) + (sameCity ? 1 : 0);
        const reason = favorite
          ? t("smartReasonFavorite")
          : sameCity
            ? t("smartReasonCity")
            : t("smartReasonNewListing");
        return { item, score, reason };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [listings, signals, t]);

  if (isLoading || recommendations.length === 0) return null;

  return (
    <section className="border-t border-border-subtle bg-bg-surface py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="section-index mb-3">
              <Zap className="h-4 w-4" />
              <span>{t("smartBadge")}</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-primary md:text-3xl">
              {t("smartTitle")}
            </h2>
          </div>
          <Badge variant="outline" className="border-accent-clay/30 bg-accent-clay-soft px-4 py-1.5 text-xs font-bold text-accent-clay">
            <Zap className="ms-1.5 inline h-3.5 w-3.5" /> {t("smartSourceBadge")}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {recommendations.map(({ item, reason }) => {
            const isCar = item.category.toLowerCase().includes("car") || item.category.includes("سيارة");
            const isOffice = Boolean(item.officeType) || item.category.toLowerCase().includes("office") || item.category.includes("مكتب");
            const route = isCar ? `/car/${item.id}` : `/property/${item.id}`;
            const unit = isOffice
              ? item.rentalPeriod === "monthly"
                ? t("madPerMonth")
                : item.rentalPeriod === "yearly"
                  ? t("madPerYear")
                  : t("madPerDay")
              : isCar
                ? t("madPerDay")
                : t("madPerNight");
            return (
              <Card key={item.id} className="group overflow-hidden rounded-lg border border-border-subtle bg-bg-surface transition-all duration-300 hover:border-border-default hover:shadow-lg hover:-translate-y-1">
                <div className="relative h-48 overflow-hidden bg-bg-muted">
                  {item.imageUrl ? (
                    <OptimizedImage src={item.imageUrl} alt={item.title} width={640} height={360} widthHint={640} sizes="(max-width: 768px) 100vw, 33vw" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-ink-tertiary">{t("noImage")}</div>
                  )}
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-accent-clay scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100" aria-hidden="true" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-1 corner-cut-sm rounded-sm bg-ink-primary/70 px-2.5 py-1.5 text-xs text-white backdrop-blur-md">
                    <MapPin className="h-3 w-3 text-accent-clay" /> {item.city}
                  </div>
                </div>
                <CardContent className="p-5">
                  <div className="mb-3 inline-block corner-cut-sm rounded-sm bg-bg-muted px-2 py-1 text-xs text-ink-tertiary">{reason}</div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="line-clamp-1 text-lg font-bold text-ink-primary group-hover:text-accent-clay transition-colors">{item.title}</h3>
                    <span className="shrink-0 text-xs text-ink-tertiary">{t("noVerifiedReviews")}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4">
                    <div>
                      <span className="block text-xs text-ink-tertiary">{t("publishedPrice")}</span>
                      <span className="font-display text-base font-bold text-ink-primary">{item.dynamicPricePerDay ?? item.pricePerDay} {unit}</span>
                    </div>
                    <Button size="sm" onClick={() => setLocation(route)} className="b2-press corner-cut-sm cursor-pointer gap-1 rounded-sm bg-accent-clay font-bold text-white hover:bg-accent-clay-hover">
                      {t("viewDetails")} <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
