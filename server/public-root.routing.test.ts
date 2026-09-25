import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectPrerenderMetadata } from "./_core/prerender";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

// ---------------------------------------------------------------------------
// Real HTTP boundary: GET / must serve the public homepage document (200, home
// listing metadata, SPA root) — never the owner login form and never a redirect
// to the login gate. Mirrors the production `serveStatic` handler (vite.ts):
// every non-API path returns the SPA shell enriched with per-route metadata via
// injectPrerenderMetadata, using the exact same client template the build uses.
// ---------------------------------------------------------------------------
describe("GET / public routing boundary", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    const template = read("client/index.html");
    app.use("*", async (_req, res) => {
      const page = await injectPrerenderMetadata(template, _req.originalUrl, "https://altusplace.vercel.app");
      res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).send(page);
    });
    server = createServer(app);
    await new Promise<void>((done) => server.listen(0, done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  it('GET "/" returns 200 with listing content, NOT the login form', async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    // Public visitors are never redirected to the owner login gate.
    expect(response.headers.get("location")).toBeNull();

    const html = await response.text();
    // Homepage listing/marketplace document markers.
    expect(html).toContain("كراء السيارات والعقارات في المغرب");
    expect(html).toContain("احجز سيارات وعقارات للكراء في المغرب");
    expect(html).toContain('id="root"');
    expect(html).toContain('name="robots" content="index, follow');
    // No owner-login form markers anywhere in the home document.
    expect(html).not.toContain("direct-password");
    expect(html).not.toContain("تسجيل الدخول المباشر");
    expect(html).not.toContain('name="robots" content="noindex');
  });

  it('GET "/owner-login" serves the login gate explicitly, hidden from crawlers', async () => {
    const response = await fetch(`${baseUrl}/owner-login`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('name="robots" content="noindex');
  });
});

// ---------------------------------------------------------------------------
// Static routing-config audit: the root route and the owner login gate wiring.
// ---------------------------------------------------------------------------
describe("root routing config audit", () => {
  it('maps "/" to the public Home page with no login gate or redirect', () => {
    const app = read("client/src/App.tsx");
    const from = app.indexOf('<Route path={"/"}>');
    const to = app.indexOf('<Route path={"/search"}>');
    const homeRoute = app.slice(from, to);
    expect(homeRoute).toContain("HomePage");
    expect(homeRoute).not.toContain("AccessGuard");
    expect(homeRoute).not.toContain("DirectLoginPage");
    expect(homeRoute).not.toContain("Redirect");
    expect(homeRoute).not.toContain("startLogin");
  });

  it("exposes the owner login ONLY at /owner-login (no /direct-login route)", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('path="/owner-login"');
    expect(app).not.toContain('path="/direct-login"');
    const clientConst = read("client/src/const.ts");
    expect(clientConst).toContain('window.location.href = "/owner-login"');
  });

  it("does not link the owner login from the navbar or footer", () => {
    const navbar = read("client/src/components/Navbar.tsx");
    const footer = read("client/src/components/Footer.tsx");
    for (const source of [navbar, footer]) {
      expect(source).not.toMatch(/owner-login|direct-login/);
    }
  });

  it("never auto-redirects passive page-load query errors to login", () => {
    const main = read("client/src/main.tsx");
    const querySubscriber = main.slice(main.indexOf("getQueryCache"), main.indexOf("getMutationCache"));
    // Query (page-load) failures are logged only — never a navigation to login.
    expect(querySubscriber).toContain('console.error("[API Query Error]"');
    expect(querySubscriber).not.toContain("startLogin");
    expect(querySubscriber).not.toContain("redirectToLoginIfUnauthorized");
    // Only user-initiated mutations may still kick off the login redirect.
    expect(main).toContain("getMutationCache");
    expect(main).toContain("redirectToLoginIfUnauthorized");
  });

  it("gates the protected favorites.list query behind auth so public pages stay neutral", () => {
    const favorites = read("client/src/hooks/useFavorites.ts");
    expect(favorites).toContain("trpc.auth.me.useQuery");
    expect(favorites).toContain("enabled: isAuthed");
    expect(favorites).toContain("favorites.list.useQuery");
    expect(favorites).not.toContain("startLogin");
  });
});