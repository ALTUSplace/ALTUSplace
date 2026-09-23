import { useState } from 'react';
import { Link } from 'wouter';
import { Heart, ListX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/ui/ListingCard';
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useFavorites } from "@/hooks/useFavorites";
import { isCarCategory } from "@/lib/categories";
import { useNoIndex } from "@/lib/seo";

/** Minimal listing shape returned inside a favorite row (server listings.list fields). */
type FavoriteListing = {
  id: number;
  ownerId: number;
  ownerRole?: string | null;
  title: string;
  titleFr?: string | null;
  category: string;
  pricePerDay: number;
  imageUrl: string | null;
  images?: string[] | null;
  city: string;
  averageRating?: number | null;
  reviewCount?: number | null;
};

type FilterType = 'all' | 'car' | 'property';

export default function Favorites() {
  useNoIndex();
  const { direction, t } = useLanguage();
  const { isAuthenticated, loading: authLoading, user } = useAuth({ redirectOnUnauthenticated: false });
  const { favorites, isLoading, isFavorite, toggleFavorite } = useFavorites();
  const [filterType, setFilterType] = useState<FilterType>('all');

  const rows = (favorites ?? []).filter((row) => {
    const listing = row.listing as unknown as FavoriteListing | undefined;
    if (!listing) return false;
    if (filterType === 'all') return true;
    if (filterType === 'car') return isCarCategory(listing.category);
    return !isCarCategory(listing.category);
  });

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-slate-50" dir={direction}>
        <p className="text-slate-500">{t('loadingPage')}</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-slate-50 px-4" dir={direction}>
        <Heart className="h-12 w-12 text-slate-300" />
        <h1 className="text-xl font-black text-slate-900">{t('favoritesTitle')}</h1>
        <p className="max-w-md text-center text-sm text-slate-500">{t('loginRequiredDesc')}</p>
        <Button type="button" onClick={startLogin} className="bg-amber-500 font-bold text-slate-950 hover:bg-amber-400">
          {t('loginAction')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4 sm:px-6" dir={direction}>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">{t('favoritesTitle')}</h1>
          <p className="text-sm text-slate-500">{t('favoritesSubtitle')}</p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'car', 'property'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                filterType === type
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {t(type === 'all' ? 'favoritesTypeAll' : type === 'car' ? 'favoritesTypeCars' : 'favoritesTypeProperties')}
            </button>
          ))}
          <span className="mr-auto text-sm font-bold text-slate-500">{rows.length}</span>
        </div>

        {isLoading && favorites === undefined && (
          <p className="py-10 text-center text-sm text-slate-500">{t('loadingPage')}</p>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-slate-200 bg-white py-16" dir={direction}>
            <ListX className="h-12 w-12 text-slate-300" />
            <h2 className="text-lg font-black text-slate-900">{t('favoritesEmptyTitle')}</h2>
            <p className="max-w-md text-center text-sm text-slate-500">{t('favoritesEmptyDesc')}</p>
            <Link href="/search" className="inline-flex items-center rounded-xl bg-amber-500 px-5 py-2.5 font-bold text-slate-950 hover:bg-amber-400">
              {t('favoritesBrowse')}
            </Link>
          </div>
        )}

        {rows.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((row) => {
              const listing = row.listing as unknown as FavoriteListing;
              const images =
                Array.isArray(listing.images) && listing.images.length > 0
                  ? listing.images
                  : listing.imageUrl
                    ? [listing.imageUrl]
                    : [];
              return (
                <ListingCard
                  key={row.favoriteId}
                  id={String(listing.id)}
                  title={listing.title}
                  titleFr={listing.titleFr ?? undefined}
                  city={listing.city}
                  pricePerDay={listing.pricePerDay}
                  images={images}
                  type={isCarCategory(listing.category) ? 'car' : 'property'}
                  providerVerified={listing.ownerRole === 'partner'}
                  rating={listing.averageRating ?? 0}
                  reviewCount={listing.reviewCount ?? 0}
                  isFavorite={isFavorite(listing.id)}
                  onToggleFavorite={() => toggleFavorite(listing.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}