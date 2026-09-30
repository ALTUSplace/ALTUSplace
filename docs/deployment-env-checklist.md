# Production environment checklist

Every variable the server, migration runner and client read at runtime, with the
format each one must satisfy and the consequence of getting it wrong.

This file is derived from the code, not from memory. The "read at" column names
the file that consumes the variable; if you change how a variable is read, update
this table in the same commit.

**Sources of truth**

- `.env.production.example` — the tracked contract file, all values blank
- `server/_core/env.ts` — server-side reads, plus the production boot guards
- `server/db.ts` — database connection
- `scripts/migrate.mjs` — migration runner and its pooler guard
- `client/src/**` — `import.meta.env.*` reads, all `VITE_`-prefixed

**Never commit a real value.** `.gitignore` excludes `.env*`; only
`.env.production.example` is tracked. The new `secret-scan` CI job
(`.gitleaks.toml`) fails the build if a credential reaches a commit.

---

## 1. Required — the app refuses to boot without these

| Variable | Format | Read at | If wrong |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:6543/DB` | `server/db.ts`, `server/_core/env.ts:12` | Every request 500s. Falls back to `SUPABASE_DB_URL` if unset. |
| `JWT_SECRET` | **≥ 32 characters**, high entropy, no spaces | `server/_core/env.ts:64-69` | **FATAL — the process throws on boot.** `SECURITY: FATAL — JWT_SECRET is missing or shorter than 32 characters.` Also used as the cookie secret, falling back to `DIRECT_LOGIN_PASSWORD` if absent (`env.ts:8`). |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | `server/_core/env.ts:27` | Server-side Supabase calls fail. Falls back to `VITE_SUPABASE_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` (new) or `eyJ…` (legacy JWT) | `server/_core/env.ts:28` | Anything reading past RLS fails. **Server-only — never expose to the client.** |

## 2. Required for migrations — and it must be a different port

| Variable | Format | Read at | If wrong |
|---|---|---|---|
| `MIGRATION_DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:5432/DB` | `scripts/migrate.mjs:215` | `pnpm db:migrate` **refuses to run.** See the port rule below. |

### The port rule (this is the one that bites)

`scripts/migrate.mjs` inspects the connection string and **hard-fails** on
Supabase's transaction-mode pooler, because advisory locks do not work across
PgBouncer transaction pooling — two concurrent migration runs would each believe
they held the lock.

| Port | Mode | Usable for migrations |
|---|---|---|
| **5432** | session pooler / direct | ✅ **required** |
| **6543** | transaction pooler (PgBouncer) | ❌ refused |
| *absent* | defaults to 5432 | ✅ fine |

`6543` is additionally detected via a `?pgbouncer=true` query parameter
regardless of port (`migrate.mjs:55`).

The error you will see:

```
[migrate] REFUSING to run: MIGRATION_DATABASE_URL points at a transaction-mode pooler.
  Set MIGRATION_DATABASE_URL to a session-pooler (port 5432) or direct connection.
