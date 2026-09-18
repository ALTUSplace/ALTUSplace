import express, { type Request } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDirectAuthRoutes } from "./directAuth";
import { createPaymentsWebhookHandler, paymentStrictLimiter, registerSecurity } from "./security";
import { createVerificationWebhookHandler } from "../verification/webhook";
import { configureProviderSecrets } from "../verification/provider";
import { createEscrowWebhookHandler } from "../escrow";
import {
  handleLocalCashWebhook,
  handlePaytabsWebhook,
  handlePayzoneWebhook,
  webhookResponder,
} from "../payments/webhooks";
import { ENV } from "./env";
import { registerStorageProxy } from "./storageProxy";
import { registerSitemapRoutes, SEO_SITE_URL } from "./sitemap";
import { injectPrerenderMetadata } from "./prerender";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { leaseEndReminderHandler } from "../leaseReminder";
import { icalExportHandler, icalSyncHandler as scheduledIcalSyncHandler } from "../ical";
import { verifyCron } from "../middleware/cronAuth";
import { icalSyncHandler } from "../cron/icalSync";
import { leaseRemindersHandler } from "../cron/leaseReminders";
import { demoCleanupHandler } from "../cron/demoCleanup";
import { logger } from "./logger";

/**
 * Origin used only to fetch the SPA shell for prerendering. Restricted to
 * first-party hosts so the request host cannot become an SSRF vector.
 */
