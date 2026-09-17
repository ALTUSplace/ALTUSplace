// Vercel Function: a single entrypoint for every /api/* request, handed to the
// bundled Express server (built to dist/api-handler.mjs by `pnpm build`).
//
// Vercel's plain (non-Next.js) file-based routing only supports `[name]` path
// segments — it does NOT support catch-all `[...path]` / `[[...path]]` files, so
// nested paths like /api/auth/owner-status never reached a function and were
// swallowed by the SPA rewrite. Instead, vercel.json rewrites /api/* to this
// single `/api/index` function, and Express performs the internal routing using
// the original request URL.
import apiHandler from "../dist/api-handler.mjs";

export default apiHandler;
