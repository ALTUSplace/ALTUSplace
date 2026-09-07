import { describe, expect, it } from "vitest";

describe("ALTUSplace app identity", () => {
  it("serves the configured application logo", async () => {
    const logoUrl = process.env.VITE_APP_LOGO;
    expect(logoUrl).toMatch(/^https:\/\//);

    const response = await fetch(logoUrl!, { method: "HEAD" });
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type") ?? "").toMatch(/^image\//);
  }, 15_000);
});

