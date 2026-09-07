import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getDb } from "../db";
import { listings } from "../../drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[character] ?? character);
}

async function injectSocialMetadata(template: string, url: string) {
  const origin = process.env.VITE_APP_URL || "https://b2rentmorocc-muehrc85.manus.space";
  let title = "B2-Rent Morocco | كراء السيارات والعقارات في المغرب";
  let description = "اكتشف عروض كراء السيارات والعقارات من شركاء محليين موثوقين في المغرب.";
  let image = `${origin}/favicon.ico`;
  const match = url.match(/^\/(?:car|property)\/(\d+)/);
  if (match) {
    try {
      const db = await getDb();
      const listing = db ? (await db.select({ title: listings.title, description: listings.description, pricePerDay: listings.pricePerDay, imageUrl: listings.imageUrl }).from(listings).where(and(eq(listings.id, Number(match[1])), inArray(listings.status, ["Published", "Available"]))).limit(1))[0] : undefined;
      if (listing) {
        title = `${listing.title} | B2-Rent Morocco`;
        description = listing.description || `عرض متاح للكراء ابتداءً من ${Number(listing.pricePerDay).toLocaleString("fr-MA")} MAD.`;
        image = listing.imageUrl || image;
      }
    } catch (error) {
      console.warn("[SEO] Could not load listing metadata", error);
    }
  }
  const tags = `<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:url" content="${escapeHtml(new URL(url, origin).toString())}"><meta name="twitter:card" content="summary_large_image">`;
  return template.replace("</head>", `${tags}</head>`);
}

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
      const pageWithMetadata = await injectSocialMetadata(page, url);
      res.status(200).set({ "Content-Type": "text/html" }).end(pageWithMetadata);
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

  app.use(express.static(distPath));

  // Fall through to index.html while injecting listing metadata for crawlers and social previews.
  app.use("*", async (req, res, next) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      const template = await fs.promises.readFile(indexPath, "utf-8");
      const page = await injectSocialMetadata(template, req.originalUrl);
      res.status(200).set({ "Content-Type": "text/html" }).send(page);
    } catch (error) {
      next(error);
    }
  });
}
