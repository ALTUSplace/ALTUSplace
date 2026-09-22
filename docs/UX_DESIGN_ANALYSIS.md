# ALTUSplace · UI/UX Design Analysis & Conversion System

> Status: baseline review — Phase 1 implemented. Date: 2026-09-22.
> Scope: Booking.com, Airbnb, Kayak pattern analysis → the ALTUSplace
> high-converting interface for car rentals + real estate.

---

## 1. Why these three references

| Platform | Core strength to borrow |
|---|---|
| **Booking.com** | Search-first UX, one action colour, trust/urgency near the price, sticker-quality clarity of price & cancellation |
| **Airbnb** | Photo-led cards, full-bleed hero with a centred search pill, wishlist + ratings, host-acquisition pages that convert |
| **Kayak** | Tabbed vertical search (Flights/Hotels/Cars), filters-as-a-drawer, price intelligence, comparison |

ALTUSplace sells two verticals (car rental, real estate) — the exact situation
Kayak solves with tabs, Booking solves with fields, and Airbnb solves with
desire-driven imagery. The recipe combines all three.

---

## 2. Pattern-by-pattern analysis

### 2.1 Booking.com

1. **One action colour.** Booking's famous blue (`#003B95` family) appears on
   every primary CTA, everywhere. No competing CTAs. → ALTUSplace already has a
   single Deep Trust Blue (`--accent-primary #1A56DB`) — the rule is: **every
   primary action uses it, nothing else becomes primary** (raw `#D4AF37`
   hero-CTA hexes found in `Home.tsx` violate this and were fixed).
2. **Search-first.** Destination → contiguous date range → guests → one blue
   button; advanced options are progressive disclosure. → ALTUSplace keeps
   city → pickup → return → one blue Search.
3. **Validation & feedback.** Booking refuses impossible ranges and explains
   why. → `SearchBar` validates return ≥ pickup (inline error + toast).
4. **Trust adjacent to price.** Scores ("9.0 Wonderful"), "Free cancellation"
   in green, scarcity ("Only 2 left"). → ALTUSplace shows rating chips and a
   verified-partner badge next to price, plus "secure, guaranteed bookings"
   microcopy under the hero CTA. **No fabricated scarcity/statistics** — the
   project's production constraint forbids invented numbers.
5. **Results.** Photo cards, rating chip overlapping the photo, price tucked
   right. → mirrored in `ListingCard` (rating chip + price chip on media).
6. **Mobile.** Filter chips + sticky bottom deals bar → `BottomNavigationBar`
   + sticky bottom CTA pattern already in place.

### 2.2 Airbnb

1. **Full-bleed hero + search pill.** "Anywhere · Any week · Add guests" is a
   single affordance that promises the whole product. → ALTUSplace hero keeps
   the search widget as the largest single element on the page.
2. **Photo-led cards.** 16:10 media, generous whitespace, wishlist heart,
   rating + review count. → `ListingCard` (hover gallery, heart, price chip,
   rating overlay).
3. **Host acquisition (Become-a-Host).** "How it works" in three steps, clear
   earnings model, one CTA. → new `PartnerWithUs` flow structure (3 steps:
   register → review/approval → go live).
4. **Trust markers.** Verified / "Guest favorite" / Superhost badges → partner
   "verified" badge on cards (Phase 2 ListingCard work).

### 2.3 Kayak

1. **Tabbed verticals.** Flights | Hotels | Cars switch the whole field set.
   → ALTUSplace hero search uses **Cars | Properties** tabs.
2. **Search bar persists on results.** The query bar stays editable on the
   results page. → compact `SearchBar` added to `/search`.
3. **Filters as a drawer** with price bands; results density; comparison →
   sidebar filters + compare modal already exist on `/search`.
4. **Date+time for cars.** Cars need pickup/dropoff dates (times matter less
   for daily rentals — kept optional, dates first).

---

## 3. Current-state audit (ALTUSplace)

### 3.1 Already strong (keep)
- Deep Trust Blue token system, dark mode, RTL/LTR logical properties
  (`client/src/index.css`).
