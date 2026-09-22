// ── SSRF guard for user-supplied external URLs (iCal imports) ────────────────
// Any URL the server fetches because a user saved it must pass
// validateExternalUrl() first. It enforces HTTPS, resolves the hostname and
// rejects private/reserved networks (DNS-rebinding safe: ANY resolved address
// being private rejects the whole URL), and can be locked to an allowlist via
// the ICAL_ALLOWED_HOSTS env var. fetchExternalText() wraps the actual fetch
// with a hard 5s timeout and a 1 MB response-size cap.

import { BlockList, isIPv4, isIPv6 } from "node:net";
import { lookup } from "node:dns/promises";

export const ICAL_FETCH_TIMEOUT_MS = 5_000;
export const ICAL_FETCH_MAX_BYTES = 1_000_000;

// Private, loopback, link-local and reserved networks that must never be
// reachable from a server-side fetch triggered by user input.
const blocked = new BlockList();
blocked.addSubnet("127.0.0.0", 8); // loopback
blocked.addSubnet("10.0.0.0", 8); // private
blocked.addSubnet("172.16.0.0", 12); // private
blocked.addSubnet("192.168.0.0", 16); // private
blocked.addSubnet("169.254.0.0", 16); // link-local (cloud metadata: 169.254.169.254)
blocked.addSubnet("0.0.0.0", 8);
blocked.addAddress("::1", "ipv6"); // IPv6 loopback
blocked.addSubnet("fc00::", 7, "ipv6"); // IPv6 unique local

type LookupAddress = { address: string; family: number };

export type ExternalUrlOptions = {
  /** Override DNS resolution (used by tests to stay hermetic). */
  resolver?: (hostname: string) => Promise<LookupAddress[]>;
  /** Override the ICAL_ALLOWED_HOSTS allowlist for a single call (tests). */
  allowedHosts?: string;
};

function normalizeIp(address: string): string {
  const lower = address.toLowerCase();
  // IPv4-mapped IPv6 addresses (::ffff:127.0.0.1) must be checked as IPv4.
  if (lower.startsWith("::ffff:")) return lower.slice(7);
  return lower;
}

async function resolveHost(hostname: string, resolver?: ExternalUrlOptions["resolver"]): Promise<string[]> {
  if (isIPv4(hostname) || isIPv6(hostname)) return [normalizeIp(hostname)];
  const resolve = resolver ?? (async (host: string) => lookup(host, { all: true, verbatim: true }));
  const addresses = await resolve(hostname);
  return addresses.map((entry) => normalizeIp(entry.address));
}

export async function validateExternalUrl(value: string, options: ExternalUrlOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("رابط iCal غير صالح. / URL iCal invalide.");
  }

  if (url.protocol !== "https:") {
    throw new Error("رابط iCal يجب أن يستخدم HTTPS فقط. / Seule une URL HTTPS est autorisée.");
  }
  if (url.username || url.password) {
    throw new Error("رابط iCal لا يجب أن يحتوي على بيانات اعتماد. / Identifiants interdits dans l'URL.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost") {
    throw new Error("مضيف iCal محلي أو غير آمن — مرفوض. / Hôte local interdit.");
  }

  // Optional host allowlist (ICAL_ALLOWED_HOSTS, comma-separated). When set,
  // only exact hosts or their subdomains are permitted.
  const allowlist = (options.allowedHosts ?? process.env.ICAL_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length > 0 && !allowlist.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))) {
    throw new Error("مضيف iCal غير مصرح به في قائمة السماح. / Hôte non autorisé par la liste blanche.");
  }

  // DNS rebinding defense: reject if ANY resolved address is private/reserved,
  // since the runtime may legitimately connect to any of them.
  const addresses = await resolveHost(hostname, options.resolver);
  for (const ip of addresses) {
    const isV6 = isIPv6(ip);
    if (blocked.check(ip, isV6 ? "ipv6" : "ipv4")) {
      throw new Error("رابط iCal يشير إلى عنوان خاص أو داخلي — مرفوض. / Adresse privée ou interne refusée.");
    }
  }

  return url;
}

export async function fetchExternalText(url: URL | string, headers?: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICAL_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: headers ?? { Accept: "text/calendar,text/plain;q=0.9" },
    });
    if (!response.ok) throw new Error(`iCal HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > ICAL_FETCH_MAX_BYTES) throw new Error("iCal feed exceeds 1 MB");
    const body = await response.text();
    if (body.length > ICAL_FETCH_MAX_BYTES) throw new Error("iCal feed exceeds 1 MB");
    return body;
  } finally {
    clearTimeout(timer);
  }
}