-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "brandExternalId" TEXT,
ADD COLUMN     "customFields" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "formExternalId" TEXT;

-- CreateTable
CREATE TABLE "TicketForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "isDefault" BOOLEAN NOT NULL,
    "inAllBrands" BOOLEAN NOT NULL,
    "brandExternalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fieldExternalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "requiredOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB NOT NULL DEFAULT '[]',
    "pattern" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketForm_tenantId_externalId_key" ON "TicketForm"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketField_tenantId_externalId_key" ON "TicketField"("tenantId", "externalId");

-- AddForeignKey
ALTER TABLE "TicketForm" ADD CONSTRAINT "TicketForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketField" ADD CONSTRAINT "TicketField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

