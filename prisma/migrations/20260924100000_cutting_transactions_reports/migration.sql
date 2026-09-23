-- Quantites + transactions multiples par annonce, notes rattachees a une
-- transaction, signalements. Migration de donnees : chaque annonce deja
-- TERMINEE (completedWithUserId) devient UNE transaction de 1 bouture, et ses
-- notes existantes sont rattachees a cette transaction (id "mig_<listingId>").

-- CreateTable
CREATE TABLE "CuttingTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingTransaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "CuttingListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingTransaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- MigrateData
INSERT INTO "CuttingTransaction" ("id", "listingId", "recipientId", "quantity", "createdAt")
SELECT 'mig_' || "id", "id", "completedWithUserId", 1, "updatedAt" FROM "CuttingListing" WHERE "completedWithUserId" IS NOT NULL;

-- CreateTable
CREATE TABLE "CuttingReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "listingId" TEXT,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "evidenceCiphertext" TEXT,
    "evidenceIv" TEXT,
    "evidenceAuthTag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OUVERT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" DATETIME,
    CONSTRAINT "CuttingReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "CuttingListing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CuttingListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "species" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OUVERTE',
    "photoUrls" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CuttingListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CuttingListing" ("createdAt", "description", "id", "photoUrls", "species", "status", "title", "type", "updatedAt", "userId") SELECT "createdAt", "description", "id", "photoUrls", "species", "status", "title", "type", "updatedAt", "userId" FROM "CuttingListing";
DROP TABLE "CuttingListing";
ALTER TABLE "new_CuttingListing" RENAME TO "CuttingListing";
CREATE INDEX "CuttingListing_status_createdAt_idx" ON "CuttingListing"("status", "createdAt");
CREATE INDEX "CuttingListing_userId_idx" ON "CuttingListing"("userId");
CREATE TABLE "new_CuttingRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedUserId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingRating_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "CuttingTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingRating_ratedUserId_fkey" FOREIGN KEY ("ratedUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CuttingRating" ("comment", "createdAt", "id", "ratedUserId", "raterId", "score", "transactionId") SELECT "comment", "createdAt", "id", "ratedUserId", "raterId", "score", 'mig_' || "listingId" FROM "CuttingRating";
DROP TABLE "CuttingRating";
ALTER TABLE "new_CuttingRating" RENAME TO "CuttingRating";
CREATE INDEX "CuttingRating_ratedUserId_idx" ON "CuttingRating"("ratedUserId");
CREATE UNIQUE INDEX "CuttingRating_transactionId_raterId_key" ON "CuttingRating"("transactionId", "raterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CuttingTransaction_listingId_idx" ON "CuttingTransaction"("listingId");

-- CreateIndex
CREATE INDEX "CuttingTransaction_recipientId_idx" ON "CuttingTransaction"("recipientId");

-- CreateIndex
CREATE INDEX "CuttingReport_status_createdAt_idx" ON "CuttingReport"("status", "createdAt");
