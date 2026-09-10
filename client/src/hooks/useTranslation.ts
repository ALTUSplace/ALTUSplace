import { useTRPC } from "@/trpc";
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
  const trpc = useTRPC();
  const [translatedText, setTranslatedText] = useState<TranslationResult | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Fetch translated listing if listingId is provided
  useEffect(() => {
    if (!listingId || !targetLanguage) return;

    const fetchTranslation = async () => {
      setIsTranslating(true);
      try {
        const listing = await trpc.listings.getById.query({
          id: listingId,
          language: targetLanguage,
        });
        
        if (listing?._translationMeta) {
          setTranslatedText({
            title: listing.title,
            description: listing.description,
            titleFromCache: listing._translationMeta.titleFromCache,
            descriptionFromCache: listing._translationMeta.descriptionFromCache,
            titleProvider: listing._translationMeta.titleProvider,
            descriptionProvider: listing._translationMeta.descriptionProvider,
          });
        }
      } catch (error) {
        console.error("Failed to fetch translation:", error);
      } finally {
        setIsTranslating(false);
      }
    };

    fetchTranslation();
  }, [listingId, targetLanguage, trpc.listings.getById]);

  return {
    translatedText,
    isTranslating,
    // Raw translate text mutation (for manual translation)
    translateText: trpc.translation.translateText.mutate,
    // Clear translation cache for a listing
    clearCache: (id: number) => trpc.translation.clearCache.mutate({ listingId: id }),
    // Translation stats
    stats: trpc.translation.stats.query,
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
  const trpc = useTRPC();
  const { data, isLoading, error } = trpc.translation.health.useQuery();
  
  return {
    health: data as TranslationHealth | undefined,
    isLoading,
    error,
  };
}
