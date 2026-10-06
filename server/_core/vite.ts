import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { renderSpaDocument } from "./prerender";
import { protectAuthOnlyPages } from "./routeGuard";


export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  // Auth-only pages (/register, /terms, /owner-login) redirect anonymous
  // visitors to "/" before the SPA fallback can serve them.
  app.use(protectAuthOnlyPages);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      const rendered = await renderSpaDocument(page, url);
      // Undeclared URLs are real 404s: mark them noindex and let them be
      // cached briefly like the prerender edge response.
      if (rendered.status === 404) {
        res.setHeader("X-Robots-Tag", "noindex");
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      }
      res.status(rendered.status).set({ "Content-Type": "text/html" }).end(rendered.html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Auth-only pages are intercepted BEFORE static assets so prerendered
  // artifacts (e.g. dist/public/terms/index.html) can never leak to
  // anonymous visitors — they are redirected to "/" first.
  app.use(protectAuthOnlyPages);
  app.use(express.static(distPath));

  // Fall through to index.html while injecting listing metadata for crawlers and social previews.
  app.use("*", async (req, res, next) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      const template = await fs.promises.readFile(indexPath, "utf-8");
      const rendered = await renderSpaDocument(template, req.originalUrl);
      // Undeclared URLs are real 404s: mark them noindex and let them be
      // cached briefly like the prerender edge response.
      if (rendered.status === 404) {
        res.setHeader("X-Robots-Tag", "noindex");
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      }
      res.status(rendered.status).set({ "Content-Type": "text/html" }).send(rendered.html);
    } catch (error) {
      next(error);
    }
  });
}
