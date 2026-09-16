import type { NextFunction, Request, Response } from "express";
import { createApp } from "./app";

const app = createApp();

/**
 * Vercel serverless handler. Bundled to dist/api-handler.mjs at build time and
 * mounted from api/[[...path]].js. Receives the original request path, so the
 * Express router matches /api/trpc, /api/oauth/callback, webhooks, health, etc.
 */
export default function apiHandler(req: Request, res: Response) {
  app(req, res, (err: unknown) => {
    if (err) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Internal server error" }));
      } else {
        res.end();
      }
      return;
    }
    if (!res.headersSent) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });
}