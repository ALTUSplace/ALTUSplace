import { describe, expect, it } from "vitest";
import { sanitizeTrpcInput } from "../../server/_core/security";

describe("XSS sanitization - sanitizeTrpcInput", () => {
  it("escapes HTML tags in string values", () => {
    const input = { name: '<script>alert("xss")</script>' };
    const result = sanitizeTrpcInput(input) as { name: string };
    expect(result.name).not.toContain("<script>");
    expect(result.name).toContain("&lt;");
  });

  it("escapes onerror handlers in strings", () => {
    const input = { value: '<img src=x onerror="alert(1)">' };
    const result = sanitizeTrpcInput(input) as { value: string };
    expect(result.value).not.toContain("<img");
    expect(result.value).not.toContain("onerror");
  });

  it("leaves numbers unchanged", () => {
    const input = { count: 42, price: 100.5 };
    const result = sanitizeTrpcInput(input) as { count: number; price: number };
    expect(result.count).toBe(42);
    expect(result.price).toBe(100.5);
  });

  it("leaves booleans unchanged", () => {
    const input = { active: true, disabled: false };
    const result = sanitizeTrpcInput(input) as { active: boolean; disabled: boolean };
    expect(result.active).toBe(true);
    expect(result.disabled).toBe(false);
  });

  it("handles nested objects", () => {
    const input = {
      user: {
        name: '<script>alert("xss")</script>',
        age: 25,
      },
    };
    const result = sanitizeTrpcInput(input) as { user: { name: string; age: number } };
    expect(result.user.name).not.toContain("<script>");
    expect(result.user.age).toBe(25);
  });

  it("handles arrays of strings", () => {
    const input = { tags: ['<script>alert(1)</script>', 'normal'] };
    const result = sanitizeTrpcInput(input) as { tags: string[] };
    expect(result.tags[0]).not.toContain("<script>");
    expect(result.tags[1]).toBe("normal");
  });

  it("handles arrays of objects", () => {
    const input = {
      items: [
        { name: '<b>bold</b>', value: 1 },
        { name: '<i>italic</i>', value: 2 },
      ],
    };
    const result = sanitizeTrpcInput(input) as { items: { name: string; value: number }[] };
    expect(result.items[0].name).not.toContain("<b>");
    expect(result.items[0].value).toBe(1);
    expect(result.items[1].name).not.toContain("<i>");
  });

  it("handles null values", () => {
    const input = { value: null };
    const result = sanitizeTrpcInput(input) as { value: null };
    expect(result.value).toBeNull();
  });

  it("handles undefined values", () => {
    const input = { value: undefined };
    const result = sanitizeTrpcInput(input) as { value: undefined };
    expect(result.value).toBeUndefined();
  });

  it("handles deeply nested structures", () => {
    const input = {
      level1: {
        level2: {
          level3: {
            name: '<script>deep</script>',
          },
        },
      },
    };
    const result = sanitizeTrpcInput(input) as { level1: { level2: { level3: { name: string } } } };
    expect(result.level1.level2.level3.name).not.toContain("<script>");
  });

  it("handles empty strings", () => {
    const input = { value: "" };
    const result = sanitizeTrpcInput(input) as { value: string };
    expect(result.value).toBe("");
  });

  it("escapes all HTML special characters", () => {
    const input = { value: '<>&"\'' };
    const result = sanitizeTrpcInput(input) as { value: string };
    expect(result.value).not.toContain("<");
    expect(result.value).not.toContain(">");
    expect(result.value).not.toContain("&");
  });

  it("preserves non-HTML content", () => {
    const input = { text: "Hello World! This is normal text." };
    const result = sanitizeTrpcInput(input) as { text: string };
    expect(result.text).toBe("Hello World! This is normal text.");
  });

  it("handles prototype pollution attempts safely", () => {
    const input = {
      "__proto__": { polluted: true },
      "constructor": { prototype: { polluted: true } },
    };
    // Should not throw and should sanitize string values
    const result = sanitizeTrpcInput(input);
    expect(result).toBeDefined();
  });

  it("handles dates correctly", () => {
    const date = new Date("2026-09-10T12:00:00.000Z");
    const input = { startDate: date };
    const result = sanitizeTrpcInput(input) as { startDate: Date };
    expect(result.startDate).toBe(date);
  });

  it("handles mixed array types", () => {
    const input = { mixed: [1, "text", true, null, { key: "value" }] };
    const result = sanitizeTrpcInput(input) as { mixed: any[] };
    expect(result.mixed[0]).toBe(1);
    expect(result.mixed[1]).toBe("text");
    expect(result.mixed[2]).toBe(true);
    expect(result.mixed[3]).toBeNull();
    expect(result.mixed[4]).toEqual({ key: "value" });
  });
});
