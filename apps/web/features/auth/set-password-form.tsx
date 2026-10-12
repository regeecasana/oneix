"use client"

import { PASSWORD_MIN_LENGTH } from "@oneix/contracts"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useAcceptInvite, useLinkDetails, useResetPassword } from "./queries"

/**
 * Sets a password from a one-time link: accepting an invite (with the option to fix the name)
 * or resetting a forgotten password. Either way the person ends up signed in.
 */
export function SetPasswordForm({ token, purpose }: { token: string; purpose: "invite" | "password_reset" }) {
  const router = useRouter()
  const link = useLinkDetails(token)
  const accept = useAcceptInvite()
  const reset = useResetPassword()
  const action = purpose === "invite" ? accept : reset
  const [name, setName] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [problem, setProblem] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < PASSWORD_MIN_LENGTH) return setProblem(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    if (password !== confirm) return setProblem("The passwords don't match.")
    setProblem(null)
    const done = { onSuccess: () => router.replace("/inbox") }
    if (purpose === "invite") accept.mutate({ token, password, name: name ?? undefined }, done)
    else reset.mutate({ token, password }, done)
  }

  const wrongKind = link.data && link.data.purpose !== purpose

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{purpose === "invite" ? "Welcome to oneix" : "Choose a new password"}</CardTitle>
          <CardDescription>
            {link.data
              ? purpose === "invite"
                ? `Set a password for ${link.data.email}${link.data.tenantName ? ` to join ${link.data.tenantName}` : ""}.`
                : `For ${link.data.email}. Other devices will be signed out.`
              : "Checking your link…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {link.isPending && <Skeleton className="h-40 w-full" />}
          {(link.isError || wrongKind) && (
            <Alert variant="destructive">
              <AlertTitle>This link can&apos;t be used</AlertTitle>
              <AlertDescription>
                {link.error?.message ?? "This link is for something else."} Ask your workspace admin for a new one.
              </AlertDescription>
            </Alert>
          )}
          {link.data && !wrongKind && (
            <form onSubmit={submit} className="flex flex-col gap-4">
              {purpose === "invite" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" value={name ?? link.data.name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters. A passphrase works well.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {(problem || action.isError) && (
                <Alert variant="destructive">
                  <AlertDescription>{problem ?? action.error?.message}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={action.isPending}>
                {action.isPending && <Spinner data-icon="inline-start" />}
                {purpose === "invite" ? "Set password and sign in" : "Save password and sign in"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
