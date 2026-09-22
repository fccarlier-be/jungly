-- CreateTable
CREATE TABLE "HealthDiagnosis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plantId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symptomCategory" TEXT NOT NULL,
    "symptomAnswers" JSONB NOT NULL,
    "photoUrls" JSONB NOT NULL,
    "plantnetDiseaseResult" JSONB,
    "hypotheses" JSONB NOT NULL,
    "localContextSnapshot" JSONB NOT NULL,
    CONSTRAINT "HealthDiagnosis_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlantnetDailyUsage" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "HealthDiagnosis_plantId_createdAt_idx" ON "HealthDiagnosis"("plantId", "createdAt");
