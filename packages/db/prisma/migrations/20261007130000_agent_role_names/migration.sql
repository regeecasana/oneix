-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "roleNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
