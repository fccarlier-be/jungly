-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" DATETIME;

-- Retro-remplissage : les comptes deja existants n'ont pas a voir la
-- presentation de premier lancement (OnboardingTour) -- seuls les comptes
-- crees APRES cette migration doivent demarrer avec la colonne a NULL.
UPDATE "User" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP WHERE "onboardingCompletedAt" IS NULL;
