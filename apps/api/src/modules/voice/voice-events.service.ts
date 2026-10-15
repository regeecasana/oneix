import { Inject, Injectable, type MessageEvent, type OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { filter, interval, map, merge, type Observable, Subject } from "rxjs";
import { REDIS } from "../../common/providers.module.js";

const CHANNEL_PREFIX = "oneix:voice:events:";
/** Keeps proxies from closing an idle stream. */
const HEARTBEAT_MS = 25_000;

export type VoiceEvent = { type: "calls.changed" };

/**
 * Live voice events for a workspace's agents. Published through Redis so every API instance's
 * open streams hear them, whichever instance handled the change.
 */
@Injectable()
export class VoiceEventsService implements OnModuleDestroy {
  private readonly events = new Subject<{ tenantId: string; event: VoiceEvent }>();
  private readonly subscriber: Redis;

  constructor(@Inject(REDIS) private readonly redis: Redis) {
    this.subscriber = redis.duplicate();
    void this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
    this.subscriber.on("pmessage", (_pattern, channel: string, message: string) => {
      try {
        this.events.next({ tenantId: channel.slice(CHANNEL_PREFIX.length), event: JSON.parse(message) as VoiceEvent });
      } catch {
        // A malformed message is dropped; agents refresh on the next one.
      }
    });
  }

  async publish(tenantId: string, event: VoiceEvent): Promise<void> {
    await this.redis.publish(`${CHANNEL_PREFIX}${tenantId}`, JSON.stringify(event));
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
  }
}
