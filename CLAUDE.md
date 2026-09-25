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

## Déploiement

Trois instances, à ne pas confondre (vérifié le 2026-09-25) :

| Instance | Machine | Conteneur / image | Déploiement |
|---|---|---|---|
| Staging `testplantes.fcold.org` | homelab `FServer` (utilisateur `franky`) | `plantes-app-test` | image CI `ghcr.io/fccarlier-be/jungly-hosted:main` (pull), ou build local pour tester une branche |
| Hébergée `jungly-app.fcold.org` | VPS OVH (`ubuntu@vps-b6850d01`) | image GHCR `jungly-hosted` épinglée `sha-<commit>` | pull de l'image |
| `plantes-app`, `plantes-app-hosted` | homelab | arrêtés au 2026-09-25 | — |

Claude n'a accès à aucune de ces machines : donner les commandes à
l'utilisateur, ne jamais supposer un chemin non vérifié.

**Ne jamais faire afficher `docker compose config` en entier** (ni `env`,
ni le `.env`) : les secrets sont en clair dans le compose du homelab
(incident du 2026-09-25, secrets du staging collés dans la conversation).
Interroger des champs précis à la place, par exemple
`docker inspect plantes-app-test --format '{{.Config.Image}}'` ou
`docker compose config plantes-app-test | grep -E "image:|context:"`.

L'image `jungly-hosted` est publiée par la CI (job `image`) à chaque push
sur `main`, seulement après `test` et `e2e` verts, taguée `main` et
`sha-<commit court>`. Elle ne contient aucune configuration d'instance.

### Staging (homelab)

- Compose : `/home/franky/serveur/docker-compose.yml`, service
  `plantes-app-test` (profil `test`, `restart: 'no'`).
- Sources : `/home/franky/serveur/www/plantes` (clone sur `main`, quelques
  fichiers non suivis sans importance) -- utilisées seulement pour un build
  local de branche.
- Données : `www/plantes/data-test` monté sur `/app/data` (+ `uploads/`,
  `library-photos/`). Proxy : `nginx-plantes-test` (`nginx/test.conf`).
- Les migrations Prisma s'appliquent seules au démarrage (`docker-entrypoint.sh`).

Service à configurer (changement proposé le 2026-09-25, à confirmer par
l'utilisateur) : ajouter `image: ghcr.io/fccarlier-be/jungly-hosted:main` et
garder `build:` pour les tests de branche ; l'argument de build
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` est obsolète depuis le 2026-09-24.

**Mise à jour après une fusion sur `main`** (attendre que le job `image` de
la CI soit vert) :

```bash
cd /home/franky/serveur
cp -a www/plantes/data-test ~/data-test.bak-$(date +%F)   # si la mise à jour contient une migration
docker compose pull plantes-app-test
docker compose up -d plantes-app-test
docker restart nginx-plantes-test
docker logs plantes-app-test 2>&1 | grep -iE "migration|erreur|error"
```

Révision déployée visible dans Paramètres > À propos (SHA passé par la CI).

**Tester une branche avant fusion** (build local, ~12 min à froid, quelques
minutes ensuite grâce au cache depuis le 2026-09-25) :

```bash
cd /home/franky/serveur/www/plantes && git fetch && git checkout <branche>
cd /home/franky/serveur && docker compose up -d --build plantes-app-test
# puis revenir à l'image CI :
cd www/plantes && git checkout main && cd .. && docker compose pull plantes-app-test && docker compose up -d plantes-app-test
```

Un build local est tagué avec le même nom d'image que l'image CI : il la
masque jusqu'au prochain `docker compose pull`.

Retour arrière : épingler `image: ghcr.io/fccarlier-be/jungly-hosted:sha-<commit>`
(commit précédent) dans le compose, puis `docker compose up -d
plantes-app-test` (restaurer la sauvegarde de `data-test` si la migration
pose problème).

### Build Docker

`Dockerfile` en 4 étages : `deps` (`npm ci`), `prod-deps` (`npm prune
--omit=dev`, ne dépend que de `package-lock.json`), `build` (`next build`),
`runtime`. Garder tout ce qui change à chaque commit (`COPY . .`, `ARG
GIT_SHA`) après les étapes lourdes, sinon le cache de `node_modules` saute.

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

**PR** : https://github.com/fccarlier-be/jungly/pull/26 (ouverte le 2026-09-25,
migration `prisma migrate deploy` nécessaire au déploiement).

**Déployé sur le staging** le 2026-09-25 (homelab, commit `e55e385`) :
migration `20260925120000_add_care_event_health_level` appliquée sans erreur.
Sauvegarde préalable : `~/data-test.bak-2026-09-25` sur le homelab. Procédure
établie avec l'utilisateur (voir « Déploiement » plus haut). Vérification
visuelle sur testplantes.fcold.org laissée à l'utilisateur.

**Correctif après staging** : la pastille rouge de l'accueil était tronquée en
haut (elle débordait de la vignette dans une rangée `overflow-x-auto`, qui
rogne aussi verticalement). Placée entièrement dans la vignette, avec une
bordure `var(--bg)` au lieu d'une ombre. Retenir : rien ne doit déborder
d'un élément dans une rangée qui défile.

**Accélération des déploiements du staging** (même jour, après remarque de
l'utilisateur : ~11 min de build pour un changement d'une ligne) :
- Diagnostic sur son log : le cache Docker du homelab était vide (`apk add`,
  `npm ci` refaits) et le Dockerfile refaisait `npm prune` après `COPY . .`
  (grosse couche `node_modules` recopiée et exportée à chaque commit).
- Dockerfile : étage `prod-deps`, `ARG GIT_SHA` déplacé après les étapes
  lourdes. Vérifié : `docker build --check` OK ; le `node_modules` final
  est identique à l'ancien (comparaison `diff -r` des deux chemins hors
  Docker, seule différence un cache jiti de 12 Ko régénéré au démarrage).
  **Build Docker complet non testé dans le bac à sable** (dépôt Alpine
  `dl-cdn.alpinelinux.org` bloqué par la politique réseau) : le premier
  vrai build sera celui de la CI (job `image`) après fusion.
- Staging : proposé de tirer l'image CI au lieu de compiler (modification du
  compose du homelab, hors repo, à faire par l'utilisateur).
- À vérifier : pourquoi le cache de build du homelab était vide
  (`docker builder prune` / nettoyage automatique ?).

**Reste à faire / idées non retenues**
- Encart « En convalescence » sur l'accueil (écarté pour l'instant).
- Pas de test e2e Playwright pour la section Santé.
- Pas de notification push spécifique « plante malade » (les tâches de suivi
  passent par les notifications de tâches existantes).
