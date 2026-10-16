import { Inject, Injectable } from "@nestjs/common";
import type { PresenceResponse, PresenceStatus } from "@oneix/contracts";
import type { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";
import type { SessionUser } from "../../common/auth.js";
import { REDIS } from "../../common/providers.module.js";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";

/** An agent counts as present while their workspace keeps checking in. */
const PRESENCE_STALE_MS = 75_000;
/** Softphone passwords last a working day; the workspace asks for a new one on sign-in. */
const CREDENTIAL_TTL_SECONDS = 12 * 3600;

interface PresenceRecord {
  status: PresenceStatus;
  /** When the agent became available, so the longest-waiting agent is offered calls first. */
  since: number;
  seenAt: number;
}

export interface SoftphoneOwner {
  userId: string;
  tenantId: string;
  password: string;
}

/**
 * Agents' availability for calls and their softphone credentials, in Redis: both are short-lived
 * and change often.
 */
@Injectable()
export class PresenceService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The agent's softphone user: stable per agent and workspace, and safe in a SIP URI. */
  static sipUser(tenantId: string, userId: string): string {
    return `oneix-${createHash("sha256").update(`${tenantId}:${userId}`).digest("hex").slice(0, 20)}`;
  }

  async get(user: SessionUser): Promise<PresenceResponse> {
    const record = await this.record(user.tenantId, user.id);
    const status = record && Date.now() - record.seenAt < PRESENCE_STALE_MS ? record.status : "away";
    return { status, ...(await this.softphone(user)) };
  }

  /** Sets the status. Called again every half minute by the workspace while it's open. */
  async set(user: SessionUser, status: PresenceStatus): Promise<PresenceResponse> {
    const previous = await this.record(user.tenantId, user.id);
    const now = Date.now();
    const record: PresenceRecord = {
      status,
      since:
        previous && previous.status === status && now - previous.seenAt < PRESENCE_STALE_MS
          ? previous.since
          : now,
      seenAt: now,
    };
    await this.redis.hset(this.key(user.tenantId), user.id, JSON.stringify(record));
    return { status, ...(await this.softphone(user)) };
  }

  /** Available agents, longest-waiting first. */
  async available(tenantId: string): Promise<string[]> {
    const all = await this.redis.hgetall(this.key(tenantId));
    const now = Date.now();
    return Object.entries(all)
      .map(([userId, raw]) => ({ userId, record: parse(raw) }))
      .filter((a) => a.record?.status === "available" && now - a.record.seenAt < PRESENCE_STALE_MS)
      .sort((a, b) => a.record!.since - b.record!.since)
      .map((a) => a.userId);
  }

  /** Who a softphone user belongs to, for Voice Gateway's registration check. */
  async owner(sipUser: string): Promise<SoftphoneOwner | null> {
    const raw = await this.redis.get(this.credentialKey(sipUser));
    return raw ? (JSON.parse(raw) as SoftphoneOwner) : null;
  }

  /** The address Voice Gateway dials for an agent. */
  dialName(tenantId: string, userId: string): string | null {
    const realm = this.config.VOICE_SIP_REALM;
    return realm ? `${PresenceService.sipUser(tenantId, userId)}@${realm}` : null;
  }

  private async softphone(
    user: SessionUser,
  ): Promise<Pick<PresenceResponse, "softphone" | "softphoneUnavailable">> {
    const { VOICE_SIP_REALM: realm, VOICE_GATEWAY_WSS_URL: wsUri } = this.config;
    if (!realm || !wsUri)
      return { softphone: null, softphoneUnavailable: "Voice calls aren't set up for oneix yet." };
    if (!user.zendeskUserId) {
      return {
        softphone: null,
        softphoneUnavailable: "Your account isn't linked to a Zendesk user, so you can't take calls yet.",
      };
    }

    const sipUser = PresenceService.sipUser(user.tenantId, user.id);
    const key = this.credentialKey(sipUser);
    const existing = await this.redis.get(key);
    const owner: SoftphoneOwner = existing
      ? (JSON.parse(existing) as SoftphoneOwner)
      : { userId: user.id, tenantId: user.tenantId, password: randomBytes(18).toString("base64url") };
    await this.redis.set(key, JSON.stringify(owner), "EX", CREDENTIAL_TTL_SECONDS);
    return {
      softphone: {
        sipUser,
        password: owner.password,
        realm,
        wsUri,
        iceServers: this.config.VOICE_ICE_SERVERS,
      },
      softphoneUnavailable: null,
    };
  }

  private async record(tenantId: string, userId: string): Promise<PresenceRecord | null> {
    return parse(await this.redis.hget(this.key(tenantId), userId));
  }

  private key(tenantId: string): string {
    return `oneix:voice:presence:${tenantId}`;
  }

  private credentialKey(sipUser: string): string {
    return `oneix:voice:softphone:${sipUser}`;
  }
}

function parse(raw: string | null | undefined): PresenceRecord | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PresenceRecord;
  } catch {
    return null;
  }
}
