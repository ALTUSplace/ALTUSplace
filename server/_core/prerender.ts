/**
 * Crawler/social prerender metadata.
 *
 * The SPA is served from a static `index.html` on Vercel, so bots that do not
 * execute JavaScript would otherwise see the generic document. This module
 * resolves per-route metadata (title, description, Open Graph, canonical,
 * robots, JSON-LD) and injects it into the built HTML document.
 *
 * It is used by:
 *  - `serveStatic` (standalone Node runtime), injected in-process, and
 *  - `GET /api/prerender` (serverless), which fetches `/index.html` from the
 *    canonical origin and returns the enriched document to edge middleware.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { listings } from "../../drizzle/schema";
import { isCarCategory } from "../../client/src/lib/categories";
import { cityFromSlug, cityLabelFr } from "../../client/src/data/moroccoCities";
import { SEO_SITE_URL } from "./sitemap";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string,
  );
}

export type RouteMetadata = {
  title: string;
  description: string;
  image: string;
  type: string;
  robots: string;
  canonical: string;
  jsonLd?: Record<string, unknown>;
};

const DEFAULT_TITLE = "كراء السيارات والعقارات في المغرب | ALTUSplace";
const DEFAULT_DESCRIPTION =
  "احجز سيارات وعقارات للكراء في المغرب بضمان المنصة ودفع آمن: أسعار واضحة ووكالات محلية موثوقة.";

const BESPOKE_LOCATIONS: Record<string, { title: string; description: string }> = {
  "marrakech-car-rental": {
    title: "كراء السيارات في مراكش | ALTUSplace",
    description: "اكتشف سيارات موثوقة للكراء في مراكش، قرب المدينة القديمة، كليز والمطار.",
  },
  "mohammed-v-airport-car-rental": {
    title: "كراء السيارات في مطار محمد الخامس | ALTUSplace",
    description: "احجز سيارة عند الوصول إلى مطار محمد الخامس واستلمها بسهولة من شركاء ALTUSplace.",
  },
};

/** Public legal pages (French slugs, Arabic content) — crawlers get real metadata. */
const LEGAL_PAGES: Record<string, { title: string; description: string }> = {
  "/conditions-utilisation": {
    title: "شروط الاستخدام | ALTUSplace",
    description: "شروط وقواعد استخدام منصة ALTUSplace لكراء السيارات والعقارات في المغرب: الحجز، الدفع، الإلغاء، الضمان المالي والتعويضات.",
  },
  "/politique-confidentialite": {
    title: "سياسة الخصوصية | ALTUSplace",
    description: "كيفية جمع ومعالجة بياناتك الشخصية في ALTUSplace وحماية معلوماتك عند كراء السيارات والعقارات بالمغرب، وفق القانون رقم 09-08.",
  },
  "/mentions-legales": {
    title: "الإعلان القانوني | ALTUSplace",
    description: "المعلومات القانونية لمنصة ALTUSplace: الناشر، النشاط، الاستضافة، الملكية الفكرية والقانون المغربي المطبق.",
  },
};

function canonicalFor(pathname: string, origin: string): string {
  const clean = (pathname || "/").split(/[?#]/)[0] || "/";
  const normalized = clean === "/" ? "/" : clean.replace(/\/+$/, "");
  return `${origin}${normalized}`;
}

async function listingMetadata(id: number, origin: string): Promise<RouteMetadata | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [listing] = await db
      .select({
        title: listings.title,
        description: listings.description,
        pricePerDay: listings.pricePerDay,
        imageUrl: listings.imageUrl,
        category: listings.category,
        city: listings.city,
      })
      .from(listings)
      .where(and(eq(listings.id, id), inArray(listings.status, ["Published", "Available"])))
      .limit(1);
    if (!listing) return null;

    const isCar = isCarCategory(listing.category ?? "");
    const price = Number(listing.pricePerDay).toLocaleString("fr-MA");
    const title = `${listing.title} | ALTUSplace`;
    const description =
      listing.description ||
      (isCar
        ? `استأجر ${listing.title} في ${listing.city} بسعر ${price} درهم لليوم عبر ALTUSplace.`
        : `عقار للإيجار في ${listing.city} بسعر ${price} درهم عبر ALTUSplace.`);
    const image = listing.imageUrl || `${origin}/images/logo.png`;

    return {
      title,
      description,
      image,
      type: isCar ? "product" : "place",
      robots: "index, follow, max-image-preview:large",
      canonical: canonicalFor(`/${isCar ? "car" : "property"}/${id}`, origin),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": isCar ? "Product" : "RealEstateListing",
        name: listing.title,
        description,
        image: [image],
        ...(isCar
          ? { offers: { "@type": "Offer", priceCurrency: "MAD", price: Number(listing.pricePerDay), availability: "https://schema.org/InStock" } }
          : { address: { "@type": "PostalAddress", addressLocality: listing.city, addressCountry: "MA" } }),
      },
    };
  } catch {
    return null;
  }
}

