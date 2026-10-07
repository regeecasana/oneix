"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useLogout, useMe } from "@/features/auth/queries";

const nav = [{ href: "/inbox", label: "Inbox" }];

/** Workspace shell. Agent state and the softphone dock join the header in later milestones. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
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
