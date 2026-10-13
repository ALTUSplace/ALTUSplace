# Architecture Decision Records

**Project:** ALTUSplace · **Decisions recorded:** Phase B + Phase C · **Status:** Accepted
**Last updated:** 2026-10-13 · **Owner:** Engineering
**Scope of this document:** the load-bearing "why" behind Phase B (security & trust) and Phase C
(lead idempotency, optimistic UX, design system, sanitization).

This file is written for two readers: an engineer onboarding to the codebase, and a reviewer
performing technical due diligence. Each record states the **context**, the **decision**, the
rationale, the alternatives **rejected**, the **trade-offs accepted**, and how the decision is
**verified** in the repository. Records are append-only and immutable in spirit: supersede, don't rewrite.

## Index

| ID | Decision | Phase | Status |
|----|----------|-------|--------|
| [ADR-001](#adr-001) | Remove simulated CMI payment entry points (rather than hide them) | B | Accepted |
| [ADR-002](#adr-002) | Ephemeral server-side lead idempotency (memory + optional Redis) | C · O3 | Accepted |
| [ADR-003](#adr-003) | Optimistic favorites via surgical cache updates | C · O2 | Accepted |
| [ADR-004](#adr-004) | Brand identity as Tailwind v4 CSS-first design tokens | C | Accepted |
| [ADR-005](#adr-005) | Domain-centric naming and comment sanitization | C · Prep | Accepted |

---

<a id="adr-001"></a>
## ADR-001 — Remove simulated CMI payment entry points

### Status
Accepted. Shipped in Phase B Final (commit `46da59a`, PR #71), following Phase A trust fixes (`3798ee6`, #70).

### Context
The platform previously exposed a **simulated** CMI (*Centre Monétique Interbancaire*) card flow: it
generated pseudo transaction references (e.g. `CMI-MA-<random>`) and rendered trust chrome such as
"Secure", "CMI Certified", and PCI-DSS claims — with **no acquirer integration and no funds moving**.
Presenting a regulated financial service that does not exist is a liability, not a demo.

### Decision
**Remove the simulated payment entry points from live user journeys**, rather than hide them behind
feature flags. Replace them with honest, non-financial fallbacks — lead capture and a bank-transfer
path. Retain the `cmi_card` value in the persisted payment-method enum so historical rows stay readable.

### Rationale
- **Honesty in UI state is non-negotiable.** A screen that says "payment successful" when no payment
  occurred is a misrepresentation, and misrepresenting a payment service carries chargeback/dispute
  and regulatory exposure that dwarfs any conversion benefit.
- **Deletion is auditable; hiding is not.** An unreachable flow can be re-enabled by a stray import or
  a flag flip. Removing the entry point makes the invariant structural.
- **Reversibility is preserved where it is safe:** the enum value stays, so we do not need a destructive
  migration to remain compatible with existing data.

### Alternatives rejected
- **Feature-flag the fake flow off.** Still ships the deceptive UI; flags drift and get re-enabled.
- **Keep the simulation, relabel it "demo".** Even a demo that accepts card numbers and prints a
  success receipt implies a financial service.

### Trade-offs accepted
- Users can no longer "simulate" a payment. Any real transaction requires a licensed acquirer
  integration and a secure test environment before go-live.
- The simulated components remain in the tree but are **no longer reachable**: `CMIPaymentModal.tsx`,
  `SecurePaymentModal.tsx`, and `PaymentCheckoutModal.tsx` have **zero importers** (verified by search).
  `PaymentStatusBadge` is still used by `Success.tsx`, but only maps `cmi_card` to a *display label*
  for status — it is not an entry point.
- Stale copy still references CMI in non-functional places: `PropertyDetailWithVideo.tsx:709`
  ("Paiement sécurisé via CMI"), the `Checkout.tsx` SEO description, and `LanguageContext` FAQ strings.
  These are **cosmetic residuals tracked for cleanup**, not payment entry points.

### Verification
- `git show 46da59a` — "remove fake CMI flows, implement safe lead-gen fallbacks".
- Search for the three simulated modals returns only their own definitions and test fixtures — no imports.
- `cmi_card` usage is confined to the DB enum, status-badge labels, and dead components.

### Future path
Integrate a licensed acquirer (CMI or an alternative) behind a real server-side payment intent, with
webhook verification, before accepting any money. Until then the product is explicitly lead-generation
and bank-transfer only. Delete the three dead components and the stale copy when they are no longer
needed as historical reference.

---

<a id="adr-002"></a>
## ADR-002 — Ephemeral server-side lead idempotency

### Status
Accepted. Shipped in Phase C O3 (commit `ca5a579`, PR #78).

### Context
`requestListing.create` fires an admin alert/email on every accepted submission. A double-click, a
client retry after a flaky connection, or an at-least-once network hop produced **duplicate admin
notifications for a single user intent**. The notification layer's `dedupeKey` collapses repeats for
one phone number, but it cannot distinguish "the same click twice" from "a legitimate second request
for the same property at a different time".

### Decision
Introduce a short-lived **idempotency ledger** (`server/_core/idempotency.ts`) and claim a key
**before** performing the side effect:

- Key is scoped per intent **and** per identity: `` `lead:${requestId}:${canonicalPhone}` ``.
- Storage is ephemeral by design — **no database writes, no migration** at this phase:
  - When a shared Redis (Upstash REST) is configured, a claim is a single atomic `SET key 1 NX EX ttl`.
  - Otherwise it falls back to a **bounded in-process `Map`** (cap `5_000` entries), whose read-then-write
    is fully synchronous so a same-tick burst cannot interleave.
- A duplicate short-circuits with `{ success: true, duplicate: true }` and **emits no email or notification**.
- The admin-alert call site is unchanged: it keeps `dedupeKey: lead:<canonicalPhone>` as a second layer.
- `requestId` is **optional** on the input; when absent the server logs a warning and skips dedupe
  (fully backward compatible with older clients).

### Rationale
- **MVP speed without schema risk.** A DB table with a unique index is the "correct" long-term answer but
  costs a migration, a retention job, and new failure modes — disproportionate for a low-volume lead form.
- **The side effect is the thing being deduplicated**, so the claim must precede `alertAdmins`. Claiming
  after the alert would be pointless.
- **Fail-open, never fail-closed.** The mutation has a "never throws" contract: if the shared store errors,
  the claim falls back to memory and **lead delivery still succeeds**. Dropping a real lead is worse than
  a rare duplicate.

### The compile-target constraint (why `Map#forEach`)
The repository's root `tsconfig.json` does not set `target`, so TypeScript defaults to ES5, and iterating
a `Map` with `for...of` or spread raises **TS2802** (*"can only be iterated through when using
`--downlevelIteration`"*). Rather than change the global compiler configuration for one utility, we adopted
the iteration idiom already used elsewhere in the repo (`server/_core/security.ts`):

```ts
// Rejected — TS2802 under the repo's default ES5 target
for (const [key, expiresAt] of memoryLedger) {
  if (expiresAt <= now) memoryLedger.delete(key);
}
```

```ts
// Adopted — server/_core/idempotency.ts, consistent with server/_core/security.ts:19
memoryLedger.forEach((expiresAt, key) => {
  if (expiresAt <= now) memoryLedger.delete(key);
});
```

### The claim, in code
```ts
// Shared store when configured: atomic first-writer-wins
const acquired = await client.set(`idempotency:${key}`, "1", { nx: true, ex: seconds });
if (acquired === null) return "duplicate"; // NX declined → someone else claimed it
return "claimed";
```

```ts
// server/routers.ts — claim BEFORE the side effect
const claim = await claimOnce(`lead:${input.requestId}:${canonicalPhone}`);
if (claim === "duplicate") {
  logger.info("[requestListing] Duplicate suppressed", { requestId: input.requestId });
  return { success: true as const, duplicate: true as const };
}
await alertAdmins({ /* ... */, dedupeKey: `lead:${canonicalPhone}` });
return { success: true as const, duplicate: false as const };
```

```tsx
// client/src/components/ui/LeadCaptureCard.tsx — one id per attempt, reused on retry
if (submitLeadRequest.isPending) return;              // guard against a queued second click
const requestId = requestIdRef.current ?? nanoid();   // reuse across retries, fresh per attempt
requestIdRef.current = requestId;
```

### Trade-offs accepted
- **Per-instance, not global, in the default configuration.** This project's production environment has
  no Redis provisioned, so the in-process path runs. It reliably catches "the same visitor double-clicks
  the same warm instance" and is **best-effort across serverless instances** — it is not a distributed lock.
- The TTL (5 minutes) defines the dedupe window; a legitimate repeat after the window is treated as new.
- Bounded memory (5,000 entries, evicting oldest-expiring first) trades exactness for a hard memory ceiling.

### Verification
- `server/_core/idempotency.test.ts` — 10 tests, including: first claim wins, NX miss is a duplicate,
  Redis outage falls back instead of throwing, and the memory cap holds.
- `server/lead-request.idempotency.test.ts` — 5 tests: a rapid double-submit and a concurrent double-submit
  each produce **exactly one** admin alert; a different `requestId` is a genuinely new lead; a reused
  `requestId` cannot suppress a *different* lead.
- Full suite green locally and in CI (`pnpm check` → 0 errors; `pnpm test` → 1088 passed / 2 skipped).

### Future path
Set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` to upgrade dedupe from best-effort to
**guaranteed across instances with no code change**. If volume or auditability demands persistence,
Phase D replaces the ledger with a DB table + unique index (durable, queryable, cross-instance).

---

<a id="adr-003"></a>
## ADR-003 — Optimistic favorites via surgical cache updates

### Status
Accepted. Shipped in Phase C (commit `4c8bb75`, PR #77; engine in `c18511b`, #76).

### Context
Toggling a favorite previously invalidated the whole `favorites.list` query and refetched it. On a slow
connection the heart visibly flickered — the optimistic state was thrown away, a spinner replaced it,
and the list re-rendered when the server answered.

### Decision
Express a toggle as an **optimistic transform of the cached collection** using the shared mutation engine
(`client/src/lib/optimistic.ts` → `queryClient.setQueryData`), with rollback on error and **no full-list
invalidation** (`invalidateOnSettled: false`). Keep the favorite-specific cache logic as **pure reducers**
in `client/src/lib/favoritesCache.ts` (`FAVORITES_LIST_QUERY_KEY`, add/remove-by-listing-id), and wire them
to the engine from `useFavorites`.

### Rationale
- **Perceived latency drops to ~0** for a toggle because the UI never waits on the network to reflect intent.
- **Less server load**: no refetch of an entire list to change one row.
- **Testability drove the split.** `favoritesCache.ts` deliberately imports no React, tRPC, or toast code,
  so its reducers and cache wiring run in the **Node test environment — no jsdom required**. Pinning the
  exact query key ensures `setQueryData`/`cancelQueries` address the entry the `useQuery` observer subscribes to.

### Alternatives rejected
- **Keep invalidate-and-refetch.** Simplest, but reintroduces flicker and refetch cost — the exact bug.
- **Local component state for the heart.** Correct-looking but diverges from the server as the source of
  truth and breaks across components/routes that read the same query.

### Trade-offs accepted
- Rollback logic is now required on failure (handled centrally by the engine, so the cost is paid once).
- The cache shape is a contract: mutating `favorites.list` outside the reducers risks drift. Centralizing
  the key and reducers in one module is what keeps that contract honest.

### Verification
- `client/src/lib/favoritesCache.test.ts` and `client/src/lib/optimistic.test.ts` run in the Node environment.
- Engine behavior proven by tests: optimistic apply, rollback on error, no settle-time invalidation.

### Future path
Reuse the same engine/reducer pattern for other toggles (saved searches, watch flags) instead of inventing
per-feature cache code.

---

<a id="adr-004"></a>
## ADR-004 — Brand identity as Tailwind v4 CSS-first design tokens

### Status
Accepted. Shipped in Phase C (commit `908dd6d`, PR #75).

### Context
The UI used generic template colors. Establishing a distinct Moroccan-luxury identity across hundreds of
components could not be done by hand-patching utility classes — that produces inconsistency and churn.

### Decision
Adopt a **Tailwind v4 CSS-first** approach: declare the palette once as CSS custom properties in
`client/src/index.css` and expose them to utilities via `@theme inline`. The brand tokens are:

| Token | Value | Role |
|-------|-------|------|
| `--accent-primary` | `#0F4C81` | Navy — primary brand color (comments: "Primary Blue") |
| `--accent-primary-h` / `-s` | `#0B3D6B` / `rgba(15,76,129,.10)` | Hover / subtle tint |
| `--accent-warm` | `#D4AF37` | Gold — premium accents, ratings, badges |
| `--accent-warm-h` / `-s` | `#B8962E` / `rgba(212,175,55,.12)` | Hover / subtle tint |

Components consume semantic aliases (`--color-primary`, `--color-primary-foreground`, etc.) that resolve
through these primitives, and `client/src/lib/designTokens.ts` mirrors the values for non-CSS consumers
(e.g. canvas/map code).

### Rationale
- **One source of truth.** Changing the brand color is a one-line CSS edit that propagates everywhere;
  no hunt for hardcoded hexes.
- **Theme-correct by construction.** Semantic aliases resolve per theme, so new components inherit correct
  light/dark behavior instead of re-deriving it.
- **Moved away from generic template colors** to a specific identity (navy/gold), which is a positioning
  decision as much as a visual one.

### Constraint handling (WCAG AA)
The palette change had to clear the existing accessibility gates, not bypass them. The contrast gate
(`tests/unit/color-contrast.test.ts`) was **extended, not loosened**: PR #75 **added** a brand-gold badge
check (`--accent-gold-dark` on `--accent-gold-light`, ≥ 4.5:1) and corrected a stale ratio in a comment
(the light accent moved from `#1A56DB` (6.18:1) to `#0F4C81` (8.86:1) on white). The **AA floor of 4.5:1
was retained**, and the primary-button check still asserts `--color-primary-foreground` resolves through
`--primary-ink` rather than a hardcoded white. The separate 44 px **touch-target floor**
(`tests/unit/touch-target-floor.test.ts`) was **not modified** by this change (it was set earlier, in `7bdfa1e`).

> Naming note: the marketing names "Deep Atlantic Blue" / "Palm Gold" **do not appear in the codebase**.
> The tokens in code are `--accent-primary` / `--accent-warm`; treat any such marketing names as aliases
> for these tokens.

### Trade-offs accepted
- Contributors must use tokens/aliases, not raw hexes — a lint/social convention more than a hard rule.
- `designTokens.ts` duplicates the CSS values for non-CSS consumers; they must be kept in sync (and the
  contrast test guards the CSS side).

### Verification
- `tests/unit/color-contrast.test.ts` (AA 4.5:1 across light/dark pairs, plus the new gold badge case).
- `tests/unit/touch-target-floor.test.ts` (44 px floor) continues to pass unchanged.

### Future path
Add new semantic aliases only when a real second consumer appears; resist adding one alias per component.

---

<a id="adr-005"></a>
## ADR-005 — Domain-centric naming and comment sanitization

### Status
Accepted. Shipped in Phase C Prep (commit `bee18ca`, PR #74).

### Context
Generic identifiers (`name`, `phone`, `item`, `city`, `isCar`, `open`) and comments referencing earlier
phases made the code read like a scaffold rather than a product, and obscured domain meaning for
reviewers, partners, and future contributors.

### Decision
Rename identifiers to **domain vocabulary** and strip phase-artifact comments, applied where it improves
clarity without changing behavior. The Phase C Prep pass touched three files
(`client/src/components/ui/LeadCaptureCard.tsx`, `client/src/pages/Home.tsx`, `server/routers.ts`).
Representative renames from `LeadCaptureCard.tsx`:

| Before | After |
|--------|-------|
| `open` / `setOpen` | `isDialogOpen` / `setDialogOpen` |
| `name` / `setName` | `contactName` / `setContactName` |
| `phone` / `setPhone` | `contactPhone` / `setContactPhone` |
| `item` / `setItem` | `requestedAsset` / `setRequestedAsset` |
| `city` / `setCity` | `desiredCity` / `setDesiredCity` |
| `isCar` | `isVehicleRequest` |

### Rationale
- **Readability is a correctness aid.** `requestedAsset` states intent that `item` only implies; reviewers
  catch more with less context.
- **Domain-driven design**: names should come from the business language (asset, tenant, request), not from
  generic placeholders.
- **Removes the "generated code" stigma.** A repo that reads as intentional is easier to trust in
  due-diligence review.

### Trade-offs accepted
- Pure-churn diffs with no functional change; must be kept small and mechanical to stay reviewable (hence
  a focused three-file pass, not a sweeping rename).
- Trivial risk of shadowing/collision in a mechanical rename, mitigated by the type checker and tests.

### Verification
- Commit `bee18ca` is a 50-insertion/49-deletion rename-only diff; `pnpm check` and the suite stay green.

### Future path
Continue naming from the domain glossary as new modules appear. Where a concept has a canonical name
(e.g. a lead request vs. a booking), prefer the business term over a generic one.

> Accuracy note: the specific examples "`listings` → `availableAssets`" and "`user` → `tenantContext`"
> **do not exist in this repository** (search returns no matches). The renames above are the actual ones
> performed. The *principle* in this ADR stands; only those two example identifiers were aspirational.

---

## Appendix A — Verification commands

```bash
pnpm check   # tsc --noEmit → 0 errors
pnpm test    # vitest run → 1088 passed / 2 skipped (Node env; no jsdom needed for pure modules)
```

## Appendix B — Decision ledger (commits / PRs)

| ADR | Commit | PR | Summary |
|-----|--------|----|---------|
| 001 | `46da59a` | #71 | Remove fake CMI flows, safe lead-gen fallbacks |
| 002 | `ca5a579` | #78 | Server-side lead idempotency (O3) |
| 003 | `c18511b`, `4c8bb75` | #76, #77 | Optimistic mutation engine; optimistic favorites (O2) |
| 004 | `908dd6d` | #75 | Luxury brand identity system (navy/gold) |
| 005 | `bee18ca` | #74 | Domain-centric renaming & comment sanitization |
