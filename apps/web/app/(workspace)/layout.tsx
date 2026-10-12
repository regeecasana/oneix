"use client"

import { Inbox, KeyRound, Link2, LogOut, Moon, Sun, Users } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { type ReactNode, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ChangePasswordDialog } from "@/features/auth/change-password-dialog"
import { useLogout, useMe, useSwitchTenant } from "@/features/auth/queries"
import { RoleBadge } from "@/features/tickets/labels"
import { initials } from "@/features/tickets/thread"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/inbox", label: "Inbox", icon: Inbox, matches: ["/inbox", "/tickets"], adminOnly: false },
  { href: "/team", label: "Team", icon: Users, matches: ["/team"], adminOnly: true },
]

/** Workspace shell. Agent state and the softphone dock join the header in later milestones. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const me = useMe()
  const logout = useLogout()
  const switchTenant = useSwitchTenant()
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [changingPassword, setChangingPassword] = useState(false)

  if (me.isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (me.isError) {
    // A 401 redirects to /login from the query cache; anything else is shown here.
    return (
      <div className="p-8">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Couldn&apos;t load your session</AlertTitle>
          <AlertDescription>{me.error.message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="flex h-14 items-center gap-4 px-6">
          <Link href="/inbox" className="text-base font-semibold tracking-tight">
            oneix
          </Link>

          {/* The client workspace the agent is in. Agents serving several clients switch here. */}
          {me.data.tenants.length > 1 ? (
            <Select
              value={me.data.tenant.slug}
              disabled={switchTenant.isPending}
              onValueChange={(slug) => switchTenant.mutate(slug, { onSuccess: () => router.replace("/inbox") })}
            >
              <SelectTrigger size="sm" aria-label="Client workspace" className="font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {me.data.tenants.map((t) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary">{me.data.tenant.name}</Badge>
          )}

          <nav className="flex gap-1">
            {nav.filter((item) => !item.adminOnly || me.data.role === "admin").map((item) => {
              const active = item.matches.some((prefix) => pathname.startsWith(prefix))
              return (
                <Button key={item.href} asChild variant="ghost" size="sm" className={cn(active && "bg-muted")}>
                  <Link href={item.href}>
                    <item.icon data-icon="inline-start" />
                    {item.label}
                  </Link>
                </Button>
              )
            })}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto gap-2">
                <Avatar size="sm">
                  <AvatarFallback>{initials(me.data.name)}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline">{me.data.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex flex-col gap-1.5">
                <span className="font-medium text-foreground">{me.data.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{me.data.email}</span>
                <span className="flex flex-wrap gap-1">
                  {me.data.roles.map((role) => (
                    <RoleBadge key={role} role={role} />
                  ))}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setChangingPassword(true)}>
                  <KeyRound />
                  Change password
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                  {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {!me.data.permissions.linked && (
        <div className="border-b bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="mx-auto flex max-w-7xl items-center gap-2">
            <Link2 className="size-4 shrink-0" aria-hidden />
            Your account isn&apos;t linked to a Zendesk user yet, so you can read tickets but not reply or change them. Ask a
            workspace admin to link it.
          </span>
        </div>
      )}
      <main className="flex-1">{children}</main>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </div>
  )
}
