-- RedefineTables (renommage apiKey -> apiKeyHash, aucun capteur existant en base a ce jour)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sensor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sensor_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Sensor" ("createdAt", "externalId", "id", "name", "plantId", "type", "apiKeyHash") SELECT "createdAt", "externalId", "id", "name", "plantId", "type", "apiKey" FROM "Sensor";
DROP TABLE "Sensor";
ALTER TABLE "new_Sensor" RENAME TO "Sensor";
CREATE UNIQUE INDEX "Sensor_apiKeyHash_key" ON "Sensor"("apiKeyHash");
CREATE INDEX "Sensor_plantId_idx" ON "Sensor"("plantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
