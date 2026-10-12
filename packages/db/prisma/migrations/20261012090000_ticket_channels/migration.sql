-- CreateEnum
CREATE TYPE "TicketChannel" AS ENUM ('email', 'chat', 'messaging', 'sunshine_conversations', 'social', 'phone', 'web_form', 'api', 'other');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "channel" "TicketChannel" NOT NULL DEFAULT 'other',
ADD COLUMN     "channelDetail" TEXT;

-- CreateIndex
CREATE INDEX "Ticket_tenantId_channel_externalUpdatedAt_idx" ON "Ticket"("tenantId", "channel", "externalUpdatedAt" DESC);
