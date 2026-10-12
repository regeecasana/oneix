"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"
import { ApiError } from "@/lib/api"

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  )
  return (
    <QueryClientProvider client={client}>
      <SignInOnUnauthorized client={client} />
      {children}
    </QueryClientProvider>
  )
}

/** Pages anyone can open; a 401 there is part of the page, not a reason to go to sign-in. */
const PUBLIC_PATHS = ["/login", "/invite/", "/reset-password/"]

/** Any request that comes back 401 sends the agent to sign in. */
function SignInOnUnauthorized({ client }: { client: QueryClient }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const onError = (error: unknown) => {
      const onPublicPage = PUBLIC_PATHS.some((path) => pathname.startsWith(path))
      if (error instanceof ApiError && error.status === 401 && !onPublicPage) router.replace("/login")
    }
    const unsubscribeQueries = client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") onError(event.action.error)
    })
    const unsubscribeMutations = client.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") onError(event.action.error)
    })
    return () => {
      unsubscribeQueries()
      unsubscribeMutations()
    }
  }, [client, router, pathname])

  return null
}
