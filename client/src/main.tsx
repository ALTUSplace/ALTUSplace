import { trpc } from "@/lib/trpc";
import { trpcApiUrl, trpcFetch, trpcHeaders } from "./lib/trpcLink";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

let redirectingToLogin = false;

const redirectToLoginIfUnauthorized = (error: unknown) => {
  try {
    if (!(error instanceof TRPCClientError)) return;
    if (typeof window === "undefined") return;

    const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
    if (!isUnauthorized) return;

    // Only attempt navigation once, so a stream of UNAUTHORIZED errors (protected
    // queries firing without a session) can't turn into a redirect loop.
    if (redirectingToLogin) return;
    redirectingToLogin = true;
    startLogin();
  } catch (redirectError) {
    // startLogin() must never crash react-query's cache/mutation update loop: a
    // throwing navigator left queries stuck in isPending (infinite spinners).
    console.error("[Auth] Failed to start login redirect:", redirectError);
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    // Passive page-load failures must NEVER hijack anonymous visitors on public
    // pages to the login gate — even if a protected query leaks onto a public
    // route. Only user-initiated mutations redirect (see the mutation cache below).
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: trpcApiUrl,
      transformer: superjson,
      headers: trpcHeaders,
      fetch: trpcFetch,
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
