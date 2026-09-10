# Jungly

Application de suivi et d'entretien des plantes (arrosage, fertilisation, rempotage, tâches, historique). Couvre les phases 1 à 8 du cahier des charges : gestion des plantes, moteur de règles/tâches (CareEngine), historique, dashboard, notifications push, PWA installable, bibliothèque de plantes, export/import, capteurs IoT. Multi-utilisateur (inscription en libre-service, voir ci-dessous), durci pour une exposition publique (rate limiting, isolation stricte entre comptes, photos privées -- voir [Sécurité](#sécurité)).

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- Prisma + SQLite
- NextAuth (Auth.js) v5, provider Credentials, sessions JWT
- Zod pour la validation
- Vitest pour les tests unitaires, Playwright pour les tests E2E
- web-push (Web Push / VAPID) pour les notifications

## Prérequis

- Docker (aucun Node.js requis en local : tout tourne dans des conteneurs)

## Variables d'environnement

Copier `.env.example` en `.env` et renseigner :

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chemin du fichier SQLite, ex. `file:./data/plantes.db` |
| `AUTH_SECRET` | Secret NextAuth (ex. `openssl rand -base64 32`) -- absent ou invalide, l'app doit refuser de démarrer plutôt que d'autoriser silencieusement tout le monde (voir [Sécurité](#sécurité)) |
| `NEXTAUTH_URL` | URL publique de l'app (ex. `http://localhost:3000` en dev, `https://plantes.fcold.org` en prod). **Son schéma détermine si les cookies de session sont préfixés `__Secure-`** (https ⇒ oui) -- important pour les tests E2E, voir `e2e/README.md`. |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Identifiants du premier compte créé au démarrage, administrateur (voir [Rôles](#rôles--administration)) |
| `PLANTES_VAPID_PUBLIC_KEY` / `PLANTES_VAPID_PRIVATE_KEY` | Clés Web Push, générées une fois avec `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Même valeur que `PLANTES_VAPID_PUBLIC_KEY`, exposée côté client (nécessaire pour l'abonnement push depuis le navigateur) |
| `OPENPLANTBOOK_CLIENT_ID` / `OPENPLANTBOOK_CLIENT_SECRET` | Identifiants OAuth2 (pas une simple clé) sur [open.plantbook.io](https://open.plantbook.io), essayés en premier pour la recherche/import d'espèces absentes de la bibliothèque locale. |
| `PERENUAL_API_KEY` | Clé gratuite sur [perenual.com/docs/api](https://perenual.com/docs/api), utilisée en repli si OpenPlantbook n'est pas configuré ou n'a pas de résultat. Sans aucune des deux, la recherche externe échoue proprement (message d'erreur), le reste de l'app fonctionne normalement. |

**Attention** : `NEXT_PUBLIC_*` est figé au moment du `next build`, jamais relu au runtime. En Docker, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` doit donc passer en `build.args` (voir `docker-compose.yml`), pas seulement en variable d'environnement du conteneur.

L'inscription est en libre-service (`/inscription`) : n'importe qui connaissant l'URL peut créer un compte. `SEED_USER_PASSWORD` est obligatoire : son absence fait échouer le démarrage plutôt que de créer un compte administrateur avec un mot de passe par défaut connu. Changer `SEED_USER_PASSWORD` puis relancer `prisma db seed` met bien à jour le mot de passe d'un compte déjà existant (pas seulement à la création).

## Rôles & administration

Un seul rôle au-delà de "utilisateur normal" : `User.isAdmin`. Le compte désigné par `SEED_USER_EMAIL` l'obtient automatiquement à chaque déploiement (le seed le réaffirme systématiquement). Réservé aux actions qui affectent des données **globales**, partagées entre tous les comptes -- aujourd'hui uniquement `POST /api/library/:id/resync` (une fiche de bibliothèque commune, pas les données personnelles d'un utilisateur). Pas d'UI dédiée pour l'instant, ce rôle se gère uniquement via `SEED_USER_EMAIL`.

## Sécurité

Quelques points à connaître avant une exposition publique (l'app est conçue pour, mais reste un projet homelab -- pas d'audit tiers formel) :

- **Isolation stricte entre comptes** : chaque route API vérifie la propriété de la ressource (`src/server/ownership.ts`) avant toute lecture/écriture, avec des 404 (jamais de 403) pour ne pas confirmer l'existence d'un id à un tiers.
- **Rate limiting** (`src/lib/rateLimit.ts`, en mémoire -- suffisant pour un déploiement mono-instance) sur la connexion (10/5min/IP), l'inscription (5/15min/IP), l'envoi de photo (30/5min/compte), les lectures de capteur (60/min/IP) et la recherche/import de bibliothèque externe (20/5min/compte, protège aussi le quota gratuit des APIs tierces). Dépend de l'en-tête `CF-Connecting-IP` posé par Cloudflare (voir `nginx/default.conf`) pour identifier le vrai visiteur derrière un reverse proxy/tunnel.
- **Photos privées** : `GET /uploads/<nom>` (`src/app/uploads/[filename]/route.ts`) vérifie que le fichier appartient bien à une plante du compte connecté avant de le servir -- pas de dossier public statique.
- **Clé API capteur hashée** (`Sensor.apiKeyHash`, bcrypt) : le jeton en clair n'est visible qu'une fois, à la création ou via `POST /api/sensors/:id/rotate`.
- **Mots de passe** : bcrypt (utilisateurs comme capteurs), aucun mot de passe par défaut possible (voir ci-dessus).
- **Dépendances** : maintenues à jour manuellement au fil des CVE connues (pas de Dependabot/Renovate configuré). `next`, `next-auth`, `prisma`/`@prisma/client`, `sharp` et `bcryptjs` sont épinglés à une version **exacte** (pas de `^`) dans `package.json` -- volontaire : avec une plage semver, une régénération de lockfile (ex. ajout d'une nouvelle dépendance) peut silencieusement faire avancer la version réellement installée sans jamais toucher `package.json`, qui affiche alors un plancher périmé même si le code tournant en prod est à jour (vécu trois fois de suite lors d'audits successifs, à chaque fois une fausse alerte). Avec une version exacte, `package.json` reflète toujours fidèlement ce qui tourne : `npm ci` respecte le pin, et seul un `npm install pkg@x.y.z` explicite (qui réécrit `package.json` lui-même) peut le faire changer -- **un audit qui lit ce fichier n'a donc plus besoin de vérifier `package-lock.json` séparément pour ces paquets précis.**

## Développement local

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c "npm install"
docker run --rm -v "$PWD":/app -w /app -p 3000:3000 --env-file <(sed 's/\"//g' .env) node:22-alpine sh -c "npm run dev"
```

Ou plus simplement, si Node.js est disponible sur la machine :

```bash
npm install
npm run dev
```

## Migrations Prisma

```bash
npx prisma migrate dev --name <nom>
```

En production, les migrations sont appliquées automatiquement au démarrage du conteneur (`docker-entrypoint.sh` -> `prisma migrate deploy`).

## Seed

```bash
npx prisma db seed
```

Crée le premier compte (administrateur, `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`) et 6 plantes de démonstration (Monstera deliciosa, Calathea orbifolia, Ficus elastica, Sansevieria trifasciata, Echeveria, Pothos) avec règles d'entretien, historique et tâches dans des états variés (en retard, aujourd'hui, à venir). Seed également la bibliothèque de plantes (~1000 profils, voir `prisma/librarySeed.ts`/`prisma/plantfolioData.json`), toujours exécuté indépendamment des données personnelles.

## Tests

```bash
npm test
```

Couvre le CareEngine (`src/server/careEngine/`) : récurrences (jours/semaines/mois/annuelle/date exacte, y compris le calage en fin de mois), saisonnalité, transitions de tâche (complétée/reportée/en retard), calcul de dosage d'engrais, déclenchement par capteur ; le service de notifications (`src/server/notifications/notificationService.ts`) : construction du digest quotidien et répartition en retard/aujourd'hui selon la date effective d'une tâche ; la validation des combinaisons `recurrenceType`/`interval`/`exactDate`/`MOISTURE_THRESHOLD` ; les limites structurelles de `backupSchema` ; le rate limiter.

### Tests E2E (Playwright)

```bash
cd e2e && cat README.md
```

Parcours réels dans un vrai navigateur : authentification, cycle de vie d'une plante (création → tâche → arrosage), isolation entre comptes (`ownership.spec.ts`), report de tâche, réglages de notification, export/import (cycle complet avec vérification du fichier physique restauré), galerie photo. Voir `e2e/README.md` pour la commande d'exécution manuelle (contre la prod réelle, jamais une instance simulée) et deux pièges déjà rencontrés (cookies `__Secure-` invisibles en HTTP simple pour un vrai navigateur, `node_modules` à isoler du conteneur Playwright).

## Build / production

```bash
npm run build
```

## CI

`.github/workflows/ci.yml`, sur chaque push vers `main` et chaque pull request : `prisma generate` + `prisma migrate deploy` (valide qu'aucune migration n'est cassée) + `npm test` + `npm run build` (job `test`), puis la suite E2E complète rejouée contre une instance `next start` **éphémère** démarrée dans le workflow -- base SQLite et compte seed jetables, jamais la prod réelle (job `e2e`, dépend de `test`). Ferme le trou que laissait un simple build : la CI pouvait être verte alors qu'un changement cassait le parcours navigateur réel.

## Déploiement (homelab)

Intégré à `docker-compose.yml` à la racine du homelab sous les services `plantes-app` (Next.js standalone) et `nginx-plantes` (reverse proxy interne). Voir les commentaires du docker-compose.yml pour les variables `PLANTES_*` à définir dans le `.env` racine.

Le sous-domaine `plantes.fcold.org` doit être routé vers `http://nginx-plantes:80` depuis le dashboard Cloudflare Zero Trust (Networks > Tunnels > Public Hostname) -- cette étape est manuelle, hors dépôt.

## Architecture

- `src/server/careEngine/` : moteur métier isolé (récurrences, saisonnalité, dosage, génération de tâches, déclenchement par capteur). Jamais appelé directement depuis un composant React. La génération de tâche (`ensurePendingTaskForRule`, `evaluateSensorReadingForTasks`) est transactionnelle de bout en bout (lecture + écriture atomiques), pour éviter qu'un appel concurrent ne crée deux tâches en attente pour la même règle.
- `src/server/validation/` : schémas Zod, une source de vérité par entité. Les combinaisons de champs incompatibles (ex. `MOISTURE_THRESHOLD` hors arrosage, `recurrenceType` sans `interval`) sont rejetées à la validation, avant toute écriture en base.
- `src/app/api/` : routes API REST. Chaque route vérifie la propriété de la ressource (`src/server/ownership.ts`) avant toute lecture/écriture -- voir [Sécurité](#sécurité).
- `src/app/*` (hors `api/`) : pages App Router, majoritairement des Server Components qui lisent directement via Prisma (`src/server/db.ts`) ; les mutations passent par les routes API via `fetch` côté client, qui vérifient systématiquement `response.ok` avant de considérer une action réussie.
- Authentification : `src/server/auth.ts` (NextAuth v5, Credentials + JWT), middleware (`src/middleware.ts`) protège toutes les pages sauf `/login`/`/inscription` ; les routes `/api/*` gèrent leur propre authentification (401 JSON, pas de redirection HTML).
- Notifications : `src/server/notifications/` -- `webPush.ts` (envoi Web Push bas niveau, purge les abonnements périmés), `notificationService.ts` (couche d'abstraction : construit le message du digest quotidien à partir des tâches dues/en retard/à venir, sur leur date **effective** -- une tâche reportée compte selon sa nouvelle échéance, pas l'ancienne), `scheduler.ts` (boucle en mémoire démarrée par `src/instrumentation.ts` au boot du serveur, pas de cron hôte nécessaire -- **mono-instance uniquement**, deux instances enverraient chacune leur propre digest). Un `PushSubscription` par appareil abonné, des `NotificationPreference` par utilisateur.
- PWA : `public/manifest.json` + `public/icons/`, service worker minimal (`public/sw.js`, push + clic sur la notification uniquement, pas de cache offline) enregistré par `src/components/ServiceWorkerRegistration.tsx`.
- Bibliothèque de plantes : `PlantLibraryEntry` sert de table "espèce générique" (le `Plant` d'un utilisateur y référence une entrée via `libraryEntryId`, jamais l'inverse -- importer/mettre à jour une fiche n'affecte jamais les plantes déjà créées à partir d'elle, leurs champs/règles ont été copiés une fois à l'ajout). Trois origines : `prisma/librarySeed.ts` (120 profils saisis à la main, `source="LOCAL"`), `prisma/plantfolioData.json` (952 profils importés une fois du dataset [plantfolio-common-plants](https://github.com/Luminoid/plantfolio-common-plants), CC BY-NC-SA 4.0, `source="PLANTFOLIO"`, voir `prisma/plantfolioMapping.ts`), et l'import à la demande depuis une source externe (`source="OPENPLANTBOOK"` ou `"PERENUAL"`, voir ci-dessous). Les trois sont seedées/synchronisées via `prisma/seed.ts` -- un doublon d'espèce entre plantfolio et une fiche locale est automatiquement écarté (la fiche locale, mieux soignée, a priorité). `GET /api/library?q=` pour la recherche locale (instantanée sur ~1000 profils), intégrée au formulaire d'ajout (`src/components/PlantForm.tsx`) et à une page de recherche live dédiée (`/bibliotheque`) qui pré-remplit les champs/règles vides à partir du profil choisi. Resynchroniser une fiche déjà importée (`POST /api/library/:id/resync`) est réservé à l'administrateur (voir [Rôles](#rôles--administration)) : cette fiche est partagée par tous les comptes.
- Photos utilisateur (couverture, galerie, notes) : upload traité (`sharp` -- redimensionnement, compression, réorientation EXIF) puis stocké sous `public/uploads/<uuid>.jpg`. **Servies uniquement via une route authentifiée** (`src/app/uploads/[filename]/route.ts`, ownership vérifié), pas un dossier statique -- voir [Sécurité](#sécurité). Le fallback visuel de la bibliothèque de plantes (images Wikimedia/OpenPlantbook/Perenual/iNaturalist/GBIF) reste public par nature (contenu partagé, pas une photo personnelle).
- Import d'espèces externes : `src/server/externalSpecies/providers.ts` centralise deux fournisseurs interchangeables (`src/server/openplantbook/`, `src/server/perenual/`, chacun avec son client HTTP + son mapping vers notre `careProfile`), essayés dans l'ordre OpenPlantbook (orienté soin, seuils précis mais pas de fréquence d'arrosage calendaire) puis Perenual en repli (quota gratuit plus restreint : 3000 espèces / 100 requêtes par jour). Si la fiche retenue n'a pas d'arrosage (typiquement OpenPlantbook), un complément silencieux via Perenual comble ce champ précis sans écraser le reste. Flux : recherche locale d'abord (jamais d'appel réseau tant qu'un résultat local existe) ; si rien de pertinent, `ExternalSpeciesSearch.tsx` propose une recherche en ligne sur clic explicite (jamais automatique) ; aperçu (`GET /api/library/external/:id?source=...`) avant import ; `POST /api/library/import` réinterroge la source côté serveur (jamais confiance en un payload client) et fait un upsert (idempotent par `source`+`sourceId`). Provenance conservée sur `PlantLibraryEntry` (`source`, `sourceId`, `importedAt`, `lastSyncedAt`, `imageSource`, `imageSourceUrl`, `imageAuthor`, `imageLicense`, `imageLicenseUrl` -- auteur/licence/source distingués strictement) -- une fois importée, une fiche est disponible localement sans dépendance réseau. GBIF/POWO (vérification taxonomique) ne sont pas branchés en recherche interactive : `prisma/backfillImages.ts` (script de rattrapage ponctuel, pas exécuté au démarrage) les utilise déjà pour combler les photos manquantes des fiches sans image propre.
- **OpenPlantbook non vérifié en conditions réelles** : les endpoints/l'authentification OAuth2 viennent du code source de la librairie officielle (fiable), mais les noms exacts des champs de réponse (`mapping.ts`) sont une hypothèse motivée faute de compte pour tester -- comme Perenual en son temps, à corriger dès les premiers vrais résultats une fois `OPENPLANTBOOK_CLIENT_ID`/`SECRET` renseignés.
- **Export/import** : `GET /api/export` / `POST /api/import` (`src/server/validation/backup.ts` pour le schéma). Un vrai backup restaurable : une archive `.zip` (`data.json` + `uploads/`, les fichiers photo eux-mêmes), pas seulement des données référençant des chemins locaux -- une sauvegarde reste valide une fois restaurée sur un autre serveur. Inclut plantes, règles, historique, notes, photos, capteurs (avec leurs 1000 dernières lectures) et le profil météo. Limites structurelles sur la taille du payload (1000 plantes max, etc., voir `backupSchema`). L'import crée toujours de nouveaux enregistrements (jamais de fusion avec l'existant -- réimporter son propre backup duplique sa collection) ; les fichiers sont réécrits sous un nom neuf (jamais de collision avec l'existant) ; les tâches ne sont jamais importées telles quelles, elles sont régénérées par le CareEngine à partir des règles restaurées ; un capteur importé reçoit une clé API fraîche (renvoyée une seule fois dans la réponse). Tout l'import est transactionnel : un échec en cours de restauration n'en laisse jamais une partielle.
- Capteurs IoT : `POST /api/plants/:id/sensors` (création, session utilisateur, renvoie la clé API en clair **une seule fois**) et `POST /api/sensors/:id/readings` (ingestion par l'appareil, header `X-Sensor-Key`, pas de session -- comparé à `Sensor.apiKeyHash`, bcrypt). `POST /api/sensors/:id/rotate` régénère la clé (l'ancienne devient aussitôt invalide). `src/server/careEngine/sensorTrigger.ts` + `evaluateSensorReadingForTasks` : une règle `MOISTURE_THRESHOLD` (uniquement sur une règle d'arrosage) génère une tâche dès qu'une lecture passe sous le seuil configuré. `recordedAt` d'une lecture doit être récent (48h maximum, jamais dans le futur). Pas d'UI de gestion (pas de matériel réel à ce jour) -- architecture prête, à brancher quand un capteur existera vraiment.
- Gestion des engrais (`/engrais`) : bibliothèque personnelle d'engrais (NPK, dosage), réutilisable lors de la création d'une règle de fertilisation.
- Apparence : bascule clair/sombre/système dans Paramètres (`src/components/ThemeToggle.tsx`), préférence stockée en `localStorage` côté navigateur.

## Sauvegardes

Intégré au `backup-manager` du homelab (`www/backup-manager/backend/app/adapters/plantes.py`, même motif que Mystery : bind-mount direct, pas d'API interne). Deux mécanismes indépendants qui écrivent dans le même dossier (`~/backups/plantes/`, checksum SHA256 à côté de chaque archive) :
- Sauvegarde quotidienne automatique via cron (`/home/franky/.local/bin/backup-plantes`, 4h15, rétention 14 jours).
- Sauvegarde/restauration à la demande depuis `https://backups.fcold.org`.

Ce mécanisme sauvegarde le disque/la base entiers (niveau infrastructure) ; l'export `.zip` intégré à l'app (voir ci-dessus, `/parametres`) reste le moyen de restaurer les données d'**un seul compte** sur une autre installation.

## Hors périmètre

(rien -- les 8 phases du cahier des charges sont couvertes, avec l'architecture capteurs en préparation du matériel réel)
