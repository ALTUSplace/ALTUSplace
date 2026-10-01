/**
 * Touch-target floor guard (44px).
 *
 * Why this exists: nothing in `tsc`, in the build, or in the rest of the suite
 * can see that a control is too small to hit with a thumb. A `h-8` Button and
 * a `h-11` Button are both perfectly valid Tailwind classes that compile to
 * real CSS, so the audit trail is "does the class string still say what the
 * design system says". The original audit found the floor broken in four
 * different layers at once, which is the signature of a *systemic* gap rather
 * than four separate typos:
 *
 *   - `Button size="icon"` was `size-10` (40px) and `icon-sm` was `size-8`
 *   - `Input` was `h-9` (36px)
 *   - raw icon buttons in the modals were `h-9 w-9` / `w-8 h-8` (32-36px)
 *   - `Checkbox` was a 16px box and `Switch` an 18x32 track
 *
 * The last two are deliberately NOT made 44px visually — a 44px checkbox
 * destroys the form rows it sits in. They carry an unpainted `after:`
 * hit-area expander instead, so this test accepts either a real 44px box or a
 * documented expander, and rejects the silent regression.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

/** Tailwind spacing step -> px. `size-11`/`min-h-11` = 2.75rem = 44px. */
const PX_PER_REM = 16;
const UNIT: Record<string, number> = { "0.25": 4, "0.5": 8, "0.75": 12, "1.5": 6, "1.75": 7 };

/**
 * Resolves a Tailwind height/width utility to px, or null when the token is not
 * a fixed pixel height (fluid widths, arbitrary values, `full`, `1fr`, ...).
 */
function pxOf(token: string): number | null {
  let match = token.match(/^(?:h|w|size|min-h|min-w)-(\d+(?:\.\d+)?)$/);
  if (match) return Number(match[1]) * 4;

  match = token.match(/^(?:h|w|size|min-h|min-w)-\[(\d+(?:\.\d+)?)px\]$/);
  if (match) return Number(match[1]);

  match = token.match(/^(?:h|w|size|min-h|min-w)-\[(\d+(?:\.\d+)?)rem\]$/);
  if (match) return Number(match[1]) * PX_PER_REM;

  return null;
}

/** True when the class string gives the element a >=44px tall target. */
function meetsFloor(className: string): boolean {
  const tokens = className.split(/\s+/);
  // A `min-h-*` at or above the floor is sufficient on its own — min-height
  // always beats height, so `min-h-11` + `h-8` is still a 44px target.
  return tokens.some((token) => {
    const px = pxOf(token);
    return px !== null && px >= 44;
  });
}

