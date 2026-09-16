import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("direct owner login (OAuth fallback) audit", () => {
  it("exposes a password-gated POST /api/auth/direct-login endpoint", () => {
    const direct = read("server/_core/directAuth.ts");
    expect(direct).toContain('"/api/auth/direct-login"');
    expect(direct).toContain("timingSafeEqual");
    expect(direct).toContain("createHash");
  });

  it("fails closed when DIRECT_LOGIN_PASSWORD is not configured", () => {
    const direct = read("server/_core/directAuth.ts");
    expect(direct).toContain("if (!configured)");
    expect(direct).toContain("404");
  });

  it("always persists the fallback owner as SUPER_ADMIN and mints a session", () => {
    const direct = read("server/_core/directAuth.ts");
    expect(direct).toContain('role: "SUPER_ADMIN"');
    expect(direct).toContain("createSessionToken");
    expect(direct).toContain("res.cookie(COOKIE_NAME");
  });

  it("mounts the route in the app and reads the password from env", () => {
    const app = read("server/_core/app.ts");
    expect(app).toContain("registerDirectAuthRoutes");
    const env = read("server/_core/env.ts");
    expect(env).toContain("DIRECT_LOGIN_PASSWORD");
  });

  it("falls back to /direct-login when the OAuth portal is not configured", () => {
    const clientConst = read("client/src/const.ts");
    expect(clientConst).toContain('window.location.href = "/direct-login"');
    const app = read("client/src/App.tsx");
    expect(app).toContain('path="/direct-login"');
  });
});