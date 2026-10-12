-- Ticket numbers become the backend's own (Zendesk's ticket ID) instead of a oneix counter, so the
-- number agents see in oneix is the one they see in Zendesk. Unique per tenant, not globally.

-- DropIndex
DROP INDEX "Ticket_number_key";

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "Ticket_number_seq";

-- Existing tickets take their backend ID; Zendesk ticket IDs are numeric.
UPDATE "Ticket" SET "number" = "externalId"::integer;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_tenantId_number_key" ON "Ticket"("tenantId", "number");
