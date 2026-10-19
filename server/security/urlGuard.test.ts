import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_REDIRECTS, fetchExternalBytes, fetchExternalText, validateExternalUrl } from "./urlGuard";

// Hermetic DNS: a public-looking IP so allow/deny logic is tested without
// touching the network.
const publicResolver = async () => [{ address: "13.248.210.221", family: 4 }];

describe("validateExternalUrl (iCal SSRF guard)", () => {
  it("blocks the cloud metadata IP 169.254.169.254", async () => {
    await expect(validateExternalUrl("https://169.254.169.254/latest/meta-data")).rejects.toThrow();
  });

  it("blocks localhost", async () => {
    await expect(validateExternalUrl("https://localhost/a.ics")).rejects.toThrow();
  });

  it("blocks the http scheme", async () => {
    await expect(validateExternalUrl("http://airbnb.com/ical.ics")).rejects.toThrow();
  });

  it("allows https airbnb.com when it resolves to a public IP", async () => {
    const url = await validateExternalUrl("https://airbnb.com/ical.ics", { resolver: publicResolver });
    expect(url.hostname).toBe("airbnb.com");
  });

  it("rejects a hostname that resolves to a private 10.x address", async () => {
    await expect(
      validateExternalUrl("https://internal.example/ical.ics", {
        resolver: async () => [{ address: "10.0.0.5", family: 4 }],
      }),
    ).rejects.toThrow();
  });

  it("rejects a hostname that resolves to an IPv4-mapped loopback", async () => {
    await expect(
      validateExternalUrl("https://mapped.example/ical.ics", {
        resolver: async () => [{ address: "::ffff:127.0.0.1", family: 6 }],
      }),
    ).rejects.toThrow();
  });

  it("enforces the ICAL_ALLOWED_HOSTS allowlist (exact host + subdomains)", async () => {
    const options = { allowedHosts: "airbnb.com,booking.com", resolver: publicResolver };
    await expect(validateExternalUrl("https://www.airbnb.com/x.ics", options)).resolves.toBeTruthy();
    await expect(validateExternalUrl("https://calendar.booking.com/x.ics", options)).resolves.toBeTruthy();
    await expect(validateExternalUrl("https://evil.example/x.ics", options)).rejects.toThrow();
  });
});

describe("redirect handling re-validates every hop (L-8)", () => {
  beforeEach(() => {
    // Keep the redirect tests independent from any local allowlist config.
    vi.stubEnv("ICAL_ALLOWED_HOSTS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a redirect into a private network before following it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://10.0.0.5/metadata" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternalText("https://93.184.216.34/feed.ics")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect chain and returns the final body", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://93.184.216.35/feed2.ics" } }))
      .mockResolvedValueOnce(new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR", { status: 200, headers: { "content-type": "text/calendar" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternalText("https://93.184.216.34/feed.ics")).resolves.toContain("BEGIN:VCALENDAR");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://93.184.216.35/feed2.ics");
  });

  it("stops a redirect loop once the hop limit is reached", async () => {
    const fetchMock = vi.fn(async (input: unknown) =>
      new Response(null, { status: 302, headers: { location: String(input) } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternalText("https://93.184.216.34/loop.ics")).rejects.toThrow(/redirect limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it("rejects a redirect to the cloud metadata IP for binary fetches too", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExternalBytes("https://93.184.216.34/audio.mp3", { maxBytes: 1024 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});