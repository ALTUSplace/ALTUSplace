import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { readBrandPreference, writeBrandPreference } from "@/config/brand";

export type Currency = "MAD" | "EUR" | "USD";

interface Rates {
  MAD: number;
  EUR: number;
  USD: number;
}

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatPrice: (amountInMAD: number) => string;
  convertPrice: (amountInMAD: number) => number;
  symbol: string;
  // #23 — async converter additions
  rates: Rates;
  ratesLoading: boolean;
  refreshRates: () => Promise<void>;
  showTotal: boolean;
  setShowTotal: (value: boolean) => void;
  formatTotalPrice: (amountInMAD: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// Static fallback rates relative to MAD (1 MAD). Used while the async source
// loads, on failure, or when VITE_CURRENCY_API_URL is not configured.
const FALLBACK_RATES: Rates = {
  MAD: 1,
  EUR: 0.092, // ~1 EUR = 10.8 MAD
  USD: 0.10, // ~1 USD = 10 MAD
};

const SYMBOLS: Record<Currency, string> = {
  MAD: "درهم",
  EUR: "€",
  USD: "$",
};

const RATES_CACHE_KEY = "altus.currency.rates.v1";
const RATES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FEES_RATIO = 0.15; // blended platform fees + taxes (~15%) shown in "total" view

interface RatesCache {
  fetchedAt: number;
  rates: Rates;
}

function readRatesCache(): RatesCache | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatesCache;
    if (!parsed || typeof parsed.fetchedAt !== "number" || !parsed.rates) return null;
    if (Date.now() - parsed.fetchedAt > RATES_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRatesCache(cache: RatesCache): void {
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // private-mode storage unavailable — engine keeps in-memory rates
  }
}

function ratesApiUrl(): string | null {
  try {
    const url = (import.meta.env.VITE_CURRENCY_API_URL as string | undefined) ?? "";
    return url.trim().length > 0 ? url.trim() : null;
  } catch {
    return null;
  }
}

// Placeholder async provider: when VITE_CURRENCY_API_URL is set it fetches live
// MAD/EUR/USD rates (relative to 1 MAD); otherwise it simulates a short async
// hop and falls back to the static table so the engine is always operational.
async function fetchRatesFromApi(): Promise<Rates> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  try {
    const url = ratesApiUrl();
    if (!url) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return { ...FALLBACK_RATES };
    }
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Rates API responded ${res.status}`);
    const data = (await res.json()) as Record<string, number>;
    const mad = Number(data.MAD ?? 1);
    const eur = Number(data.EUR);
    const usd = Number(data.USD);
    if (![mad, eur, usd].every((n) => Number.isFinite(n) && n > 0)) {
      throw new Error("Malformed rates payload");
    }
    return { MAD: mad, EUR: eur, USD: usd };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = readBrandPreference("currency");
    return saved === "EUR" || saved === "USD" ? saved : "MAD";
  });

  const [rates, setRates] = useState<Rates>(() => {
    const cached = readRatesCache();
    return cached ? cached.rates : { ...FALLBACK_RATES };
  });
  const [ratesLoading, setRatesLoading] = useState(false);
  const [showTotal, setShowTotal] = useState<boolean>(() => {
    let saved = "on"; try { saved = window.localStorage.getItem("altus.currency.showtotal.v1") ?? "on"; } catch { saved = "on"; }
    return saved !== "off";
  });

  const refreshRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const fresh = await fetchRatesFromApi();
      setRates(fresh);
      writeRatesCache({ fetchedAt: Date.now(), rates: fresh });
    } catch {
      // keep current (fallback or cached) rates on failure
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRates();
    const interval = window.setInterval(() => void refreshRates(), RATES_CACHE_TTL_MS);
    return () => window.clearInterval(interval);
  }, [refreshRates]);

  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    writeBrandPreference("currency", next);
  }, []);

  const toggleShowTotal = useCallback((value: boolean) => {
    setShowTotal(value);
    try { window.localStorage.setItem("altus.currency.showtotal.v1", value ? "on" : "off"); } catch {}
  }, []);

  const currentRates = useMemo<Rates>(
    () => ({
      MAD: 1,
      EUR: rates.EUR || FALLBACK_RATES.EUR,
      USD: rates.USD || FALLBACK_RATES.USD,
    }),
    [rates],
  );

  const convertPrice = useCallback(
    (amountInMAD: number) => Math.round(amountInMAD * currentRates[currency]),
    [currentRates, currency],
  );

  const formatPrice = useCallback(
    (amountInMAD: number) => {
      const converted = convertPrice(amountInMAD);
      const sym = SYMBOLS[currency];
      return currency === "MAD" ? `${converted.toLocaleString()} ${sym}` : `${sym}${converted.toLocaleString()}`;
    },
    [convertPrice, currency],
  );

  const formatTotalPrice = useCallback(
    (amountInMAD: number) => {
      const totalInMAD = Math.round(amountInMAD * (1 + FEES_RATIO));
      return formatPrice(totalInMAD);
    },
    [formatPrice],
  );

  const value: CurrencyContextType = {
    currency,
    setCurrency,
    formatPrice,
    convertPrice,
    symbol: SYMBOLS[currency],
    rates: currentRates,
    ratesLoading,
    refreshRates,
    showTotal,
    setShowTotal: toggleShowTotal,
    formatTotalPrice,
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
