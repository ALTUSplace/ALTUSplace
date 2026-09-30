# Release governance

Standing rules for what has to happen **by hand** around a release. This exists
because nothing in the deploy pipeline applies migrations. That is a deliberate
current state, not an oversight — see [Why this is a human gate](#why-this-is-a-human-gate).

Last reviewed: 2026-09-27, alongside the Phase 1 runner hardening (PR #17).

---

## 1. The rule

**If a release diff adds, edits, renames, or deletes any `drizzle/*.sql` file, a
human must run the migration and confirm it against a checklist before that release
is considered done.**

No exceptions for "small" migrations, hotfixes, or migrations you believe are
no-ops. A migration that turns out to need no work still has to be shown to need
no work.

### Why the trigger is the diff, not the merge

The failure mode this guards against is specific and has already happened once. On
2026-09-26, `drizzle/0020_detailed_ratings.sql` was committed but never added to
`drizzle/meta/_journal.json`, so the runner never applied it. The site stayed up
and served HTTP 500s on review pages until someone read a log. The file existed in
the repo the whole time, fully reviewed, and was invisible to every system that
mattered.

A rule keyed on "did we merge a migration" or "did anyone remember" does not
prevent that. A rule keyed on **the diff contains a `.sql` file** cannot miss it,
because the file is right there in the change.

---

## 2. The confirmation checklist

Run in order. Do not skip to the end because the first few looked fine.

### Before

- [ ] `pnpm install --frozen-lockfile`
- [ ] `MIGRATION_DATABASE_URL` points at a **session pooler (port 5432)** or a
      direct connection. It must **not** be the transaction pooler. See
      [§4 Connection requirements](#4-connection-requirements).
- [ ] You know which production database you are pointed at, and you have
      confirmed the host. The runner will not ask.

### Apply

- [ ] `pnpm db:migrate` exits 0.
- [ ] The output ends with `migrations applied/recorded: N/N` where `N` equals the
      entry count in `drizzle/meta/_journal.json`.
- [ ] `[migrate] advisory lock acquired (key 0x616c74757370)` appears in the
      output. Its **absence**, or a message containing
      `another migration run holds the advisory lock`, means this run refused
      itself rather than interleaving. The runner uses `pg_try_advisory_lock`, so
      it fails fast instead of queueing. **Do not retry in a loop** — find the
      other run first. Two simultaneous migrations is the exact race the lock
      exists to prevent, and the refusal is the guard working, not a flake.
- [ ] Each object the migration creates shows as `added`, not skipped. A migration
      that silently skips most of its statements has failed, whatever the exit code.

### Verify — read-only, on the live database

These are the checks that would have caught the 2026-09-26 incident.

- [ ] The new columns/tables/constraints exist, by name, in `information_schema`
      or `pg_constraint`. Not inferred from the runner's own output — queried
      independently, because the runner's output is what failed last time.
- [ ] `SELECT count(*) FROM "drizzle"."__drizzle_migrations";` matches the journal
      entry count. Ledger and reality agree.
- [ ] Re-run, **by hand**, the application queries the migration supports. For the
      2026-09-26 migration these were the two review-summary queries in
      `docs/incident-reviews-schema.md` §Step 5. A migration that applies cleanly
      can still leave a query broken; that was the second stacked bug in the same
      incident, an invalid `CHECK (a) AND (b)` that no migration runner can detect.
- [ ] The affected pages return 200, and an obviously-absent id still returns the
      clean not-found state rather than a 500.

### After

- [ ] The release is not marked done until the above is complete. A release that
      merged a migration without them is an open incident, not a slow one.

---

## 3. What CI does and does not do for you

Do not read a green `gates` run as "migrations are handled". It is not, and the
distinction is the reason this document exists.

| Check | Where | Blocks a release? | What it actually guarantees |
|---|---|---|---|
| `Migration journal completeness` | pre-commit hook **and** CI | **Yes** | Every `drizzle/*.sql` has a `_journal.json` entry. Fails loudly, naming the missing file. |
| `Migration schema parity (advisory)` | CI only | **No** — `continue-on-error: true` | All 19 migrations, replayed from scratch into a throwaway Postgres, produce a catalog matching `drizzle/schema.ts`. |
| `scripts/migrate.test.ts` | CI | Yes, as part of `gates` | 13 unit tests over the connection classifier and lock key. No database. |

Three things follow, and all three matter:

1. **Neither check runs the migration against production.** They run it against an
   ephemeral database, or not at all. Nothing in CI or in the Vercel build applies a
   migration to the live database. That is what §2 exists for.
2. **The parity gate cannot block anything.** Its step is
   `continue-on-error: true`, so a parity failure does not turn the job red. It is
   reported, and it does not stop a release. Promotion to blocking is a separate,
   deliberate decision that has not been made.
3. **The journal gate does block**, because it is inside the required `gates` job
   (see below). It is the only migration check with real enforcement.

### Branch protection on `main`, precisely

Verified against the GitHub API, not inferred:

- Required status checks: **`gates`**, and only `gates`.
- `enforce_admins: true` — this applies to admins too, so it cannot be bypassed by
  pushing as an owner.
- `allow_force_pushes: false`, `allow_deletions: false`.
- **No required pull-request review.** Once `gates` is green, a human can merge
  without a second reviewer. That is a real gap and it is the one that matters
  during an incident, when the temptation is to merge fast and look later.

**A direct push to `main` is therefore not possible.** The required check only ever
attaches to a pull request, so a push that skips a PR can never obtain a green
`gates` and is rejected by the server. This is worth knowing before anyone tries to
ship a hotfix by pushing straight to `main` — including this document, which had to
go through a pull request for that reason.

> The comment at `.github/workflows/ci.yml:22-23` says a required-checks rule is
> still future work. **That comment is stale** — the rule exists and is enforced.
> The comment is left as-is here to keep this change to one file, but do not trust
> it over the API.

Parity compares **index names last** — it ignores the name, and still compares
method, columns, and uniqueness. It does **not** ignore CHECK constraint names;
that extension is a separate pending decision, not yet made.

---

## 4. Connection requirements

The runner **refuses** to apply migrations over a transaction-mode connection. This
is a hard guard, and it is not a warning:

```
refusing to migrate over a transaction-mode connection: port 6543 is
Supabase's transaction-mode pooler (PgBouncer), which cannot run DDL safely.
```

It refuses because session state does not survive a transaction boundary there, so
the advisory lock that serialises concurrent runs would be **silently ineffective**.
The protection would appear to be working while doing nothing.

| Variable | Purpose | Must be |
|---|---|---|
| `MIGRATION_DATABASE_URL` | **Migrations only.** Preferred by the runner. | Session pooler, port 5432, or direct |
| `DATABASE_URL` | Application traffic. Fallback only. | Transaction pooler, port 6543 |

**Never put a migration URL in `DATABASE_URL`.** That variable serves live traffic
and is transaction-mode by design. Mixing them reintroduces the failure the guard
exists to prevent.

`MIGRATION_ALLOW_TRANSACTION_POOLER=1` is the escape hatch. It restores the
pre-Phase-1 behaviour, which means **migrations are no longer serialised** and
concurrent runs are no longer prevented. Use it when a migration is genuinely
urgent and there is no alternative; do not let it become the normal path, and
record that it was used.

### ⚠️ Known gap: the Vercel variable does not unblock a local run

`MIGRATION_DATABASE_URL` has been provisioned **in Vercel's environment variables**
as a session-pooler URL. That satisfies the prerequisite for a future CI or
deploy-side job, but it does **not** currently help a developer's machine, because
Vercel environment variables are not visible to a local shell.

To run `pnpm db:migrate` locally you still need one of:

- `MIGRATION_DATABASE_URL` exported in your own shell, or
- the `MIGRATION_ALLOW_TRANSACTION_POOLER=1` escape hatch above.

And nothing consumes the Vercel variable yet, because no deployment wiring exists
— see below.

---

## 5. Why this is a human gate

Three phases were scoped for closing the pipeline gap. **Only Phase 1 shipped.**

| Phase | Scope | Status |
|---|---|---|
| 1 | Make the runner safe: advisory lock, per-migration transactions, pooler refusal | **Shipped**, PR #17 |
| 2 | A serialized CI job that applies migrations | **Not started.** Blocked. |
| 3 | Ordering migrations against the Vercel deploy | **Not started.** Blocked. |

Phases 2 and 3 must not begin until the blockers in **#14** are closed. The
reasoning is not caution for its own sake: automated invocation turns a latent
runner bug into an incident that repeats on *every push*, and the failure modes
that would do that are precisely the ones not yet proven.

What Phase 1 fixed, in the runner:

- **Concurrency.** A session advisory lock (`pg_try_advisory_lock`, fail-fast,
  released in `finally`). Key `0x616c74757370n` — the ASCII bytes of `altusp` —
  because advisory locks share one keyspace across every database on a server.
- **Atomicity.** Each migration's DDL and its ledger row now commit in the same
  transaction. Previously a crash between them left schema changes on the server
  that `__drizzle_migrations` did not know about, and the next run died on
  "already exists".
- **Pooler refusal.** As described in §4.
- **A PostgreSQL 12 floor**, enforced. Five of the nineteen migrations (`0003`,
  `0004`, `0006`, `0011`, `0012`) are `ALTER TYPE ... ADD VALUE`, which is illegal
  inside a transaction block before PG 12. Production is 17.6.

### What is still unproven — track it in #14

Recorded here so nobody reads "Phase 1 shipped" as "the runner is fully verified".

**Proven.** The transaction path, the advisory lock, and all nineteen migrations
including the five enum ones. The parity gate replayed the whole set from scratch
into a real Postgres 16 through the new transactional runner, 609/609 catalog lines,
`PARITY OK`. That closed the largest gap.

**Still unproven, and blocking Phases 2 and 3:**

- **B1-residual — a real Supabase session pooler.** The parity gate runs against
  `postgres:16-alpine` on a direct port. The actual session pooler has never been
  exercised. `MIGRATION_ALLOW_TRANSACTION_POOLER=1` was unit-tested at the
  classifier only; its end-to-end path was deliberately never run, because that
  would have connected to production.
- **B1-residual — genuine concurrency.** The lock has been acquired and released
  successfully. Two runners racing for it has never been observed. Nothing in CI
  attempts it.
- **B2 — local access.** The Vercel variable does not unblock local runs. See §4.

---

## 6. Pre-existing quirks — do not assume parity means correctness

The parity gate compares enum labels **and their order**, and it passes. That
agreement is partly coincidental, and it will not protect you from the underlying
defect.

`scripts/migrate.mjs` rewrites `ALTER TYPE ... ADD VALUE` and **drops the
`BEFORE`/`AFTER` clause**, so a label lands at the end of the enum instead of where
the migration file asked for it. Confirmed in production: `drizzle/0012` requests
`ADD VALUE 'partner' BEFORE 'user'`, and production reads
`renter,owner,admin,user,SUPER_ADMIN,partner` — `partner` last.

`drizzle/schema.ts` happens to declare `partner` in the position the runner
actually produced. The declared intent and the real schema are wrong in the same
way, which is exactly why nothing detects it. **If you reorder an enum in
`schema.ts` to match what the migration file says, parity will fail and the diff
will point at the wrong cause.** See #16.

Also open and unaddressed:

- **#15** — the `.env` fallback in `loadConnectionString` never matches this
  project's `.env` format (it is a bare `postgres://` string, and the regex
  requires a `KEY=` prefix). The file is dead code. Migrations have only ever run
  because the URL was passed as a process environment variable. Do not assume
  dropping the URL into `.env` works.
- **`drizzle/meta` is stale** — 8 snapshots, last one `0012` of 19. Drizzle-kit's
  own model is 11 migrations behind. Pre-existing, no issue filed yet.
- **`DEPLOYMENT_GUIDE.md` §2 step 4 is stale** — it says `pnpm db:migrate` applies
  pending migrations `0007` and `0008`. All 19 are applied. Left alone here to keep
  this change to one new file.

---

## 7. Related

- **#10** — the original request: deploy-time migrations plus journal-completeness
  and migration-parse tests.
- **#14** — Phase 1 record, and the authoritative blocker list for Phases 2 and 3.
- **#15** — `.env` fallback is dead code.
- **#16** — enum ordering follows run order, not the migration files.
- **`docs/incident-reviews-schema.md`** — the 2026-09-26 incident write-up, with
  the detailed one-off migration runbook referenced in §2.
- **`DEPLOYMENT_GUIDE.md`** — deployment steps. Migration material there predates
  the runner hardening in PR #17 and does not mention `MIGRATION_DATABASE_URL`.

---

## Deferred Follow-ups

- [ ] sitemap audit test needs `DATABASE_URL` or a mock — fails in env-less CI
      (`server/sitemap.audit.test.ts:22`)
- [ ] `users.email` unique constraint — pending dedup audit on production data
- [ ] zero-FK orphan audit — must precede any FK retrofit on populated tables
- [ ] `MIGRATION_DATABASE_URL` provisioned in Vercel/Railway dashboard — verify and
      check this box
- [ ] gitleaks or trufflehog secret scanner in CI — 20+ live secrets in
      `.env.production.local` with no automated protection
- [ ] `DIRECT_LOGIN_PASSWORD` emptied in production env — `server/_core/env.ts:59`
      warns; `DEPLOYMENT_GUIDE.md:79` requires removal before GA
- [ ] `bp-test` worktree cleanup — locked at `6b4c54c` with 561 staged deletions,
      needs manual resolution
- [ ] `C:\Users\kml\AppData\Local\Temp\opencode\wt-vis` leftover directory — manual
      cleanup
- [ ] `C:\Users\kml\Documents\altus-incident` leftover directory — manual cleanup
