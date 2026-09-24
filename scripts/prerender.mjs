/**
 * Build-time static prerenderer (runs after `vite build`).
 *
 * Writes a static HTML shell per marketing route into
 * `dist/public/<route>/index.html` (the home route overwrites
 * `dist/public/index.html`). Each shell keeps the exact SPA assets from the
 * built `index.html` so the client hydrates the same routes normally — but its
 * <head> is fully static and localized (Arabic default), so crawlers that do
 * not execute JavaScript see real metadata:
 *
 *   - <title>, meta description, canonical + x-default alternate, robots
 *   - Open Graph (og:title, og:description, og:image, og:type, og:url, …)
 *   - Twitter card tags
 *   - JSON-LD: WebSite on `/`, LocalBusiness per city page
 *
 * The inline anti-FOUC theme script and its surrounding CSS are preserved
 * byte-for-byte so the CSP sha256 guard (`scripts/verify-inline-script-hash.mjs`)
 * still passes. Only head metadata tags are swapped.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PUBLIC_DIR = resolve(ROOT, "dist", "public");
const TEMPLATE_PATH = resolve(PUBLIC_DIR, "index.html");

function readEnvFile(name) {
  try {
    return readFileSync(resolve(ROOT, name), "utf8");
  } catch {
    return "";
  }
}

/** Resolves VITE_SITE_URL the same way client/src/lib/seo.ts does. */
function resolveSiteUrl() {
  if (process.env.VITE_SITE_URL) return process.env.VITE_SITE_URL.replace(/\/+$/, "");
  const combined = [".env", ".env.local", ".env.production.local"].map(readEnvFile).join("\n");
  const match = combined.match(/^VITE_SITE_URL=(.*)$/m);
  const raw = match ? match[1].trim().replace(/^["']|["']$/g, "") : "https://altusplace.vercel.app";
  return raw.replace(/\/+$/, "") || "https://altusplace.vercel.app";
}

const SITE_URL = resolveSiteUrl();
const LOGO_URL = `${SITE_URL}/images/logo.png`;

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

/** The six prerendered city marketing pages, Arabic-default copy. */
const CITIES = [
  { slug: "casablanca", ar: "الدار البيضاء" },
  { slug: "marrakech", ar: "مراكش" },
  { slug: "agadir", ar: "أغادير" },
  { slug: "rabat", ar: "الرباط" },
  { slug: "tangier", ar: "طنجة" },
  { slug: "fes", ar: "فاس" },
];

function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: "ALTUSplace",
        inLanguage: "ar-MA",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "ALTUSplace",
        url: `${SITE_URL}/`,
        logo: LOGO_URL,
        areaServed: { "@type": "Country", name: "Morocco" },
        knowsLanguage: ["ar", "fr", "en"],
      },
    ],
  };
}

function cityJsonLd(city) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: `ALTUSplace — ${city.ar}`,
    url: `${SITE_URL}/city/${city.slug}`,
    image: LOGO_URL,
    description: `كراء السيارات والعقارات في ${city.ar} مع ALTUSplace: وكالات محلية، أسعار واضحة، وحجز سهل عبر الإنترنت.`,
    address: { "@type": "PostalAddress", addressLocality: city.ar, addressCountry: "MA" },
    areaServed: { "@type": "City", name: city.ar },
    priceRange: "MAD",
  };
}

