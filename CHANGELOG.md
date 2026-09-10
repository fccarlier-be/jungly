# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Post-MVP] - 2026-09-10 — Durcissement post-audit4

Suite à une 4e revue de code indépendante (GPT, sur l'état post-audit3, CI verte). Audit le plus précis jusqu'ici -- une seule affirmation fausse (Prisma "6.2.1, P1 immédiat" : déjà `6.19.3` dans `package-lock.json`/le conteneur en prod, même faux-positif récurrent que Next.js dans audit2 et audit3 -- fermé définitivement en épinglant les versions exactes des dépendances sensibles, voir plus bas).

### Sécurité

- **`TZ=Europe/Brussels` fixé aussi dans le Dockerfile** : déjà effectif via `environment:` dans `docker-compose.yml` (Node.js résout `TZ` avec son propre ICU embarqué, indépendamment de `tzdata` absent d'Alpine -- vérifié : `Intl.DateTimeFormat().resolvedOptions().timeZone` renvoyait déjà `Europe/Brussels`), donc pas un bug actif contrairement à ce que suggérait l'audit. Ajouté quand même dans l'image pour qu'elle reste correcte par défaut même lancée hors de ce `docker-compose.yml` précis.
- **Conteneur Docker non-root** : le runtime tournait en `root` alors que l'app accepte des fichiers uploadés, des images traitées par `sharp` et des ZIP d'import. `USER node` (utilisateur non-root déjà fourni par l'image officielle, uid/gid 1000) + `--chown=node:node` sur chaque `COPY` (pas de `RUN chown -R` séparé -- un premier essai a montré que le parcours récursif d'un `node_modules` complet, en plus de la copie elle-même, doublait le travail au point de provoquer des kills mémoire répétés sur cet hôte partagé). Répertoires bind-montés (`/app/data`, `/app/public/uploads`) rechownés côté hôte au même uid en amont. Vérifié en direct : migrations + seed au démarrage, écriture DB et upload/suppression de fichier réels, suite E2E `photos.spec.ts`.
- **Mot de passe borné à 72 octets** (`registerSchema`) : bcrypt ne prend en compte que les 72 premiers octets, alors que `password.max(200)` autorisait davantage -- deux mots de passe partageant le même préfixe de 72 octets devenaient équivalents. Validation par `Buffer.byteLength(value, "utf8")` (pas `.max()` de zod, qui compte les caractères UTF-16, pas les octets UTF-8 -- un mot de passe accentué pouvait dépasser 72 octets bien avant 72 caractères).
- **Versions de dépendances sensibles épinglées exactement** (`next`, `prisma`, `@prisma/client`, `sharp`, `bcryptjs` -- `next-auth` l'était déjà) : ferme définitivement le faux-positif récurrent (Next.js ×2 dans audit2/audit3, Prisma dans audit4) où `package.json` affichait un plancher `^x.y.z` périmé alors que le lockfile/le conteneur en prod tournaient déjà sur une version plus récente. Note explicative ajoutée dans `README.md` (section Sécurité). Aucun changement de version réel.
- **Capteurs sans rate limit ni plafond à la création directe** : `POST /api/plants/:id/sensors` n'avait aucune limite (contrairement à la limite de 20/plante qui n'existait que côté *import*). Ajout d'un rate limit (`sensor-create:${userId}`, 10/5min, même ordre de grandeur que les autres créations sensibles) et d'un plafond de 20 capteurs/plante. Vérifié en direct : 21e capteur → 400 ; 11e requête en rafale → 429.
- **Tâche `SNOOZED` dupliquée par une tâche `PENDING` pour la même règle** : `ensurePendingTaskForRuleWithClient()`/`evaluateSensorReadingForTasks()` ne vérifiaient l'absence de tâche active que via `status: "PENDING"`, jamais `SNOOZED` -- une tâche reportée n'était pas considérée comme "active". Un arrosage spontané (`recordStandaloneCareEvent`, ex. bouton "Arrosée maintenant" sans lien avec la tâche reportée) laissait donc la tâche `SNOOZED` orpheline tout en créant une nouvelle `PENDING` à côté. Les trois filtres deviennent `status: { in: ["PENDING", "SNOOZED"] }`, et `recordStandaloneCareEvent` complète désormais aussi une tâche `SNOOZED` trouvée (pas seulement `PENDING`) avant de régénérer la suivante. Vérifié en E2E (`tasks-and-settings.spec.ts`) : tâche reportée + arrosage spontané → exactement une tâche active après coup, l'ancienne passée à `COMPLETED`.
- **Ownership des URLs `/uploads/...` non vérifié à l'écriture** : le fix `remapUrl()` d'audit3 ne couvrait que l'import ZIP -- `POST/PATCH /api/plants`, `POST /api/plants/:id/photos` et `POST /api/notes` acceptaient n'importe quelle URL `/uploads/...` sans vérifier qu'elle appartient à l'utilisateur, si son nom (UUID) était connu. Nouvelle table `Upload` (trace qui a téléversé chaque fichier via `POST /api/uploads`, avant même son rattachement à une plante) et nouvelle fonction `assertOwnedUpload()` (`src/server/uploads.ts`) : autorise une URL si le fichier appartient à l'utilisateur (table `Upload`) OU si elle est déjà référencée par une de SES plantes/photos/notes existantes (réédition légitime), rejette (400) dans tous les autres cas. Appliqué sur les 4 routes concernées. Vérifié en E2E (`ownership.spec.ts` étendu) : compte B ne peut plus référencer le fichier physique de A via couverture, galerie ou note.
- **`data.json` non borné à l'import** : le fix ZIP bomb précédent (audit3) plafonnait les fichiers `uploads/*` mais pas `data.json` lui-même, décompressé (`entry.async("string")`) sans aucune limite -- un fichier de 25 Ko compressés pouvait produire 25 Mo décompressés sans être inquiété. Ajout d'un contrôle en deux temps (taille annoncée par les métadonnées du zip avant décompression, puis taille réelle après) via `MAX_DATA_JSON_SIZE` (20 Mo). Ajout aussi de `MAX_ZIP_FILE_SIZE` (10 Mo) vérifié côté application -- ne plus dépendre uniquement de `client_max_body_size` de nginx. Vérifié en direct : archive de 25 Ko avec `data.json` gonflé à 25 Mo → 400 propre.

## [Post-MVP] - 2026-09-10 — Durcissement post-audit3

Suite à une 3e revue de code indépendante (GPT, sur l'état post-audit2), vérifiée ligne par ligne contre le code réel avant correction. Trois écarts par rapport aux affirmations de l'audit : une sous-estimée (Next.js : RCE non-authentifiées critiques CVSS 9.0/9.5 confirmées par recherche web, pas juste "des advisories"), une surestimée (le plancher `^15.1.4` de `package.json` était périmé, mais `package-lock.json`/le conteneur en prod tournaient déjà en `next@15.5.25`, patché, depuis la régénération du lockfile de la phase 5 d'audit2 -- même type de faux positif que dans audit2 lui-même), et une fausse (le README documentait déjà explicitement "1000 dernières lectures" par capteur, pas d'"export complet" -- rien à corriger sur ce point précis).

### Sécurité

- **Plancher `next` corrigé dans `package.json`** (`^15.1.4` → `^15.5.24`) pour refléter la réalité : la version réellement installée (`package-lock.json`, image Docker en prod) était déjà `15.5.25`, au-delà du correctif du bulletin d'août 2026 (deux RCE critiques non-authentifiées, CVSS 9.0/9.5 -- AVIF via `libheif`/`sharp`, non exploitable ici en pratique faute d'usage de `next/image` ; path traversal Windows, non pertinent sur ce déploiement Linux). Aucun changement de version réel, juste une correction de plancher déclaré pour éviter toute confusion future.
- **Import : URL `/uploads/...` orpheline conservée telle quelle au lieu d'être supprimée** (`remapUrl()` dans `import/route.ts`) -- un backup partiel/corrompu, ou une archive fabriquée à la main référençant le nom de fichier (UUID) d'un AUTRE utilisateur sans l'inclure dans le zip, faisait conserver l'URL d'origine telle quelle. La plante importée pointait alors vers ce chemin, que la nouvelle route de service (audit2) sert dès qu'une plante DU compte courant le référence -- sans vérifier que le fichier a réellement été apporté par CET import. `remapUrl()` retourne désormais `null` (photo perdue, jamais un chemin non maîtrisé) quand le fichier référencé est absent de l'archive. Nouveau test E2E dédié (`backup.spec.ts`) construisant une archive avec une référence orpheline.
- **Import : les tâches étaient régénérées avant la restauration de l'historique** -- chaque `CareRule` importée appelait `ensurePendingTaskForRule(rule, new Date(), tx)` avant que la boucle `careEvents` ne s'exécute, donc la prochaine échéance se calculait depuis la date d'import plutôt que depuis le dernier soin réel. Une plante arrosée tous les 7 jours dont le dernier arrosage réel datait d'avant-hier se retrouvait avec une échéance à +7 jours à partir d'aujourd'hui, décalant silencieusement tout le calendrier à chaque restauration. Les `CareEvent` sont désormais importés en premier ; chaque règle dérive son point de départ du dernier événement du même type de soin (repli sur la date d'import si aucun événement de ce type n'a été restauré). Vérifié en direct : arrosage réel il y a 2 jours + règle hebdomadaire → échéance correcte à +5 jours, pas +7.
- **Plafond global de capteurs à l'import** : `MAX_SENSORS_PER_PLANT` (20) × `MAX_PLANTS` (1000) autorisait jusqu'à 20 000 hachages `bcrypt` (coût 10) dans une seule transaction d'import. Ajout de `MAX_SENSORS_TOTAL = 100` sur l'ensemble du backup, largement au-dessus de tout usage homelab réel.
- **Import ZIP sans limite de taille décompressée ni validation de contenu** : `JSZip.loadAsync()`/`entry.async()` décompressent entièrement en mémoire (pas de mode flux) -- rien ne bornait la taille une fois décompressée, alors que le zip compressé lui-même n'est plafonné qu'à 10 Mo par nginx (un ratio DEFLATE dégénéré peut amplifier ça de plusieurs ordres de grandeur). Ajout de plafonds (nombre d'entrées, taille par fichier, taille cumulée décompressée) et d'une validation de contenu réel via `sharp` (déjà utilisée pour les uploads normaux) -- tout fichier non décodable comme image fait échouer l'import entier, pas seulement ce fichier. Traité en même temps qu'une découverte adjacente : le filtrage des entrées `uploads/` se basait sur `zip.folder("uploads").files`, qui n'est PAS filtré par JSZip (il partage la table de fichiers complète du zip) -- `data.json` lui-même se retrouvait traité comme une image candidate. Invisible tant qu'aucune validation stricte n'existait (juste un fichier orphelin de plus sur disque), devenu un échec systématique de tout import dès l'ajout de la validation `sharp` ci-dessus -- corrigé par un filtrage explicite sur le préfixe de chemin `uploads/`.

## [Post-MVP] - 2026-09-10 — Durcissement post-audit2

Suite à une 2e revue de code indépendante (GPT, sur l'état post-E2E/CI), vérifiée ligne par ligne contre le code réel avant correction -- deux de ses affirmations se sont révélées fausses (version Next.js déjà à jour d'après le lockfile ; le "bug" `overdueEnabled` ne se reproduit pas selon le calcul réel du digest), et un bug adjacent réel a été trouvé en vérifiant ce dernier point.

### Sécurité

- **CVE NextAuth réelle** (CVE-2026-73421 / GHSA-8fpg-xm3f-6cx3, vérifiée par recherche web) : `next-auth` `5.0.0-beta.25` → `5.0.0-beta.32`. Les versions `beta.0` à `beta.31` retournent un objet tronqué mais *truthy* depuis `auth()` quand la configuration devient invalide (ex. `AUTH_SECRET` absent), au lieu de `null` -- notre middleware fait exactement `if (!req.auth)`, le pattern vulnérable à ce "fail open". Pas activement exploité (notre config est correcte), mais plus de garantie de repli sécurisé si une variable d'environnement venait à manquer.
- **Mot de passe seed par défaut supprimé** : `prisma/seed.ts` ne retombe plus sur `"changeme123"` si `SEED_USER_PASSWORD` est absent -- le démarrage échoue explicitement à la place.
- **Mécanisme de changement de mot de passe réparé** : changer `SEED_USER_PASSWORD` puis relancer le seed ne mettait à jour que `isAdmin`, jamais `passwordHash`, sur un compte déjà existant -- contrairement à ce que promettait le README. `passwordHash` fait maintenant partie de l'`update` de l'upsert.

### Corrigé

- **Digest de notifications** : le comptage des tâches "en retard" utilisait `dueAt` brut au lieu de la date effective (`effectiveDueDate()`) -- une tâche reportée (`SNOOZED`) avec un ancien `dueAt` d'origine mais reportée à aujourd'hui était comptée à tort comme en retard. Logique de comptage extraite en fonction pure testée (`splitOverdueAndDueToday`).
- **`MOISTURE_THRESHOLD` restreint à l'arrosage** : rien n'empêchait de créer une règle `FERTILIZING`/`REPOTTING` avec cette récurrence -- un capteur d'humidité du sol aurait alors pu déclencher une fertilisation ou un rempotage. Champ `moistureThresholdPercent` ajouté à l'interface `RuleConfiguration` (déjà utilisé au runtime, absent du type).
- **Fenêtre de course sur la génération de tâches** (`ensurePendingTaskForRule()`, `evaluateSensorReadingForTasks()`) : la lecture ("existe-t-il déjà une tâche `PENDING` ?") et l'écriture se faisaient en deux appels Prisma séparés -- deux appels concurrents pouvaient chacun constater l'absence de tâche avant que l'un des deux n'écrive, créant deux tâches `PENDING` pour la même règle. Lecture et écriture englobées dans une transaction unique (SQLite sérialise les transactions d'écriture au niveau moteur, suffisant pour fermer la fenêtre sans verrou applicatif).
- **Rate limiting derrière Cloudflare Tunnel** : `nginx/default.conf` posait `X-Real-IP` sur `$remote_addr`, qui correspond à l'IP interne du conteneur `cloudflared` (le tunnel), pas au visiteur réel -- tous les visiteurs externes partageaient donc le même compteur de rate limit. Utilise désormais `CF-Connecting-IP` (posé systématiquement par Cloudflare, y compris via Tunnel), avec repli sur `$remote_addr` en son absence.
- **Photos utilisateur rendues privées** : `/uploads/<uuid>.jpg` était servi directement par nginx sans aucune vérification -- un tiers connaissant l'URL exacte pouvait récupérer une photo sans session. `nginx` ne sert plus ce dossier ; une nouvelle route (`src/app/uploads/[filename]/route.ts`) vérifie que le fichier appartient bien à une plante (couverture, galerie ou photo de note) de l'utilisateur connecté avant de le lire sur disque. Même chemin d'URL qu'avant (`/uploads/<nom>`) -- aucune référence existante à modifier.
- **Limites structurelles sur l'import JSON** : `backupSchema` n'imposait quasiment aucune borne (nombre de plantes/événements/photos, taille des chaînes libres, taille de `configuration`/`metadata`) -- un compte compromis pouvait faire travailler SQLite très longtemps avec un payload artificiellement énorme. Bornes ajoutées (1000 plantes, 10 000 événements/plante, 100 photos/plante, etc.), toujours très au-dessus de tout usage réel homelab.
- **Clé API capteur hashée + rotation** : `Sensor.apiKey` était stocké et comparé en clair, et renvoyé par `GET /api/plants/:id/sensors` à chaque lecture (pas seulement à la création). Renommé en `apiKeyHash` (bcrypt, comme les mots de passe utilisateur) ; le jeton en clair n'est désormais visible qu'une seule fois, à la création ou via la nouvelle route `POST /api/sensors/:id/rotate`. `recordedAt` (lectures de capteur) rejette maintenant une date dans le futur ou antérieure à 48h, pour limiter le backdating de mesures.

### Ajouté

- **Export/import devenu un vrai backup restaurable** : `GET /api/export` produit désormais une archive `.zip` (`data.json` + `uploads/`, les fichiers photo eux-mêmes) au lieu d'un simple JSON référençant des chemins `/uploads/...` -- restaurer une sauvegarde sur un autre serveur ne donnait auparavant que des photos cassées (le fichier restait sur le serveur d'origine). `POST /api/import` désarchive, revalide (`backupSchema`), réécrit chaque fichier sous un nom neuf (UUID frais, évite toute collision) et remappe les URLs en conséquence avant insertion en base -- toujours dans la même transaction atomique qu'avant (échec d'écriture d'un fichier = import annulé en entier, fichiers déjà écrits nettoyés). L'export inclut maintenant aussi les capteurs (avec leurs 1000 dernières lectures) et le profil météo, absents jusqu'ici. Un capteur importé reçoit une clé API fraîche (renvoyée une seule fois dans la réponse d'import) -- l'ancienne ne survivrait de toute façon pas à un changement de serveur.
- **4 nouveaux tests E2E Playwright** : `ownership.spec.ts` (deux comptes jetables, vérifie qu'aucune ressource -- plante, tâche, règle, engrais, emplacement, photo -- n'est accessible/modifiable depuis un autre compte), `tasks-and-settings.spec.ts` (report de tâche qui redevient dû à expiration, persistance du réglage "tâches en retard"), `backup.spec.ts` (cycle complet export → suppression → import, vérifie que la plante ET le fichier physique de sa photo sont bien restaurés), `photos.spec.ts` (upload, galerie, promotion automatique de couverture, suppression du fichier physique). `e2e/testHelpers.ts` ajouté pour créer des comptes de test directement en base (bcrypt) sans passer par `/api/register`, afin de ne pas consommer son rate limit avec la suite qui grandit. Playwright configuré en `workers: 1` : SQLite ne sérialise qu'un seul writer à la fois, plusieurs tests écrivant en parallèle faisaient sinon la queue jusqu'à dépasser le timeout côté serveur.
- **CI : nouveau job `e2e`**, après le job `test` existant, contre une instance `next start` **éphémère** démarrée dans le workflow (base SQLite et compte seed jetables, jamais la prod réelle) -- fermait le trou que laissait un simple `npm run build` : la CI pouvait être verte alors qu'un changement cassait le parcours navigateur réel. `NEXTAUTH_URL` en HTTP simple (pas de piège `__Secure-` en CI, contrairement à un run manuel contre la prod HTTPS). `photos.spec.ts` rendu portable via `E2E_UPLOADS_DIR` (dossier réellement utilisé par le serveur testé -- `/data/uploads` par défaut pour un run manuel avec Docker, `public/uploads` du checkout pour la CI sans Docker).

### Documentation

- README : suppression de la mention obsolète "pas de page d'inscription publique" (existe depuis `/inscription`), et de "capteurs IoT hors périmètre" en tête de fichier alors qu'ils sont déjà implémentés et documentés plus bas.

### Corrigé (post-plan, trouvé en vérifiant la CI)

- **La CI (`job e2e`) et un run local complet échouaient systématiquement sur le tout dernier test de la suite** (`tasks-and-settings.spec.ts` — "le réglage 'tâches en retard' persiste après rechargement"), en environnement isolé (CI, compte jetable frais) comme contre la vraie prod : pas une régression applicative (le code métier est correct, vérifié en reproduisant exactement le job CI en local), mais un dépassement réel du rate limiter de connexion (`login:${ip}`, 10/5min). Chaque fichier E2E se connectait indépendamment (`loginAs()` par `test()`), et l'inscription compte double (auto-connexion après `/api/register`, puis la reconnexion explicite du test) -- le total réel était monté à 11 connexions au fil de l'ajout de tests cette session, dépassant la limite pile sur la toute dernière. `backup.spec.ts` et `tasks-and-settings.spec.ts` partagent désormais une seule connexion entre leurs tests (`test.describe.serial` + `page` partagé créé dans un `beforeAll`), ramenant le total à 8. Documenté dans `e2e/README.md` pour ne pas repasser la limite au prochain fichier de test ajouté.

## [Post-MVP] - 2026-09-10 — CI GitHub Actions

### Ajouté

- **Workflow CI** (`.github/workflows/ci.yml`), déclenché sur chaque push vers `main` et chaque pull request : installation, génération du client Prisma, application des migrations sur une base SQLite jetable (valide qu'aucune migration n'est cassée -- deux ont été écrites à la main aujourd'hui, hors du flux `prisma migrate dev`), suite `vitest` (68 tests), puis `next build` complet (type-check TypeScript + compilation). Ne lance jamais les tests E2E Playwright (`e2e/`) : ils ciblent l'application réellement déployée en HTTPS avec les identifiants du compte seed, pas une instance jetable -- aucun secret de production n'est fourni à ce workflow. Les 4 étapes ont été rejouées manuellement dans un environnement isolé (copie du dépôt via `git archive`, jamais le `node_modules` de travail) avant d'être poussées, pour la même raison que la mésaventure Playwright de tout à l'heure : générer le client Prisma dans un environnement différent de celui utilisé localement écrase le moteur natif par une version incompatible.

## [Post-MVP] - 2026-09-10 — Tests E2E Playwright

### Ajouté

- **Tests E2E (Playwright)** couvrant deux parcours réels dans un vrai navigateur, contre l'application déployée en HTTPS (jamais contre une instance simulée) : inscription → déconnexion → reconnexion → mot de passe incorrect refusé ; création d'une plante (règle d'arrosage générée automatiquement) → tâche visible et complétable sur `/taches` → événement enregistré dans l'historique → suppression de la plante. Voir `e2e/README.md` pour la commande d'exécution complète (conteneur Playwright officiel, réseau Docker partagé, `node_modules` isolé dans un volume dédié).
- `@playwright/test` en devDependency, version **fixée sans `^`** (`1.63.0`) : doit toujours correspondre exactement au tag de l'image Docker utilisée (`vX.Y.Z-noble`), les binaires JS et les navigateurs embarqués évoluant indépendamment. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` ajouté au `Dockerfile` pour que les builds de l'image de production (qui n'exécutent jamais ces tests) ne téléchargent jamais les ~300 Mo de navigateurs.

### Corrigé (découvert en écrivant les tests E2E)

- Aucun bug applicatif direct, mais deux pièges méthodologiques bons à noter : (1) les cookies de session sont préfixés `__Secure-` dès que `NEXTAUTH_URL` est en https -- un vrai navigateur les refuse silencieusement s'ils sont reçus en HTTP simple (contrairement à un `fetch()` Node, qui n'applique pas cette règle et masquait le problème pendant toute la session de durcissement précédente) ; les tests E2E doivent donc cibler l'URL HTTPS publique, jamais l'adresse interne du conteneur. (2) Exécuter `npm ci`/`prisma generate` dans un conteneur Playwright (Ubuntu) en réutilisant le `node_modules` du dépôt (bind-mount) écrase le moteur Prisma par un binaire incompatible avec les images Debian/Alpine utilisées pour `vitest`/la construction de l'image -- corrigé en isolant ce `node_modules` dans un volume Docker dédié à l'exécution E2E.

## [Post-MVP] - 2026-09-10 — Durcissement post-audit

Suite à deux revues de code indépendantes du dépôt GitHub (générées par GPT, vérifiées ligne par ligne contre le code réel avant toute correction -- plusieurs affirmations se sont révélées inexactes ou déjà non pertinentes et n'ont pas été appliquées), 18 corrections traitées une par une : implémentation, tests, déploiement puis vérification en direct contre l'application réelle (souvent avec deux comptes utilisateurs distincts) avant de passer au point suivant.

### Sécurité

- **IDOR sur les emplacements** : `POST`/`PATCH /api/plants` n'importe quel `locationId` fourni par le client sans vérifier qu'il appartenait bien à l'utilisateur -- un attaquant pouvait rattacher sa plante à l'emplacement d'un autre compte (et donc en apprendre le nom).
- **IDOR sur les règles d'entretien** : arroser/fertiliser une plante en fournissant le `careRuleId` d'une règle appartenant à une **autre** plante (y compris d'un autre utilisateur) en complétait/régénérait la tâche depuis sa propre plante.
- **IDOR sur les photos de galerie** : `DELETE /api/plants/:id/photos/:photoId` vérifiait l'existence de la photo indépendamment du `plantId` de l'URL -- un utilisateur connaissant l'id d'une photo pouvait supprimer celle d'une plante qui n'était pas la sienne.
- **`/api/library/[id]/resync` réservé à l'administrateur** : cette route modifiait une fiche de bibliothèque **globale**, partagée par tous les comptes -- n'importe quel utilisateur connecté pouvait donc altérer ce que voient tous les autres. Nouveau champ `User.isAdmin` (le compte `SEED_USER_EMAIL` l'est automatiquement à chaque déploiement).
- **Rate limiting** ajouté (limiteur en mémoire, un seul conteneur donc pas de Redis nécessaire) : connexion (10/5min/IP), inscription (5/15min/IP), envoi de photo (30/5min/utilisateur), lectures de capteur (60/min/IP, protège aussi contre le brute-force de `X-Sensor-Key`), recherche/import de bibliothèque externe (20/5min/utilisateur, protège le quota gratuit Perenual). Un échec de connexion pour cause de limite atteinte renvoie la même réponse générique qu'un mot de passe incorrect, pour ne jamais révéler qu'une limite existe.

### Fiabilité / cohérence des données

- **`addMonths()`** ne bornait pas la date résultante à la longueur réelle du mois cible (`Date.setMonth()` ne le fait pas nativement) : "31 janvier + 1 mois" débordait sur le 3 mars au lieu de se limiter au 28/29 février.
- **Import JSON (`/api/import`) rendu transactionnel** : un échec en cours de restauration (ex. 17e plante sur 25 invalide) laissait une restauration partielle et silencieuse en base. Tout l'import tourne désormais dans une seule transaction Prisma (timeout relevé à 30s pour les grosses sauvegardes) -- vérifié en direct avec un échec forcé à mi-import : zéro plante restait persistée.
- **États de tâche invalides** : compléter deux fois la même tâche (double-clic, requête rejouée) créait un second `CareEvent` en conflit avec la contrainte unique `taskId`, remontant un 500 générique. `complete`/`snooze` refusent désormais explicitement une tâche déjà traitée (409 clair), et `snooze` refuse une date de report passée (400). Complétion transformée en transaction atomique (événement + statut ensemble).
- **Désactiver une règle d'entretien** n'empêchait que la génération de *futures* tâches -- une tâche déjà en attente ou reportée continuait d'apparaître indéfiniment. Elle est désormais annulée (`SKIPPED`) dès que la règle passe à désactivé.
- **Validation stricte des combinaisons `recurrenceType`/`interval`/`exactDate`** : créer une règle `FIXED_INTERVAL_DAYS` sans `interval`, ou `EXACT_DATE` sans date, passait la validation Zod puis faisait planter la génération de tâche (500 générique) *après* que la règle ait déjà été enregistrée en base, orpheline et jamais réparée. Rejeté désormais en 400 avant toute écriture ; `POST /api/care-rules` rendu transactionnel par la même occasion (règle + première tâche ensemble).
- **Tâches reportées (`SNOOZED`) ignorées** à plusieurs endroits : `GET /api/plants` (prochaine tâche, filtre "Aucune tâche", indicateur de retard), la fiche détail d'une plante (`/plantes/[id]`, ligne de règle affichée comme "Manuel" alors qu'une tâche existait bien, juste repoussée), et le tri de `/taches` (une tâche reportée à demain restait classée "En retard" sur son ancienne échéance au lieu d'utiliser sa date de report effective). Les trois utilisent désormais `effectiveDueDate()`, comme le reste de l'application depuis la session précédente.
- **Fichiers uploadés jamais supprimés physiquement** : effacer une photo de galerie ou une plante entière ne libérait jamais l'espace disque correspondant (`data/uploads`, monté en volume persistant). Supprimés désormais au moment de la suppression de la ressource qui les référence.
- **Erreurs silencieuses côté frontend** : une dizaine d'appels `fetch` (arroser/fertiliser/rempoter, compléter/reporter une tâche, gérer les règles d'entretien et les engrais, préférences de notification, navigation de la bibliothèque) ne vérifiaient jamais `response.ok` -- une action refusée par le serveur (ex. les 409 ci-dessus) semblait avoir réussi côté interface. Chacun affiche désormais l'erreur reçue et annule le changement optimiste le cas échéant.
- **Export/import de la galerie photo** : `/api/export` n'incluait jamais `PlantPhoto` (uniquement la photo de couverture) -- une sauvegarde/restauration perdait silencieusement toutes les photos additionnelles. Incluses désormais dans les deux sens.
- **Champs de licence image incohérents** : le script de rattrapage `prisma/backfillImages.ts` stockait l'attribution complète (ex. *"(c) Jane Doe, some rights reserved (CC BY-NC)"*) dans le champ `imageLicense`, qui devrait contenir le nom de la licence elle-même (ex. *"CC BY-NC 4.0"*). Nouveau champ `imageAuthor` pour séparer les deux ; **les 662 entrées de bibliothèque déjà affectées ont été corrigées rétroactivement** (49 OpenPlantbook nettoyées, 613 iNaturalist/GBIF reclassées avec une vraie licence dérivée de leur URL).
- Script `npm run lint` cassé (eslint jamais installé dans les dépendances) retiré de `package.json`.

### Infrastructure

- 2 nouvelles migrations Prisma (`imageAuthor`, `User.isAdmin`) appliquées automatiquement au déploiement (`prisma migrate deploy`, déjà en place dans `docker-entrypoint.sh`).
- 20 tests unitaires ajoutés (`addMonths()`, combinaisons `recurrenceType`/`interval`/`exactDate`, limiteur de débit) -- suite complète passée de 48 à 68 tests, tous verts avant chaque déploiement.

## [Post-MVP] - 2026-09-10

Renommage du projet en **Jungly** (ex-Plant Manager) en tout début de session -- toutes les entrées ci-dessous et dans les sections suivantes utilisent le nouveau nom. Premier backup Git du projet sur `github.com/fccarlier-be/jungly` (dépôt privé, deploy key dédiée).

### Ajouté

- **Multi-utilisateur en libre-service** : page `/inscription` (email, prénom optionnel, mot de passe -- 8 caractères minimum), connexion automatique après création. Le modèle de données isolait déjà chaque utilisateur (`userId` sur `Plant` et consorts) ; il manquait uniquement un moyen de créer un compte hors du seed initial.
- **Galerie multi-photos par plante** : nouveau modèle `PlantPhoto`, upload multiple depuis la fiche plante, choix de la photo de couverture (`Plant.photoUrl`, inchangé -- déjà utilisé partout dans l'app), suppression avec promotion automatique d'une autre photo si celle supprimée était la couverture. Backfill automatique de l'ancienne photo unique dans la galerie au premier affichage d'une fiche.
- **Visionneuse plein écran** (`PlantPhotoLightbox` + `PhotoViewerProvider`) : cliquer sur la couverture ou une vignette de galerie ouvre un carrousel (flèches, swipe tactile, clavier ← →/Échap, compteur x/y) partagé entre les deux points d'entrée via un contexte React.
- **Compression automatique des photos** à l'envoi (`sharp`) : redimensionnement à 1600px de large maximum, qualité JPEG 82%, réorientation EXIF puis suppression -- une photo de téléphone de 3-4 Mo devient ~300-400 Ko sans perte visible. Les 5 photos déjà envoyées avant ce correctif ont été retraitées manuellement avec la même pipeline (~90% de réduction chacune).
- **`/uploads` servi directement par nginx**, plus par le process Next.js : en mode `standalone`, le serveur Next ne détecte jamais les fichiers ajoutés à `public/` après son démarrage (il ne liste `public/` qu'au lancement) -- une photo tout juste envoyée restait donc invisible (404) jusqu'au prochain redéploiement. nginx lit le dossier à chaque requête, plus de ce problème.
- **Ajustement météo automatique de la fréquence d'arrosage** : chaque utilisateur peut renseigner sa ville (`WeatherProfile`, géocodage [Open-Meteo](https://open-meteo.com/), gratuit et sans clé API). Une vérification quotidienne calcule la température max moyenne des 3 derniers jours + 2 jours de prévision et en déduit un multiplicateur d'intervalle d'arrosage (canicule ×0,7, chaleur ×0,85, normal ×1, frais ×1,3) : les futures tâches générées en tiennent compte, et les tâches déjà en attente sont avancées (jamais reculées) si la météo du jour le justifie. Badge discret sur l'accueil ("Ville · Normal/Chaleur/Canicule/Frais").
- **Swipe sur les cartes de tâches de l'accueil** (`SwipeableCard`) : glisser à gauche valide la tâche, à droite la reporte d'un jour **à partir de sa propre échéance** (pas "demain depuis aujourd'hui" -- une tâche déjà prévue dans 3 jours passe à 4 jours, pas à demain). S'applique aux tâches du jour et à "Prochaines échéances", qui reste maintenant affichée en permanence (avant : seulement quand rien n'était dû aujourd'hui).
- **Accueil non scrollable sur mobile** (`NoScrollDashboard`) : la page ne bouge/rebondit plus jamais dans son ensemble ; si le contenu variable (tâches + prochaines échéances) dépasse l'espace disponible, il défile dans sa propre zone contenue, dont la hauteur est mesurée en direct par rapport à la position réelle de la barre "Ma collection" (ou de la nav du bas à défaut), pas une valeur fixe devinée.
- **Notifications à l'heure pile** : le sélecteur d'heure du digest est restreint aux quarts d'heure (00/15/30/45), et le scheduler se recale sur ces instants exacts au lieu de vérifier toutes les 15 minutes depuis le démarrage du conteneur (écart pouvant aller jusqu'à 14 minutes avant). Changer l'heure réinitialise le verrou "déjà envoyé aujourd'hui" pour permettre un nouvel envoi le jour même.
- **Seed conditionnel** (`SeedFingerprint`) : la bibliothèque locale et Plantfolio calculent une empreinte de leurs données sources et sautent tout le reparcours (des centaines de requêtes SQLite) si rien n'a changé depuis le dernier déploiement -- fait passer un redémarrage de plusieurs minutes à quelques secondes quand seul du code applicatif change.
- **Cache de build Docker** (BuildKit, `.next/cache`) : les redéploiements pour un simple changement de code sont ~2x plus rapides qu'avant (le cache Next.js persiste désormais entre les `docker compose build` successifs).
- Thème **clair par défaut** (au lieu de suivre le système) ; "Système" reste un choix explicite distinct et fonctionnel dans Paramètres.
- Seuil de bascule mobile/desktop remonté de 768px à 1024px : une tablette garde la navigation tactile (barre du bas) au lieu de basculer vers la barre latérale pensée pour souris/clavier.
- Nouvelle icône de l'app (fournie par l'utilisateur), déclinée en 192px/512px.
- Derniers emojis de l'interface remplacés par des icônes lucide-react (page de connexion, d'inscription, accueil, barre latérale desktop), pour une cohérence visuelle complète.
- **Empaquetage Android natif (TWA via Bubblewrap)** pour sideload sur une tablette Android 7.0 : projet généré et APK compilé (`minSdkVersion 21`, compatible), vérification de domaine publiée (`/.well-known/assetlinks.json`) pour un lancement plein écran sans barre d'adresse. Seuil de bascule mobile/desktop (ci-dessus) corrigé au passage suite à un premier essai d'affichage sur la tablette. Installation validée sur l'appareil cible après un aller-retour sur un plantage ponctuel de Google Play Store (Play Protect scannant l'APK au premier essai) -- résolu par un nouveau téléchargement et une nouvelle tentative, sans changement côté app. Keystore de signature conservé précieusement pour les futures mises à jour.

### Corrigé

- Le conteneur `plantes-app` n'avait pas de fuseau horaire défini (UTC par défaut) alors que le scheduler comparait l'heure de notification à l'horloge du conteneur : le digest partait systématiquement 2h en retard (heure d'été) par rapport à l'heure choisie. `TZ=Europe/Brussels` ajouté.
- Le rappel anticipé ("Prochaines échéances", digest) ignorait les tâches reportées (`SNOOZED`), ne comptant que les tâches `PENDING` -- une tâche reportée à demain pouvait rester invisible derrière une échéance `PENDING` bien plus lointaine. Nouveau helper partagé `effectiveDueDate()` (date de report si reportée, échéance sinon), réutilisé sur l'accueil, `/plantes` et le service de notifications.
- Même bug sur `/plantes` : la "prochaine action" affichée sur chaque carte ne regardait que les tâches `PENDING`, une tâche d'arrosage reportée à demain pouvait être masquée par une fertilisation `PENDING` prévue dans 6 mois.
- Champs heure/nombre de jours (Paramètres → Notifications) qui se sauvegardaient à chaque frappe/cran de molette au lieu du blur, et se désactivaient pendant la sauvegarde -- coupait le focus et fermait le clavier/la roulette en plein milieu de la saisie sur mobile.
- Bug Safari/WebKit connu : le `padding-inline-start` d'un conteneur flex qui défile horizontalement est ignoré -- corrigé par un vrai élément espaceur plutôt qu'un padding pour l'espace avant le premier élément de "Ma collection".
- Avec `scroll-snap-type: mandatory`, Safari corrigeait de force la position de repos sur le premier point d'ancrage au chargement, annulant visuellement l'espaceur ci-dessus -- l'espaceur porte désormais lui-même `snap-start`.
- Émoticône `?` affichée à la place d'une photo tout juste envoyée dans la galerie (voir "`/uploads` servi par nginx" ci-dessus).

### Infrastructure

- Nettoyage ponctuel : `tsconfig.tsbuildinfo` (artefact de build) exclu du suivi Git.
- Incident sans lien avec ce projet au cours de la session (processus de nettoyage système qui a saturé la mémoire du serveur, redémarrant `dockerd` et l'ensemble des conteneurs du homelab) -- constaté, pas causé par un déploiement de Jungly, résolu de lui-même.

## [Post-MVP] - 2026-09-09

### Ajouté

- Bibliothèque de plantes étendue de 12 à 120 profils : plantes vertes/tropicales courantes, succulentes et cactus, fougères, palmiers, plantes à fleurs, et 17 herbes aromatiques (basilic, persil, ciboulette, thym, romarin, sauge, coriandre, aneth, estragon, laurier, marjolaine, cerfeuil, livèche, sarriette, verveine citronnelle, en plus de la menthe et de l'origan déjà présents).
- Photo de référence par plante de la bibliothèque (`careProfile.imageUrl`) : récupérée automatiquement depuis Wikipédia/Wikimedia Commons (119/120 trouvées), affichée en vignette dans `/bibliotheque` et pré-remplit la photo de la plante à la création si l'utilisateur n'en a pas encore mis une (jamais écrasée si déjà renseignée).
- **Refonte complète de l'UI/UX** : design system (palette vert forêt/sauge/terracotta, typographie Lora + Inter, tokens de radius/ombre/transition), Plant Cards visuelles (grande photo, badge de statut contextuel au lieu d'un badge "En bonne santé" répété partout), navigation réduite à 4 onglets, icônes lucide-react colorées par type de soin (bleu arrosage, vert fertilisation, brun rempotage, orange taille, gris inspection), accueil personnalisé (message contextuel, bande "Ma collection", astuce du jour tournante), fiche plante réorganisée (section "Entretien" renommée depuis "Aujourd'hui" -- elle liste toutes les règles, pas seulement celles du jour), micro-interactions (validation de tâche, apparition des cartes), correctifs mobile (zoom Safari au focus, largeur des champs date/heure).
- **Bibliothèque dynamique (import Perenual)** : recherche et import d'espèces absentes des 120 profils locaux, via [Perenual](https://perenual.com/docs/api). `PlantLibraryEntry` gagne des colonnes de provenance (`source`, `sourceId`, `importedAt`, `lastSyncedAt`, `imageSourceUrl`, `imageLicense`, `imageLicenseUrl`) ; import idempotent (`@@unique([source, sourceId])`), toujours déclenché explicitement par l'utilisateur (jamais automatique), jamais de dépendance réseau pour une fiche déjà importée. `ExternalSpeciesSearch.tsx` intégré au formulaire d'ajout et à `/bibliotheque` comme repli quand la recherche locale ne trouve rien. GBIF/POWO (vérification taxonomique) laissés de côté pour l'instant -- le champ `source` est prêt à les accueillir le jour où ce sera utile.
- **Enrichissement Plantfolio + OpenPlantbook** : import statique unique de 952 profils du dataset [plantfolio-common-plants](https://github.com/Luminoid/plantfolio-common-plants) (CC BY-NC-SA 4.0, sources POWO/ASPCA/USDA) -- 806 réellement ajoutés, 146 doublons avec une fiche locale automatiquement écartés (la fiche locale, mieux soignée, garde la priorité). Bibliothèque locale totale : ~1000 profils. Recherche externe transformée en chaîne de fournisseurs (`src/server/externalSpecies/providers.ts`) : [OpenPlantbook](https://open.plantbook.io) (orienté seuils de soin) essayé en premier, Perenual en repli (quota gratuit plus restreint) ; si la fiche retenue n'a pas de fréquence d'arrosage (typique d'OpenPlantbook, pensé pour un capteur d'humidité plutôt qu'un calendrier), un complément silencieux via Perenual comble ce champ précis. `/bibliotheque` passée en recherche live (comme le formulaire d'ajout) au lieu de charger ~1000 profils d'un coup à l'affichage. Non vérifié en conditions réelles faute de compte OpenPlantbook au moment de l'écriture -- endpoints/authentification confirmés via le code source de la librairie officielle, mapping des champs de réponse à corriger si besoin dès les premiers vrais résultats (comme Perenual en son temps).

### Corrigé

- Passage en revue complet de tous les textes visibles dans l'application (labels, boutons, messages d'erreur, notifications) pour corriger l'absence d'accents français -- affectait la lisibilité de l'interface entière.
- Suppression des mentions aux numéros de section du cahier des charges dans les textes affichés à l'utilisateur (pages Bibliothèque et Engrais) -- ces références restent dans les commentaires de code, utiles au suivi du développement, mais n'ont pas leur place dans l'interface.
- Suppression de la route `/api/sensors` (création de capteur par le corps de la requête), redondante avec `/api/plants/:id/sensors` -- un reliquat de la double session du 2026-09-07, les deux routes faisant la même chose de façon incohérente avec le reste de l'API.
- **Bug du seed de bibliothèque** : les entrées déjà présentes en base (les 12 premières, dont les 7 vraies plantes de l'utilisateur) n'étaient jamais mises à jour lors des redéploiements suivants -- seules les 108 nouvelles entrées de cette session avaient reçu leur photo. `seedLibrary()` fait désormais un vrai upsert (create ou update) à chaque déploiement.
- **Qualité des photos** : 14 entrées avaient récupéré une gravure botanique ancienne (planches "Köhler's Medizinal-Pflanzen", 1887) ou une illustration au lieu d'une vraie photo -- essentiellement des herbes aromatiques (persil, thym, romarin, coriandre, aneth, laurier, cerfeuil, livèche) plus quelques autres (caoutchouc, lierre, rhipsalis, citronnier, olivier). Remplacées par une recherche ciblée dans Wikimedia Commons filtrant les noms de fichiers évoquant une illustration/gravure/carte plutôt qu'une photo. Le bananier d'intérieur (Musa), qui n'avait aucune photo (page Wikipédia ambiguë), en a maintenant une aussi.

## [Post-MVP] - 2026-09-08

### Ajouté

Relecture complète du cahier des charges (45 sections) pour identifier les manques restants après les phases 1-8 ; trois comblés :

- **Gestion des engrais** : page `/engrais` (créer/modifier/supprimer, NPK, dosage recommandé), jusque-là seulement accessible via l'API brute. Nouvelles routes `PATCH`/`DELETE /api/fertilizers/:id`.
- **Page Bibliothèque dédiée** : `/bibliotheque`, navigable depuis la barre de navigation (6e onglet) et Paramètres -- jusque-là la bibliothèque n'était consultable qu'en tapant dans le formulaire d'ajout de plante.
- **Apparence clair/sombre/système** : bouton dans Paramètres (`ThemeToggle`), persiste en `localStorage`, script d'initialisation `beforeInteractive` pour éviter un flash à l'affichage.

### Corrigé

- Suppression d'un fichier de test capteurs dupliqué (`__tests__/sensorTrigger.test.ts`, quasi identique à `careEngine.sensorTrigger.test.ts` -- reliquat de la double session du 09-07).

## [Post-MVP] - 2026-09-07

### Incident

- Un déploiement (build+up de `plantes-app`) a démarré sur une base de données de production vide, effaçant les 7 vraies plantes de l'utilisateur (recréées ensuite via l'API à partir de la bibliothèque). Cause exacte non confirmée (deux sessions Claude travaillaient en parallèle sans coordination sur ce projet ; l'une des deux a été arrêtée par l'utilisateur). Aucune sauvegarde n'existait à ce moment -- voir ci-dessous.

### Ajouté

- Intégration au `backup-manager` du homelab (`www/backup-manager/backend/app/adapters/plantes.py`, même motif que Mystery : bind-mount direct sur `www/plantes/data/`, pas d'API interne à exposer). Sauvegarde/restauration/téléchargement depuis `https://backups.fcold.org`, avec checksum SHA256 et sauvegarde de sécurité automatique avant toute restauration.
- Sauvegarde quotidienne automatique indépendante (cron franky, `/home/franky/.local/bin/backup-plantes`, 4h15, rétention 14 jours, alerte email en cas d'échec) -- même pattern que Mystery.
- 9 tests pytest (`www/backup-manager/backend/tests/test_plantes.py`) : création/liste/suppression, restauration (état exact, fichier inconnu, archive corrompue, checksum invalide), téléchargement.

## [Phase 8] - 2026-09-07

### Ajouté

- Architecture capteurs IoT (section 22) : `POST /api/plants/:id/sensors` (création, session utilisateur), `GET /api/plants/:id/sensors` (liste + dernière lecture). `Sensor.apiKey` (clé unique par capteur, générée automatiquement) pour l'authentification d'un appareil sans session -- un micro-contrôleur ne peut pas porter de cookie NextAuth.
- `POST /api/sensors/:id/readings` : ingestion d'une lecture par l'appareil lui-même (header `X-Sensor-Key`), réponse 404 uniforme que la clé soit fausse ou le capteur inexistant (n'expose jamais l'existence d'un id sans la bonne clé).
- `src/server/careEngine/sensorTrigger.ts` + `evaluateSensorReadingForTasks` (service.ts) : démontre l'évolution demandée section 22, "arroser tous les 7 jours" -> "arroser quand l'humidité passe sous un seuil", sans réécrire le CareEngine existant. Une règle `MOISTURE_THRESHOLD` génère une tâche PENDING immédiate dès qu'une lecture de capteur sol passe sous le seuil configuré (idempotent, pas de doublon si une tâche est déjà en attente).
- 6 tests Vitest sur `shouldTriggerFromMoistureReading`.

### Décisions notables

- Clé d'ingestion par capteur (`apiKey`) plutôt qu'un secret global partagé : révocable individuellement, pas de nouvelle variable d'environnement à gérer au déploiement.
- Pas d'UI de gestion des capteurs (section 22 : "ne pas implémenter complètement cette fonctionnalité dans le MVP") -- l'architecture est prête (modèle, moteur, API), l'interface viendra avec du matériel réel.

## [Phase 7] - 2026-09-07

### Ajouté

- Export complet des données (section 30) : `GET /api/export`, format JSON, références (emplacement/engrais) résolues par nom pour rester portable entre installations.
- Import (section 30) : `POST /api/import`, crée toujours de nouveaux enregistrements (jamais de fusion silencieuse avec une plante existante), rapproche emplacements/engrais par nom, régénère les tâches PENDING via le CareEngine plutôt que d'importer un état de tâche potentiellement périmé.
- UI dans Paramètres : téléchargement direct + import par fichier, avec message de résultat.

### Corrigé (durcissement sécurité, section 39)

- `GET /api/plants/:id/history` et la page Historique acceptaient un paramètre `type` non valide, transmis tel quel à Prisma (cast `as never`) : un type invalide pouvait provoquer une erreur serveur plutôt qu'un filtre ignoré proprement. Validé désormais contre l'enum `CareEventType` réel.
- Audit de toutes les routes API : chaque route vérifie `requireUserId()` et, pour les ressources individuelles, la propriété via `src/server/ownership.ts` avant lecture/écriture -- aucune lacune trouvée au-delà du point ci-dessus.

## [Phase 6] - 2026-09-07

### Ajouté

- Bibliothèque de plantes (section 20) : 12 profils de soin (les 7 plantes réelles de l'utilisateur + 5 des espèces de démo), stockés dans `PlantLibraryEntry.careProfile` (exposition, température, humidité, substrat, toxicité, conseils, et suggestions d'arrosage/fertilisation/rempotage). Seed idempotent par `scientificName`, toujours exécuté indépendamment des données personnelles de l'utilisateur.
- `GET /api/library?q=` : recherche (nom courant ou botanique) pour le flux "Rechercher dans la bibliothèque" du formulaire d'ajout de plante.
- Formulaire d'ajout : recherche intégrée qui pré-remplit nom/nom botanique/substrat/exposition et les trois règles d'entretien -- uniquement les champs encore vides, l'utilisateur garde toujours la main (section 20 : "les valeurs génériques restent des recommandations").

### Corrigé

- `exposure` limité à 80 caractères dans la validation Zod, trop court pour certaines descriptions de la bibliothèque (ex. Pilea) -- porté à 200 comme `substrate`.

## [Phase 5] - 2026-09-07

### Ajouté

- Notifications push (section 18) : `PushSubscription` (un abonnement par appareil/navigateur), `NotificationPreference.lastDigestSentAt`. Couche `NotificationService` (`src/server/notifications/notificationService.ts`) qui construit un **digest quotidien agrégé** (tâches dues aujourd'hui + en retard + aperçu des échéances à venir sous `advanceReminderDays` jours) plutôt qu'une notification par tâche, pour éviter le spam. Envoi effectif via `web-push` (VAPID) avec purge automatique des abonnements périmés (404/410).
- Scheduler en mémoire (`src/server/notifications/scheduler.ts`), démarré au boot du serveur via `src/instrumentation.ts` (hook officiel Next.js) : vérifie toutes les 15 minutes si un utilisateur a atteint son heure de notification, sans dépendre d'un cron côté hôte.
- Page Paramètres : réglages des notifications (activer/désactiver, heure d'envoi, alerte de retard, délai de rappel anticipé), abonnement/désabonnement sur l'appareil courant, bouton d'envoi d'une notification de test.
- PWA installable (section 3) : icônes réelles (`public/icons/`, générées depuis un SVG maison), `manifest.json` complet, service worker minimal (`public/sw.js` : affichage + clic sur la notification, pas de cache offline) enregistré au chargement de l'app.
- 6 nouveaux tests Vitest sur la construction du message de digest (aucune tâche, une, plusieurs, avec retard, avec rappel anticipé, combinaison aujourd'hui+à venir).

### Corrigé

- Une tâche reportée (`SNOOZED`) dont la date de report est déjà passée ne redevenait jamais visible (ni dashboard, ni page Tâches, ni désormais notifications) : nouveau helper partagé `src/server/careEngine/dueTasks.ts` (`isTaskDueNow`), réutilisé aux trois endroits.
- `/sw.js` n'était pas exclu du middleware d'authentification : l'enregistrement du service worker échouait tant qu'on n'était pas connecté (notamment sur `/login`, où `ServiceWorkerRegistration` s'exécute pourtant). Ajouté à la liste d'exclusion, au même titre que `manifest.json`.
- iOS/iPadOS : `PushManager` n'existe que pour une PWA déjà ajoutée à l'écran d'accueil et ouverte depuis cette icône (jamais depuis un onglet Safari, même à jour) -- le message "non supporté" était donc trompeur et bloquant. `NotificationSettings` détecte maintenant ce cas précis et affiche la marche à suivre (Partager -> Sur l'écran d'accueil -> rouvrir depuis l'icône). Ajout de `appleWebApp` aux métadonnées pour un rendu standalone correct sur iOS.

### Décisions notables

- Web Push réel plutôt qu'une simple bannière in-app : c'est ce que demandent les sections 18/45, et le conteneur étant un process Node persistant (pas serverless), un scheduler in-process est suffisant.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` doit passer en `build.args` Docker, pas seulement en variable d'environnement runtime -- piège classique Next.js/Docker documenté dans le README.

## [Phases 1-4] - 2026-09-07

### Ajouté

- Initialisation du projet (Next.js 15 App Router, TypeScript, Tailwind CSS, Prisma + SQLite, Vitest).
- Modèle de données complet (section 21 du cahier des charges) : `User`, `Location`, `Plant`, `PlantCareRule`, `Task`, `CareEvent`, `Fertilizer`, `Note`, et les tables préparant les phases futures (`PlantLibraryEntry`, `NotificationPreference`, `Sensor`, `SensorReading`).
- CareEngine (`src/server/careEngine/`) : calcul de récurrence (intervalle jours/semaines/mois, annuel, date exacte), règles saisonnières (mois actif/inactif), calcul de dosage d'engrais, génération/transition des tâches (complétée, reportée, en retard). 30 tests Vitest.
- Authentification NextAuth (Auth.js v5, Credentials + sessions JWT), utilisateur unique créé par le seed (pas d'inscription publique).
- API REST complète (section 31) : CRUD plantes, règles d'entretien, arrosage/fertilisation/rempotage/événements génériques, complétion/report de tâches, engrais, notes, emplacements, dashboard, upload de photo.
- Interface : dashboard "Aujourd'hui", liste des plantes (filtres/tri), ajout/modification de plante avec règles d'entretien, fiche plante (état, informations, actions rapides, historique récent, notes), page Tâches (en retard/aujourd'hui/à venir), page Historique (filtrable par type), page Paramètres. Navigation mobile (barre du bas) et desktop (barre latérale).
- Seed de démonstration : 6 plantes (Monstera deliciosa, Calathea orbifolia, Ficus elastica, Sansevieria trifasciata, Echeveria, Pothos) avec règles, historique et tâches dans des états variés.
- Intégration homelab : Dockerfile multi-stage (standalone), `docker-entrypoint.sh` (migrations + seed automatiques), nginx dédié (`nginx-plantes`), ajout au `docker-compose.yml` racine, labels homepage.

### Corrigé

- Middleware NextAuth v5 : l'export brut `auth` comme middleware ne redirige pas automatiquement les utilisateurs non connectés -- ajout d'une redirection explicite vers `/login`, et défense en profondeur côté Server Components (`requireSessionUserId`) pour ne jamais planter si le middleware était un jour contourné.
- `trustHost: true` sur la config NextAuth : nécessaire derrière le reverse proxy nginx-plantes/Cloudflare Tunnel (sinon erreur `UntrustedHost`).
- Runtime Node.js explicite pour le middleware (`export const config = { runtime: "nodejs" }`) : évite d'embarquer bcrypt/Prisma dans un bundle Edge incompatible.
- Image Docker runtime : le CLI Prisma (utilisé par l'entrypoint pour les migrations/seed) a des dépendances transitives non tracées par la sortie "standalone" de Next.js -- `prisma`/`tsx` déplacés en `dependencies` (ils tournent en production) et copie du `node_modules` complet (pruné des devDependencies) plutôt qu'un sous-ensemble cousu main.
- Ajout d'un `.dockerignore` : la sortie standalone de Next.js copie automatiquement les fichiers `.env*` présents au moment du build, ce qui avait fait fuiter le `.env` de dev dans l'image ; désormais exclu du contexte de build.

### Décisions notables

- SQLite plutôt que PostgreSQL (cohérence avec le reste du homelab, aucun nouveau conteneur DB à maintenir).
- Pas de page d'inscription publique : l'app n'est pas derrière Cloudflare Access (contrairement au reste du homelab), donc le login applicatif est le seul rempart contre l'accès public.
- Périmètre limité aux phases 1-4 du cahier des charges : notifications/PWA, bibliothèque de plantes, export/import et capteurs IoT restent à implémenter (tables Prisma déjà prévues).
