# CLAUDE.md

Contexte pour Claude Code (CLI ou web). Ce fichier est chargé automatiquement :
**tenir le journal des sessions à jour** (section en bas) à chaque modification,
pour que la session suivante sache ce qui a été fait, pourquoi, et ce qui reste.

## Projet

Jungly : application de suivi de plantes d'intérieur (Next.js 16 App Router,
React 19, Prisma 7 + SQLite via `@prisma/adapter-better-sqlite3`, NextAuth v5,
Tailwind 4, zod 4). Interface et commentaires en français.

- Schéma : `prisma/schema.prisma` ; client généré dans `generated/prisma`
  (import `@generated/prisma/client`). Migrations dans `prisma/migrations/`
  (nommage `AAAAMMJJHHMMSS_description`).
- Logique métier serveur : `src/server/` (moteur de soins dans
  `src/server/careEngine/`, validation zod dans `src/server/validation/`).
- Fonctions pures partagées client/serveur : `src/lib/`.
- Fiche plante : `src/app/plantes/[id]/page.tsx` → `PlantCarousel` →
  `PlantDetailView`, données préformatées par `src/lib/plantDetailData.ts`.
- Accueil : `src/app/page.tsx` (conçu pour ne pas défiler, `NoScrollDashboard`).

## Conventions

- Commentaires en français **sans accents** dans le code, textes d'interface
  avec accents. Commentaires qui expliquent le *pourquoi* (souvent un retour
  utilisateur daté).
- Couleurs uniquement via les variables CSS de `src/app/globals.css`
  (déclinées en thème sombre).
- `CHANGELOG.md` tenu à jour (entrées datées, sections Ajouté / Modifié /
  Corrigé / Vérifié).
- Pas de prettier dans les scripts : ne pas reformater des fichiers entiers.

## Commandes

```bash
npm ci
npx prisma generate
# Tests et build : mêmes variables que la CI (.github/workflows)
export DATABASE_URL=file:./ci.db AUTH_SECRET=x NEXTAUTH_URL=http://localhost:3000
npx prisma migrate deploy
npm test          # vitest (unitaires + intégration sur SQLite réel)
npm run lint
npx tsc --noEmit -p .
npm run build
```

Nouvelle migration : modifier le schéma, écrire le SQL dans un nouveau dossier
de `prisma/migrations/`, puis vérifier avec
`npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`
(doit afficher « empty migration »).

---

## Journal des sessions

Le plus récent en haut. Pour chaque session : date, branche, ce qui a été fait
et pourquoi, fichiers principaux, décisions, et ce qui reste à faire.

### 2026-09-25 — État de santé des plantes (branche `claude/upbeat-mayer-1bnecz`)

**Demande** : pouvoir indiquer l'état de santé d'une plante depuis sa fiche.
Trois options proposées, l'utilisateur a choisi l'**option 3** (journal de
santé + statut global qui en tient compte + relances d'inspection), avec une
**échelle à 5 niveaux** et une **pastille rouge** sur l'accueil (plutôt qu'un
encart « En convalescence », pour ne pas faire défiler l'accueil).

**Constat de départ** : le badge « En bonne santé » était calculé uniquement
à partir des tâches (`computePlantStatus`), il ne disait rien de la santé réelle.

**Modèle de données**
- Enum `HealthLevel` : `EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `CRITICAL`
  (Excellente / Bonne / Moyenne / Mauvaise / Critique).
- Colonne `CareEvent.healthLevel` (nullable), migration
  `20260925120000_add_care_event_health_level`. Un relevé de santé = un
  `CareEvent` de type `INSPECTION` avec un niveau. Symptômes cochés dans
  `CareEvent.metadata.symptoms` (valeurs de `SymptomCategory`, mêmes libellés
  que le diagnostic photo).
- **Pas de copie de l'état sur `Plant`** : l'état actuel est toujours le
  dernier relevé (évite toute désynchronisation).

**Logique**
- `src/lib/plantHealth.ts` (pur) : niveaux, libellés, couleurs (variables CSS
  existantes), `isSick` (POOR/CRITICAL), tendance vs relevé précédent,
  `computeOverallStatus(taskStatus, healthLevel)` → statut + libellé du badge :
  Critique/Mauvaise → Attention (prioritaire sur les tâches) ; Moyenne → au
  moins À surveiller ; « En bonne santé » seulement si un relevé Bonne/Excellente
  existe, sinon « Soins à jour ».
- `src/server/careEngine/health.ts` : `getHealthSummaries(plantIds)` (derniers
  relevés en une requête) et `syncHealthFollowUp(plantId, tx)` : tant que la
  plante est malade, **une** tâche `INSPECTION` de suivi (sans règle,
  `metadata.healthFollowUp = true`) due à +3 jours (Mauvaise) ou +2 jours
  (Critique) ; dès qu'elle va mieux, la tâche en attente passe à `SKIPPED`.
  Appelé après chaque événement `INSPECTION` (`recordStandaloneCareEvent`,
  `completeTaskWithEvent`) et après un import de sauvegarde.
- API : `POST /api/plants/:id/events` et `POST /api/tasks/:id/complete`
  acceptent `healthLevel` et `symptoms` (uniquement pour une inspection ;
  refusé par zod sinon sur `/events`, ignoré sur `/complete`).
- Export/import : `healthLevel` inclus (optionnel, anciennes sauvegardes OK).

**Interface**
- Fiche plante : nouvelle section « Santé » (`PlantHealthSection.tsx`) entre
  l'en-tête et « Entretien » : niveau, date, tendance, symptômes, prochaine
  inspection de suivi, frise des 12 derniers relevés, bouton « Lancer un
  diagnostic » si malade, formulaire de nouveau relevé. Badge d'en-tête avec
  libellé combiné.
- Actions rapides → Inspection : sélecteur de niveau facultatif.
- Cartes de tâche : valider une tâche d'inspection demande d'abord l'état
  constaté (ou « Valider sans relevé »).
- « Mes plantes » : pastille « Santé mauvaise/critique » sur la carte (prime
  sur les tâches), nouveau filtre « En mauvaise santé » ; le filtre « À faire »
  reste basé sur les seules tâches.
- Accueil : pastille rouge sur la vignette « Ma collection » des plantes
  malades.
- Historique : « Santé : X » affiché sur les inspections avec relevé.
- Composants réutilisables : `HealthLevelPicker`, `SymptomPicker`, `HealthDot`
  (`src/components/HealthLevelPicker.tsx`).

**Tests** : `__tests__/plantHealth.test.ts` (statut combiné, tendance,
validation) et `__tests__/healthFollowUp.integration.test.ts` (relances de
suivi sur SQLite réel). Suite complète verte (452 tests), lint et `tsc` OK.

**Reste à faire / idées non retenues**
- Encart « En convalescence » sur l'accueil (écarté pour l'instant).
- Pas de test e2e Playwright pour la section Santé.
- Pas de notification push spécifique « plante malade » (les tâches de suivi
  passent par les notifications de tâches existantes).
