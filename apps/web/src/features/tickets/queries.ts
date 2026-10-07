import type {
  AddNoteRequest,
  ListAgentsResponse,
  ListTicketsResponse,
  TicketDetail,
  TicketStatus,
  TicketSummary,
  UpdateTicketRequest,
} from "@oneix/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface TicketFilters {
  status?: TicketStatus;
  /** `me`, `unassigned`, or undefined for everyone */
  assignee?: string;
}

export function useTickets(filters: TicketFilters) {
  return useInfiniteQuery({
    queryKey: ["tickets", filters],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.assignee) params.set("assignee", filters.assignee);
      if (pageParam) params.set("cursor", pageParam);
      return api<ListTicketsResponse>(`/tickets?${params}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
}

export function useTicket(id: string) {
  return useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketDetail>(`/tickets/${id}`) });
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api<ListAgentsResponse>("/users"),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateTicketRequest) =>
      api<TicketSummary>(`/tickets/${id}`, { method: "PATCH", body: changes }),
    onSuccess: (summary) => {
      queryClient.setQueryData<TicketDetail>(["ticket", id], (old) => (old ? { ...old, ...summary } : old));
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useAddNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: AddNoteRequest) => api<void>(`/tickets/${id}/notes`, { method: "POST", body: note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket", id] }),
  });
}
