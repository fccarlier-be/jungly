# Jungly

Application de suivi et d'entretien des plantes (arrosage, fertilisation, rempotage, tâches, historique). Couvre les phases 1 à 8 du cahier des charges : gestion des plantes, moteur de règles/tâches (CareEngine), historique, dashboard, notifications push, PWA installable, bibliothèque de plantes, export/import, capteurs IoT. Multi-utilisateur (inscription en libre-service, voir ci-dessous).

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- Prisma + SQLite
- NextAuth (Auth.js) v5, provider Credentials, sessions JWT
- Zod pour la validation
- Vitest pour les tests du CareEngine
- web-push (Web Push / VAPID) pour les notifications

## Prérequis

- Docker (aucun Node.js requis en local : tout tourne dans des conteneurs)

## Variables d'environnement

Copier `.env.example` en `.env` et renseigner :

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chemin du fichier SQLite, ex. `file:./data/plantes.db` |
| `AUTH_SECRET` | Secret NextAuth (ex. `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL publique de l'app (ex. `http://localhost:3000` en dev, `https://plantes.fcold.org` en prod) |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Identifiants de l'utilisateur unique créé par le seed |
| `PLANTES_VAPID_PUBLIC_KEY` / `PLANTES_VAPID_PRIVATE_KEY` | Clés Web Push, générées une fois avec `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Même valeur que `PLANTES_VAPID_PUBLIC_KEY`, exposée côté client (nécessaire pour l'abonnement push depuis le navigateur) |
| `OPENPLANTBOOK_CLIENT_ID` / `OPENPLANTBOOK_CLIENT_SECRET` | Identifiants OAuth2 (pas une simple clé) sur [open.plantbook.io](https://open.plantbook.io), essayés en premier pour la recherche/import d'espèces absentes de la bibliothèque locale. |
| `PERENUAL_API_KEY` | Clé gratuite sur [perenual.com/docs/api](https://perenual.com/docs/api), utilisée en repli si OpenPlantbook n'est pas configuré ou n'a pas de résultat. Sans aucune des deux, la recherche externe échoue proprement (message d'erreur), le reste de l'app fonctionne normalement. |

**Attention** : `NEXT_PUBLIC_*` est figé au moment du `next build`, jamais relu au runtime. En Docker, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` doit donc passer en `build.args` (voir `docker-compose.yml`), pas seulement en variable d'environnement du conteneur.

L'inscription est en libre-service (`/inscription`) : n'importe qui connaissant l'URL peut créer un compte. `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` créent (et gardent administrateur, `User.isAdmin`) un premier compte au démarrage -- changer `SEED_USER_PASSWORD` puis relancer `prisma db seed` met bien à jour le mot de passe d'un compte déjà existant (pas seulement à la création). `SEED_USER_PASSWORD` est obligatoire : son absence fait échouer le démarrage plutôt que de créer un compte administrateur avec un mot de passe par défaut connu.

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

Crée l'utilisateur unique (`SEED_USER_EMAIL`/`SEED_USER_PASSWORD`) et 6 plantes de démonstration (Monstera deliciosa, Calathea orbifolia, Ficus elastica, Sansevieria trifasciata, Echeveria, Pothos) avec règles d'entretien, historique et tâches dans des états variés (en retard, aujourd'hui, à venir). Seed également la bibliothèque de plantes (120 profils, voir `prisma/librarySeed.ts`), toujours exécuté indépendamment des données personnelles.

## Tests

```bash
npm test
```

Couvre le CareEngine (`src/server/careEngine/`) : récurrences (jours/semaines/mois/annuelle/date exacte), saisonnalité, transitions de tâche (complétée/reportée/en retard), calcul de dosage d'engrais, déclenchement par capteur ; et le service de notifications (`src/server/notifications/notificationService.ts`) : construction du message du digest quotidien selon les tâches dues/en retard/à venir.

## Build / production

```bash
npm run build
```

## Déploiement (homelab)

Intégré à `docker-compose.yml` à la racine du homelab sous les services `plantes-app` (Next.js standalone) et `nginx-plantes` (reverse proxy interne). Voir les commentaires du docker-compose.yml pour les variables `PLANTES_*` à définir dans le `.env` racine.

Le sous-domaine `plantes.fcold.org` doit être routé vers `http://nginx-plantes:80` depuis le dashboard Cloudflare Zero Trust (Networks > Tunnels > Public Hostname) -- cette étape est manuelle, hors dépôt.

## Architecture

- `src/server/careEngine/` : moteur métier isolé (récurrences, saisonnalité, dosage, génération de tâches, déclenchement par capteur). Jamais appelé directement depuis un composant React.
- `src/server/validation/` : schémas Zod, une source de vérité par entité.
- `src/app/api/` : routes API REST. Chaque route vérifie la propriété de la ressource (`src/server/ownership.ts`) avant toute lecture/écriture.
- `src/app/*` (hors `api/`) : pages App Router, majoritairement des Server Components qui lisent directement via Prisma (`src/server/db.ts`) ; les mutations passent par les routes API via `fetch` côté client.
- Authentification : `src/server/auth.ts` (NextAuth v5, Credentials + JWT), middleware (`src/middleware.ts`) protège toutes les pages sauf `/login` ; les routes `/api/*` gèrent leur propre authentification (401 JSON, pas de redirection HTML).
- Notifications : `src/server/notifications/` -- `webPush.ts` (envoi Web Push bas niveau, purge les abonnements périmés), `notificationService.ts` (couche d'abstraction : construit le message du digest quotidien), `scheduler.ts` (boucle en mémoire démarrée par `src/instrumentation.ts` au boot du serveur, pas de cron hôte nécessaire). Un `PushSubscription` par appareil abonné, des `NotificationPreference` par utilisateur.
- PWA : `public/manifest.json` + `public/icons/`, service worker minimal (`public/sw.js`, push + clic sur la notification uniquement, pas de cache offline) enregistré par `src/components/ServiceWorkerRegistration.tsx`.
- Bibliothèque de plantes : `PlantLibraryEntry` sert de table "espèce générique" (le `Plant` d'un utilisateur y référence une entrée via `libraryEntryId`, jamais l'inverse -- importer/mettre à jour une fiche n'affecte jamais les plantes déjà créées à partir d'elle, leurs champs/règles ont été copiés une fois à l'ajout). Trois origines : `prisma/librarySeed.ts` (120 profils saisis à la main, `source="LOCAL"`), `prisma/plantfolioData.json` (952 profils importés une fois du dataset [plantfolio-common-plants](https://github.com/Luminoid/plantfolio-common-plants), CC BY-NC-SA 4.0, `source="PLANTFOLIO"`, voir `prisma/plantfolioMapping.ts`), et l'import à la demande depuis une source externe (`source="OPENPLANTBOOK"` ou `"PERENUAL"`, voir ci-dessous). Les trois sont seedées/synchronisées via `prisma/seed.ts` -- un doublon d'espèce entre plantfolio et une fiche locale est automatiquement écarté (la fiche locale, mieux soignée, a priorité). `GET /api/library?q=` pour la recherche locale (instantanée sur ~1000 profils), intégrée au formulaire d'ajout (`src/components/PlantForm.tsx`) et à une page de recherche live dédiée (`/bibliotheque`) qui pré-remplit les champs/règles vides à partir du profil choisi.
- Import d'espèces externes : `src/server/externalSpecies/providers.ts` centralise deux fournisseurs interchangeables (`src/server/openplantbook/`, `src/server/perenual/`, chacun avec son client HTTP + son mapping vers notre `careProfile`), essayés dans l'ordre OpenPlantbook (orienté soin, seuils précis mais pas de fréquence d'arrosage calendaire) puis Perenual en repli (quota gratuit plus restreint : 3000 espèces / 100 requêtes par jour). Si la fiche retenue n'a pas d'arrosage (typiquement OpenPlantbook), un complément silencieux via Perenual comble ce champ précis sans écraser le reste. Flux : recherche locale d'abord (jamais d'appel réseau tant qu'un résultat local existe) ; si rien de pertinent, `ExternalSpeciesSearch.tsx` propose une recherche en ligne sur clic explicite (jamais automatique) ; aperçu (`GET /api/library/external/:id?source=...`) avant import ; `POST /api/library/import` réinterroge la source côté serveur (jamais confiance en un payload client) et fait un upsert (idempotent par `source`+`sourceId`) ; `POST /api/library/:id/resync` rafraîchit une fiche déjà importée. Provenance conservée sur `PlantLibraryEntry` (`source`, `sourceId`, `importedAt`, `lastSyncedAt`, `imageSourceUrl`, `imageLicense`, `imageLicenseUrl`) -- une fois importée, une fiche est disponible localement sans dépendance réseau. GBIF/POWO (vérification taxonomique) ne sont pas branchés : `source` est déjà un champ ouvert à ces valeurs le jour où ce sera nécessaire.
- **OpenPlantbook non vérifié en conditions réelles** : les endpoints/l'authentification OAuth2 viennent du code source de la librairie officielle (fiable), mais les noms exacts des champs de réponse (`mapping.ts`) sont une hypothèse motivée faute de compte pour tester -- comme Perenual en son temps, à corriger dès les premiers vrais résultats une fois `OPENPLANTBOOK_CLIENT_ID`/`SECRET` renseignés.
- Export/import : `GET /api/export` / `POST /api/import` (`src/server/validation/backup.ts` pour le schéma). L'import crée toujours de nouveaux enregistrements ; les tâches ne sont jamais importées telles quelles, elles sont régénérées par le CareEngine à partir des règles restaurées.
- Capteurs IoT : `POST /api/plants/:id/sensors` (création, session utilisateur) et `POST /api/sensors/:id/readings` (ingestion par l'appareil, header `X-Sensor-Key` = `Sensor.apiKey`, pas de session). `src/server/careEngine/sensorTrigger.ts` + `evaluateSensorReadingForTasks` : une règle `MOISTURE_THRESHOLD` génère une tâche dès qu'une lecture passe sous le seuil configuré. Pas d'UI de gestion (pas de matériel réel à ce jour) -- architecture prête, à brancher quand un capteur existera vraiment.
- Gestion des engrais (`/engrais`) : bibliothèque personnelle d'engrais (NPK, dosage), réutilisable lors de la création d'une règle de fertilisation.
- Apparence : bascule clair/sombre/système dans Paramètres (`src/components/ThemeToggle.tsx`), préférence stockée en `localStorage` côté navigateur.

## Sauvegardes

Intégré au `backup-manager` du homelab (`www/backup-manager/backend/app/adapters/plantes.py`, même motif que Mystery : bind-mount direct, pas d'API interne). Deux mécanismes indépendants qui écrivent dans le même dossier (`~/backups/plantes/`, checksum SHA256 à côté de chaque archive) :
- Sauvegarde quotidienne automatique via cron (`/home/franky/.local/bin/backup-plantes`, 4h15, rétention 14 jours).
- Sauvegarde/restauration à la demande depuis `https://backups.fcold.org`.

## Hors périmètre

(rien -- les 8 phases du cahier des charges sont couvertes, avec l'architecture capteurs en préparation du matériel réel)
