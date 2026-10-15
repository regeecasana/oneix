import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// The shared .env lives at the repo root; Next only reads its own folder.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    /** The Click To Call Endpoint URL from the Cognigy Voice Gateway Endpoint. */
    NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL: process.env.NEXT_PUBLIC_COGNIGY_C2C_ENDPOINT_URL ?? "",
    /** The oneix workspace whose agents take the calls. */
    NEXT_PUBLIC_LANDING_TENANT:
      process.env.NEXT_PUBLIC_LANDING_TENANT ?? process.env.DEV_TENANT_SLUG ?? process.env.ZENDESK_SUBDOMAIN ?? "",
  },
};

export default nextConfig;
