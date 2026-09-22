import { describe, expect, it } from "vitest";
import { validateExternalUrl } from "./urlGuard";

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