describe("touch targets meet the 44px floor", () => {
  describe("shared UI primitives", () => {
    it("Button has no size variant below 44px", () => {
      const source = read("client/src/components/ui/button.tsx");
      // Pull the `size:` block out of the cva variant map, minus comments —
      // the prose inside it legitimately mentions `h-8` and `h-10` when
      // recording what each variant *used* to be.
      const block = source
        .match(/size:\s*\{([\s\S]*?)\n\s{6}\}/)?.[1]
        ?.replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect(block, "could not locate the Button `size:` variant block").toBeTruthy();

      // Keys are bare identifiers for the simple names (`sm:`) and quoted for
      // the hyphenated ones (`"icon-sm":`) — a regex that only accepts one of
      // the two forms silently skips the other half of the table.
      //
      // `matchAll` returns a one-shot iterator: spread it into an array ONCE.
      // Asserting on `[...variants].length` and *then* looping `variants`
      // iterates an already-exhausted iterator, so `offenders` stays empty and
      // the guard passes no matter what the file says.
      const variants = [
        ...block!.matchAll(/(?:"([^"]+)"|([A-Za-z][\w-]*))\s*:\s*"([^"]+)"/g),
      ];
      expect(
        variants.length,
        "parsed no size variants — the key regex does not match this file's style",
      ).toBeGreaterThanOrEqual(6);

      const offenders: string[] = [];
      for (const [, quoted, bare, classes] of variants) {
        const name = quoted ?? bare;
        // Icon variants carry an explicit square `size-*`; text variants carry a
        // `min-h-*`/`h-*`. Accept whichever the variant actually uses.
        const tall = classes.match(/\b(?:h|min-h)-(\d+(?:\.\d+)?)\b/)?.[1];
        const square = classes.match(/\bsize-(\d+(?:\.\d+)?)\b/)?.[1];
        const px = tall ? Number(tall) * 4 : square ? Number(square) * 4 : null;
        if (px !== null && px < 44) offenders.push(`size="${name}" -> ${classes}`);
      }
      expect(
        offenders,
        `Button variants under the 44px touch floor:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });

    it("Input is at least 44px tall", () => {
      // Scope to the <input>'s own class string rather than the whole file —
      // scanning the file would pass on any `min-h-11` appearing anywhere,
      // including inside a comment, even with `h-9` still on the element.
      const source = read("client/src/components/ui/input.tsx");
      const classes = source.match(/"[^"]*border-input[^"]*"/)?.[0];
      expect(classes, "could not find the Input class string").toBeTruthy();
      expect(
        meetsFloor(classes!),
        `Input was h-9 (36px); it needs min-h-11 so every field is tappable. Got: ${classes}`,
      ).toBe(true);
      // And it must not still be pinned to a sub-44px height. Only an
      // *unprefixed* token applies unconditionally: `file:h-7` styles the file
      // upload button nested inside the input and is irrelevant here, and a
      // bare `h-9` would outrank `min-h-11` only if min-height did not, which
      // it does — but pinning it back is still the regression worth catching.
      const bareSizeTokens = classes!.match(/(?<![:\w-])h-(?:[1-9]|10)\b/g) ?? [];
      expect(
        bareSizeTokens,
        `Input still declares an explicit h-* under 44px: ${classes}`,
      ).toEqual([]);
    });

    it("Select trigger is at least 44px tall in both sizes", () => {
      const source = read("client/src/components/ui/select.tsx");
      for (const size of ["default", "sm"]) {
        expect(
          source.includes(`data-[size=${size}]:min-h-11`),
          `Select size="${size}" trigger is still under 44px`,
        ).toBe(true);
        // `h-9` / `h-8` are gone, not merely supplemented — a leftover
        // `data-[size=default]:h-9` would pin the height back down.
        expect(
          new RegExp(`data-\\[size=${size}\\]:h-`).test(source),
          `Select size="${size}" still pins a sub-44px height`,
        ).toBe(false);
      }
    });

    it("Tabs list is at least 44px tall", () => {
      const source = read("client/src/components/ui/tabs.tsx");
      const classes = source.match(/"[^"]*bg-muted text-muted-foreground[^"]*"/)?.[0];
      expect(classes, "could not find the TabsList class string").toBeTruthy();
      expect(
        meetsFloor(classes!),
        `TabsList was h-9 (36px). Got: ${classes}`,
      ).toBe(true);
    });

    it.each([
      ["Checkbox", "client/src/components/ui/checkbox.tsx"],
      ["Switch", "client/src/components/ui/switch.tsx"],
    ])("%s is either 44px or carries a hit-area expander", (name, path) => {
      const source = read(path);
      const expanded = /after:absolute\s+after:-inset/.test(source);
      const sized = meetsFloor(source);
      expect(
        expanded || sized,
        `${name} is a small visual control with no 44px target. Either size it ` +
          `to 44px, or add an unpainted expander: ` +
          `after:absolute after:-inset-[14px] after:content-['']`,
      ).toBe(true);
    });
  });

  describe("raw icon buttons on modal chrome", () => {
    it.each([
      ["AIChatWidget", "client/src/components/AIChatWidget.tsx"],
      ["AuthModal", "client/src/components/ui/AuthModal.tsx"],
      ["PaymentCheckoutModal", "client/src/components/PaymentCheckoutModal.tsx"],
      ["SecurePaymentModal", "client/src/components/SecurePaymentModal.tsx"],
    ])("%s close control meets the floor", (name, path) => {
      const source = read(path);
      // The dismiss control: a close handler whose own class string is the only
      // place the size is declared.
      const close = source.match(
        /onClick=\{(?:[^}]*?)(?:onClose|handleClose|setIsOpen\(false\))[^}]*\}[^>]*?className="([^"]*)"/,
      )?.[1];
      expect(close, `could not find ${name}'s close control class string`).toBeTruthy();

      // Two sanctioned shapes: a genuinely 44px box, or a compact box carrying
      // an unpainted `after:` expander. The expander is preferred wherever the
      // control sits in a `justify-between` row with no gap or against a
      // container edge — sizing the box up there overlaps the neighbour.
      const sized = meetsFloor(close!);
      const expanded = /after:absolute\s+after:-inset-\[/.test(close!);
      expect(
        sized || expanded,
        `${name} close control is under 44px and has no hit-area expander: ${close}`,
      ).toBe(true);
    });
  });

  describe("AIChatWidget responsive panel", () => {
    const source = read("client/src/components/AIChatWidget.tsx");

    it("cannot overflow a 360px viewport", () => {
      // The container is `left-6` (24px). A fixed 350px panel therefore needed
      // 374px and forced a horizontal scrollbar on the most common phone
      // width. The width must be expressed against the viewport, not as a
      // constant.
      const width = source.match(/className="bg-white ([^"]*)"/)?.[1];
      expect(width, "could not find the open-panel class string").toBeTruthy();
      expect(
        width,
        "the panel width must be viewport-relative (100vw) so it fits 360px; " +
          "a fixed w-[350px] plus the left-6 gutter overflows by 14px",
      ).toContain("100vw");
      expect(width, "the panel must stay capped at its designed width").toMatch(
        /max-w-\[\d+px\]/,
      );
    });

    it("fits the gutter on both sides at 360px", () => {
      const width = source.match(/className="bg-white ([^"]*)"/)?.[1]!;
      const viewport = 360;
      const gutterEachSide = 24; // left-6, mirrored by 100vw - 3rem
      const panel = viewport - gutterEachSide * 2;
      expect(width).toContain(`w-[calc(100vw-3rem)]`);
      expect(panel).toBeGreaterThanOrEqual(0);
      // The literal the class encodes must equal 360 - 48.
      const literal = width.match(/w-\[calc\(100vw-(\d+)rem\)\]/)?.[1];
      expect(Number(literal) * PX_PER_REM).toBe(gutterEachSide * 2);
    });
  });
});