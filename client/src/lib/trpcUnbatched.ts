import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

/**
 * tRPC client whose procedures are sent as INDIVIDUAL HTTP requests (no
 * batching). Production deployments of this app can stall when a single
 * request batches 3+ procedures (the Supabase transaction-mode pooler never
 * answers those), while every procedure succeeds on its own request. The
 * admin dashboard mounts ~10 queries at once, so it must use this client
 * (see TrpcUnbatchedProvider) instead of the default httpBatchLink one.
 */
export const trpcUnbatched = createTRPCReact<AppRouter>();