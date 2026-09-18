import { TRPCClientError } from "@trpc/client";

type ZodErrorLike = {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
};

type TrpcDataLike = {
  code?: string;
  httpStatus?: number;
  zodError?: ZodErrorLike;
};

/** Returns the tRPC error code (e.g. "CONFLICT") when one is present. */
export function trpcErrorCode(error: unknown): string | undefined {
  if (error instanceof TRPCClientError) {
    return (error.data as TrpcDataLike | undefined)?.code;
  }
  return undefined;
}

/**
 * Turns any thrown value (tRPC, fetch, Error) into a single user-facing string.
 * Input-validation errors surface their first field message so forms can show
 * something actionable instead of a serialized zod payload.
 */
export function formatApiError(error: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى."): string {
  if (error instanceof TRPCClientError) {
    const data = error.data as TrpcDataLike | undefined;
    const fieldMessages = data?.zodError?.fieldErrors
      ? (Object.values(data.zodError.fieldErrors).flat().filter(Boolean) as string[])
      : [];
    if (fieldMessages.length) return fieldMessages[0];
    const formMessages = data?.zodError?.formErrors ?? [];
    if (formMessages.length) return formMessages[0];
    if (error.message && !error.message.trim().startsWith("[")) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
