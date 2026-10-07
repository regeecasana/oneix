"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDevDirectory, useDevLogin } from "@/features/auth/queries";

/** Admins stand out, light agents read as limited, everything else neutral. */
function roleStyle(role: string): string {
  const name = role.toLowerCase();
  if (name.includes("admin")) return "bg-violet-100 text-violet-800";
  if (name.includes("light")) return "bg-zinc-100 text-zinc-600";
  if (name.includes("moderator")) return "bg-sky-100 text-sky-800";
  return "bg-emerald-100 text-emerald-800";
}

export default function LoginPage() {
  const router = useRouter();
  const directory = useDevDirectory();
  const login = useDevLogin();
  const tenants = directory.data?.tenants ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  // With one client there is nothing to choose.
  const tenant = tenants.find((t) => t.slug === chosen) ?? (tenants.length === 1 ? tenants[0] : undefined);

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">oneix</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Development sign-in. {tenant ? "Pick an agent to continue." : "Pick a client workspace."}
        </p>

        <div className="mt-6 space-y-2">
          {directory.isPending && <p className="text-sm text-zinc-500">Loading…</p>}
          {directory.isError && (
            <p className="text-sm text-rose-700">
              Development sign-in is unavailable. Check that the API is running with AUTH_DEV_LOGIN=true.
            </p>
          )}
          {directory.isSuccess && tenants.length === 0 && (
            <p className="text-sm text-zinc-500">
              No client workspaces yet. Add one with npm run tenant -- add, or set the ZENDESK_* values and run npm
              start.
            </p>
          )}

          {!tenant &&
            tenants.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => setChosen(t.slug)}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-left hover:border-zinc-400 hover:bg-zinc-50"
              >
                <span>
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block text-xs text-zinc-500">{t.slug}</span>
                </span>
                <span className="text-xs text-zinc-400">{t.agents.length} agents</span>
              </button>
            ))}

          {tenant && (
            <>
              {tenants.length > 1 && (
                <button
                  type="button"
                  onClick={() => setChosen(null)}
                  className="mb-2 text-sm text-zinc-500 hover:text-zinc-900"
                >
                  ← {tenant.name}
                </button>
              )}
              {tenant.agents.length === 0 && (
                <p className="text-sm text-zinc-500">No agents yet. They are provisioned from the client&apos;s Zendesk.</p>
              )}
              <div className="max-h-96 space-y-2 overflow-y-auto">
                {tenant.agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    disabled={login.isPending}
                    onClick={() =>
                      login.mutate(
                        { email: agent.email, tenant: tenant.slug },
                        { onSuccess: () => router.replace("/inbox") },
                      )
                    }
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-left hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <span>
                      <span className="block text-sm font-medium">{agent.name}</span>
                      <span className="block text-xs text-zinc-500">{agent.email}</span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {(agent.roles.length > 0 ? agent.roles : [agent.role]).map((role) => (
                        <span
                          key={role}
                          className={`rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${roleStyle(role)}`}
                        >
                          {role}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {login.isError && <p className="text-sm text-rose-700">{login.error.message}</p>}
        </div>
      </div>
    </main>
  );
}
