import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

describe("ALTUSplace app identity", () => {
  it("ships the default application logo asset", () => {
    const logoPath = path.resolve(import.meta.dirname, "..", "client", "public", "images", "logo.png");
    expect(existsSync(logoPath)).toBe(true);
  });

  it("serves the configured remote application logo when provided", async () => {
    const logoUrl = process.env.VITE_APP_LOGO;
    // The remote logo is deployment-specific; when it is not configured the
    // bundled asset above is authoritative, so the network probe is skipped.
    if (!logoUrl) return;

    expect(logoUrl).toMatch(/^https:\/\//);
    const response = await fetch(logoUrl, { method: "HEAD" });
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type") ?? "").toMatch(/^image\//);
  }, 15_000);
});

