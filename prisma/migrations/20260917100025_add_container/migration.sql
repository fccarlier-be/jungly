-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "potShape" TEXT NOT NULL DEFAULT 'RECTANGULAR',
    "potDiameterMm" INTEGER,
    "potLengthMm" INTEGER,
    "potWidthMm" INTEGER,
    "potHeightMm" INTEGER,
    "potMaterial" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Container_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "libraryEntryId" TEXT,
    "name" TEXT NOT NULL,
    "scientificName" TEXT,
    "photoUrl" TEXT,
    "locationId" TEXT,
    "containerId" TEXT,
    "positionX" REAL,
    "positionY" REAL,
    "acquiredAt" DATETIME,
    "potShape" TEXT NOT NULL DEFAULT 'ROUND',
    "potDiameterMm" INTEGER,
    "potLengthMm" INTEGER,
    "potWidthMm" INTEGER,
    "potHeightMm" INTEGER,
    "potMaterial" TEXT,
    "substrate" TEXT,
    "exposure" TEXT,
    "temperatureNote" TEXT,
    "humidityNote" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Plant_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Plant_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Plant_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "PlantLibraryEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Plant" ("acquiredAt", "createdAt", "exposure", "humidityNote", "id", "libraryEntryId", "locationId", "name", "notes", "photoUrl", "potDiameterMm", "potHeightMm", "potLengthMm", "potMaterial", "potShape", "potWidthMm", "scientificName", "substrate", "temperatureNote", "updatedAt", "userId") SELECT "acquiredAt", "createdAt", "exposure", "humidityNote", "id", "libraryEntryId", "locationId", "name", "notes", "photoUrl", "potDiameterMm", "potHeightMm", "potLengthMm", "potMaterial", "potShape", "potWidthMm", "scientificName", "substrate", "temperatureNote", "updatedAt", "userId" FROM "Plant";
DROP TABLE "Plant";
ALTER TABLE "new_Plant" RENAME TO "Plant";
CREATE INDEX "Plant_userId_idx" ON "Plant"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Container_userId_name_key" ON "Container"("userId", "name");