function prerenderFetchOrigin(req: Request): string {
  const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  const proto = (req.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const allowed = /^([a-z0-9-]+\.)*(altusplace\.ma|vercel\.app|localhost)(:\d+)?$/i;
  if (host && allowed.test(host)) return `${proto}://${host}`;
  return SEO_SITE_URL;
}

/**
 * Builds the Express application (all middleware + routes), without binding a
 * port. Used by both the standalone Node runtime (server/_core/index.ts) and
 * the Vercel serverless function (server/_core/api-handler.ts).
 */
export function createApp() {
  const app = express();

  // -----------------------------------------------------------------------
  // Cross-origin support: when VITE_APP_URL is configured (Vercel frontend
  // + separate Node backend) the SPA sends credentialed cross-origin requests.
  // Same-origin mode (default) needs no CORS headers; the middleware is
  // entirely skipped so existing dev/test flows are unchanged.
  // -----------------------------------------------------------------------
  const frontendOrigin = process.env.VITE_APP_URL?.trim();
  if (frontendOrigin) {
    app.use((_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", frontendOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (_req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  }

  // Identity verification (KYC): inject provider secrets so external
  // verification sessions (Stripe Identity / Persona) can be created, and
  // mount the signed webhook that resolves submissions asynchronously.
  configureProviderSecrets({
    stripeIdentitySecretKey: ENV.stripeIdentitySecretKey,
    personaApiKey: ENV.personaApiKey,
  });
  app.post(
    "/api/v1/verification/webhook",
    express.raw({ type: "*/*", limit: "1mb" }),
    createVerificationWebhookHandler({
      getSecret: () => ENV.verificationWebhookSecret || ENV.stripeIdentityWebhookSecret || ENV.personaWebhookSecret,
      getProvider: () => (ENV.verificationProvider as "manual" | "stripe_identity" | "persona") ?? "manual",
    }),
  );
  // Security shield: headers + CSRF guard + strict (5/min) then global (100/15min) rate limits.
  registerSecurity(app);
  // Payment webhook (Stripe/CMI): raw body + HMAC signature verification.
  // MUST stay before express.json() so req.body is the exact raw Buffer the
  // provider signed. Unverified payloads are rejected instantly with 400.
  app.post(
    "/api/v1/payments/webhook",
    paymentStrictLimiter,
    express.raw({ type: "*/*", limit: "1mb" }),
    createPaymentsWebhookHandler(async rawBody => {
      // No live provider is configured yet (payments are simulated in
      // server/billing.ts); acknowledge receipt and log for audit.
      logger.info("Payment webhook received and verified", { bytes: rawBody.length, path: "/api/v1/payments/webhook" });
    })
  );
  // Legacy alias used by older clients/docs.
  app.post(
    "/api/payments/webhook",
    paymentStrictLimiter,
    express.raw({ type: "*/*", limit: "1mb" }),
    createPaymentsWebhookHandler(async rawBody => {
      logger.info("Payment webhook received and verified (legacy)", { bytes: rawBody.length, path: "/api/payments/webhook" });
    })
  );
  // Stripe Connect escrow webhook: reconcile transfer and payment_intent
  // lifecycle events with the escrow ledger (freeze/release/mediation).
  app.post(
    "/api/v1/escrow/webhook",
    paymentStrictLimiter,
    express.raw({ type: "*/*", limit: "1mb" }),
    createEscrowWebhookHandler({
      getSecret: () => ENV.stripeWebhookSecret,
    })
  );
  // Moroccan gateway webhooks (PayZone / PayTabs / Cash Plus / Wafacash).
  // MUST stay before express.json() so req.body is the raw Buffer the provider
  // (or agency) signed. Every handler verifies then idempotently settles the
  // transaction, updating payment, invoice, booking and the escrow ledger.
  app.post(
    "/api/webhooks/payzone",
    paymentStrictLimiter,
    express.raw({ type: "*/*", limit: "1mb" }),
    webhookResponder(handlePayzoneWebhook)
  );
  app.post(
    "/api/webhooks/paytabs",
    paymentStrictLimiter,
    express.raw({ type: "*/*", limit: "1mb" }),
    webhookResponder(handlePaytabsWebhook)
  );
  app.post(
    "/api/webhooks/local-cash",
    paymentStrictLimiter,
    express.raw({ type: "*/*", limit: "1mb" }),
    webhookResponder(handleLocalCashWebhook)
  );
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerDirectAuthRoutes(app);
  // tRPC API
  app.post("/api/scheduled/lease-end-reminder", leaseEndReminderHandler);
  app.post("/api/scheduled/ical-sync", scheduledIcalSyncHandler);
  // Vercel Cron endpoints — guarded by verifyCron (x-vercel-cron header or CRON_SECRET bearer).
  app.post("/api/cron/ical-sync", verifyCron, icalSyncHandler);
  app.post("/api/cron/lease-reminders", verifyCron, leaseRemindersHandler);
  app.post("/api/cron/demo-cleanup", verifyCron, demoCleanupHandler);
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  app.get("/api/ical/export/:token", icalExportHandler);
  // Sitemap sub-indexes generated from live inventory (static parts are built
  // by scripts/generate-sitemap.ts into client/public).
  registerSitemapRoutes(app);
  // Prerender proxy target for edge middleware: returns the SPA shell with
  // route-specific meta tags so crawlers/social bots get real previews.
  app.get("/api/prerender", async (req, res) => {
    const requested = typeof req.query.path === "string" ? req.query.path : "/";
    const targetPath = requested.startsWith("/") ? requested : `/${requested}`;
    try {
      const indexResponse = await fetch(`${prerenderFetchOrigin(req)}/index.html`);
      if (!indexResponse.ok) throw new Error(`index responded ${indexResponse.status}`);
      const template = await indexResponse.text();
      const html = await injectPrerenderMetadata(template, targetPath, SEO_SITE_URL);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.status(200).send(html);
    } catch (error) {
      logger.warn("Prerender request failed", {
        error: error instanceof Error ? error.message : String(error),
        path: targetPath,
      });
      res.status(502).json({ error: "prerender_unavailable" });
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Anything under /api that fell through is a real 404 (JSON, never HTML).
  // Keep this BEFORE any SPA/static fallback so unmatched API paths cannot
  // be served the SPA document.
  app.use("/api", (_req, res) => {
    if (!res.headersSent) res.status(404).json({ error: "API route not found" });
  });

  return app;
}