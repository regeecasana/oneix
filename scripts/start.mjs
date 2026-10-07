#!/usr/bin/env node
/**
 * One command to run oneix locally: `npm start`.
 *
 * 1. Creates .env from .env.example on the first run, then stops so you can add Zendesk values.
 * 2. Checks Docker is running and starts PostgreSQL and Redis.
 * 3. Installs dependencies if needed.
 * 4. Applies database migrations and seeds the tenant and agents.
 * 5. Runs api, worker, and web in watch mode.
 *
 * Every step is safe to repeat, so the same command works on every run.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
const composeFile = "infra/docker/docker-compose.yml";

function step(message) {
  console.log(`\n\x1b[1m▸ ${message}\x1b[0m`);
}

function fail(message) {
  console.error(`\n\x1b[31m✖ ${message}\x1b[0m\n`);
  process.exit(1);
}

/** Runs a command in the repo root with inherited output. Returns true on success. */
function run(command, { quiet = false } = {}) {
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: quiet ? "ignore" : "inherit",
  });
  return result.status === 0;
}

// 1. Environment file
if (!existsSync(envFile)) {
  copyFileSync(join(root, ".env.example"), envFile);
  console.log("\nCreated .env from .env.example.");
  console.log("Fill in the Zendesk values (see README → Connecting Zendesk), then run `npm start` again.\n");
  process.exit(0);
}

process.loadEnvFile(envFile);
const missing = [];
if (!process.env.ZENDESK_SUBDOMAIN) missing.push("ZENDESK_SUBDOMAIN");
const env = process.env;
if (
  !env.ZENDESK_ACCESS_TOKEN &&
  !(env.ZENDESK_EMAIL && env.ZENDESK_API_TOKEN) &&
  !(env.ZENDESK_CLIENT_ID && env.ZENDESK_CLIENT_SECRET)
) {
  missing.push("ZENDESK_EMAIL and ZENDESK_API_TOKEN (or ZENDESK_ACCESS_TOKEN, or ZENDESK_CLIENT_ID and ZENDESK_CLIENT_SECRET)");
}
if (missing.length > 0) {
  fail(`Set these in .env first:\n  - ${missing.join("\n  - ")}`);
}

// 2. Docker services
step("Checking Docker");
if (!run("docker info", { quiet: true })) {
  fail("Docker is not running. Start Docker Desktop and try again.");
}

step("Starting PostgreSQL and Redis");
if (!run(`docker compose -f ${composeFile} up -d --wait`)) {
  fail("Could not start the database containers. See the output above.");
}

// 3. Dependencies
if (!existsSync(join(root, "node_modules"))) {
  step("Installing dependencies");
  if (!run("npm install")) fail("npm install failed.");
}

// 4. Database
step("Applying database migrations");
if (!run("npm run migrate:deploy -w @oneix/db")) fail("Migrations failed.");

step("Generating the database client");
if (!run("npm run db:generate")) fail("Prisma client generation failed.");

step("Seeding the tenant and agents");
if (!run("npm run db:seed")) fail("Seeding failed.");

// 5. Apps
step("Starting api, worker, and web (Ctrl+C to stop)");
console.log("  Workspace: http://localhost:3000");
console.log("  API:       http://localhost:4000\n");
const dev = spawnSync("npx turbo run dev", { cwd: root, shell: true, stdio: "inherit" });
process.exit(dev.status ?? 0);
