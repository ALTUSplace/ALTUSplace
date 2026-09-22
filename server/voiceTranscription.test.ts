import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The SSRF guard + bounded fetch are mocked so these tests verify the WIRING
// inside transcribeAudio (guard invoked before any download, error mapping,
// 5 MB cap) without touching the network. The guard's own allow/deny logic is
// exercised for real in server/security/urlGuard.test.ts.
const mocks = vi.hoisted(() => ({
  validateExternalUrl: vi.fn(),
  fetchExternalBytes: vi.fn(),
}));

vi.mock("./security/urlGuard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./security/urlGuard")>();
  return {
    ...actual,
    validateExternalUrl: mocks.validateExternalUrl,
    fetchExternalBytes: mocks.fetchExternalBytes,
  };
});

const forgeFetch = vi.fn<typeof fetch>();

async function loadTranscribe() {
  process.env.BUILT_IN_FORGE_API_URL = "https://forge.test";
  process.env.BUILT_IN_FORGE_API_KEY = "test-key";
  vi.resetModules();
  const mod = await import("./_core/voiceTranscription");
  return mod;
}

type TranscribeModule = Awaited<ReturnType<typeof loadTranscribe>>;
let transcribe: TranscribeModule;

beforeAll(async () => {
  transcribe = await loadTranscribe();
});

beforeEach(() => {
  // Stub global fetch so the Whisper call in the allow-path test is hermetic.
  vi.stubGlobal("fetch", forgeFetch);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("transcribeAudio SSRF guard (audioUrl)", () => {
  it("blocks a private-IP audio URL before any download is attempted", async () => {
    mocks.validateExternalUrl.mockRejectedValueOnce(new Error("Adresse privée ou interne refusée."));

    const result = await transcribe.transcribeAudio({ audioUrl: "https://169.254.169.254/latest/meta-data" });

    expect(mocks.validateExternalUrl).toHaveBeenCalledWith("https://169.254.169.254/latest/meta-data");
    expect(mocks.fetchExternalBytes).not.toHaveBeenCalled();
    expect(result).toMatchObject({ code: "INVALID_FORMAT", error: "Audio URL is not allowed (HTTPS only; no private or internal hosts)" });
  });

  it("blocks a non-HTTPS audio URL", async () => {
    mocks.validateExternalUrl.mockRejectedValueOnce(new Error("Seule une URL HTTPS est autorisée."));

    const result = await transcribe.transcribeAudio({ audioUrl: "http://example.com/audio.mp3" });

    expect(mocks.validateExternalUrl).toHaveBeenCalledWith("http://example.com/audio.mp3");
    expect(mocks.fetchExternalBytes).not.toHaveBeenCalled();
    expect(result).toMatchObject({ code: "INVALID_FORMAT" });
  });

  it("allows a valid HTTPS audio URL and downloads it with a 5 MB cap", async () => {
    const audioUrl = "https://storage.example.com/uploads/audio.webm";
    mocks.validateExternalUrl.mockResolvedValueOnce(new URL(audioUrl));
    mocks.fetchExternalBytes.mockResolvedValueOnce({
      buffer: Buffer.from("fake-audio-bytes"),
      contentType: "audio/webm",
    });
    forgeFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        task: "transcribe",
        language: "en",
        duration: 1.5,
        text: "Hello from the test",
        segments: [] as unknown[],
      }),
    } as Response);

    const result = await transcribe.transcribeAudio({ audioUrl });

    expect(mocks.validateExternalUrl).toHaveBeenCalledWith(audioUrl);
    expect(mocks.fetchExternalBytes).toHaveBeenCalledWith(audioUrl, { maxBytes: 5 * 1024 * 1024 });
    expect(forgeFetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ text: "Hello from the test", language: "en" });
  });
});