/**
 * Translation Service for Automated Real-Time Text Translation
 *
 * Uses AWS Translate as the primary service with fallback support.
 * Implements a database caching strategy to avoid repeated API calls.
 *
 * Translation Flow:
 * 1. Check database cache for existing translation
 * 2. If not found, call translation API
 * 3. Store result in database for future requests
 * 4. Return translated text to the client
 */

import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import { ENV } from "./env";
import { getDb } from "../db";
import { translations, Translation } from "../../drizzle/schema"; // أو مسار الـ schema الصحيح لديك

import { eq, and, desc } from "drizzle-orm";

// Supported languages for translation
export const SUPPORTED_LANGUAGES = ["ar", "fr", "en"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// Language code mapping for AWS Translate
const LANGUAGE_CODE_MAP: Record<Language, string> = {
  ar: "ar",
  fr: "fr",
  en: "en",
};

// Singleton Translate client
let translateClient: TranslateClient | null = null;

/**
 * Get or create the AWS Translate client singleton
 */
function getTranslateClient(): TranslateClient | null {
  if (!translateClient && ENV.translationProvider === "aws" && ENV.awsTranslateAccessKeyId && ENV.awsTranslateSecretAccessKey) {
    try {
      translateClient = new TranslateClient({
        region: ENV.awsRegion,
        credentials: {
          accessKeyId: ENV.awsTranslateAccessKeyId,
          secretAccessKey: ENV.awsTranslateSecretAccessKey,
        },
      });
    } catch (error) {
      console.error("[Translation] Failed to initialize AWS Translate client:", error);
      return null;
    }
  }
  return translateClient;
}

/**
 * Check if translation service is available
 */
export function isTranslationAvailable(): boolean {
  return ENV.translationEnabled && ENV.translationProvider !== "none" && getTranslateClient() !== null;
}

/**
 * Translate text using AWS Translate API
 */
export async function translateWithAws(
  text: string,
  sourceLanguage: Language,
  targetLanguage: Language,
  skipCache: boolean = false
): Promise<{ translatedText: string | null; fromCache: boolean; provider: string }> {
  const client = getTranslateClient();
  if (!client) {
    return { translatedText: null, fromCache: false, provider: "unavailable" };
  }

  try {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: LANGUAGE_CODE_MAP[sourceLanguage],
      TargetLanguageCode: LANGUAGE_CODE_MAP[targetLanguage],
    });

    const result = await client.send(command);
    return {
      translatedText: result.TranslatedText ?? null,
      fromCache: false,
      provider: "aws",
    };
  } catch (error) {
    console.error("[Translation] AWS Translate error:", error);
    return { translatedText: null, fromCache: false, provider: "error" };
  }
}

/**
 * Get cached translation from database
 */
async function getCachedTranslation(
  listingId: number,
  language: Language,
  field: "title" | "description",
  originalText: string
): Promise<string | null> {
  const database = await getDb();
  if (!database) return null;

  try {
    const result = await database
      .select({ translatedText: translations.translatedText })
      .from(translations)
      .where(
        and(
          eq(translations.listingId, listingId),
          eq(translations.language, language),
          eq(translations.field, field),
          eq(translations.originalText, originalText)
        )
      )
      .orderBy(desc(translations.updatedAt))
      .limit(1);

    return result[0]?.translatedText ?? null;
  } catch (error) {
    console.error("[Translation] Cache lookup error:", error);
    return null;
  }
}

/**
 * Store translation in database cache
 */
async function storeTranslation(
  listingId: number,
  language: Language,
  field: "title" | "description",
  originalText: string,
  translatedText: string,
  provider: string = "aws"
): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;

  try {
    await database
      .insert(translations)
      .values({
        listingId,
        language,
        field,
        originalText,
        translatedText,
        provider,
      })
      .onDuplicateKeyUpdate({
        set: { translatedText, provider, updatedAt: new Date() },
      });

    return true;
  } catch (error) {
    console.error("[Translation] Cache store error:", error);
    return false;
  }
}

/**
 * Get or translate a listing field with caching
 *
 * This is the main entry point for translation requests.
 * It implements the cache-first strategy:
 * 1. Check database for cached translation
 * 2. If not found, call translation API
 * 3. Store result in database
 * 4. Return translated text
 */
