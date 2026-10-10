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
import { and, avg, count, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { listings, reviews } from "../../drizzle/schema";
import { isCarCategory } from "../../client/src/lib/categories";
import { cityFromSlug, cityLabelFr } from "../../client/src/data/moroccoCities";
import { classifySpaPath } from "../../shared/routes/spaPaths";
import { SEO_SITE_URL } from "./sitemap";

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string,
  );
}

/**
 * Residential property types map to the concrete schema.org type Google
 * understands; everything else keeps `RealEstateListing`. Mirrors the client
 * (PropertyDetailWithVideo) so SSR and hydrated JSON-LD never disagree.
 */
const RESIDENTIAL_SCHEMA_TYPE: Record<string, string> = {
  apartment: "Apartment",
  apartment_share: "Apartment",
  studio: "Apartment",
  villa: "House",
  riad: "House",
};
function propertySchemaType(propertyType: string | null | undefined): string {
  return RESIDENTIAL_SCHEMA_TYPE[String(propertyType ?? "").toLowerCase()] ?? "RealEstateListing";
}

export type RouteMetadata = {
  title: string;
  description: string;
  image: string;
  type: string;
  robots: string;
  canonical: string;
  jsonLd?: Record<string, unknown>;
  /** True when the URL is not a real document: rendered as HTTP 404 + noindex. */
  notFound?: boolean;
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

/**
 * Ratings summary for a listing, or `null` when it has no usable reviews.
 *
 * The client pages already emit `aggregateRating` (CarDetails / PropertyDetail),
 * but Googlebot is proxied to the prerendered shell by `middleware.ts` and never
 * runs the SPA, so without this the rating never reached the crawler. A listing
 * with zero reviews must return `null` rather than a `ratingValue` of 0 —
 * Google treats a zero rating as a manual-action-grade rich-result error.
 */
async function ratingSummary(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  listingId: number,
): Promise<{ average: number; count: number } | null> {
  try {
    const [row] = await db
      .select({ average: avg(reviews.rating), total: count(reviews.id) })
      .from(reviews)
      .where(eq(reviews.listingId, listingId))
      .limit(1);
    const total = Number(row?.total ?? 0);
    if (total === 0) return null;
    // Postgres returns AVG() as a numeric string; Number() normalizes it.
    const average = Number(row?.average ?? 0);
    if (!Number.isFinite(average) || average <= 0) return null;
    // Round to 1dp so the structured value matches the figure the UI shows
    // instead of a 12-decimal float Google would round differently.
    return { average: Math.round(average * 10) / 10, count: total };
  } catch {
    return null;
  }
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
        pricePerMonth: listings.pricePerMonth,
        imageUrl: listings.imageUrl,
        images: listings.images,
        category: listings.category,
        city: listings.city,
        lat: listings.lat,
        lng: listings.lng,
        propertyType: listings.propertyType,
        rooms: listings.rooms,
        area: listings.area,
      })
      .from(listings)
      .where(and(eq(listings.id, id), inArray(listings.status, ["Published", "Available"])))
      .limit(1);
    if (!listing) return null;

    const isCar = isCarCategory(listing.category ?? "");
    const url = canonicalFor(`/${isCar ? "car" : "property"}/${id}`, origin);
    // Properties are priced per month and cars per day. Emitting the daily
    // price in a RealEstateListing Offer put the wrong number in the money
    // field, not merely an imprecise one.
    const price = isCar ? Number(listing.pricePerDay) : Number(listing.pricePerMonth ?? listing.pricePerDay);
    const unit = isCar ? "درهم / يوم" : "درهم / شهر";
    const priceLabel = `${price.toLocaleString("fr-MA")} ${unit}`;
    const gallery = listing.images?.length ? listing.images : listing.imageUrl ? [listing.imageUrl] : [];
    const image = gallery[0] || `${origin}/images/og-default.png`;
    const title = `${listing.title} | ALTUSplace`;
    const description =
      listing.description ||
      (isCar
        ? `استأجر ${listing.title} في ${listing.city} بسعر ${priceLabel} عبر ALTUSplace مع دفع آمن وتأمين شامل.`
        : `${listing.propertyType || "شقة"} للكراء في ${listing.city} بسعر ${priceLabel} عبر ALTUSplace مع دفع آمن.`);
    const cityFr = cityLabelFr(listing.city);
    const ratings = await ratingSummary(db, id);

    const node: Record<string, unknown> = {
      "@type": isCar ? "Product" : propertySchemaType(listing.propertyType),
      "@id": `${url}#listing`,
      name: listing.title,
      description,
      url,
      image: gallery.length ? gallery : [image],
      ...(isCar
        ? { sku: `car-${id}`, category: "Vehicles > Cars > Car Rentals" }
        : {
            ...(listing.propertyType ? { additionalType: listing.propertyType } : {}),
            ...(listing.rooms ? { numberOfRooms: listing.rooms } : {}),
            ...(listing.area
              ? { floorSize: { "@type": "QuantitativeValue", value: listing.area, unitCode: "MTK" } }
              : {}),
            address: {
              "@type": "PostalAddress",
              addressLocality: listing.city,
              ...(cityFr ? { addressRegion: cityFr } : {}),
              addressCountry: "MA",
              // Local SEO: coordinates are what let Google place the pin and
              // qualify the listing for "near me" style queries.
              ...(listing.lat != null && listing.lng != null
                ? { geo: { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lng } }
                : {}),
            },
          }),
      offers: {
        "@type": "Offer",
        priceCurrency: "MAD",
        price,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price,
          priceCurrency: "MAD",
          unitCode: isCar ? "DAY" : "MON",
        },
        availability: "https://schema.org/InStock",
        url,
        areaServed: { "@type": "City", name: listing.city },
        // Points at the Organization node declared in the document head, so the
        // offer is attributed to the site entity rather than a bare string.
        seller: { "@id": `${origin}/#organization` },
      },
      ...(ratings
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: ratings.average,
              reviewCount: ratings.count,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    };

    return {
      title,
      description,
      image,
      type: isCar ? "product" : "place",
      robots: "index, follow, max-image-preview:large",
      canonical: url,
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          node,
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "ALTUSplace", item: `${origin}/` },
              {
                "@type": "ListItem",
                position: 2,
                name: isCar ? "سيارات للكراء في المغرب" : "عقارات للكراء في المغرب",
                item: `${origin}/search`,
              },
              { "@type": "ListItem", position: 3, name: listing.title, item: url },
            ],
          },
        ],
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
    image: `${origin}/images/og-default.png`,
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
      notFound: true,
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

  if (path === "/properties/for-rent") {
    // Dedicated hub for the "شقق للكراء" head term. Without a branch here the
    // prerender would fall through to `base` and serve the homepage title and
    // description to Googlebot for this URL.
    return {
      ...base,
      title: "شقق للكراء في المغرب: أسعار واضحة وحجز آمن | ALTUSplace",
      description:
        "اكتشف شقق للكراء في المغرب: شقق مؤثثة وفلل ومكاتب للكراء الشهري في الدار البيضاء ومراكش وأغادير، مع وكالات محلية ودفع آمن عبر ALTUSplace.",
      image: `${origin}/images/og-default.png`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "شقق للكراء في المغرب",
        url: canonicalFor(path, origin),
        inLanguage: "ar-MA",
        isPartOf: { "@id": `${origin}/#website` },
        about: { "@id": `${origin}/#organization` },
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "ALTUSplace", item: `${origin}/` },
            { "@type": "ListItem", position: 2, name: "شقق للكراء", item: canonicalFor(path, origin) },
          ],
        },
      },
    };
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

  // The owner/admin login is auth-flow-only: noindex it in the prerendered
  // shell so crawlers never discover or index it (robots.txt also disallows
  // it, and the route guard redirects anonymous visitors to "/"). The renter
  // login, signup and terms pages are PUBLIC but still noindexed — they are
  // app surfaces, not SEO landing pages.
  const AUTH_ONLY_METADATA: Record<string, { title: string }> = {
    "/owner-login": { title: "دخول المالكين | ALTUSplace" },
    "/login": { title: "دخول المستأجرين | ALTUSplace" },
    "/register": { title: "إنشاء حساب | ALTUSplace" },
    "/terms": { title: "شروط الاستخدام | ALTUSplace" },
  };
  const authOnly = AUTH_ONLY_METADATA[path];
  if (authOnly) {
    return { ...base, title: authOnly.title, robots: "noindex, follow" };
  }

  // Undeclared URLs are NOT the SPA shell: the client router has no route for
  // them, so serving 200 + index, follow canonicalized this path was the
  // soft-404 hole Google flagged. Unknown paths now render a real 404 with
  // noindex and the homepage canonical so crawlers stop treating them as
  // distinct indexable documents.
  if (classifySpaPath(path) === "unknown") {
    return {
      ...base,
      canonical: `${origin}/`,
      robots: "noindex, follow",
      notFound: true,
    };
  }

  return base;
}

export type RenderedSpaDocument = {
  html: string;
  status: number;
  metadata: RouteMetadata;
};

/** Build the document head from resolved metadata (pure string transform). */
export function applyPrerenderMetadata(template: string, metadata: RouteMetadata): string {
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

/**
 * Render the SPA shell for `url`, returning the HTML plus the HTTP status the
 * document merits (404 for undeclared/not-found URLs, 200 otherwise). Both
 * `serveStatic`/Vite fallbacks and the `/api/prerender` edge target use this so
 * crawlers and real users see the same status for the same URL.
 */
export async function renderSpaDocument(
  template: string,
  url: string,
  origin: string = SEO_SITE_URL
): Promise<RenderedSpaDocument> {
  const metadata = await resolveRouteMetadata(url, origin);
  return {
    html: applyPrerenderMetadata(template, metadata),
    status: metadata.notFound ? 404 : 200,
    metadata,
  };
}

/** Prerender target used by tests that only need the enriched HTML. */
export async function injectPrerenderMetadata(
  template: string,
  url: string,
  origin: string = SEO_SITE_URL
): Promise<string> {
  return (await renderSpaDocument(template, url, origin)).html;
}
