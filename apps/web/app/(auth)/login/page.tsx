"use client"

import { ArrowLeft, Building2, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDevDirectory, useDevLogin } from "@/features/auth/queries"
import { RoleBadge } from "@/features/tickets/labels"
import { initials } from "@/features/tickets/thread"

export default function LoginPage() {
  const router = useRouter()
  const directory = useDevDirectory()
  const login = useDevLogin()
  const tenants = directory.data?.tenants ?? []
  const [chosen, setChosen] = useState<string | null>(null)
  // With one client there is nothing to choose.
  const tenant = tenants.find((t) => t.slug === chosen) ?? (tenants.length === 1 ? tenants[0] : undefined)

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">oneix</CardTitle>
          <CardDescription>
            Development sign-in. {tenant ? `Pick an agent in ${tenant.name}.` : "Pick a client workspace."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          {directory.isPending &&
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}

          {directory.isError && (
            <Alert variant="destructive">
              <AlertTitle>Sign-in is unavailable</AlertTitle>
              <AlertDescription>Check that the API is running with AUTH_DEV_LOGIN=true.</AlertDescription>
            </Alert>
          )}

          {directory.isSuccess && tenants.length === 0 && (
            <Alert>
              <AlertTitle>No client workspaces yet</AlertTitle>
              <AlertDescription>
                Add one with npm run tenant -- add, or set the ZENDESK_* values and run npm start.
              </AlertDescription>
            </Alert>
          )}

          {!tenant &&
            tenants.map((t) => (
              <Button
                key={t.slug}
                variant="outline"
                className="h-auto justify-start gap-3 py-3"
                onClick={() => setChosen(t.slug)}
              >
                <Building2 />
                <span className="flex flex-col items-start">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.agents.length} agents</span>
                </span>
                <ChevronRight className="ml-auto" />
              </Button>
            ))}

          {tenant && (
            <>
              {tenants.length > 1 && (
                <Button variant="ghost" size="sm" className="w-fit" onClick={() => setChosen(null)}>
                  <ArrowLeft data-icon="inline-start" />
                  All clients
                </Button>
              )}
              {tenant.agents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No agents yet. They are provisioned from the client&apos;s Zendesk.
                </p>
              )}
              <div className="-mx-1 flex max-h-[28rem] flex-col gap-2 overflow-y-auto px-1">
                {tenant.agents.map((agent) => (
                  <Button
                    key={agent.id}
                    variant="outline"
                    className="h-auto justify-start gap-3 py-2.5"
                    disabled={login.isPending}
                    onClick={() =>
                      login.mutate(
                        { email: agent.email, tenant: tenant.slug },
                        { onSuccess: () => router.replace("/inbox") },
                      )
                    }
                  >
                    <Avatar size="sm">
                      <AvatarFallback>{initials(agent.name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="font-medium">{agent.name}</span>
                      <span className="max-w-full truncate text-xs text-muted-foreground">{agent.email}</span>
                    </span>
                    <span className="ml-auto flex flex-wrap justify-end gap-1">
                      {(agent.roles.length > 0 ? agent.roles : [agent.role]).map((role) => (
                        <RoleBadge key={role} role={role} />
                      ))}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          )}

          {login.isError && (
            <Alert variant="destructive">
              <AlertDescription>{login.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
