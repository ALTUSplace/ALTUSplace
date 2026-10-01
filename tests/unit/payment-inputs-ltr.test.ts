// Group D guard: payment and identifier inputs must not inherit `dir="rtl"`.
//
// LanguageContext sets document.documentElement.dir to rtl for Arabic, and
// every payment modal renders inside that document. A card number, an expiry
// date, a CVV and an OTP are fixed-format numeric strings, not prose: rendered
// right-to-left they display in the opposite order to how they are read off a
// physical card, which is a transcription-error risk on a field the user cannot
// easily check before submitting.
//
// `inputMode="numeric"` is asserted alongside `dir="ltr"` because on iOS the
// two together are what produce a digits-only, LTR-ordered numeric keypad.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Pulls every `<input .../>` opening tag from a source file and returns the
 * ones whose attributes identify a numeric payment/OTP field, so the assertion
 * is about real markup rather than about a regex that could match a comment.
 */
function numericInputs(source: string): string[] {
  return [...source.matchAll(/<input\b[^>]*>/g)]
    .map((m) => m[0])
    .filter(
      (tag) =>
        /inputMode="numeric"/.test(tag) ||
        /autoComplete="cc-(number|exp|csc)"/.test(tag) ||
        /autoComplete="one-time-code"/.test(tag),
    );
}

const MODALS = [
  "client/src/components/PaymentCheckoutModal.tsx",
  "client/src/components/SecurePaymentModal.tsx",
  "client/src/components/CMIPaymentModal.tsx",
] as const;

describe("payment inputs are LTR-isolated", () => {
  it.each(MODALS)("%s declares at least one numeric input", (rel) => {
    expect(numericInputs(read(rel)).length).toBeGreaterThan(0);
  });

  it.each(MODALS)("%s puts dir=\"ltr\" on every numeric input", (rel) => {
    const offenders = numericInputs(read(rel)).filter((tag) => !/dir="ltr"/.test(tag));
    expect(offenders).toEqual([]);
  });

  it("AuthModal OTP boxes are LTR-isolated", () => {
    const offenders = numericInputs(read("client/src/components/ui/AuthModal.tsx")).filter(
      (tag) => !/dir="ltr"/.test(tag),
    );
    expect(offenders).toEqual([]);
  });

  it("KycDocumentUpload document number is LTR-isolated", () => {
    const source = read("client/src/components/KycDocumentUpload.tsx");
    // The field is the shared <Input> component, not a bare <input>. Anchor on
    // the bound value, then take the whole element by brace/bracket balancing
    // rather than a fixed character window -- the onChange arrow function and
    // the long className make any hand-tuned width brittle.
    const at = source.indexOf("value={documentNumber}");
    expect(at).toBeGreaterThan(-1);
    const start = source.lastIndexOf("<Input", at);
    expect(start).toBeGreaterThan(-1);

    // Walk forward to the first top-level "/>" that is not inside a {...} or a
    // string. Arrow functions (=>) and template literals both appear here.
    let depth = 0;
    let end = -1;
    for (let i = start; i < source.length - 1; i++) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === "/" && source[i + 1] === ">" && depth === 0) {
        end = i + 1;
        break;
      }
    }
    expect(end).toBeGreaterThan(-1);
    expect(source.slice(start, end + 1)).toMatch(/dir="ltr"/);
  });
});

describe("LTR-isolated fields keep numeric keypads", () => {
  // On iOS, dir="ltr" without inputMode="numeric" yields a full QWERTY layout.
  const mustAlsoBeNumeric: Array<[string, RegExp]> = [
    ["client/src/components/PaymentCheckoutModal.tsx", /autoComplete="cc-(number|exp|csc)"/],
    ["client/src/components/SecurePaymentModal.tsx", /autoComplete="cc-(number|exp|csc)"/],
    ["client/src/components/CMIPaymentModal.tsx", /dir="ltr"\s+inputMode="numeric"/],
  ];

  it.each(mustAlsoBeNumeric)("%s pairs dir with inputMode", (rel, re) => {
    expect(read(rel)).toMatch(re);
  });
});

describe("Voucher code is LTR-isolated", () => {
  it("renders the code with dir=\"ltr\"", () => {
    const source = read("client/src/pages/Voucher.tsx");
    // The element is the code-display button, identified by its click handler.
    // Its text content lives after the closing `>`, so the match spans it.
    const element = source.match(/<button[^>]*onClick=\{copyCode\}[\s\S]{0,200}?<\/button>/);
    expect(element).not.toBeNull();
    expect(element![0]).toMatch(/dir="ltr"/);
    // And it really is the code, not some unrelated button on the page.
    expect(element![0]).toContain("voucher.code");
  });
});

describe("Checkout flight number: dir and alignment agree", () => {
  // `dir="ltr"` with `text-end` under RTL would push the value to the physical
  // left while the digits still read LTR — the two fight each other. text-start
  // is the pairing that matches the forced direction.
  it("uses text-start, not text-end, alongside dir=\"ltr\"", () => {
    const source = read("client/src/pages/Checkout.tsx");
    const input = source.match(/<input\b[^>]*id="flight-number"[\s\S]{0,700}?\/>/);
    expect(input).not.toBeNull();
    const tag = input![0];
    expect(tag).toMatch(/dir="ltr"/);
    expect(tag).toMatch(/text-start/);
    expect(tag).not.toMatch(/text-end/);
  });
});
