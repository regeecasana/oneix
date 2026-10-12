"use client"

import { ArrowLeft, Building2, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useDevDirectory, useDevLogin } from "@/features/auth/queries"
import { RoleBadge } from "@/features/tickets/labels"
import { initials } from "@/features/tickets/thread"
import { cn } from "@/lib/utils"

/**
 * Development sign-in: pick a workspace and any account, no password. Only shown when the API
 * has AUTH_DEV_LOGIN on, which it refuses in production.
 */
export function DevSignIn() {
  const router = useRouter()
  const directory = useDevDirectory()
  const login = useDevLogin()
  const tenants = directory.data?.tenants ?? []
  const [chosen, setChosen] = useState<string | null>(null)
  // With one client there is nothing to choose.
  const tenant = tenants.find((t) => t.slug === chosen) ?? (tenants.length === 1 ? tenants[0] : undefined)

  // Hidden entirely when development sign-in is off.
  if (directory.isError || (directory.isSuccess && tenants.length === 0)) return null

  return (
    <Card className={cn("w-full max-w-md border-dashed bg-transparent shadow-none")}>
      <CardHeader>
        <CardTitle className="text-base">Development sign-in</CardTitle>
        <CardDescription>
          {tenant ? `Pick an account in ${tenant.name}. No password.` : "Pick a workspace. Only in development."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {directory.isPending &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
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
  )
}
