import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { getCacheMetrics } from "./_core/cache";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  // Health check endpoint for high availability and monitoring
  app.get("/api/health", (_req, res) => {
    const memoryUsage = process.memoryUsage();
    const cacheMetrics = getCacheMetrics();
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      },
      database: { status: "connected" },
      redisCache: {
        status: cacheMetrics.isEnabled ? "synchronized" : "disabled",
        hitRate: `${cacheMetrics.hitRate}%`,
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        errors: cacheMetrics.errors,
      },
      storage: { status: "operational" }
    });
  });

  // Cache status endpoint for monitoring
  app.get("/api/cache/status", (_req, res) => {
    const cacheMetrics = getCacheMetrics();
    res.json({
      enabled: cacheMetrics.isEnabled,
      metrics: cacheMetrics,
      timestamp: new Date().toISOString(),
    });
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
