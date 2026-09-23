-- AlterTable
ALTER TABLE "CuttingListing" ADD COLUMN "retiredAt" DATETIME;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "cuttingsBannedUntil" DATETIME;

-- CreateTable
CREATE TABLE "CuttingWarning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "reportId" TEXT,
    "message" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "consequence" TEXT NOT NULL DEFAULT 'NONE',
    "acknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingWarning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingWarning_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingWarning_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CuttingReport" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CuttingTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "contestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingTransaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "CuttingListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingTransaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CuttingTransaction" ("createdAt", "id", "listingId", "quantity", "recipientId") SELECT "createdAt", "id", "listingId", "quantity", "recipientId" FROM "CuttingTransaction";
DROP TABLE "CuttingTransaction";
ALTER TABLE "new_CuttingTransaction" RENAME TO "CuttingTransaction";
CREATE INDEX "CuttingTransaction_listingId_idx" ON "CuttingTransaction"("listingId");
CREATE INDEX "CuttingTransaction_recipientId_idx" ON "CuttingTransaction"("recipientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CuttingWarning_userId_createdAt_idx" ON "CuttingWarning"("userId", "createdAt");
