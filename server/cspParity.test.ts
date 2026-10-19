import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { securityHeaders } from "./_core/security";

type VercelHeader = { key: string; value: string };
type VercelConfig = { headers?: Array<{ source: string; headers: VercelHeader[] }> };

/** The exact edge header set Vercel applies to `/(.*)` in vercel.json. */
function edgeHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as VercelConfig;
  const block = config.headers?.find((entry) => entry.source === "/(.*)");
  if (!block) throw new Error('vercel.json has no "/(.*)" header block');
  return Object.fromEntries(block.headers.map((header) => [header.key, header.value]));
}

/** Run Express `securityHeaders` against a fake res and return sent headers. */
function expressHeaders(): Record<string, string> {
  const sent = new Map<string, string>();
  const res = {
    setHeader: (name: string, value: string) => sent.set(name, String(value)),
    removeHeader: (name: string) => sent.delete(name),
  } as never;
  const req = { originalUrl: "/" } as never;
  securityHeaders(req, res, () => undefined);
  return Object.fromEntries(sent);
}

describe("security header parity (vercel.json edge <-> Express securityHeaders)", () => {
  const edge = edgeHeaders();
  const express = expressHeaders();

  it("Express sends EVERY vercel.json `/(.*)` header with byte-identical values", () => {
    // Regression for the old drift: edge sent X-XSS-Protection + no payment=()
    // while Express sent payment=() and no X-XSS-Protection. Every header the
    // edge sends must now be sent by the Node runtime with the exact same value.
    for (const [key, value] of Object.entries(edge)) {
      expect(express[key], `Express is missing edge header ${key}`).toBe(value);
    }
  });

  it("disables the deprecated X-XSS-Protection filter on both runtimes (L-10)", () => {
    // "1; mode=block" was the old helmet default; the legacy XSS auditor no
    // longer exists in current browsers and introduced its own flaws where it
    // did. Both runtimes now send the explicit "0" (still byte-parity above).
    expect(express["X-XSS-Protection"]).toBe("0");
    expect(edge["X-XSS-Protection"]).toBe("0");
  });

  it("blocks the payment API via Permissions-Policy on both runtimes", () => {
    expect(express["Permissions-Policy"]).toContain("payment=()");
    expect(edge["Permissions-Policy"]).toContain("payment=()");
  });

  it("removes X-Powered-By (information disclosure regression)", () => {
    expect(Object.keys(express)).not.toContain("X-Powered-By");
  });
});