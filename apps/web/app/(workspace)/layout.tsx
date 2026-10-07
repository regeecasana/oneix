"use client"

import { Inbox, LogOut, Moon, Sun } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import type { ReactNode } from "react"
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
import { useLogout, useMe, useSwitchTenant } from "@/features/auth/queries"
import { RoleBadge } from "@/features/tickets/labels"
import { initials } from "@/features/tickets/thread"
import { cn } from "@/lib/utils"

const nav = [{ href: "/inbox", label: "Inbox", icon: Inbox, matches: ["/inbox", "/tickets"] }]

/** Workspace shell. Agent state and the softphone dock join the header in later milestones. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const me = useMe()
  const logout = useLogout()
  const switchTenant = useSwitchTenant()
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()

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
            {nav.map((item) => {
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
      <main className="flex-1">{children}</main>
    </div>
  )
}
