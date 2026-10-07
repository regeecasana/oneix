"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useLogout, useMe, useSwitchTenant } from "@/features/auth/queries";

const nav = [{ href: "/inbox", label: "Inbox" }];

/** Workspace shell. Agent state and the softphone dock join the header in later milestones. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  const switchTenant = useSwitchTenant();
  const pathname = usePathname();
  const router = useRouter();

  if (me.isPending) {
    return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  }
  if (me.isError) {
    // A 401 redirects to /login from the query cache; anything else is shown here.
    return <div className="p-8 text-sm text-rose-700">Couldn&apos;t load your session: {me.error.message}</div>;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
        <div className="flex h-14 items-center gap-6 px-6">
          <Link href="/inbox" className="text-base font-semibold tracking-tight">
            oneix
          </Link>
          {/* The client workspace the agent is in. Agents serving several clients switch here. */}
          {me.data.tenants.length > 1 ? (
            <label className="text-sm">
              <span className="sr-only">Client workspace</span>
              <select
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium"
                value={me.data.tenant.slug}
                disabled={switchTenant.isPending}
                onChange={(e) =>
                  switchTenant.mutate(e.target.value, { onSuccess: () => router.replace("/inbox") })
                }
              >
                {me.data.tenants.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="rounded-md bg-zinc-100 px-2 py-1 text-sm font-medium text-zinc-700">
              {me.data.tenant.name}
            </span>
          )}
          <nav className="flex gap-1">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href) || (item.href === "/inbox" && pathname.startsWith("/tickets"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-zinc-600">{me.data.name}</span>
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-900"
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
