import type { DevDirectory, Me } from "@oneix/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), retry: false, staleTime: Infinity });
}

export function useDevDirectory() {
  return useQuery({
    queryKey: ["dev-directory"],
    queryFn: () => api<DevDirectory>("/auth/dev-directory"),
    retry: false,
  });
}

export function useDevLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (login: { email: string; tenant: string }) =>
      api<Me>("/auth/dev-login", { method: "POST", body: login }),
    onSuccess: (me) => {
      queryClient.clear();
      queryClient.setQueryData(["me"], me);
    },
  });
}

/** Moves the session to another client. Everything cached belongs to the old one, so it is dropped. */
export function useSwitchTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenant: string) => api<Me>("/auth/switch-tenant", { method: "POST", body: { tenant } }),
    onSuccess: (me) => {
      queryClient.clear();
      queryClient.setQueryData(["me"], me);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => queryClient.clear(),
  });
}
