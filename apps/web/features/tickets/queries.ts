import type {
  AddCommentRequest,
  ChannelCountsResponse,
  TicketChannel,
  PriorityFilter,
  ListAgentsResponse,
  ListTicketsResponse,
  SortOrder,
  TicketSortField,
  TicketDetail,
  TicketStatus,
  TicketSummary,
  UpdateTicketRequest,
} from "@oneix/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface TicketFilters {
  /** Show only these statuses; empty or undefined for all. */
  status?: TicketStatus[];
  /** Show only these priorities, `none` for tickets without one; empty or undefined for all. */
  priority?: PriorityFilter[];
  /** `me`, `unassigned`, or undefined for everyone */
  assignee?: string;
}

/** The filters as query parameters, lists comma-separated. */
function filterParams(filters: TicketFilters, params = new URLSearchParams()): URLSearchParams {
  if (filters.status?.length) params.set("status", filters.status.join(","));
  if (filters.priority?.length) params.set("priority", filters.priority.join(","));
  if (filters.assignee) params.set("assignee", filters.assignee);
  return params;
}

/** Ticket counts per channel for the inbox tabs, under the same filters as the list. */
export function useChannelCounts(filters: TicketFilters) {
  return useQuery({
    queryKey: ["tickets", "channel-counts", filters],
    queryFn: () => {
      const params = filterParams(filters);
      return api<ChannelCountsResponse>(`/tickets/channel-counts?${params}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

export interface TicketSort {
  field: TicketSortField;
  order: SortOrder;
}

/** @param sort null for the server's default order (most recently updated first). */
export function useTickets(
  filters: TicketFilters,
  page: number,
  pageSize: number,
  sort: TicketSort | null = null,
  channel: TicketChannel | null = null,
) {
  return useQuery({
    queryKey: ["tickets", filters, page, pageSize, sort, channel],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (channel) params.set("channel", channel);
      if (sort) {
        params.set("sort", sort.field);
        params.set("order", sort.order);
      }
      filterParams(filters, params);
      return api<ListTicketsResponse>(`/tickets?${params}`);
    },
    // Keeps the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
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

export function useAddComment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comment: AddCommentRequest) =>
      api<TicketSummary>(`/tickets/${id}/comments`, { method: "POST", body: comment }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