```

There is a deliberate escape hatch, `MIGRATION_ALLOW_TRANSACTION_POOLER=1`
(`migrate.mjs:215`), which logs a loud `WARNING` and proceeds. Do not set it in
production.

So: `DATABASE_URL` on 6543 (pooled app traffic) and `MIGRATION_DATABASE_URL` on
5432 (DDL) is the correct production pair. They are **not** interchangeable.

## 3. Must be empty in production

| Variable | Read at | Behaviour if set |
|---|---|---|
| `DIRECT_LOGIN_PASSWORD` | `server/_core/env.ts:59-63` | Enables a direct-login backdoor. In production the app **logs a warning and continues** — `SECURITY: direct-login backdoor enabled in production` — it does *not* refuse to boot. `DEPLOYMENT_GUIDE.md` §4 requires removing it before general availability, and disabling `POST /api/auth/direct-login` and `/owner-login` (404). |

Note the asymmetry: a short `JWT_SECRET` is fatal, but this backdoor only warns.
It will not stop a deploy. Removing it is a manual step.

## 4. Payments

| Variable | Read at | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `env.ts:38` | Server-only. Live keys start `sk_live_`. |
| `STRIPE_WEBHOOK_SECRET` | `env.ts:39` | From `stripe webhook` output, not the dashboard. Must match the endpoint's secret or signature verification fails silently. |
| `STRIPE_IDENTITY_SECRET_KEY` | `env.ts:33` | Only if using Stripe Identity. |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | `env.ts:34` | As above. |

## 5. Identity verification (pick one provider)

`VERIFICATION_PROVIDER` (`env.ts:31`) defaults to `manual`. The webhook secret
must match the selected provider, or callbacks fail signature verification.

| Variable | Read at | Notes |
|---|---|---|
| `VERIFICATION_PROVIDER` | `env.ts:31` | `manual` \| `stripe_identity` \| `persona`. |
| `VERIFICATION_WEBHOOK_SECRET` | `env.ts:32` | Provider-specific. |
| `PERSONA_API_KEY` | `env.ts:35` | Only for `persona`. |
| `PERSONA_WEBHOOK_SECRET` | `env.ts:36` | Only for `persona`. |

## 6. Translation (optional)

Defaults: provider `aws`, region `us-east-1`, **enabled** unless
`TRANSLATION_ENABLED=false` (`env.ts:45-51`). The feature is on by default, so an
unset provider with no credentials fails at request time rather than at boot.

| Variable | Read at | Notes |
|---|---|---|
| `TRANSLATION_ENABLED` | `env.ts:51` | Anything other than `"false"` enables it. |
| `TRANSLATION_PROVIDER` | `env.ts:45` | `aws` \| `google` \| `deepl` \| `none`. Use `none` to disable cleanly. |
| `AWS_REGION` | `env.ts:46` | Defaults `us-east-1`. |
| `AWS_TRANSLATE_ACCESS_KEY_ID` | `env.ts:47` | Required for `aws`. |
| `AWS_TRANSLATE_SECRET_ACCESS_KEY` | `env.ts:48` | Required for `aws`. |
| `GOOGLE_TRANSLATE_API_KEY` | `env.ts:49` | Required for `google`. |
| `DEEPL_API_KEY` | `env.ts:50` | Required for `deepl`. |

## 7. Caching (optional)

| Variable | Read at | Notes |
|---|---|---|
| `REDIS_ENABLED` | `env.ts:43` | **Enabled unless the value is exactly `"false"`.** Note the inverted sense. |
| `UPSTASH_REDIS_REST_URL` | `env.ts:41` | Upstash REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | `env.ts:42` | Server-only. |

## 8. Authorization

| Variable | Read at | Notes |
|---|---|---|
| `OWNER_OPEN_ID` | `env.ts:14` | Single owner account. Comma-separated ids in `SUPER_ADMIN_OPEN_IDS` (`env.ts:18`) for the rest. |
| `SUPER_ADMIN_OPEN_IDS` | `env.ts:18` | Comma-separated `openId` values. |
| `OWNER_WHATSAPP_PHONE` | `env.ts:15` | Digits-only international form, e.g. `2126XXXXXXXX`. |

## 9. Client-side — all `VITE_`-prefixed and therefore public

Anything in this table is **compiled into the JavaScript bundle** and is readable
by anyone who views source. Never put a secret here.

| Variable | Read at | Notes |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | client map components | Public by design; restrict by URL origin in the Mapbox dashboard. |
| `VITE_SUPABASE_URL` | `env.ts:27` (server fallback) | Project URL, not a secret. |
| `VITE_SUPABASE_ANON_KEY` | client data access | **Anon key, not the service role key.** RLS is the only thing protecting your data. |
| `VITE_APP_URL` | client | Canonical origin, e.g. `https://altusplace.vercel.app`. |
| `VITE_API_URL` | client | API base URL. |
| `VITE_CURRENCY_API_URL` | client | Exchange-rate endpoint. |
| `VITE_GA4_MEASUREMENT_ID` | client | GA4 property id, e.g. `G-XXXXXXXXXX`. |
| `VITE_META_PIXEL_ID` | client | Meta Pixel id. |
| `VITE_WHATSAPP_SUPPORT_PHONE` | client | Digits-only international form. |
| `VITE_MAP_TEST_HOOK` | client | Test-only. **Must be unset in production.** |

## 10. Not environment variables

Worth stating explicitly, because both are easy to assume are env-driven:

- **`NODE_ENV`** — set to `production` by the platform, not by you. It is what
  arms every boot guard in `server/_core/env.ts:58`.
- **`MIGRATION_ALLOW_TRANSACTION_POOLER`** — read at `migrate.mjs:215`, but it is
  a deliberate override and must be unset in production (see §2).

---

## Pre-deploy verification

```bash
# 1. Both URLs present, on the correct ports. Do not print the values.
grep -E '^(DATABASE_URL|MIGRATION_DATABASE_URL)=' .env | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'

# 2. JWT_SECRET is long enough (must not echo it).
awk -F= '/^JWT_SECRET=/{print "JWT_SECRET length:", length($2)}' .env

# 3. The backdoor is off.
grep -E '^DIRECT_LOGIN_PASSWORD=' .env   # expect an empty value

# 4. The migration runner agrees about the port.
pnpm db:migrate --dry-run 2>&1 | head -5
```

The two checks that matter most, in order of blast radius:

1. **`MIGRATION_DATABASE_URL` is on 5432, not 6543.** Getting this wrong either
   fails the deploy loudly (good) or, with the override set, lets two migration
   runs race on an advisory lock (silent corruption).
2. **`DIRECT_LOGIN_PASSWORD` is empty.** This one only warns. Nothing enforces it.

## Related

- `docs/release-governance.md` — the human gate on migrations, and the deferred
  follow-up list
- `DEPLOYMENT_GUIDE.md` — deployment steps
- `.env.production.example` — the blank contract file
