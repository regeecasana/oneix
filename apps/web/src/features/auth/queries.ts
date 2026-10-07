import type { ListAgentsResponse, Me } from "@oneix/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me"), retry: false, staleTime: Infinity });
}

export function useDevUsers() {
  return useQuery({
    queryKey: ["dev-users"],
    queryFn: () => api<ListAgentsResponse>("/auth/dev-users"),
    retry: false,
  });
}

export function useDevLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api<Me>("/auth/dev-login", { method: "POST", body: { email } }),
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
