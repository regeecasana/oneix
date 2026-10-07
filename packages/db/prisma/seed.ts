import { existsSync, readFileSync } from "node:fs";
import { createPrismaClient, type UserRole } from "../src/index.js";

if (existsSync("../../.env")) process.loadEnvFile("../../.env");

interface SeedUser {
  email: string;
  name: string;
  role: UserRole;
  /** Mapped agent in the ticketing backend. Needed to assign tickets to this user. */
  zendeskUserId?: string;
  cxoneAgentId?: string;
}

// seed-users.json is git-ignored so real agent mappings stay out of the repo.
const file = existsSync("prisma/seed-users.json") ? "prisma/seed-users.json" : "prisma/seed-users.example.json";
const users = JSON.parse(readFileSync(file, "utf8")) as SeedUser[];

const tenantId = process.env.TENANT_ID ?? "default";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const prisma = createPrismaClient(databaseUrl);

await prisma.tenant.upsert({
  where: { id: tenantId },
  create: { id: tenantId, name: "Development tenant" },
  update: {},
});

for (const user of users) {
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: user.email } },
    create: { tenantId, ...user },
    update: { name: user.name, role: user.role, zendeskUserId: user.zendeskUserId, cxoneAgentId: user.cxoneAgentId },
  });
}

console.log(`Seeded tenant "${tenantId}" with ${users.length} users from ${file}`);
await prisma.$disconnect();
