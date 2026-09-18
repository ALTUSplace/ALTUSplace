/**
 * Vercel Edge Middleware: prerender proxy for crawlers and social bots.
 *
 * The app is a client-rendered SPA served from a static `index.html`. When a
 * known bot requests a page we rewrite the request to `/api/prerender`, which
 * returns the SPA shell enriched with route-specific title/description/OG,
 * canonical and JSON-LD. Real users and assets are untouched.
 *
 * `middleware.ts` runs on Vercel only; it is intentionally outside
 * tsconfig.json's include (compiled by Vercel's edge runtime).
 */
const BOT_USER_AGENT =
  /bot|crawler|spider|crawling|facebookexternalhit|facebot|slackbot|twitterbot|whatsapp|telegrambot|linkedinbot|pinterest|googlebot|bingbot|yandex|duckduckbot|baiduspider|applebot|discordbot|embedly|redditbot|skypeuripreview/i;

export const config = {
  matcher: "/((?!api|assets|_next/static|_next/image|favicon.ico|.*\\..*).*)",
};

export async function middleware(request: Request): Promise<Response | undefined> {
  const userAgent = request.headers.get("user-agent") || "";
  if (!BOT_USER_AGENT.test(userAgent)) return undefined;

  const url = new URL(request.url);
  const prerenderUrl = new URL("/api/prerender", url.origin);
  prerenderUrl.searchParams.set("path", url.pathname);

  const response = await fetch(prerenderUrl, {
    headers: { "x-prerender": "1", "user-agent": "ALTUSplace-Prerender" },
  });
  if (!response.ok) return undefined;

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": response.headers.get("cache-control") || "public, max-age=300, s-maxage=3600",
      "x-prerender": "1",
    },
  });
}
