-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastSeenCuttingsAt" DATETIME;

-- CreateTable
CREATE TABLE "CuttingListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "species" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OUVERTE',
    "photoUrls" JSONB NOT NULL,
    "completedWithUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CuttingListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CuttingMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "bodyCiphertext" TEXT NOT NULL,
    "bodyIv" TEXT NOT NULL,
    "bodyAuthTag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "CuttingMessage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "CuttingListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CuttingRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedUserId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingRating_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "CuttingListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CuttingRating_ratedUserId_fkey" FOREIGN KEY ("ratedUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CuttingListing_status_createdAt_idx" ON "CuttingListing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CuttingListing_userId_idx" ON "CuttingListing"("userId");

-- CreateIndex
CREATE INDEX "CuttingMessage_listingId_createdAt_idx" ON "CuttingMessage"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "CuttingMessage_recipientId_readAt_idx" ON "CuttingMessage"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "CuttingRating_ratedUserId_idx" ON "CuttingRating"("ratedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CuttingRating_listingId_raterId_key" ON "CuttingRating"("listingId", "raterId");
