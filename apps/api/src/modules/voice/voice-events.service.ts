import { Inject, Injectable, type MessageEvent, type OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { filter, interval, map, merge, type Observable, Subject } from "rxjs";
import type { CallSignal, WidgetCallEvent } from "@oneix/contracts";
import { REDIS } from "../../common/providers.module.js";

const CHANNEL_PREFIX = "oneix:voice:events:";
/** One call's events for the customer's widget. */
const CALL_CHANNEL_PREFIX = "oneix:voice:call:";
/** Keeps proxies from closing an idle stream. */
const HEARTBEAT_MS = 25_000;

/**
 * `calls.changed`: a call started, changed, or ended. `call.transcript`: a call's transcript grew.
 * `call.signal`: the customer's widget sent the agent on `callId` a step of setting up their call.
 */
export type VoiceEvent =
  | { type: "calls.changed" }
  | { type: "call.transcript"; callId: string }
  | { type: "call.signal"; callId: string; signal: CallSignal };

/**
 * Live voice events for a workspace's agents. Published through Redis so every API instance's
 * open streams hear them, whichever instance handled the change.
 */
@Injectable()
export class VoiceEventsService implements OnModuleDestroy {
  private readonly events = new Subject<{ tenantId: string; event: VoiceEvent }>();
  private readonly callEvents = new Subject<{ callId: string; event: WidgetCallEvent }>();
  private readonly subscriber: Redis;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.subscriber = redis.duplicate();
    void this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`, `${CALL_CHANNEL_PREFIX}*`);
    this.subscriber.on("pmessage", (_pattern, channel: string, message: string) => {
      try {
        if (channel.startsWith(CALL_CHANNEL_PREFIX)) {
          const callId = channel.slice(CALL_CHANNEL_PREFIX.length);
          this.callEvents.next({ callId, event: JSON.parse(message) as WidgetCallEvent });
        } else {
          this.events.next({
            tenantId: channel.slice(CHANNEL_PREFIX.length),
            event: JSON.parse(message) as VoiceEvent,
          });
        }
      } catch {
        // A malformed message is dropped; agents refresh on the next one.
      }
    });
  }

  async publish(tenantId: string, event: VoiceEvent): Promise<void> {
    await this.redis.publish(`${CHANNEL_PREFIX}${tenantId}`, JSON.stringify(event));
  }

  async publishToCall(callId: string, event: WidgetCallEvent): Promise<void> {
    await this.redis.publish(`${CALL_CHANNEL_PREFIX}${callId}`, JSON.stringify(event));
  }

  /** One call's events for the customer's widget, as Server-Sent Events, with a heartbeat. */
  streamCall(callId: string): Observable<MessageEvent> {
    return merge(
      this.callEvents.pipe(
        filter((e) => e.callId === callId),
        map((e): MessageEvent => ({ data: e.event })),
      ),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ data: { type: "ping" } }))),
    );
  }

  /** The workspace's events as Server-Sent Events, with a heartbeat. */
  stream(tenantId: string): Observable<MessageEvent> {
    return merge(
      this.events.pipe(
        filter((e) => e.tenantId === tenantId),
        map((e): MessageEvent => ({ data: e.event })),
      ),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ data: { type: "ping" } }))),
    );
  }

  onModuleDestroy(): void {
    this.subscriber.disconnect();
    this.events.complete();
    this.callEvents.complete();
  }
}
