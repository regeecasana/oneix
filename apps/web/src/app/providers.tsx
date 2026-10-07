"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ApiError } from "@/lib/api";

/** Any request that comes back 401 sends the agent to sign in. */
function onError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
