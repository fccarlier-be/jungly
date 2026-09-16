-- AlterTable
ALTER TABLE "ConsumedPurchase" ADD COLUMN "revokedAt" DATETIME;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME;