export async function getTranslatedListingField<T extends "title" | "description">(
  listingId: number,
  field: T,
  originalText: string,
  targetLanguage: Language,
  sourceLanguage: Language = "ar" // Default source is Arabic (original content language)
): Promise<{ translatedText: string; fromCache: boolean; provider: string }> {
  // If target language is same as source, return original
  if (targetLanguage === sourceLanguage) {
    return { translatedText: originalText, fromCache: true, provider: "none" };
  }

  // Check database cache first
  const cached = await getCachedTranslation(listingId, targetLanguage, field, originalText);
  if (cached) {
    return { translatedText: cached, fromCache: true, provider: "cache" };
  }

  // Translate via API
  let translatedText: string | null = null;
  let provider = "none";

  if (ENV.translationProvider === "aws") {
    const awsResult = await translateWithAws(originalText, sourceLanguage, targetLanguage);
    translatedText = awsResult.translatedText;
    provider = awsResult.provider;
  }

  // If translation failed, return original text
  if (!translatedText) {
    console.warn(`[Translation] Failed to translate listing ${listingId} ${field} to ${targetLanguage}`);
    return { translatedText: originalText, fromCache: false, provider: "failed" };
  }

  // Store in cache for future requests
  await storeTranslation(listingId, targetLanguage, field, originalText, translatedText, provider);

  return { translatedText, fromCache: false, provider };
}

/**
 * Get fully translated listing (title and description)
 */
export async function getTranslatedListing(
  listing: {
    id: number;
    title: string;
    description: string | null;
  },
  targetLanguage: Language,
  sourceLanguage: Language = "ar"
): Promise<{
  title: string;
  description: string | null;
  titleFromCache: boolean;
  descriptionFromCache: boolean;
  titleProvider: string;
  descriptionProvider: string;
}> {
  const [titleResult, descriptionResult] = await Promise.all([
    getTranslatedListingField(listing.id, "title", listing.title, targetLanguage, sourceLanguage),
    listing.description
      ? getTranslatedListingField(listing.id, "description", listing.description, targetLanguage, sourceLanguage)
      : Promise.resolve({ translatedText: null as string | null, fromCache: true, provider: "none" }),
  ]);

  return {
    title: titleResult.translatedText,
    description: descriptionResult.translatedText,
    titleFromCache: titleResult.fromCache,
    descriptionFromCache: descriptionResult.fromCache,
    titleProvider: titleResult.provider,
    descriptionProvider: descriptionResult.provider,
  };
}

/**
 * Invalidate translation cache for a listing
 * Call this when a listing is updated
 */
export async function invalidateTranslationCache(listingId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;

  try {
    const result = await database
      .delete(translations)
      .where(eq(translations.listingId, listingId));

    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  } catch (error) {
    console.error("[Translation] Cache invalidation error:", error);
    return 0;
  }
}

/**
 * Get translation statistics
 */
export async function getTranslationStats(listingId?: number): Promise<{
  totalTranslations: number;
  cachedTranslations: number;
  byLanguage: Record<Language, number>;
}> {
  const database = await getDb();
  if (!database) {
    return { totalTranslations: 0, cachedTranslations: 0, byLanguage: { ar: 0, fr: 0, en: 0 } };
  }

  try {
    const conditions = listingId ? [eq(translations.listingId, listingId)] : [];
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const allTranslations = await database
      .select({
        language: translations.language,
        count: translations.id,
      })
      .from(translations)
      .where(whereClause)
      .orderBy(desc(translations.createdAt));

    const totalTranslations = allTranslations.length;
    const byLanguage: Record<string, number> = {};

    for (const t of allTranslations) {
      byLanguage[t.language] = (byLanguage[t.language] || 0) + 1;
    }

    return {
      totalTranslations,
      cachedTranslations: totalTranslations,
      byLanguage: byLanguage as Record<Language, number>,
    };
  } catch (error) {
    console.error("[Translation] Stats error:", error);
    return { totalTranslations: 0, cachedTranslations: 0, byLanguage: { ar: 0, fr: 0, en: 0 } };
  }
}

/**
 * Check if a specific translation exists in cache
 */
export async function hasCachedTranslation(
  listingId: number,
  language: Language,
  field: "title" | "description",
  originalText: string
): Promise<boolean> {
  const cached = await getCachedTranslation(listingId, language, field, originalText);
  return cached !== null;
}
