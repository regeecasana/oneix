import type { ConnectionAuthType } from "@oneix/db";
import type { ZendeskConfig } from "@oneix/ticketing";

/** What is stored, encrypted, in TenantConnection.credentials for each auth type. */
export type ZendeskCredentials =
  | { type: "access_token"; accessToken: string }
  | { type: "api_token"; email: string; apiToken: string }
  | { type: "oauth_client"; clientId: string; clientSecret: string };

export function zendeskConfig(
  subdomain: string,
  credentials: ZendeskCredentials,
  impersonate: boolean,
): ZendeskConfig {
  switch (credentials.type) {
    case "access_token":
      return { subdomain, accessToken: credentials.accessToken, impersonate };
    case "api_token":
      return { subdomain, apiToken: { email: credentials.email, token: credentials.apiToken }, impersonate };
    case "oauth_client":
      return { subdomain, clientId: credentials.clientId, clientSecret: credentials.clientSecret, impersonate };
  }
}

export function authTypeOf(credentials: ZendeskCredentials): ConnectionAuthType {
  return credentials.type;
}

/**
 * Credentials from ZENDESK_* variables, in the same order of preference as the client:
 * access token, then API token, then OAuth client. Returns null when none are complete.
 */
export function zendeskCredentialsFromEnv(env: NodeJS.ProcessEnv): ZendeskCredentials | null {
  if (env.ZENDESK_ACCESS_TOKEN) return { type: "access_token", accessToken: env.ZENDESK_ACCESS_TOKEN };
  if (env.ZENDESK_EMAIL && env.ZENDESK_API_TOKEN) {
    return { type: "api_token", email: env.ZENDESK_EMAIL, apiToken: env.ZENDESK_API_TOKEN };
  }
  if (env.ZENDESK_CLIENT_ID && env.ZENDESK_CLIENT_SECRET) {
    return { type: "oauth_client", clientId: env.ZENDESK_CLIENT_ID, clientSecret: env.ZENDESK_CLIENT_SECRET };
  }
  return null;
}
