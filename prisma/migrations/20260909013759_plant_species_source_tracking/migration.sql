-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlantLibraryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commonName" TEXT NOT NULL,
    "scientificName" TEXT,
    "family" TEXT,
    "careProfile" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "sourceId" TEXT,
    "importedAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "imageSourceUrl" TEXT,
    "imageLicense" TEXT,
    "imageLicenseUrl" TEXT
);
INSERT INTO "new_PlantLibraryEntry" ("careProfile", "commonName", "createdAt", "family", "id", "scientificName", "updatedAt") SELECT "careProfile", "commonName", "createdAt", "family", "id", "scientificName", "updatedAt" FROM "PlantLibraryEntry";
DROP TABLE "PlantLibraryEntry";
ALTER TABLE "new_PlantLibraryEntry" RENAME TO "PlantLibraryEntry";
CREATE UNIQUE INDEX "PlantLibraryEntry_source_sourceId_key" ON "PlantLibraryEntry"("source", "sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
