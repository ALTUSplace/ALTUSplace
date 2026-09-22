import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CSP_HEADER_VALUE } from "../shared/security/csp";

type VercelHeader = { key: string; value: string };
type VercelConfig = { headers?: Array<{ source: string; headers: VercelHeader[] }> };

describe("CSP parity (vercel.json <-> shared/security/csp.ts)", () => {
  it("edge Content-Security-Policy exactly equals CSP_HEADER_VALUE", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as VercelConfig;
    const edgeCsp = config.headers
      ?.find((entry) => entry.source === "/(.*)")
      ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;

    expect(edgeCsp).toBeDefined();
    expect(edgeCsp).toBe(CSP_HEADER_VALUE);
  });
});