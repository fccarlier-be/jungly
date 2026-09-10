-- RedefineTables
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
    "batteryPercent" INTEGER,
    "charging" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" DATETIME,
    "lowBatteryNotifiedAt" DATETIME,
    CONSTRAINT "Sensor_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Sensor" ("apiKeyHash", "createdAt", "externalId", "id", "name", "plantId", "type") SELECT "apiKeyHash", "createdAt", "externalId", "id", "name", "plantId", "type" FROM "Sensor";
DROP TABLE "Sensor";
ALTER TABLE "new_Sensor" RENAME TO "Sensor";
CREATE UNIQUE INDEX "Sensor_apiKeyHash_key" ON "Sensor"("apiKeyHash");
CREATE INDEX "Sensor_plantId_idx" ON "Sensor"("plantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
