-- CreateEnum
CREATE TYPE "VoiceCallState" AS ENUM ('connecting', 'ai', 'queued', 'agent', 'missed', 'ended');

-- CreateTable
CREATE TABLE "VoiceCall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ticketExternalId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "state" "VoiceCallState" NOT NULL DEFAULT 'connecting',
    "cognigySessionId" TEXT,
    "gatewayCallId" TEXT,
    "agentId" TEXT,
    "startedAt" TIMESTAMP(3),
    "handedOverAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceCall_token_key" ON "VoiceCall"("token");

-- CreateIndex
CREATE INDEX "VoiceCall_tenantId_state_idx" ON "VoiceCall"("tenantId", "state");

-- CreateIndex
CREATE INDEX "VoiceCall_tenantId_ticketNumber_idx" ON "VoiceCall"("tenantId", "ticketNumber");

-- AddForeignKey
ALTER TABLE "VoiceCall" ADD CONSTRAINT "VoiceCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceCall" ADD CONSTRAINT "VoiceCall_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

