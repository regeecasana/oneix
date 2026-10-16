import type {
  CallTranscriptResponse,
  LiveCall,
  LiveCallsResponse,
  PresenceResponse,
  PresenceStatus,
} from "@oneix/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { API_URL, api } from "@/lib/api";

const liveCallsKey = ["voice", "calls"] as const;
const presenceKey = ["voice", "presence"] as const;

/** Every voice event, re-dispatched on window for listeners outside React Query, like the softphone. */
export const VOICE_EVENT = "oneix:voice-event";
const transcriptKey = (callId: string) => ["voice", "transcript", callId] as const;

/** Presence is kept by checking in; the API forgets an agent who stops. */
const PRESENCE_HEARTBEAT_MS = 30_000;

/** Calls in progress in this workspace, kept current by the voice event stream. */
export function useLiveCalls() {
  return useQuery({
    queryKey: liveCallsKey,
    queryFn: () => api<LiveCallsResponse>("/voice/calls"),
    // A safety net for missed events.
    refetchInterval: 60_000,
  });
}

/** The live call on a ticket, if any. */
export function useLiveCallForTicket(ticketNumber: number): LiveCall | undefined {
  return useLiveCalls().data?.items.find((call) => call.ticketNumber === ticketNumber);
}

/** A call's conversation with the AI agent, kept current by the voice event stream. */
export function useCallTranscript(callId: string | undefined) {
  return useQuery({
    queryKey: transcriptKey(callId ?? ""),
    queryFn: () => api<CallTranscriptResponse>(`/voice/calls/${callId}/transcript`),
    enabled: Boolean(callId),
  });
}

/** Listens to the workspace's voice events and refreshes the live calls when they change. */
export function useVoiceEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource(`${API_URL}/voice/events`, { withCredentials: true });
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data as string) as { type: string; callId?: string };
        if (event.type === "calls.changed") void queryClient.invalidateQueries({ queryKey: liveCallsKey });
        if (event.type === "call.transcript" && event.callId) {
          void queryClient.invalidateQueries({ queryKey: transcriptKey(event.callId) });
        }
        // The softphone listens for its call's setup messages.
        window.dispatchEvent(new CustomEvent(VOICE_EVENT, { detail: event }));
      } catch {
        // Not an event we know.
      }
    };
    // The browser reconnects by itself; catch up on what changed meanwhile.
    source.onopen = () => void queryClient.invalidateQueries({ queryKey: liveCallsKey });
    return () => source.close();
  }, [queryClient]);
}

export function usePresence() {
  return useQuery({ queryKey: presenceKey, queryFn: () => api<PresenceResponse>("/voice/presence"), staleTime: Infinity });
}

export function useSetPresence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: PresenceStatus) => api<PresenceResponse>("/voice/presence", { method: "PUT", body: { status } }),
    onSuccess: (presence) => queryClient.setQueryData(presenceKey, presence),
  });
}

/** Keeps an available agent present while the workspace is open. */
export function usePresenceHeartbeat(status: PresenceStatus | undefined) {
  const setPresence = useSetPresence();
  const { mutate } = setPresence;
  useEffect(() => {
    if (status !== "available") return;
    const timer = setInterval(() => mutate("available"), PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [status, mutate]);
}

export function useAnswerCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (callId: string) => api<LiveCall>(`/voice/calls/${callId}/answer`, { method: "POST" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: liveCallsKey }),
  });
}

export function useEndCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (callId: string) => api<void>(`/voice/calls/${callId}/end`, { method: "POST" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: liveCallsKey }),
  });
}
