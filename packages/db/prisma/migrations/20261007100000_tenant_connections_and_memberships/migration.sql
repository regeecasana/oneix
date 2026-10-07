-- Multi-tenant Zendesk connections, and users who can belong to several tenants.
-- Existing data is kept: tenants get a slug, and each user's tenant, role, and
-- platform IDs move into a membership.

-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('zendesk');

-- CreateEnum
CREATE TYPE "ConnectionAuthType" AS ENUM ('access_token', 'api_token', 'oauth_client');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'failing', 'disabled');

-- Tenant slug, backfilled from the ID for existing tenants
ALTER TABLE "Tenant" ADD COLUMN "slug" TEXT;
UPDATE "Tenant" SET "slug" = lower(regexp_replace("id", '[^a-zA-Z0-9-]+', '-', 'g'));
ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateTable
CREATE TABLE "TenantConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "ConnectionProvider" NOT NULL,
    "subdomain" TEXT NOT NULL,
    "authType" "ConnectionAuthType" NOT NULL,
    "credentials" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "impersonate" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'agent',
    "zendeskUserId" TEXT,
    "cxoneAgentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- Users sharing an email across tenants become one user. The oldest row is kept.
CREATE TEMP TABLE "_user_merge" AS
SELECT "id" AS "fromId",
       first_value("id") OVER (PARTITION BY lower("email") ORDER BY "createdAt", "id") AS "toId"
FROM "User";

-- One membership per existing user row, pointing at the kept user
INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "role", "zendeskUserId", "cxoneAgentId", "createdAt", "updatedAt")
SELECT DISTINCT ON (u."tenantId", m."toId")
       gen_random_uuid()::text, u."tenantId", m."toId", u."role", u."zendeskUserId", u."cxoneAgentId", u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
JOIN "_user_merge" m ON m."fromId" = u."id"
ORDER BY u."tenantId", m."toId", u."createdAt";

UPDATE "Ticket" t SET "assigneeId" = m."toId"
FROM "_user_merge" m WHERE t."assigneeId" = m."fromId" AND m."fromId" <> m."toId";

UPDATE "AuditLog" a SET "actorId" = m."toId"
FROM "_user_merge" m WHERE a."actorId" = m."fromId" AND m."fromId" <> m."toId";

DELETE FROM "User" u USING "_user_merge" m WHERE u."id" = m."fromId" AND m."fromId" <> m."toId";

DROP TABLE "_user_merge";

-- User becomes a tenant-independent identity
ALTER TABLE "User" DROP CONSTRAINT "User_tenantId_fkey";
DROP INDEX "User_tenantId_email_key";
DROP INDEX "User_tenantId_zendeskUserId_key";
ALTER TABLE "User" DROP COLUMN "cxoneAgentId",
DROP COLUMN "role",
DROP COLUMN "tenantId",
DROP COLUMN "zendeskUserId";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_ssoSubject_key" ON "User"("ssoSubject");

-- Backend IDs repeat across tenants, so webhook idempotency keys are per tenant
DROP INDEX "WebhookEvent_source_eventKey_key";
CREATE UNIQUE INDEX "WebhookEvent_tenantId_source_eventKey_key" ON "WebhookEvent"("tenantId", "source", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "TenantConnection_tenantId_provider_key" ON "TenantConnection"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_zendeskUserId_key" ON "TenantMembership"("tenantId", "zendeskUserId");

-- AddForeignKey
ALTER TABLE "TenantConnection" ADD CONSTRAINT "TenantConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
