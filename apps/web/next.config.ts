import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// The shared .env lives at the repo root; Next only reads its own folder.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  },
};

export default nextConfig;
