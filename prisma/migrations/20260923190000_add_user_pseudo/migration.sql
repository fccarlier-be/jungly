-- AlterTable
ALTER TABLE "User" ADD COLUMN "pseudo" TEXT;
ALTER TABLE "User" ADD COLUMN "pseudoKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_pseudoKey_key" ON "User"("pseudoKey");
