import type {
  BackendAgentOptionsResponse,
  BackendDirectoryResponse,
  InviteMemberRequest,
  InviteMemberResponse,
  OneTimeLinkResponse,
  TeamMember,
  TeamResponse,
  UpdateMemberRequest,
} from "@oneix/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

export function useTeam() {
  return useQuery({ queryKey: ["team"], queryFn: () => api<TeamResponse>("/team") })
}

/** The workspace's Zendesk users, to pick a link from. */
export function useBackendDirectory() {
  return useQuery({
    queryKey: ["team", "directory"],
    queryFn: () => api<BackendDirectoryResponse>("/team/directory"),
    staleTime: 60_000,
  })
}

/** Roles and groups for creating a Zendesk agent; only loaded when needed. */
export function useAgentOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["team", "zendesk-options"],
    queryFn: () => api<BackendAgentOptionsResponse>("/team/zendesk-options"),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useInviteMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InviteMemberRequest) =>
      api<InviteMemberResponse>("/team/invites", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, changes }: { userId: string; changes: UpdateMemberRequest }) =>
      api<TeamMember>(`/team/members/${userId}`, { method: "PATCH", body: changes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  })
}

export function useIssueLink() {
  return useMutation({
    mutationFn: (userId: string) => api<OneTimeLinkResponse>(`/team/members/${userId}/link`, { method: "POST" }),
  })
}
