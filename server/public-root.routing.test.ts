import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import { injectPrerenderMetadata, resolveRouteMetadata } from "./_core/prerender";
import { protectAuthOnlyPages, shouldRedirectAuthOnlyPage, AUTH_INTENT_COOKIE } from "./_core/routeGuard";
import { sdk } from "./_core/sdk";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

// ---------------------------------------------------------------------------
// Real HTTP boundary: mirrors the production `serveStatic` handler (vite.ts):
// the auth-only route guard runs first, then every non-API path returns the
// SPA shell enriched with per-route metadata via injectPrerenderMetadata, using
// the exact same client template the build uses.
// ---------------------------------------------------------------------------
describe("GET / public routing boundary", () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  let sessionToken: string;

  beforeAll(async () => {
    const app = express();
    const template = read("client/index.html");
    // Same middleware order as serveStatic(): guard BEFORE the SPA fallback.
    app.use(protectAuthOnlyPages);
    app.use("*", async (_req, res) => {
      const page = await injectPrerenderMetadata(template, _req.originalUrl, "https://altusplace.vercel.app");
      res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).send(page);
    });
    server = createServer(app);
    await new Promise<void>((done) => server.listen(0, done));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Valid session token (ephemeral secret — no DB needed in tests).
    sessionToken = await sdk.signSession({ openId: "gate-test-owner", appId: "test", name: "Gate Test" });
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  it('GET "/" returns 200 with listing content, NOT the login form', async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    // Public visitors are never redirected to an auth gate.
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

  it.each(["/register", "/terms", "/owner-login"])(
    'anonymous GET "%s" is redirected to the public homepage "/" (no auth UI)',
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
      expect(response.headers.get("cache-control")).toBe("no-store");
      // The login/consent/terms form must never reach an anonymous visitor.
      const body = await response.text();
      expect(body).not.toContain("direct-password");
      expect(body).not.toContain('id="root"');
    },
  );

  it('anonymous GET "/register?next=login" also redirects (query preserved on the path)', async () => {
    const response = await fetch(`${baseUrl}/register?next=login`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it('an ACTIVE login flow (b2_auth_intent marker) reaches /register for legal consent', async () => {
    const response = await fetch(`${baseUrl}/register?next=login`, {
      headers: { Cookie: `${AUTH_INTENT_COOKIE}=1` },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="root"');
    // Consent page stays hidden from crawlers even when the flow is allowed.
    expect(html).toContain('name="robots" content="noindex');
  });

  it('a valid session reaches the auth-only pages (session-gated, not blanket-blocked)', async () => {
    const headers = { Cookie: `${COOKIE_NAME}=${sessionToken}` };
    for (const path of ["/register", "/terms", "/owner-login"]) {
      const response = await fetch(`${baseUrl}${path}`, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      const html = await response.text();
      expect(html).toContain('id="root"');
      expect(html).toContain('name="robots" content="noindex');
    }
  });

  it('rejects an INVALID session token on auth-only pages (fails closed)', async () => {
    const response = await fetch(`${baseUrl}/owner-login`, {
      redirect: "manual",
      headers: { Cookie: `${COOKIE_NAME}=not-a-valid-token` },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it('resolves noindex crawler metadata for /register, /terms and /owner-login', async () => {
    for (const path of ["/register", "/terms", "/owner-login"]) {
      const metadata = await resolveRouteMetadata(path, "https://altusplace.vercel.app");
      expect(metadata.robots).toContain("noindex");
    }
    const home = await resolveRouteMetadata("/", "https://altusplace.vercel.app");
    expect(home.robots).toContain("index");
  });
});

// ---------------------------------------------------------------------------
// Static routing-config audit: the public root route, the auth-only guard
// wiring, the crawl surface and the navigation menus.
// ---------------------------------------------------------------------------
describe("public/private route isolation audit", () => {
  it('maps "/" to the public Home page with no login gate or redirect', () => {
    const app = read("client/src/App.tsx");
    const from = app.indexOf('<Route path={"/"}>');
    const to = app.indexOf('<Route path={"/search"}>');
    const homeRoute = app.slice(from, to);
    expect(homeRoute).toContain("HomePage");
    expect(homeRoute).not.toContain("AccessGuard");
    expect(homeRoute).not.toContain("AuthOnlyRoute");
    expect(homeRoute).not.toContain("DirectLoginPage");
    expect(homeRoute).not.toContain("Redirect");
    expect(homeRoute).not.toContain("startLogin");
  });

  it("wraps /register, /terms and /owner-login in the AuthOnlyRoute guard", () => {
    const app = read("client/src/App.tsx");
    for (const path of ["/register", "/terms", "/owner-login"]) {
      const index = app.indexOf(`path="${path}"`);
      expect(index).toBeGreaterThan(-1);
      const block = app.slice(index, index + 240);
      expect(block).toContain("AuthOnlyRoute");
    }
    // The guard itself redirects anonymous visitors to the public homepage.
    const guard = app.slice(app.indexOf("function AuthOnlyRoute"), app.indexOf("function AuthOnlyRoute") + 1200);
    expect(guard).toContain('redirectPath: "/"');
    expect(guard).toContain("redirectOnUnauthenticated");
    expect(guard).toContain("useNoIndex");
    expect(guard).toContain("hasAuthIntent");
  });

  it("exposes the owner login ONLY at /owner-login (no /direct-login route)", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('path="/owner-login"');
    expect(app).not.toContain('path="/direct-login"');
    const clientConst = read("client/src/const.ts");
    expect(clientConst).toContain('window.location.href = "/owner-login"');
  });

  it("does not link any auth-only page from the navbar, footer or bottom nav", () => {
    const navbar = read("client/src/components/Navbar.tsx");
    const footer = read("client/src/components/Footer.tsx");
    const bottom = read("client/src/components/BottomNavigationBar.tsx");
    for (const source of [navbar, footer, bottom]) {
      expect(source).not.toMatch(/owner-login|direct-login/);
      expect(source).not.toContain('href="/terms"');
      expect(source).not.toContain('href="/register"');
    }
  });

  it("keeps /register and /terms out of the sitemap and robots-allow surface", () => {
    const sitemap = read("client/public/sitemap.xml");
    expect(sitemap).not.toContain("https://altusplace.vercel.app/terms");
    expect(sitemap).not.toContain("https://altusplace.vercel.app/register");
    const robots = read("client/public/robots.txt");
    expect(robots).toContain("Disallow: /owner-login");
    expect(robots).toContain("Disallow: /register");
    expect(robots).toContain("Disallow: /terms");
  });

  it("does not prerender guarded auth-only pages to static artifacts", () => {
    const prerender = read("scripts/prerender.mjs");
    expect(prerender).not.toContain('path: "/terms"');
    expect(prerender).not.toContain("terms/index.html");
    expect(prerender).not.toContain('path: "/register"');
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

  it("gates the login/consent entry behind an explicit auth-intent marker", () => {
    const clientConst = read("client/src/const.ts");
    expect(clientConst).toContain("persistAuthIntent");
    const legal = read("client/src/lib/legalDisclosure.ts");
    expect(legal).toContain("b2_auth_intent");
    expect(legal).toContain("persistAuthIntent");
  });

  it("route-guard decision logic: only anonymous, intent-less hits on auth-only paths redirect", () => {
    expect(shouldRedirectAuthOnlyPage({ pathname: "/", sessionToken: null, hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/search", sessionToken: null, hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register", sessionToken: null, hasAuthIntent: false })).toBe(true);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register/", sessionToken: null, hasAuthIntent: false })).toBe(true);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/terms", sessionToken: null, hasAuthIntent: false })).toBe(true);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/owner-login", sessionToken: null, hasAuthIntent: false })).toBe(true);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register", sessionToken: "tok", hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register", sessionToken: null, hasAuthIntent: true })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/owner-login", sessionToken: null, hasAuthIntent: true })).toBe(false);
    // Anything else must never be touched by the guard.
    expect(shouldRedirectAuthOnlyPage({ pathname: "/terms-of-foo", sessionToken: null, hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/api/auth/direct-login", sessionToken: null, hasAuthIntent: false })).toBe(false);
  });
});