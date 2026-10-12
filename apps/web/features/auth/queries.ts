import type {
  AcceptInviteRequest,
  ChangePasswordRequest,
  DevDirectory,
  LinkDetails,
  LoginRequest,
  Me,
  ResetPasswordRequest,
} from "@oneix/contracts";
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

/** After signing in, nothing cached belongs to the new session except who they are. */
function useSignedIn() {
  const queryClient = useQueryClient();
  return (me: Me) => {
    queryClient.clear();
    queryClient.setQueryData(["me"], me);
  };
}

export function useLogin() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (login: LoginRequest) => api<Me>("/auth/login", { method: "POST", body: login }),
    onSuccess: signedIn,
  });
}

/** What an invite or reset link is for; fails when it expired or was used. */
export function useLinkDetails(token: string) {
  return useQuery({
    queryKey: ["auth-link", token],
    queryFn: () => api<LinkDetails>(`/auth/links/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });
}

export function useAcceptInvite() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (input: AcceptInviteRequest) => api<Me>("/auth/invites/accept", { method: "POST", body: input }),
    onSuccess: signedIn,
  });
}

export function useResetPassword() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (input: ResetPasswordRequest) => api<Me>("/auth/password-reset", { method: "POST", body: input }),
    onSuccess: signedIn,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordRequest) => api<void>("/auth/password", { method: "POST", body: input }),
  });
}
