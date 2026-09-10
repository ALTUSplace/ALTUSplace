import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { createPaymentsWebhookHandler, paymentStrictLimiter, registerSecurity } from "./security";
import { createVerificationWebhookHandler } from "../verification/webhook";
import { configureProviderSecrets } from "../verification/provider";
import { ENV } from "./env";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { leaseEndReminderHandler } from "../leaseReminder";
import { icalExportHandler, icalSyncHandler } from "../ical";
import { logger } from "./logger";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.post("/api/scheduled/lease-end-reminder", leaseEndReminderHandler);
  app.post("/api/scheduled/ical-sync", icalSyncHandler);
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  app.get("/api/ical/export/:token", icalExportHandler);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.info(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(error => {
  logger.error("Server startup failed", { error: error instanceof Error ? error.message : String(error) });
});
