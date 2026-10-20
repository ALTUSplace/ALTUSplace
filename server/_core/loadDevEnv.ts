import { config } from "dotenv";

// `.env` is loaded first by `dotenv/config`. Locally, allow a git-ignored
// `.env.development.local` to supply machine-specific values such as
// DATABASE_URL. Production must use injected environment variables only.
if (process.env.NODE_ENV === "development") {
  config({ path: ".env.development.local", override: true, quiet: true });
}
