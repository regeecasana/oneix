-- Ticket access: tickets record their group and organization, agents their groups and organizations,
-- so oneix can enforce the backend's ticket restrictions.

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "groupExternalId" TEXT,
ADD COLUMN "organizationExternalId" TEXT;

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN "groupExternalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "organizationExternalIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Ticket_tenantId_groupExternalId_idx" ON "Ticket"("tenantId", "groupExternalId");
