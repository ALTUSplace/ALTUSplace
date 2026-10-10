import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./analytics";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("trackEvent", () => {
  it("is a no-op when there is no window (SSR/tests)", () => {
    expect(() => trackEvent("view_listing", { listing_id: 12 })).not.toThrow();
  });

  it("forwards the event to window.gtag when available", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackEvent("initiate_booking", { listing_id: 42, currency: "MAD", nights: 3 });
    expect(gtag).toHaveBeenCalledWith("event", "initiate_booking", {
      listing_id: 42,
      currency: "MAD",
      nights: 3,
    });
  });

  it("drops null/undefined params before forwarding", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    trackEvent("click_quick_date", {
      listing_id: 7,
      mode: "tomorrow",
      city: undefined,
      notes: null,
    });
    expect(gtag).toHaveBeenCalledWith("event", "click_quick_date", {
      listing_id: 7,
      mode: "tomorrow",
    });
  });

  it("falls back to a console stub and never throws when gtag is missing", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.stubGlobal("window", {});
    expect(() => trackEvent("whatsapp_handoff", { context: "share" })).not.toThrow();
    expect(debug).toHaveBeenCalled();
  });

  it("never throws if the provider itself throws", () => {
    vi.stubGlobal("window", {
      gtag: () => {
        throw new Error("analytics down");
      },
    });
    expect(() => trackEvent("signup_completed", { method: "password" })).not.toThrow();
  });
});