-- AlterTable
ALTER TABLE "User" ADD COLUMN "hasUnlimitedAccess" BOOLEAN NOT NULL DEFAULT false;

-- Retro-remplissage : les comptes deja existants (auto-heberges comme sur
-- l'hebergee) ne doivent jamais se retrouver brides par l'introduction du
-- palier gratuit -- seuls les comptes crees APRES cette migration partent
-- avec hasUnlimitedAccess = false.
UPDATE "User" SET "hasUnlimitedAccess" = true;
