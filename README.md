# Jungly

Application de suivi et d'entretien des plantes : arrosage, fertilisation, rempotage, tâches, historique, notifications push, bibliothèque de plantes, export/import, capteurs IoT. Multi-utilisateur (inscription en libre-service), avec isolation stricte entre comptes.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- Prisma + SQLite
- NextAuth (Auth.js) v5, provider Credentials, sessions JWT
- Zod pour la validation
- Vitest (tests unitaires) + Playwright (tests E2E)
- web-push (Web Push / VAPID) pour les notifications

## Prérequis

- Docker (aucun Node.js requis en local : tout tourne dans des conteneurs)

## Configuration

Copier `.env.example` en `.env` et renseigner :

| Variable | Description |
|---|---|
| `DATABASE_URL` | Chemin du fichier SQLite, ex. `file:./data/plantes.db` |
| `AUTH_SECRET` | Secret NextAuth, ex. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL publique de l'app (`http://localhost:3000` en dev, `https://...` en prod) -- son schéma détermine si les cookies de session sont préfixés `__Secure-` |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Identifiants du premier compte créé au démarrage (administrateur) |
| `PLANTES_VAPID_PUBLIC_KEY` / `PLANTES_VAPID_PRIVATE_KEY` | Clés Web Push, générées une fois avec `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Même valeur que `PLANTES_VAPID_PUBLIC_KEY`, exposée côté client |
| `OPENPLANTBOOK_CLIENT_ID` / `OPENPLANTBOOK_CLIENT_SECRET` | Identifiants OAuth2 sur [open.plantbook.io](https://open.plantbook.io), pour la recherche d'espèces externes |
| `PERENUAL_API_KEY` | Clé gratuite sur [perenual.com/docs/api](https://perenual.com/docs/api), utilisée en repli si OpenPlantbook n'a pas de résultat. Sans aucune des deux clés, la recherche externe est simplement désactivée, le reste de l'app fonctionne normalement. |

**Note** : `NEXT_PUBLIC_*` est figé au moment du build, jamais relu au runtime -- en Docker, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` doit donc passer en `--build-arg`, pas seulement en variable d'environnement du conteneur.

L'inscription est en libre-service (`/inscription`). Le compte `SEED_USER_EMAIL` est administrateur (seul rôle existant, réservé aux actions sur des données globales partagées, ex. resynchroniser une fiche de la bibliothèque de plantes) ; changer `SEED_USER_PASSWORD` puis relancer le seed met à jour son mot de passe.

## Installation

```bash
docker build -t jungly --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY=<votre_clé> .

docker run -d --name jungly -p 3000:3000 \
  --env-file .env \
  -v "$(pwd)/data":/app/data \
  -v "$(pwd)/data/uploads":/app/public/uploads \
  jungly
```

Les migrations Prisma et le seed (compte admin + bibliothèque de plantes) s'exécutent automatiquement au démarrage du conteneur. Un reverse proxy est recommandé devant l'app (voir `nginx/default.conf` à titre d'exemple, à adapter à votre infrastructure).

### Développement local

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine sh -c "npm install"
docker run --rm -v "$PWD":/app -w /app -p 3000:3000 --env-file <(sed 's/\"//g' .env) node:22-alpine sh -c "npm run dev"
```

Ou, si Node.js est disponible sur la machine :

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
npm test
npm run lint
```

Voir `e2e/README.md` pour les tests end-to-end (Playwright).

## Sécurité

- Isolation stricte entre comptes : chaque route API vérifie la propriété de la ressource avant toute lecture/écriture.
- Rate limiting sur la connexion, l'inscription, les uploads, l'import/export et les capteurs.
- Photos privées, servies uniquement après vérification que l'utilisateur y a accès.
- Mots de passe et clés API capteur hashés (bcrypt).

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md) : code visible publiquement, usage non-commercial autorisé, toute exploitation commerciale requiert une autorisation explicite.
