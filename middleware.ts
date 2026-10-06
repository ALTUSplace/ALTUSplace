/**
 * Vercel Edge Middleware: prerender proxy for crawlers and hard 404s for
 * undeclared SPA URLs.
 *
 * The app is a client-rendered SPA served from a static `index.html`. When a
 * known bot requests a page we rewrite the request to `/api/prerender`, which
 * returns the SPA shell enriched with route-specific title/description/OG,
 * canonical and JSON-LD. Real users get the shell (known routes) or a real 404
 * (undeclared paths — previously a soft-200 that Google flagged as a soft-404).
 *
 * `middleware.ts` runs on Vercel only; it is intentionally outside
 * tsconfig.json's include (compiled by Vercel's edge runtime).
 */
import { classifySpaPath } from "./shared/routes/spaPaths";

const BOT_USER_AGENT =
  /bot|crawler|spider|crawling|facebookexternalhit|facebot|slackbot|twitterbot|whatsapp|telegrambot|linkedinbot|pinterest|googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|discordbot|embedly|redditbot|skypeuripreview/i;

export const config = {
  // `storage` is excluded too: `/storage/(.*)` rewrites to `/api/index` and
  // extensionless storage keys must never be classified as unknown SPA paths.
  matcher: "/((?!api|storage|assets|_next/static|_next/image|favicon.ico|.*\\..*).*)",
};

// Bare, dependency-free 404 document. No inline styles/scripts: the edge
// `/(.*)` CSP in vercel.json still applies to this response.
const NOT_FOUND_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, follow"/>
<title>الصفحة غير موجودة | ALTUSplace</title>
</head>
<body>
<h1>404</h1>
<p>الصفحة غير موجودة.</p>
</body>
</html>`;

const NOT_FOUND_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=60, s-maxage=300",
  "x-robots-tag": "noindex",
};

export async function middleware(request: Request): Promise<Response | undefined> {
  const userAgent = request.headers.get("user-agent") || "";
  const isBot = BOT_USER_AGENT.test(userAgent);

  const url = new URL(request.url);

  if (!isBot) {
    // Real users: let known SPA routes fall through to the catch-all rewrite.
    // Undeclared paths are hard 404s (no SPA shell, no inline JS).
    if (classifySpaPath(url.pathname) === "known") return undefined;
    return new Response(NOT_FOUND_HTML, { status: 404, headers: NOT_FOUND_HEADERS });
  }

  const prerenderUrl = new URL("/api/prerender", url.origin);
  prerenderUrl.searchParams.set("path", url.pathname);

  const response = await fetch(prerenderUrl, {
    headers: { "x-prerender": "1", "user-agent": "ALTUSplace-Prerender" },
  });

  // 4xx (including 404 for missing listings/undeclared paths) must be
  // forwarded so crawlers see the real status. Only degrade to the SPA shell
  // when the prerenderer itself is failing (5xx).
  if (response.status >= 500) return undefined;

  const robots =
    response.headers.get("x-robots-tag") || (response.status === 404 ? "noindex" : "");

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": response.headers.get("cache-control") || "public, max-age=300, s-maxage=3600",
      "x-prerender": "1",
      ...(robots ? { "x-robots-tag": robots } : {}),
    },
  });
}