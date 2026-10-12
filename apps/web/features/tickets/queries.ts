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
  TicketFormsResponse,
  TicketStatus,
  TicketSummary,
  UpdateTicketRequest,
} from "@oneix/contracts";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface TicketFilters {
  /** Text to search for in the subject, number, or customer. */
  q?: string;
  /** Show only these statuses; empty or undefined for all. */
  status?: TicketStatus[];
  /** Show only these priorities, `none` for tickets without one; empty or undefined for all. */
  priority?: PriorityFilter[];
  /** `me`, `unassigned`, or undefined for everyone */
  assignee?: string;
}

/** The filters as query parameters, lists comma-separated. */
function filterParams(filters: TicketFilters, params = new URLSearchParams()): URLSearchParams {
  if (filters.q) params.set("q", filters.q);
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

/** Tickets for a scrolling list: the next page loads as the list reaches its end. */
export function useTicketList(filters: TicketFilters, channel: TicketChannel | null, pageSize = 30) {
  return useInfiniteQuery({
    queryKey: ["tickets", "list", filters, channel, pageSize],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: String(pageSize) });
      if (channel) params.set("channel", channel);
      filterParams(filters, params);
      return api<ListTicketsResponse>(`/tickets?${params}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}

/** @param number the ticket number, as in Zendesk and the URL. */
export function useTicket(number: string | number) {
  const id = String(number);
  return useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketDetail>(`/tickets/${id}`) });
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api<ListAgentsResponse>("/users"),
    staleTime: 5 * 60_000,
  });
}

/** The forms a ticket of this brand can use, with their fields. Changes rarely, so cached a while. */
export function useTicketForms(brandId: string | null, formId: string | null) {
  return useQuery({
    queryKey: ["ticket-forms", brandId, formId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (brandId) params.set("brandId", brandId);
      if (formId) params.set("formId", formId);
      return api<TicketFormsResponse>(`/ticket-forms?${params}`);
    },
    staleTime: 10 * 60_000,
  });
}

export function useUpdateTicket(number: number) {
  const id = String(number);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateTicketRequest) =>
      api<TicketSummary>(`/tickets/${id}`, { method: "PATCH", body: changes }),
    onSuccess: (summary, changes) => {
      queryClient.setQueryData<TicketDetail>(["ticket", id], (old) => {
        if (!old) return old;
        const customFields = Object.fromEntries(
          Object.entries({ ...old.customFields, ...changes.customFields }).filter(([, v]) => v !== null),
        );
        return { ...old, ...summary, formId: changes.formId ?? old.formId, customFields };
      });
      // The summary doesn't carry the form and field values; read them back.
      if (changes.formId !== undefined || changes.customFields !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      }
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useAddComment(number: number) {
  const id = String(number);
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
