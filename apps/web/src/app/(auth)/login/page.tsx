"use client";

import { useRouter } from "next/navigation";
import { useDevLogin, useDevUsers } from "@/features/auth/queries";

export default function LoginPage() {
  const router = useRouter();
  const users = useDevUsers();
  const login = useDevLogin();

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">oneix</h1>
        <p className="mt-1 text-sm text-zinc-500">Development sign-in. Pick an agent to continue.</p>

        <div className="mt-6 space-y-2">
          {users.isPending && <p className="text-sm text-zinc-500">Loading agents…</p>}
          {users.isError && (
            <p className="text-sm text-rose-700">
              Development sign-in is unavailable. Check that the API is running with AUTH_DEV_LOGIN=true.
            </p>
          )}
          {users.data?.items.length === 0 && (
            <p className="text-sm text-zinc-500">No agents yet. Run npm run db:seed.</p>
          )}
          {users.data?.items.map((user) => (
            <button
              key={user.id}
              type="button"
              disabled={login.isPending}
              onClick={() => login.mutate(user.email, { onSuccess: () => router.replace("/inbox") })}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-left hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-zinc-500">{user.email}</span>
              </span>
              <span className="text-xs text-zinc-400 capitalize">{user.role}</span>
            </button>
          ))}
          {login.isError && <p className="text-sm text-rose-700">{login.error.message}</p>}
        </div>
      </div>
    </main>
  );
}
