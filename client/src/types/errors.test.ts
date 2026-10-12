import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import {
  apiErrorStrategy,
  classifyApiError,
  isRetryableApiError,
} from "./errors";

function trpcError(code: string, httpStatus?: number) {
  return TRPCClientError.from({
    error: {
      message: code,
      code: -32600,
      data: { code, httpStatus },
    },
  });
}

function named(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("classifyApiError", () => {
  it.each([
    ["BAD_REQUEST", "validation", false],
    ["PARSE_ERROR", "validation", false],
    ["UNAUTHORIZED", "auth", false],
    ["FORBIDDEN", "forbidden", false],
    ["NOT_FOUND", "notFound", false],
    ["CONFLICT", "conflict", false],
    ["TOO_MANY_REQUESTS", "rateLimited", true],
    ["TIMEOUT", "network", true],
    ["CLIENT_CLOSED_REQUEST", "network", true],
    ["INTERNAL_SERVER_ERROR", "server", true],
    ["SERVICE_UNAVAILABLE", "server", true],
  ])(
    "maps the %s code to kind %s",
    (code: string, kind: string, retryable: boolean) => {
      const result = classifyApiError(trpcError(code, 400));

      expect(result.kind).toBe(kind);
      expect(result.retryable).toBe(retryable);
      expect(result.code).toBe(code);
      expect(result.status).toBe(400);
    },
  );

  it("maps each kind to its handling strategy", () => {
    expect(classifyApiError(trpcError("BAD_REQUEST")).strategy).toBe("inline");
    expect(classifyApiError(trpcError("UNAUTHORIZED")).strategy).toBe("login");
    expect(classifyApiError(trpcError("NOT_FOUND")).strategy).toBe("reload");
    expect(classifyApiError(trpcError("CONFLICT")).strategy).toBe("notify");
    expect(classifyApiError(trpcError("FORBIDDEN")).strategy).toBe("notify");
    expect(classifyApiError(trpcError("BAD_GATEWAY")).strategy).toBe("retry");
  });

  it("classifies an unlisted tRPC code as unknown", () => {
    const result = classifyApiError(trpcError("SOMETHING_NEW"));

    expect(result.kind).toBe("unknown");
    expect(result.strategy).toBe("notify");
    expect(result.retryable).toBe(false);
    expect(result.code).toBe("SOMETHING_NEW");
  });

  it("classifies a codeless tRPC failure as a network error", () => {
    const result = classifyApiError(
      TRPCClientError.from(new Error("Failed to fetch")),
    );

    expect(result.kind).toBe("network");
    expect(result.retryable).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it("reports offline when connectivity is unavailable", () => {
    const result = classifyApiError(new Error("boom"), { online: false });

    expect(result.kind).toBe("offline");
    expect(result.strategy).toBe("retry");
    expect(result.retryable).toBe(true);
  });

  it("treats validation as connectivity-independent", () => {
    expect(classifyApiError(named("ZodError"), { online: false }).kind).toBe(
      "validation",
    );
  });

  it("classifies aborts, timeouts and fetch failures as retryable network errors", () => {
    const failures: unknown[] = [
      named("AbortError"),
      named("OperationTimeoutError"),
      new TypeError("Failed to fetch"),
    ];

    for (const failure of failures) {
      const result = classifyApiError(failure);

      expect(result.kind).toBe("network");
      expect(result.retryable).toBe(true);
    }
  });

  it("falls back to unknown for unrecognized failures", () => {
    for (const failure of ["nope", new Error("boom")]) {
      const result = classifyApiError(failure);

      expect(result.kind).toBe("unknown");
      expect(result.strategy).toBe("notify");
      expect(result.retryable).toBe(false);
    }
  });
});

describe("error helpers", () => {
  it("exposes retryability and the handling strategy", () => {
    expect(isRetryableApiError(trpcError("SERVICE_UNAVAILABLE"))).toBe(true);
    expect(isRetryableApiError(trpcError("BAD_REQUEST"))).toBe(false);
    expect(apiErrorStrategy(trpcError("NOT_FOUND"))).toBe("reload");
  });
});
