# Jungly

Application de suivi et d'entretien des plantes. Multi-utilisateur (inscription en libre-service), avec isolation stricte entre comptes, installable comme application web (PWA) ou comme app Android.

Jungly est et restera gratuit pour quiconque héberge sa propre instance avec ce dépôt : aucune fonctionnalité limitée, aucune inscription requise ailleurs. Pour celles et ceux qui préfèrent ne pas gérer un serveur, une offre hébergée à achat unique et à bas prix existe en complément (voir [Deux façons d'utiliser Jungly](#deux-façons-dutiliser-jungly)). Elle est volontairement secondaire : le code est le même, l'auto-hébergement reste la voie principale.

## Fonctionnalités

**Suivi des plantes**
- Fiche par plante : photos (galerie, couverture), emplacement, pot (forme, dimensions, matériau), substrat, exposition, notes, historique des soins.
- Règles de soins récurrents (arrosage, fertilisation, rempotage) : intervalle en jours, semaines ou mois, annuel, date exacte, manuel ou seuil d'humidité (capteur). Le journal accepte aussi la taille, l'inspection et les notes libres.
- Tâches du jour et en retard sur l'accueil : valider ou reporter en un geste (bouton ou glissement), soins d'une même plante regroupés sur une carte.
- Ajustement de l'arrosage selon la météo locale, notifications push (Web Push) avec heure et rappels réglables.
- Jardinières partagées : plusieurs plantes dans un même contenant, schéma interactif et avertissements de compatibilité.
- Engrais : catalogue personnel (NPK, dosage) associé aux règles de fertilisation.

**Connaissances**
- Bibliothèque de plus de 780 fiches d'entretien (avec photos en miroir local et crédits), en français, recherche insensible à la casse et aux accents. Recherche et import d'espèces absentes via OpenPlantbook, puis Perenual en repli.
- Identification d'une plante par photo (Pl@ntNet) et diagnostic de santé : questionnaire adaptatif + photos + contexte de la plante, analysé par un moteur de règles local (Pl@ntNet ne sert que de preuve complémentaire, jamais de verdict).

**Données et administration**
- Export / import complet en ZIP (données, photos, fiches de bibliothèque liées), avec validation stricte de l'archive.
- Capteurs IoT : envoi de mesures par API avec clé dédiée.
- Retours des utilisateurs (formulaire intégré), annonces de nouveautés en modale (la dernière annonce, suivie des deux précédentes non vues), page d'administration.
- Unités métriques ou impériales, thème clair, sombre ou système.

**Réservé à l'instance hébergée** (désactivé par défaut, voir [Configuration](#configuration))
- Don et échange de boutures entre comptes : annonces avec photo et quantité, messagerie privée chiffrée au repos, échanges confirmés par les deux parties, notes mutuelles et réputation, signalements, avertissements et suspensions progressives. La vente est interdite et refusée par l'application.
- Création de compte uniquement par achat vérifié (Google Play).

## Deux façons d'utiliser Jungly

| | Auto-hébergé | Offre hébergée |
|---|---|---|
| Coût | Gratuit | Achat unique, à bas prix |
| Fonctionnalités de suivi | Toutes | Toutes |
| Serveur à gérer | Oui (Docker) | Non |
| Boutures entre comptes | Non (mono-foyer par nature) | Oui |

L'app Android (Trusted Web Activity) est actuellement en test fermé sur Google Play. Elle demande, au premier lancement, d'utiliser une instance auto-hébergée ou l'offre hébergée. La vérification de domaine nécessaire pour l'afficher en plein écran (`public/.well-known/assetlinks.json`) est incluse dans ce dépôt et servie automatiquement : rien à configurer de votre côté. La procédure de build de l'APK est décrite dans `docs/android-apk-build.md`.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Prisma 7 + SQLite (`better-sqlite3`)
- NextAuth (Auth.js) v5, provider Credentials, sessions JWT révocables
- Zod pour la validation, Sharp pour le traitement des images
- Vitest (tests unitaires et d'intégration sur une vraie base SQLite) + Playwright (tests E2E)
- web-push (Web Push / VAPID)

## Prérequis

- Docker (aucun Node.js requis en local : tout tourne dans des conteneurs)

## Configuration

Copier `.env.example` en `.env` et renseigner :

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chemin du fichier SQLite, ex. `file:./data/plantes.db` |
| `AUTH_SECRET` | Secret NextAuth, ex. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL publique de l'app (`http://localhost:3000` en dev, `https://...` en prod) : son schéma détermine si les cookies de session sont préfixés `__Secure-` |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Compte administrateur créé au démarrage (voir la note ci-dessous) |
| `PLANTES_VAPID_PUBLIC_KEY` / `PLANTES_VAPID_PRIVATE_KEY` | Clés Web Push, générées une fois avec `npx web-push generate-vapid-keys`. La clé publique est lue au démarrage et transmise au navigateur par la page Paramètres |
| `OPENPLANTBOOK_CLIENT_ID` / `OPENPLANTBOOK_CLIENT_SECRET` | Identifiants OAuth2 sur [open.plantbook.io](https://open.plantbook.io), pour la recherche d'espèces externes |
| `PERENUAL_API_KEY` | Clé gratuite sur [perenual.com/docs/api](https://perenual.com/docs/api), utilisée en repli si OpenPlantbook n'a pas de résultat. Sans aucune des deux clés, la recherche externe est désactivée, le reste fonctionne |
| `PLANTNET_API_KEY` | Clé gratuite sur [my.plantnet.org](https://my.plantnet.org/settings/api-key) (500 identifications par jour, plafond logiciel à 480). Sans elle, l'identification par photo et le diagnostic échouent proprement |
| `RESEND_API_KEY` / `BETA_SIGNUP_FROM_EMAIL` | Envoi d'e-mails (réinitialisation de mot de passe, liste d'attente bêta, avertissements) via [Resend](https://resend.com). Sans clé, les e-mails sont journalisés au lieu d'être envoyés |

**Uniquement pour l'instance hébergée** (laisser vides en auto-hébergement) :

| Variable | Description |
|---|---|
| `REGISTRATION_MODE` | `invite_only` ferme l'inscription publique : les comptes ne se créent que par achat vérifié. Par défaut (`open`), l'inscription est libre |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Clé JSON (sur une ligne) d'un compte de service ayant accès à l'API Play Developer, pour vérifier les achats |
| `ENABLE_CUTTINGS_MARKETPLACE` | `true` active le don/échange de boutures |
| `CUTTINGS_MESSAGE_ENCRYPTION_KEY` | Clé AES-256-GCM (32 octets en base64, `openssl rand -base64 32`), requise dès que les boutures sont activées. Distincte de `AUTH_SECRET`. La perdre rend les messages existants illisibles |
| `JUNGLY_ADMIN_INTERNAL_SECRET` | Secret partagé avec un panel d'administration externe qui interroge l'API interne (`/api/internal/admin/*`) |

**Notes**
- Toute la configuration d'instance est lue au démarrage du conteneur, rien n'est figé au build : aucun `--build-arg` nécessaire. L'argument `GIT_SHA` (facultatif) sert seulement à afficher la révision dans Paramètres > À propos. L'ancienne variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY` reste acceptée en repli si `PLANTES_VAPID_PUBLIC_KEY` est absente.
- Le compte `SEED_USER_EMAIL` est administrateur (rôle réservé aux actions sur des données globales partagées, ex. resynchroniser une fiche de bibliothèque). **Son mot de passe est réinitialisé à la valeur de `SEED_USER_PASSWORD` à chaque démarrage du conteneur** : c'est ce qui permet de changer ce mot de passe en modifiant la variable. N'utilisez donc pas ce compte comme compte personnel dont vous changeriez le mot de passe depuis l'app : créez le vôtre via `/inscription`, puis désignez-le administrateur en le mettant en `SEED_USER_EMAIL`.

## Installation

```bash
docker build -t jungly .

docker run -d --name jungly -p 3000:3000 \
  --env-file .env \
  -v "$(pwd)/data":/app/data \
  -v "$(pwd)/data/uploads":/app/public/uploads \
  -v "$(pwd)/data/library-photos":/app/public/library-photos \
  jungly
```

Les migrations Prisma et le seed (compte administrateur, bibliothèque de plantes) s'exécutent automatiquement au démarrage du conteneur. Un reverse proxy est recommandé devant l'app (voir `nginx/default.conf` à titre d'exemple, à adapter à votre infrastructure).

### Sauvegardes et mises à jour

- Sauvegardez le dossier `data/` (base SQLite, `uploads/`, `library-photos/`). Chaque utilisateur peut aussi exporter ses propres données en ZIP depuis Paramètres, et les réimporter sur n'importe quelle instance.
- Pour mettre à jour : reconstruire l'image et recréer le conteneur. Les migrations s'appliquent seules ; sauvegardez `data/` avant une mise à jour qui en contient.
- Après avoir recréé le conteneur de l'app derrière un reverse proxy nginx, redémarrez aussi le proxy (il met en cache l'adresse du conteneur au démarrage).

### Développement local

Sans Node.js sur la machine, tout passe par Docker :

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c "npm install"
docker run --rm -v "$PWD":/app -w /app -p 3000:3000 --env-file <(sed 's/\"//g' .env) node:22-alpine sh -c "npm run dev"
```

Avec Node.js disponible :

```bash
npm install
npm run dev
```

Migrations et seed en local :

```bash
npx prisma migrate dev --name <nom>
npx prisma db seed
```

## Tests

```bash
./scripts/verify-docker.sh                                   # lint + tests + build, dans un conteneur jetable
./scripts/verify-docker.sh "npm test -- --run"               # une commande précise
```

`verify-docker.sh` monte `node_modules`, `.next` et le client Prisma généré dans des volumes Docker nommés : il n'écrit jamais dans votre dépôt. Ne lancez pas `docker run -v "$PWD":/app` avec `npm ci` directement, il créerait ces dossiers en `root` dans le dépôt.

Les tests d'intégration utilisent une vraie base SQLite. Voir `e2e/README.md` pour les tests bout en bout (Playwright), également exécutés par la CI GitHub Actions à chaque push.

## Organisation du code

```
src/app/          pages et routes API (App Router)
src/components/   composants React ; art/ = illustrations, icons.tsx = jeu d'icônes
src/server/       logique métier (soins, diagnostic, boutures, facturation, e-mails...)
src/lib/          utilitaires partagés (session, unités, rate limiting...)
prisma/           schéma, migrations, seed, scripts de rattrapage de la bibliothèque
e2e/              tests Playwright
android/          projet de l'app Android (TWA)
nginx/            exemples de configuration reverse proxy
```

## Interface

L'identité visuelle est « jungle en papier découpé » : aplats de couleur empilés, séparés par une ombre douce, jamais de dégradés.

- **Illustrations** : `src/components/art/paper.tsx` (splash animé, en-tête d'accueil qui suit l'heure, écrans vides, pastilles de soin, feuillage de fond), en SVG généré, sans image externe.
- **Icônes** : `src/components/icons.tsx`, un jeu maison qui remplace lucide-react (même API). Le menu du bas garde les icônes lucide d'origine.
- **Jetons** (couleurs, ombres, composants `card`, `card-flat`, `btn-primary`...) : `src/app/globals.css`, avec thème clair et sombre. Titres en Fraunces, texte en Inter.

## Sécurité

- Isolation stricte entre comptes : chaque route API vérifie la propriété de la ressource avant toute lecture ou écriture.
- Sessions JWT révoquées à la réinitialisation du mot de passe (`User.sessionVersion`).
- Rate limiting sur la connexion, l'inscription, les uploads, l'import/export, les messages et les capteurs.
- Photos privées, servies uniquement après vérification des droits (seules les photos d'annonces de boutures sont visibles des autres comptes connectés).
- Images retraitées par Sharp (limites de taille et de pixels), archives d'import protégées contre les ZIP bombs, requêtes sortantes protégées contre le SSRF.
- Mots de passe et clés API capteur hashés (bcrypt) ; messages privés entre utilisateurs chiffrés au repos (AES-256-GCM, clé serveur, sans chiffrement de bout en bout).
- Content-Security-Policy avec nonce par requête.

### Frontière de confiance

`AUTH_SECRET` avec `trustHost: true` et `getClientIp()` (rate limiting) font confiance aux en-têtes `Host` / `X-Real-IP` / `X-Forwarded-For` de la requête entrante. **Next.js ne doit donc jamais être exposé directement à Internet** (port 3000) : un reverse proxy qui pose ces en-têtes lui-même (voir `nginx/default.conf`, qui prend `CF-Connecting-IP` en priorité derrière Cloudflare Tunnel) doit toujours se trouver devant. Sans lui, ces en-têtes sont forgeables par n'importe quel client, et le rate limiting comme le calcul d'origine des cookies de session deviennent contournables.

## Limites architecturales assumées

Des choix volontairement non conçus pour du multi-instance, cohérents avec un déploiement mono-instance. Documentés ici pour qu'un futur audit ne les signale pas comme des oublis : ce sont des compromis délibérés, à revisiter seulement si l'usage réel de Jungly change (plusieurs instances, ouverture publique à grande échelle).

- **Rate limiting en mémoire** (`src/lib/rateLimit.ts`) : une `Map` par process, pas de Redis. Fiable avec un seul conteneur ; les compteurs ne seraient pas partagés entre plusieurs instances.
- **Scheduler dans le process Next.js** (`instrumentation.ts`) : pas de queue ni de cron externe. Un garde en mémoire empêche les doublons sur une seule instance, mais deux instances dupliqueraient les vérifications.
- **SQLite** (`better-sqlite3` + Prisma 7) : suffisant pour quelques utilisateurs et une faible concurrence en écriture. PostgreSQL n'aurait de sens qu'en cas d'ouverture publique à grande échelle.
- **Suppression de fichiers non transactionnelle avec la base** (`deleteUploadedFileIfUnreferenced()`) : fenêtre théorique entre la vérification « encore référencé ? » et la suppression physique. Un vrai correctif demanderait une garbage collection différée, disproportionnée face à ce scénario.
- **Réserve de quota Pl@ntNet** : le plafond logiciel (480 par jour) peut être dépassé de quelques requêtes par deux appels simultanés ; la marge sous les 500 du quota réel l'absorbe.
- **Résolution DNS des images externes** : la validation SSRF résout le nom d'hôte avant le téléchargement ; une attaque par rebinding DNS reste théoriquement possible entre les deux résolutions.

## Historique

Voir [CHANGELOG.md](CHANGELOG.md).

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md) : code visible publiquement, usage non-commercial autorisé, toute exploitation commerciale requiert une autorisation explicite.
