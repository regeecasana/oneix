-- CreateEnum
CREATE TYPE "TicketAccess" AS ENUM ('all', 'groups', 'organization', 'assigned', 'requested');

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "canReplyPublicly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ticketAccess" "TicketAccess" NOT NULL DEFAULT 'all';
