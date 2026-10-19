import { describe, expect, it } from "vitest";
import { sanitizeText, sanitizeUserContent } from "../../server/_core/security";

/**
 * L-4: the OLD global `sanitizeTrpcInput` middleware HTML-escaped every string
 * that entered a tRPC procedure — before zod validation even ran. That
 * corrupted real data (`&` became `&amp;` inside URLs, e-mail addresses and
 * passwords) while providing no real XSS defense: React escapes on render,
 * JSON-LD payloads escape `<` when serialized (client/src/lib/seo.ts) and
 * server-rendered HTML (prerender, notification e-mails) escapes at its own
 * boundary.
 *
 * The middleware is gone. These tests pin the two field-level helpers that
 * remain for content explicitly bound to HTML output, and the missing global
 * sanitizer.
 */
describe("field-level content sanitizers (post L-4)", () => {
  it("sanitizeText strips NUL + control characters and trims", () => {
    expect(sanitizeText("\u0000hello\u0007world\u001F")).toBe("helloworld");
    expect(sanitizeText("  padded  ")).toBe("padded");
    // Newlines and tabs are legitimate in descriptions.
    expect(sanitizeText("keep\nnewlines\ttabs")).toBe("keep\nnewlines\ttabs");
  });

  it("sanitizeText preserves URLs containing ampersands (double-encoding regression)", () => {
    const url = "https://example.com/search?make=audi&fuel=diesel&sort=price_asc";
    expect(sanitizeText(url)).toBe(url);
  });

  it("sanitizeText caps stored length", () => {
    expect(sanitizeText("x".repeat(80), 64)).toHaveLength(64);
  });

  it("sanitizeUserContent still escapes HTML for fields bound to HTML output", () => {
    expect(sanitizeUserContent('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
    );
    expect(sanitizeUserContent("O'Brien")).toBe("O&#x27;Brien");
    expect(sanitizeUserContent("plain text")).toBe("plain text");
  });

  it("no longer exports a global tRPC input sanitizer", async () => {
    const security = await import("../../server/_core/security");
    expect("sanitizeTrpcInput" in security).toBe(false);
  });
});