/** Static + city routes in a stable order. `file` is relative to dist/public. */
const STATIC_ROUTES = [
  {
    path: "/",
    file: "index.html",
    title: "كراء السيارات والعقارات في المغرب | ALTUSplace",
    description: "احجز سيارات وعقارات للكراء في المغرب بضمان المنصة ودفع آمن: أسعار واضحة ووكالات محلية موثوقة.",
    jsonLd: websiteJsonLd(),
  },
  {
    path: "/search",
    file: "search/index.html",
    title: "كراء السيارات والعقارات في المغرب | ALTUSplace",
    description: "قارن عروض كراء السيارات والعقارات في جميع مدن المغرب بأسعار واضحة وحجز آمن عبر الإنترنت.",
  },
  {
    path: "/terms",
    file: "terms/index.html",
    title: "شروط الاستخدام | ALTUSplace",
    description: "شروط وقواعد استخدام منصة ALTUSplace لكراء السيارات والعقارات في المغرب: الحجز، الدفع، الإلغاء والتعويضات.",
  },
  {
    path: "/privacy",
    file: "privacy/index.html",
    title: "سياسة الخصوصية | ALTUSplace",
    description: "كيفية جمع ومعالجة بياناتك الشخصية في ALTUSplace وحماية معلوماتك عند كراء السيارات والعقارات بالمغرب.",
  },
  {
    path: "/conditions-utilisation",
    file: "conditions-utilisation/index.html",
    title: "شروط الاستخدام | ALTUSplace",
    description: "شروط وقواعد استخدام منصة ALTUSplace لكراء السيارات والعقارات في المغرب: الحجز، الدفع، الإلغاء، الضمان المالي والتعويضات.",
  },
  {
    path: "/politique-confidentialite",
    file: "politique-confidentialite/index.html",
    title: "سياسة الخصوصية | ALTUSplace",
    description: "كيفية جمع ومعالجة بياناتك الشخصية في ALTUSplace وحماية معلوماتك عند كراء السيارات والعقارات بالمغرب، وفق القانون رقم 09-08.",
  },
  {
    path: "/mentions-legales",
    file: "mentions-legales/index.html",
    title: "الإعلان القانوني | ALTUSplace",
    description: "المعلومات القانونية لمنصة ALTUSplace: الناشر، النشاط، الاستضافة، الملكية الفكرية والقانون المغربي المطبق.",
  },
  {
    path: "/blog",
    file: "blog/index.html",
    title: "مدونة ALTUSplace | دليل كراء السيارات والاستثمار العقاري في المغرب",
    description: "أدلة وافية حول كراء السيارات في الدار البيضاء ومراكش وأكادير، نصائح القيادة الآمنة، وفرص الاستثمار العقاري في طنجة.",
  },
];

const ROUTES = [
  ...STATIC_ROUTES,
  ...CITIES.map((city) => ({
    path: `/city/${city.slug}`,
    file: `city/${city.slug}/index.html`,
    title: `كراء السيارات والعقارات في ${city.ar} | ALTUSplace`,
    description: `اكتشف سيارات وعقارات للكراء في ${city.ar} مع ALTUSplace: وكالات محلية، أسعار واضحة، وحجز سهل عبر الإنترنت.`,
    jsonLd: cityJsonLd(city),
  })),
];

function link(rel, href, hreflang) {
  return `<link rel="${rel}"${hreflang ? ` hreflang="${hreflang}"` : ""} href="${escapeHtml(href)}">`;
}

function meta(name, content) {
  return `<meta name="${name}" content="${escapeHtml(content)}">`;
}

function og(property, content) {
  return `<meta property="${property}" content="${escapeHtml(content)}">`;
}

function renderHead(route) {
  const canonical = `${SITE_URL}${route.path === "/" ? "/" : route.path}`;
  const tags = [
    `<title>${escapeHtml(route.title)}</title>`,
    meta("description", route.description),
    meta("robots", "index, follow, max-image-preview:large"),
    link("canonical", canonical),
    link("alternate", canonical, "x-default"),
    og("og:type", "website"),
    og("og:site_name", "ALTUSplace"),
    og("og:title", route.title),
    og("og:description", route.description),
    og("og:image", LOGO_URL),
    og("og:image:width", "1000"),
    og("og:image:height", "558"),
    og("og:image:alt", `ALTUSplace — ${route.title}`),
    og("og:url", canonical),
    og("og:locale", "ar_MA"),
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(LOGO_URL)}">`,
    route.jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(route.jsonLd).replace(/</g, "\\u003c")}</script>`
      : "",
  ].filter(Boolean);
  return tags.join("");
}

/** Removes every per-route head tag; everything else (fonts, theme script) survives. */
function stripRouteHeadTemplate(template) {
  return template
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>/gi, "")
    .replace(/<link\s+rel="(?:canonical|alternate)"[^>]*>/gi, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "")
    .replace(/<meta\s+name="(?:geo\.[^"]*|keywords)"[^>]*>/gi, "")
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/gi, "");
}

function main() {
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const stripped = stripRouteHeadTemplate(template);

  for (const route of ROUTES) {
    const html = stripped.replace("</head>", `${renderHead(route)}</head>`);
    const output = resolve(PUBLIC_DIR, route.file);
    mkdirSync(resolve(output, ".."), { recursive: true });
    writeFileSync(output, html, "utf8");
    console.log(`[prerender] ${route.path} -> dist/public/${route.file}`);
  }
}

main();