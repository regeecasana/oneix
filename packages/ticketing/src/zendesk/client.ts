import { TicketingError } from "../errors.js";

export interface ZendeskClientConfig {
  subdomain: string;
  clientId?: string;
  clientSecret?: string;
  /** Pre-issued OAuth access token. When set, the client credentials grant is skipped. */
  accessToken?: string;
  /** Send agent actions with X-On-Behalf-Of. The token needs the `impersonate` scope. */
  impersonate: boolean;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Agent email to act as, when impersonation is enabled. */
  onBehalfOf?: string;
}

const MAX_RATE_LIMIT_WAIT_MS = 10_000;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** Thin HTTP client for the Zendesk REST API with OAuth and rate-limit handling. */
export class ZendeskClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ZendeskClientConfig) {
    this.baseUrl = `https://${config.subdomain}.zendesk.com`;
    this.fetchFn = config.fetch ?? fetch;
    if (!config.accessToken && !(config.clientId && config.clientSecret)) {
      throw new Error("Ticketing backend needs either an access token or a client ID and secret");
    }
  }

  get impersonationEnabled(): boolean {
    return this.config.impersonate;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await this.accessToken()}`,
        Accept: "application/json",
      };
      if (options.body !== undefined) headers["Content-Type"] = "application/json";
      if (options.onBehalfOf && this.config.impersonate) headers["X-On-Behalf-Of"] = options.onBehalfOf;

      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch (error) {
        throw new TicketingError(`Ticketing request failed: ${String(error)}`, 0, true);
      }

      if (response.ok) {
        return (response.status === 204 ? undefined : await response.json()) as T;
      }

      // A rejected token is dropped and fetched again once.
      if (response.status === 401 && attempt === 0 && !this.config.accessToken) {
        this.token = null;
        continue;
      }

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      if ((response.status === 429 || response.status === 503) && attempt < 2) {
        if (retryAfterMs !== undefined && retryAfterMs <= MAX_RATE_LIMIT_WAIT_MS) {
          await sleep(retryAfterMs);
          continue;
        }
      }

      const detail = await response.text().catch(() => "");
      throw new TicketingError(
        `Ticketing request ${method} ${url.pathname} failed with ${response.status}: ${detail.slice(0, 500)}`,
        response.status,
        response.status === 429 || response.status >= 500,
        retryAfterMs,
      );
    }
  }

  private async accessToken(): Promise<string> {
    if (this.config.accessToken) return this.config.accessToken;
    if (this.token && this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return this.token.value;

    const scope = this.config.impersonate ? "read write impersonate" : "read write";
    let response: Response;
    try {
      response = await this.fetchFn(new URL("/oauth/tokens", this.baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope,
        }),
      });
    } catch (error) {
      throw new TicketingError(`Ticketing token request failed: ${String(error)}`, 0, true);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new TicketingError(
        `Ticketing token request failed with ${response.status}: ${detail.slice(0, 500)}`,
        response.status,
        response.status >= 500,
      );
    }

    const body = (await response.json()) as { access_token: string; expires_in?: number | null };
    // Tokens without an expiry are kept for an hour, then refreshed anyway.
    const ttlMs = (body.expires_in ?? 3600) * 1000;
    this.token = { value: body.access_token, expiresAt: Date.now() + ttlMs };
    return this.token.value;
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
