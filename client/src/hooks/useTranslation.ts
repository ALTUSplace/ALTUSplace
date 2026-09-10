import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

// Hook to get the user's current language preference and sync with API
interface UseTranslationOptions {
  listingId?: number;
  targetLanguage?: "ar" | "fr" | "en";
}

interface TranslationResult {
  title: string;
  description: string | null;
  titleFromCache: boolean;
  descriptionFromCache: boolean;
  titleProvider: string;
  descriptionProvider: string;
}

export function useTranslation({ listingId, targetLanguage }: UseTranslationOptions = {}) {
  const utils = trpc.useUtils();
  const translateMutation = trpc.translation.translateText.useMutation();
  const clearCacheMutation = trpc.translation.clearCache.useMutation();

  const { data: listing, isFetching } = trpc.listings.getById.useQuery(
    { id: listingId ?? 0, language: targetLanguage },
    { enabled: Boolean(listingId && targetLanguage) },
  );

  const [translatedText, setTranslatedText] = useState<TranslationResult | null>(null);

  useEffect(() => {
    if (!listing || !("_translationMeta" in listing) || !listing._translationMeta) return;
    setTranslatedText({
      title: listing.title,
      description: listing.description,
      titleFromCache: listing._translationMeta.titleFromCache,
      descriptionFromCache: listing._translationMeta.descriptionFromCache,
      titleProvider: listing._translationMeta.titleProvider,
      descriptionProvider: listing._translationMeta.descriptionProvider,
    });
  }, [listing]);

  return {
    translatedText,
    isTranslating: isFetching || translateMutation.isPending,
    // Raw translate text mutation (for manual translation)
    translateText: translateMutation.mutate,
    // Clear translation cache for a listing
    clearCache: (id: number) => clearCacheMutation.mutate({ listingId: id }),
    // Translation stats
    stats: () => utils.translation.stats.fetch(),
  };
}

// Hook to check translation service health
interface TranslationHealth {
  enabled: boolean;
  provider: string;
  available: boolean;
  supportedLanguages: string[];
  awsConfigured: boolean;
  googleConfigured: boolean;
  deeplConfigured: boolean;
}

export function useTranslationHealth() {
  const { data, isLoading, error } = trpc.translation.health.useQuery();

  return {
    health: data as TranslationHealth | undefined,
    isLoading,
    error,
  };
}