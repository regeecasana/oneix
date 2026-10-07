import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Scripts run from packages/db; the shared .env lives at the repo root.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` does not connect, so an empty URL is fine there.
    url: process.env.DATABASE_URL ?? "",
  },
});
