import { TRPCClientError } from "@trpc/client";
import { trpcErrorCode } from "@/lib/apiError";

/**
 * API error taxonomy (roadmap Phase C / task O1).
 *
 * One place that turns any thrown value into a *handling decision*, so every
 * optimistic feature reacts the same way:
 *
 * - `retry`  → transient (offline / network / 5xx / 429); safe to retry.
 * - `inline` → validation; show the message next to the field, never retry.
 * - `login`  → auth; hand off to the login flow.
 * - `reload` → not found; drop local state and reload (or soft-delete).
 * - `notify` → conflict / forbidden / unknown; tell the user, do not retry.
 *
 * This file answers *what to do*. User-facing wording stays in
 * `formatApiError` (`@/lib/apiError`).
 */

export type ApiErrorKind =
  | "offline"
  | "network"
  | "validation"
  | "auth"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "rateLimited"
  | "server"
  | "unknown";

export type ApiErrorStrategy =
  | "retry"
  | "inline"
  | "login"
  | "reload"
  | "notify";

export interface ApiErrorClassification {
  kind: ApiErrorKind;
  strategy: ApiErrorStrategy;
  /** True when retrying the same request can plausibly succeed. */
  retryable: boolean;
  /** Raw tRPC error code, when the failure came from the API. */
  code?: string;
  /** HTTP status, when one is attached to the failure. */
  status?: number;
}

export interface ApiErrorContext {
  /** Override connectivity detection (useful in tests and SSR). */
  online?: boolean;
}

const STRATEGY_BY_KIND: Record<ApiErrorKind, ApiErrorStrategy> = {
  offline: "retry",
  network: "retry",
  rateLimited: "retry",
  server: "retry",
  validation: "inline",
  auth: "login",
  notFound: "reload",
  forbidden: "notify",
  conflict: "notify",
  unknown: "notify",
};

const RETRYABLE_KINDS: ReadonlySet<ApiErrorKind> = new Set<ApiErrorKind>([
  "offline",
  "network",
  "rateLimited",
  "server",
]);

/** tRPC error codes → kind. Unlisted codes classify as `unknown`. */
const KIND_BY_TRPC_CODE: Record<string, ApiErrorKind> = {
  // Validation
  BAD_REQUEST: "validation",
  PARSE_ERROR: "validation",
  PAYLOAD_TOO_LARGE: "validation",
  // Auth
  UNAUTHORIZED: "auth",
  FORBIDDEN: "forbidden",
  // Lifecycle
  NOT_FOUND: "notFound",
  CONFLICT: "conflict",
  TOO_MANY_REQUESTS: "rateLimited",
  // Transport / server
  TIMEOUT: "network",
  CLIENT_CLOSED_REQUEST: "network",
  INTERNAL_SERVER_ERROR: "server",
  NOT_IMPLEMENTED: "server",
  BAD_GATEWAY: "server",
  SERVICE_UNAVAILABLE: "server",
  GATEWAY_TIMEOUT: "server",
};

type TrpcDataLike = { code?: string; httpStatus?: number };

function classify(
  kind: ApiErrorKind,
  code?: string,
  status?: number,
): ApiErrorClassification {
  return {
    kind,
    strategy: STRATEGY_BY_KIND[kind],
    retryable: RETRYABLE_KINDS.has(kind),
    ...(code === undefined ? {} : { code }),
    ...(status === undefined ? {} : { status }),
  };
}

function isOnline(explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** `withTimeout` (lib/mutationGuards) races mutations against a hard deadline. */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "OperationTimeoutError";
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network error") ||
    message.includes("networkerror")
  );
}

function isValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ZodError") return true;
  return Array.isArray((error as { issues?: unknown }).issues);
}

/** Classifies any thrown value into a kind, a handling strategy and retryability. */
export function classifyApiError(
  error: unknown,
  context?: ApiErrorContext,
): ApiErrorClassification {
  if (error instanceof TRPCClientError) {
    const data = error.data as TrpcDataLike | undefined;
    const code = trpcErrorCode(error);
    if (code) {
      return classify(
        KIND_BY_TRPC_CODE[code] ?? "unknown",
        code,
        data?.httpStatus,
      );
    }
    // A tRPC client error without a server code is a transport failure
    // ("Failed to fetch", aborted request, offline gateway).
    return classify(isOnline(context?.online) ? "network" : "offline");
  }

  // Validation is connectivity-independent, so it wins over offline checks.
  if (isValidationError(error)) return classify("validation");
  if (isAbortError(error) || isTimeoutError(error)) return classify("network");
  if (!isOnline(context?.online)) return classify("offline");
  if (isNetworkError(error)) return classify("network");
  return classify("unknown");
}

/** True when retrying the same request can plausibly succeed. */
export function isRetryableApiError(
  error: unknown,
  context?: ApiErrorContext,
): boolean {
  return classifyApiError(error, context).retryable;
}

/** The recommended UI handling for a failure. */
export function apiErrorStrategy(
  error: unknown,
  context?: ApiErrorContext,
): ApiErrorStrategy {
  return classifyApiError(error, context).strategy;
}
