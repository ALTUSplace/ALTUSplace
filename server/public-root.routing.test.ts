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
import { buildTestSitemap } from "./sitemap-fixture.mjs";

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
    expect(html).not.toContain("دخول المالكين");
    expect(html).not.toContain('name="robots" content="noindex');
  });

  it.each(["/owner-login"])(
    'anonymous GET "%s" is redirected to the public homepage "/" (no auth UI)',
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/");
      expect(response.headers.get("cache-control")).toBe("no-store");
      // The owner-login form must never reach an anonymous visitor.
      const body = await response.text();
      expect(body).not.toContain("direct-password");
      expect(body).not.toContain('id="root"');
    },
  );

  it.each(["/register", "/terms", "/login"])(
    'anonymous GET "%s" is PUBLIC — SPA shell serves (no redirect)',
    async (path) => {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      const html = await response.text();
      expect(html).toContain('id="root"');
      // Public app surfaces, but never indexed.
      expect(html).toContain('name="robots" content="noindex');
    },
  );

  it('anonymous GET "/register?next=login" is public too — query never redirects', async () => {
    const response = await fetch(`${baseUrl}/register?next=login`, { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it('an ACTIVE owner-login flow (b2_auth_intent marker) reaches /owner-login', async () => {
    const response = await fetch(`${baseUrl}/owner-login`, {
      headers: { Cookie: `${AUTH_INTENT_COOKIE}=1` },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('id="root"');
    // Owner login stays hidden from crawlers even when the flow is allowed.
    expect(html).toContain('name="robots" content="noindex');
  });

  it('a valid session reaches the auth-only page (session-gated, not blanket-blocked)', async () => {
    const headers = { Cookie: `${COOKIE_NAME}=${sessionToken}` };
    for (const path of ["/owner-login"]) {
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

  it('resolves noindex crawler metadata for /owner-login, /login, /register and /terms', async () => {
    for (const path of ["/owner-login", "/login", "/register", "/terms"]) {
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

  it("wraps /owner-login in the AuthOnlyRoute guard (register/terms/login are public)", () => {
    const app = read("client/src/App.tsx");
    // Scope each assertion to its own <Route>/</Route> element: /login sits
    // directly above /owner-login, so a fixed-width window would bleed into
    // the neighbouring (guarded) block.
    const element = (path: string) => {
      const start = app.indexOf(`path="${path}"`);
      expect(start).toBeGreaterThan(-1);
      return app.slice(start, app.indexOf("</Route>", start) + 8);
    };
    expect(element("/owner-login")).toContain("AuthOnlyRoute");
    for (const path of ["/register", "/terms", "/login"]) {
      expect(element(path)).not.toContain("AuthOnlyRoute");
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
    const sitemap = buildTestSitemap();
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
    // /register, /terms and /login are PUBLIC — never redirected by the guard.
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register", sessionToken: null, hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register/", sessionToken: null, hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/terms", sessionToken: null, hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/login", sessionToken: null, hasAuthIntent: false })).toBe(false);
    // Only /owner-login is auth-only: anonymous + no intent -> redirect.
    expect(shouldRedirectAuthOnlyPage({ pathname: "/owner-login", sessionToken: null, hasAuthIntent: false })).toBe(true);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/owner-login/", sessionToken: null, hasAuthIntent: false })).toBe(true);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/owner-login", sessionToken: "tok", hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/owner-login", sessionToken: null, hasAuthIntent: true })).toBe(false);
    // ...and public paths stay untouched whatever the session/intent state.
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register", sessionToken: "tok", hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/register", sessionToken: null, hasAuthIntent: true })).toBe(false);
    // Anything else must never be touched by the guard.
    expect(shouldRedirectAuthOnlyPage({ pathname: "/terms-of-foo", sessionToken: null, hasAuthIntent: false })).toBe(false);
    expect(shouldRedirectAuthOnlyPage({ pathname: "/api/auth/direct-login", sessionToken: null, hasAuthIntent: false })).toBe(false);
  });
});