"use client"

import { Check, ChevronsUpDown, Inbox, KeyRound, Link2, LogOut, Moon, Sun, Users } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { type ReactNode, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { ChangePasswordDialog } from "@/features/auth/change-password-dialog"
import { useLogout, useMe, useSwitchTenant } from "@/features/auth/queries"
import { RoleBadge } from "@/features/tickets/labels"
import { initials } from "@/features/tickets/thread"

const nav = [
  { href: "/inbox", label: "Inbox", icon: Inbox, matches: ["/inbox", "/tickets"], adminOnly: false },
  { href: "/team", label: "Team", icon: Users, matches: ["/team"], adminOnly: true },
]

type Me = NonNullable<ReturnType<typeof useMe>["data"]>

/** Workspace shell: a collapsible sidebar with the client workspace, navigation, and the account menu. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const me = useMe()
  const pathname = usePathname()

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

  const items = nav.filter((item) => !item.adminOnly || me.data.role === "admin")
  const current = items.find((item) => item.matches.some((prefix) => pathname.startsWith(prefix)))

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <WorkspaceSwitcher me={me.data} />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item === current} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <AccountMenu me={me.data} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-muted/30">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <span className="text-sm font-medium">{current?.label}</span>
        </header>
        {!me.data.permissions.linked && (
          <div className="border-b bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <span className="flex items-center gap-2">
              <Link2 className="size-4 shrink-0" aria-hidden />
              Your account isn&apos;t linked to a Zendesk user yet, so you can read tickets but not reply or change them.
              Ask a workspace admin to link it.
            </span>
          </div>
        )}
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** oneix and the client workspace the agent is in. Agents serving several clients switch here. */
function WorkspaceSwitcher({ me }: { me: Me }) {
  const switchTenant = useSwitchTenant()
  const router = useRouter()
  const { isMobile } = useSidebar()
  const several = me.tenants.length > 1

  const button = (
    <SidebarMenuButton
      size="lg"
      tooltip={me.tenant.name}
      disabled={switchTenant.isPending}
      className="data-[state=open]:bg-sidebar-accent"
      asChild={!several}
    >
      {several ? (
        <WorkspaceLabel name={me.tenant.name} switchable />
      ) : (
        <Link href="/inbox">
          <WorkspaceLabel name={me.tenant.name} />
        </Link>
      )}
    </SidebarMenuButton>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {several ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" side={isMobile ? "bottom" : "right"} className="w-60">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Client workspaces</DropdownMenuLabel>
              {me.tenants.map((t) => (
                <DropdownMenuItem
                  key={t.slug}
                  onSelect={() => {
                    if (t.slug !== me.tenant.slug) switchTenant.mutate(t.slug, { onSuccess: () => router.replace("/inbox") })
                  }}
                >
                  {t.name}
                  {t.slug === me.tenant.slug && <Check className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          button
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function WorkspaceLabel({ name, switchable = false }: { name: string; switchable?: boolean }) {
  return (
    <>
      <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
        o
      </span>
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate font-semibold tracking-tight">oneix</span>
        <span className="truncate text-xs text-muted-foreground">{name}</span>
      </span>
      {switchable && <ChevronsUpDown className="ml-auto" />}
    </>
  )
}

function AccountMenu({ me }: { me: Me }) {
  const logout = useLogout()
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { resolvedTheme, setTheme } = useTheme()
  const [changingPassword, setChangingPassword] = useState(false)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={me.name} className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(me.name)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{me.name}</span>
                <span className="truncate text-xs text-muted-foreground">{me.email}</span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side={isMobile ? "bottom" : "right"} className="w-64">
            <DropdownMenuLabel className="flex flex-col gap-1.5">
              <span className="font-medium text-foreground">{me.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{me.email}</span>
              <span className="flex flex-wrap gap-1">
                {me.roles.map((role) => (
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
        <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
