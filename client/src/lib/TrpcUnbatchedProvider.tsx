import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink } from "@trpc/client";
import superjson from "superjson";
import type { ReactNode } from "react";
import { trpcApiUrl, trpcFetch, trpcHeaders } from "./trpcLink";
import { trpcUnbatched } from "./trpcUnbatched";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const client = trpcUnbatched.createClient({
  links: [
    // httpLink (NOT httpBatchLink): one HTTP request per procedure. Batches of
    // 3+ procedures stall against the production transaction-mode pooler.
    httpLink({
      url: trpcApiUrl,
      transformer: superjson,
      headers: trpcHeaders,
      fetch: trpcFetch,
    }),
  ],
});

/** Provides a subtree with an UNBATCHED tRPC client (see trpcUnbatched). */
export function TrpcUnbatchedProvider({ children }: { children: ReactNode }) {
  return (
    <trpcUnbatched.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpcUnbatched.Provider>
  );
}