# 🇲🇦 ALTUSplace

> Morocco's marketplace for car rentals, real estate, and office spaces.

[![Live Site](https://img.shields.io/badge/Live%20Site-altusplace.vercel.app-0A192F)](https://altusplace.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-D4AF37)](LICENSE)

## ✨ Features

- 🚗 Car rentals with KYC, insurance options, dynamic seasonal pricing
- 🏠 Real estate & office spaces with commercial lease contracts (PDF)
- 💳 Multi-gateway payments: CMI, Stripe Connect, PayPal, PayZone, PayTabs, Bank Transfer
- 🔄 iCal sync with Airbnb & Booking.com (hourly cron)
- 📱 WhatsApp Business API for instant agency alerts
- 🌐 Tri-lingual interface: Arabic (RTL), French, English
- 🔐 Role-based access: Renter / Partner / Admin / Super Admin
- ⚖️ Dispute resolution center with file attachments and mediation
- 📄 Auto-generated contracts & invoices (PDF with Arabic shaping + TVA)
- 🛡️ Row-Level Security via Supabase + Drizzle ORM

## 🏗️ Architecture

```
ALTUSplace/
├── client/        # Vite + React 19 + Tailwind 4 + tRPC
├── server/        # Express + tRPC v11 + Drizzle ORM
├── shared/        # Zod schemas shared client/server
├── drizzle/       # PostgreSQL migrations
├── supabase/      # RLS policies (rls.sql)
└── e2e/           # Playwright tests
```

## 🚀 Quick Start

```bash
git clone https://github.com/ALTUSplace/ALTUSplace.git
cd ALTUSplace
pnpm install
cp .env.production.example .env
# Fill: DATABASE_URL (Supabase), JWT_SECRET (>= 32 bytes)
pnpm db:migrate
pnpm dev
# Client: http://localhost:5173 | API: http://localhost:3000
```

## 🧪 Testing

```bash
pnpm test     # Vitest (35+ unit & integration tests)
pnpm check    # TypeScript strict mode
pnpm build    # Production build
```

## 🗺️ Feature verification status

The map, city-selector and regional-highlight work below was validated by
Playwright driving the **real production build** in Chromium. This section
records exactly what is proven and what is not, so nobody mistakes one for the
other.

### Fully verified (automated, reproducible)

| Area | Suite | Coverage |
| --- | --- | --- |
| City selector responsiveness | `verify-city-selector-responsive.mjs` | 37 checks @ 375/768/1024/1280: desktop dropdown shown only ≥1280, hamburger reachable, accordion expands to 71 options, filter narrows, empty state, selection navigates and closes the menu, zero feature-owned overflow |
| City selector layout | `audit-city-accordion-geometry.mjs` | 44px tap targets, no truncated labels, no rows outside the panel, popular group first, filter autofocused, list scrolls internally (3513px content in a 403px box) |
| No horizontal page scroll | `verify-horizontal-scroll.mjs` | drives `window.scrollTo` and asserts `scrollX` stays 0 — `documentElement.scrollWidth` over-reports in RTL and is *not* used as the signal |
| Header control clipping | `verify-navbar-clipping.mjs` | no header control clipped at any width (this suite caught a real 768px defect, see below) |
| Map clustering → popup → navigation | `verify-map-interactions.mjs` | 27 checks against 56 injected listings (39 cars / 17 properties across Casablanca, Rabat, Marrakech, Agadir, Tangier): source receives all 56 features, clustering active (`clusterMaxZoom` 13, `clusterRadius` 56), country zoom collapses to 2 clusters with 0 individual pins, cluster click zooms z10→z11.3 and re-renders children, largest cluster holds 22 points, point click opens a popup with title/city/price/CTA, and the CTA routes by type in **both** directions (`/car/1007`, `/property/1017`) |

Two guards are built into the suites rather than assumed:

- Cluster and pin clicks assert via `document.elementFromPoint` that the canvas
  really is the topmost element. The sticky header is a DOM element over the
  map, so a pin projecting near the canvas top silently eats the click — the
  suites now pick an unoccluded target instead of the first one.
- Fixtures are validated against the app's real `categories.ts` classifier
  before use, so a type-routing assertion cannot pass for the wrong reason.

### Unverified — blocked by the environment, not by the code

No database is reachable here (`getDb()` returns `null`; the server logs
`No database configured - skipping demo seed`), and the driver is
`postgres-js` only, so these paths were **never executed**:

- **The `listings.search` SQL itself.** The suite injects a fixture in place of
  the tRPC response. Radius, price, type and pagination filters are untested.
- **All seeding paths** — `server/demoSeed.ts`, `server/seed/demo-listings.ts`,
  `server/seed/reviews.ts` never ran.
- **The `search-radius` circle and the `onViewportChange` → `radiusKm`
  re-query loop** are rendered but not asserted.
- **`pageSize: 200`** has no real data behind it.
- **Fullscreen toggle**, **dark-mode repaint** (`setPaintProperty` on theme
  flip) and **geocoding / the `q` param** are not covered.
- **Auth-gated UI** (favorites, notifications, CMI, 2FA) is untouched.
- **Touch, real devices and other engines.** Only Chromium mouse events at
  desktop/tablet viewports; no iOS, Safari or Firefox.
- **Human visual sign-off.** Screenshots were captured, but the reviewing model
  cannot view images, so layout was asserted geometrically instead. Treat the
  visual design as unreviewed by a human.
- **Scale.** 56 synthetic points is not a real city. Mapbox's clustering is
  trusted beyond that, not measured.

### Known defect found while testing — since fixed

`client/src/lib/categories.ts` classified a category as a **car** unless it
matched `PROPERTY_HINTS`:

```ts
export function isCarCategory(category: string): boolean {
  return category === 'car' || !PROPERTY_HINTS.test(category);
}
```

Because that was a deny-list, any unlisted category was treated as a vehicle.
`محل تجاري` (shop) and `دار` (house) resolved to `car` and opened
`/car/<id>` — including through the map popup, which undermined the type-aware
routing above.

The client was also **not** mirroring the server, despite the comment claiming
so. `normalizeBookingCategory` used the opposite default ("car only if it looks
like one"), so the two disagreed on every value outside the intersection of their
word lists, and the server had the mirror-image bug: `سيدان عائلية / Sedan`, a
real option on the `AddCar` form, matched neither word list and was treated as a
stay.

Both now delegate to one module, `shared/listingCategory.ts`, which matches
vehicles positively and defaults to a stay:

- vehicles are matched by name (`سيارة`, `سيدان`, `suv`, `sedan`, `van`, …) with
  Latin terms word-bounded so `car` does not match inside `caravane`;
- every unrecognised value is a stay, so a missed *vehicle* word is the only
  remaining failure mode, and it is a visible one;
- the default is a stay because it is what decides which identity document
  `normalizeBookingCategory` demands — an unknown value must fail towards the
  requirement that asks for proof.

Two traps worth knowing about, both covered by tests:

- Arabic `ة` is written as U+0629 *or* U+062A in real data. They render
  identically, and a regex pinned to one silently misses the other — which is
  how `سيارة` came to miss half the car catalogue. The word lists use
  `[\u0629\u062A]` instead of a literal character.
- The car form stores labels, not the canonical value `car`, so a word list
  built only from seed data is not enough.

`tests/unit/listing-category.test.ts` is the contract: it pins the vocabulary,
parses `AddCar.tsx` and the seed/demo/dashboard sources so a new category cannot
be added without classifying it, and asserts the client and server agree on
every fixture. `scripts/probe-category-classifier.mjs` runs the same check
standalone, and the map interaction suite now includes `محل تجاري` and `دار` as
fixtures so the original misroute is guarded end to end.

## 📜 Legal

- Compliant with Moroccan Law 09-08 (CNDP data protection)
- Commercial lease contracts follow Moroccan legal framework
- Platform operates as technical intermediary only

## 📄 License

MIT © ALTUSplace

---
**Built with ❤️ in Morocco**