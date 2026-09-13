// ── Server-side FX rate resolution ───────────────────────────────────────────
// Single source of truth for the amounts persisted with a payment. The client
// refreshes display rates from VITE_CURRENCY_API_URL (10-min TTL); this module
// mirrors that contract server-side via CURRENCY_API_URL so the amount a guest
// approves at checkout equals the invoice + payment rows exactly. Without the
// env var both sides fall back to the same static table in billing.ts.

import { CURRENCY_RATES } from "../billing";

export type ExchangeRates = {
  MAD: 1;
  EUR: number;
  USD: number;
};

const TTL_MS = 10 * 60 * 1000;

let cache: { fetchedAt: number; rates: ExchangeRates } | null = null;

function ratesApiUrl(): string | null {
  const value = (process.env.CURRENCY_API_URL ?? "").trim();
  return value.length > 0 ? value : null;
}

function staticRates(): ExchangeRates {
  return { MAD: 1, EUR: CURRENCY_RATES.EUR, USD: CURRENCY_RATES.USD };
}

async function fetchRates(): Promise<ExchangeRates> {
  const url = ratesApiUrl();
  if (!url) return staticRates();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Rates API responded ${res.status}`);
    const data = (await res.json()) as Record<string, number>;
    const eur = Number(data.EUR);
    const usd = Number(data.USD);
    if (!Number.isFinite(eur) || eur <= 0 || !Number.isFinite(usd) || usd <= 0) {
      throw new Error("Malformed rates payload");
    }
    return { MAD: 1, EUR: eur, USD: usd };
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolves the current MAD/EUR/USD rates, cached 10 minutes. Never throws. */
export async function resolveExchangeRates(): Promise<ExchangeRates> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates;
  try {
    const rates = await fetchRates();
    cache = { fetchedAt: Date.now(), rates };
    return rates;
  } catch {
    const rates = staticRates();
    cache = { fetchedAt: Date.now(), rates };
    return rates;
  }
}

/** Converts a MAD amount to the target currency with integer rounding, matching
 * the client's convertPrice(Math.round) so checkout totals reconcile exactly. */
export function convertFromMAD(amountInMAD: number, to: "MAD" | "EUR" | "USD", rates: ExchangeRates): number {
  const rate = rates[to] ?? 1;
  return Math.round((amountInMAD * rate) / rates.MAD);
}