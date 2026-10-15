"use client"

import { Check, ChevronsUpDown, Inbox, KeyRound, Link2, LogOut, Moon, PhoneCall, Sun, Users } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { type CSSProperties, type ReactNode, useState } from "react"
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { ChangePasswordDialog } from "@/features/auth/change-password-dialog"
import { useLogout, useMe, useSwitchTenant } from "@/features/auth/queries"
import { RoleBadge } from "@/features/tickets/labels"
import { TicketListPanel } from "@/features/tickets/ticket-list-panel"
import { initials } from "@/features/tickets/thread"
import { usePresence, usePresenceHeartbeat, useVoiceEvents } from "@/features/voice/queries"
import { SoftphoneProvider } from "@/features/voice/softphone"
import {
  ActiveCallBar,
  IncomingCallDialog,
  LiveCallsList,
  PresenceControl,
  useLiveCallCount,
} from "@/features/voice/voice-ui"

const nav = [
  { href: "/inbox", label: "Inbox", icon: Inbox, matches: ["/inbox", "/tickets"], adminOnly: false },
  { href: "/calls", label: "Live calls", icon: PhoneCall, matches: ["/calls"], adminOnly: false },
  { href: "/team", label: "Team", icon: Users, matches: ["/team"], adminOnly: true },
]

type Me = NonNullable<ReturnType<typeof useMe>["data"]>

/**
 * Workspace shell. The sidebar is an icon rail (client workspace, navigation, account) and, beside
 * an open ticket, the ticket list with its channel tabs, so agents move between tickets without
 * leaving the one they're in. The list collapses to leave just the rail.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const me = useMe()

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

  return <Workspace me={me.data}>{children}</Workspace>
}

/** The signed-in workspace: sidebar, header, and the page. */
function Workspace({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname()
  const presence = usePresence()
  const items = nav.filter((item) => !item.adminOnly || me.role === "admin")
  const current = items.find((item) => item.matches.some((prefix) => pathname.startsWith(prefix)))
  // The ticket list sits beside an open ticket, and the live calls beside the calls page; the inbox
  // page has the full table instead.
  const panel = pathname.startsWith("/tickets/") ? "tickets" : pathname.startsWith("/calls") ? "calls" : null
  const listPanel = panel !== null

  return (
    <VoiceShell>
    <SidebarProvider
      style={{ "--sidebar-width": listPanel ? "22rem" : "calc(var(--sidebar-width-icon) + 1px)" } as CSSProperties}
    >
      <Sidebar collapsible="icon" className="overflow-hidden *:data-[sidebar=sidebar]:flex-row">
        {/* The rail: always icons only. */}
        <Sidebar collapsible="none" className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r">
          <SidebarHeader>
            <WorkspaceSwitcher me={me} />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent className="px-1.5 md:px-0">
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={item === current}
                        tooltip={{ children: item.label, hidden: false }}
                        className="px-2.5 md:px-2"
                      >
                        <Link href={item.href}>
                          <span className="relative">
                            <item.icon />
                            {item.href === "/calls" && <LiveCallCount />}
                          </span>
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
            <AccountMenu me={me} />
          </SidebarFooter>
        </Sidebar>

        {listPanel && (
          <Sidebar collapsible="none" className="hidden min-w-0 flex-1 md:flex">
            {panel === "tickets" ? <TicketListPanel /> : <LiveCallsPanel />}
          </Sidebar>
        )}
      </Sidebar>

      {/* Exactly the viewport's height: pages scroll inside, and a page can fill the height instead. */}
      <SidebarInset className="h-svh min-w-0 overflow-hidden bg-muted/30">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          {listPanel && (
            <>
              <SidebarTrigger className="-ml-1" aria-label="Show or hide the list" />
              <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            </>
          )}
          <span className="text-sm font-medium">{current?.label}</span>
          <div className="ml-auto flex items-center gap-3">
            <ActiveCallBar />
            <PresenceControl presence={presence.data} />
          </div>
        </header>
        {!me.permissions.linked && (
          <div className="border-b bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <span className="flex items-center gap-2">
              <Link2 className="size-4 shrink-0" aria-hidden />
              Your account isn&apos;t linked to a Zendesk user yet, so you can read tickets but not reply or change them.
              Ask a workspace admin to link it.
            </span>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
    </VoiceShell>
  )
}

/**
 * Voice for the workspace: the agent's softphone (registered while they're available), the
 * availability check-ins, live call events, and the incoming-call pop-up.
 */
function VoiceShell({ children }: { children: ReactNode }) {
  const presence = usePresence()
  usePresenceHeartbeat(presence.data?.status)
  useVoiceEvents()
  return (
    <SoftphoneProvider
      credentials={presence.data?.softphone ?? null}
      enabled={presence.data?.status === "available"}
    >
      {children}
      <IncomingCallDialog />
    </SoftphoneProvider>
  )
}

/** The number of live calls, on the rail icon. */
function LiveCallCount() {
  const count = useLiveCallCount()
  if (count === 0) return null
  return (
    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white tabular-nums">
      {count}
    </span>
  )
}

/** The live calls beside the calls page. */
function LiveCallsPanel() {
  const count = useLiveCallCount()
  return (
    <>
      <SidebarHeader className="gap-1 border-b p-4">
        <span className="text-base font-medium text-foreground">Live calls</span>
        <span className="text-xs text-muted-foreground">
          {count === 0 ? "Nobody is on a call." : `${count} ${count === 1 ? "call" : "calls"} in progress`}
        </span>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <LiveCallsList />
      </SidebarContent>
    </>
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
      tooltip={{ children: `oneix · ${me.tenant.name}`, hidden: false }}
      disabled={switchTenant.isPending}
      className="data-[state=open]:bg-sidebar-accent md:h-8 md:p-0"
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
            <SidebarMenuButton
              size="lg"
              tooltip={{ children: me.name, hidden: false }}
              className="data-[state=open]:bg-sidebar-accent md:h-8 md:p-0"
            >
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
