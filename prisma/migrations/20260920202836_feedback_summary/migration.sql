/*
  Warnings:

  - Added the required column `summary` to the `Feedback` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "topic" TEXT NOT NULL DEFAULT 'AUTRE',
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "photoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Feedback" ("content", "createdAt", "id", "photoUrl", "topic", "userId") SELECT "content", "createdAt", "id", "photoUrl", "topic", "userId" FROM "Feedback";
DROP TABLE "Feedback";
ALTER TABLE "new_Feedback" RENAME TO "Feedback";
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