export async function resolveRouteMetadata(pathname: string, origin: string = SEO_SITE_URL): Promise<RouteMetadata> {
  const base: RouteMetadata = {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    image: `${origin}/images/logo.png`,
    type: "website",
    robots: "index, follow, max-image-preview:large",
    canonical: canonicalFor(pathname, origin),
  };

  const path = (pathname || "/").split(/[?#]/)[0] || "/";
  const listingMatch = path.match(/^\/(car|property)\/(\d+)/);
  if (listingMatch) {
    const metadata = await listingMetadata(Number(listingMatch[2]), origin);
    if (metadata) return metadata;
    return {
      ...base,
      title: "الإعلان غير متاح | ALTUSplace",
      robots: "noindex, follow",
    };
  }

  const cityMatch = path.match(/^\/locations\/([^/]+)$/);
  if (cityMatch) {
    const bespoke = BESPOKE_LOCATIONS[cityMatch[1]];
    if (bespoke) return { ...base, ...bespoke };
    const city = cityFromSlug(cityMatch[1]);
    if (city) {
      const cityFr = cityLabelFr(city);
      return {
        ...base,
        title: `كراء السيارات والعقارات في ${city} | ALTUSplace`,
        description: `اكتشف سيارات وعقارات للكراء في ${city} (${cityFr}) مع ALTUSplace: وكالات محلية، أسعار واضحة، وحجز سهل.`,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "ALTUSplace", item: `${origin}/` },
            { "@type": "ListItem", position: 2, name: cityFr, item: canonicalFor(path, origin) },
          ],
        },
      };
    }
    return { ...base, title: "مدن المغرب | ALTUSplace" };
  }

  if (path === "/search") {
    return {
      ...base,
      title: "كراء السيارات والعقارات في المغرب | ALTUSplace",
      description: "قارن عروض كراء السيارات والعقارات في جميع مدن المغرب بأسعار واضحة وحجز آمن عبر الإنترنت.",
    };
  }

  if (path === "/locations") {
    return {
      ...base,
      title: "مدن المغرب: سيارات وعقارات للكراء | ALTUSplace",
      description: "تصفح العروض حسب المدينة في جميع أنحاء المغرب: من الدار البيضاء والرباط إلى أغادير والداخلة.",
    };
  }

  const legalPage = LEGAL_PAGES[path];
  if (legalPage) {
    return { ...base, ...legalPage };
  }

  // The owner/admin login is operator-only: noindex it in the prerendered shell
  // so crawlers never discover or index it (robots.txt also disallows it).
  if (path === "/owner-login") {
    return { ...base, title: "تسجيل الدخول المباشر | ALTUSplace", robots: "noindex, follow" };
  }

  return base;
}

export async function injectPrerenderMetadata(template: string, url: string, origin: string = SEO_SITE_URL): Promise<string> {
  const metadata = await resolveRouteMetadata(url, origin);
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="robots" content="${escapeHtml(metadata.robots)}">`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:type" content="${escapeHtml(metadata.type)}">`,
    `<meta property="og:site_name" content="ALTUSplace">`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}">`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}">`,
    `<meta property="og:image" content="${escapeHtml(metadata.image)}">`,
    `<meta property="og:url" content="${escapeHtml(metadata.canonical)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(metadata.image)}">`,
    metadata.jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(metadata.jsonLd).replace(/</g, "\\u003c")}</script>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const stripped = template
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta name="description"[^>]*>/i, "")
    .replace(/<meta name="robots"[^>]*>/i, "")
    .replace(/<link rel="canonical"[^>]*>/i, "")
    .replace(/<link rel="alternate"[^>]*>/gi, "");

  return stripped.replace("</head>", `${tags}</head>`);
}
