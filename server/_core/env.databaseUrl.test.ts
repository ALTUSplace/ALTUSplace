import { describe, expect, it } from "vitest";
import { resolveDatabaseUrlFromEnv } from "./env";

describe("resolveDatabaseUrlFromEnv", () => {
  it("prefers a non-empty DATABASE_URL", () => {
    expect(
      resolveDatabaseUrlFromEnv({
        DATABASE_URL: "postgresql://primary",
        SUPABASE_DB_URL: "postgresql://fallback",
      }),
    ).toBe("postgresql://primary");
  });

  it("falls back to SUPABASE_DB_URL when DATABASE_URL is empty or whitespace", () => {
    expect(
      resolveDatabaseUrlFromEnv({
        DATABASE_URL: "",
        SUPABASE_DB_URL: "postgresql://fallback",
      }),
    ).toBe("postgresql://fallback");
    expect(
      resolveDatabaseUrlFromEnv({
        DATABASE_URL: "   ",
        SUPABASE_DB_URL: " postgresql://fallback ",
      }),
    ).toBe("postgresql://fallback");
  });

  it("returns an empty string when neither URL is set", () => {
    expect(resolveDatabaseUrlFromEnv({})).toBe("");
  });
});