- `OptimizedImage` srcset/sizes/lazy-loading; skeleton/error/empty states.
- Lazy route loading, font preconnect + anti-FOUC in `index.html`.
- Mobile bottom nav, ≥44px touch targets, `prefers-reduced-motion` support.
- `/search` sidebar filters, map view, compare, quick-view, URL state sync.

### 3.2 Defects found (Phase 1 — fixed)
| File | Issue | Fix |
|---|---|---|
| `components/CatalogShowcase.tsx` | Mojibake (double-encoded Arabic) across ~12 strings; stale copy mentioning removed car fleet | Rewrote strings in clean UTF-8; aligned copy with apartments-only catalog |
| `pages/Search.tsx` | Hardcoded `dir="rtl"`; Arabic-only H1/description for EN | `dir` from context; i18n keys for title/subtitle; localized filter labels |
| `pages/Home.tsx` | Gold raw-hex hero CTA (`#D4AF37`) breaks single-action-colour rule | Deep Trust Blue `accent-clay` |
| `pages/PartnerWithUs.. /PartnerApply.. /AgencyOnboarding` | Off-brand green palette (`#102d2b`, `#f5b85b`, `#3B82F6`); hardcoded `dir="rtl"`; fabricated "45%" stat | Phase 2 restyle to tokens; stat removed in Phase 2 |
| `index.html` | No LCP preload/fetchpriority | Preload hero image + `fetchPriority="high"` |

### 3.3 Conversion gaps (roadmap)
| Gap | Phase |
|---|---|
| No search bar on `/search` results | 1 ✅ (compact `SearchBar`) |
| No date-range validation in hero search | 1 ✅ (`SearchBar`) |
| Catalog cards CTA stops at `/search`, never reaches a product page | 2 (deep-link adapter in `PropertyDetailWithVideo`) |
| Home featured-properties copy partially hardcoded AR | 1 ✅ (keys `featuredProperties*`) |
| Partner funnel off-brand + single long form | 2 (3-step layout + token restyle) |
| ListingCard rating outside the photo; no verified badge slot | 2 |

---

## 4. The ALTUSplace conversion rules (design decisions)

1. **One primary action colour** — Deep Trust Blue, everywhere, always.
2. **Search is the hero** — tabs (Cars | Properties) + city → pickup → return
   → Search; the bar persists on results.
3. **Dates are validated before you search** — impossible ranges never travel.
4. **Trust sits next to the price and the CTA** — platform guarantee, verified
   partner badge, rating as a score chip. Never fabricated numbers.
5. **Media leads** — photos at fixed aspect ratios, lazy + responsive, hover
   galleries, wishlist hearts.
6. **Every card ends in a real destination** — search hub now, deep product
   links in Phase 2.
7. **Mobile-first saved state** — bottom nav, sticky CTAs, 44px targets,
   skeletons, error/empty states.
8. **RTL/LTR by `dir` from context** — never hardcoded; use logical
   `start/end/inline` utilities.

---

## 5. Implementation roadmap

### Phase 1 (implemented)
- New shared `client/src/components/SearchBar.tsx` (hero + compact variants,
  tabs, date validation, trust microcopy).
- Home hero uses `SearchBar`; hero CTA recoloured; LCP `fetchpriority`.
- `/search` gains compact search bar; RTL/i18n fixes; date state wired into
  results.
- `CatalogShowcase` mojibake + copy fixed; `index.html` preload.
- New i18n keys (AR/FR/EN) in `LanguageContext.tsx`.

### Phase 2 (proposed)
- `PartnerWithUs` redesign: ink hero + "how it works" 3 steps + on-brand cards.
- `PartnerApply` restyle + grouped sections + sticky "what happens next" rail.
- `AgencyOnboarding` stat cleanup + token restyle.
- `ListingCard` verified badge + rating chip overlay.
- Catalog → `/property/:id` deep links via an adapter.

### Phase 3 (future)
- A/B-able hero variants, price-hint microcopy, referral/guest-count field,
  partner dashboard polish, copy deck for all three languages.

---

## 6. Guardrails (kept from `DESIGN_SYSTEM.md`)

- No synthetic ratings, reviews, or performance numbers in the UI.
- CMI/WhatsApp/email remain simulated until credentials land.
- CSS-only movement, accessible focus, reduced-motion respected.