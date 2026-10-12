"use client"

import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { DevSignIn } from "@/features/auth/dev-sign-in"
import { useLogin } from "@/features/auth/queries"

export default function LoginPage() {
  const router = useRouter()
  const login = useLogin()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  function submit(event: FormEvent) {
    event.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => router.replace("/inbox") })
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to oneix</CardTitle>
          <CardDescription>Use your oneix account, not your Zendesk login.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {login.isError && (
              <Alert variant="destructive">
                <AlertDescription>{login.error.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={login.isPending}>
              {login.isPending && <Spinner data-icon="inline-start" />}
              Sign in
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Forgot your password or need access? Ask your workspace admin for a link.
            </p>
          </form>
        </CardContent>
      </Card>

      <DevSignIn />
    </main>
  )
}
