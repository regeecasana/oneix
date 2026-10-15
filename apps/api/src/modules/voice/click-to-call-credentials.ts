import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../config/config.js";

/** How long Click To Call credentials are reused before they're read again. */
const CACHE_MS = 5 * 60_000;

interface WidgetCredentials {
  username: string;
  password: string;
}

/**
 * The SIP logins of Cognigy's Click To Call widgets. Once the Voice Gateway account's registration
 * webhook points at oneix, Voice Gateway asks oneix about every SIP login on the account, including
 * customers' widget calls, which it otherwise checks itself. Their credentials are stable and come
 * from each Click To Call Endpoint's configuration, so oneix reads them from there.
 */
@Injectable()
export class ClickToCallCredentials {
  private readonly logger = new Logger(ClickToCallCredentials.name);
  private cache: { at: number; credentials: WidgetCredentials[] } | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** The password of a widget login, or null when no Click To Call Endpoint has that username. */
  async passwordOf(username: string): Promise<string | null> {
    const fresh = this.cache && Date.now() - this.cache.at < CACHE_MS;
    let found = fresh ? this.find(username) : null;
    // Read again when the cache is old or doesn't know the username (an Endpoint may be new).
    if (!found) {
      await this.reload();
      found = this.find(username);
    }
    return found?.password ?? null;
  }

  private find(username: string): WidgetCredentials | undefined {
    return this.cache?.credentials.find((c) => c.username === username);
  }

  private async reload(): Promise<void> {
    const credentials: WidgetCredentials[] = [];
    for (const url of this.config.VOICE_C2C_ENDPOINT_URLS) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const body = (await response.json()) as {
          endpointSettings?: { sipConnectivityInfo?: { username?: string; password?: string } };
        };
        const info = body.endpointSettings?.sipConnectivityInfo;
        if (info?.username && info.password) credentials.push({ username: info.username, password: info.password });
      } catch (error) {
        this.logger.warn({ err: error }, "couldn't read a Click To Call Endpoint's configuration");
      }
    }
    this.cache = { at: Date.now(), credentials };
  }
}
