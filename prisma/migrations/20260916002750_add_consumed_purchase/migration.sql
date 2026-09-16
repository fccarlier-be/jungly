-- CreateTable
CREATE TABLE "ConsumedPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseToken" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsumedPurchase_purchaseToken_key" ON "ConsumedPurchase"("purchaseToken");
