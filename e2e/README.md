# Tests E2E (Playwright)

Parcours réels exécutés dans un vrai navigateur, contre une instance de
l'app déjà démarrée (jamais contre `plantes.fcold.org` en production).

## Lancer les tests

Depuis `www/plantes`, avec l'app démarrée (`docker compose up -d plantes-app`
depuis `serveur/`) :

```bash
set -a; source <(grep -E "^PLANTES_SEED_EMAIL=|^PLANTES_SEED_PASSWORD=" ../../.env); set +a

docker run --rm \
  --network serveur_default \
  -v "$(pwd)":/app -w /app \
  -v jungly_e2e_node_modules:/app/node_modules \
  -v "$(pwd)/data":/data \
  -e E2E_BASE_URL=https://plantes.fcold.org \
  -e E2E_SEED_EMAIL="$PLANTES_SEED_EMAIL" \
  -e E2E_SEED_PASSWORD="$PLANTES_SEED_PASSWORD" \
  -e DATABASE_URL=file:/data/plantes.db \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  sh -c "npm ci && npx prisma generate && npx playwright test"
```

- **`E2E_BASE_URL` doit être en HTTPS** (le vrai domaine public, pas
  `http://plantes-app:3000`) : NextAuth préfixe ses cookies en `__Secure-`
  dès que `NEXTAUTH_URL` est en https (c'est le cas ici), et un vrai
  navigateur -- contrairement à un simple `fetch()` Node -- refuse
  silencieusement un cookie `__Secure-` reçu en HTTP simple. Un test qui
  se connecte "avec succès" mais reste bloqué sur `/login` juste après en
  est le symptôme.
- `-v "$(pwd)/data":/data` + `DATABASE_URL` : même fichier SQLite que le
  conteneur testé, uniquement pour que `e2e/dbCleanup.ts` puisse nettoyer
  les données de test en filet de sécurité (jamais pour piloter l'app).
- Le compte seed est réutilisé pour le parcours "créer une plante" (la
  plante est supprimée par le test lui-même) ; le parcours "inscription"
  crée son propre compte jetable.
- **`-v jungly_e2e_node_modules:/app/node_modules` est important** : sans
  ce volume Docker dédié, `npm ci`/`npx prisma generate` écrivent dans le
  `node_modules` du host (partagé avec `vitest`/le build de l'image) --
  le moteur Prisma généré dans ce conteneur Ubuntu n'est pas compatible
  avec les images Debian/Alpine utilisées ailleurs (`node:20-slim`,
  `node:22-alpine`), et casse la suite `vitest` jusqu'à un `npx prisma
  generate` de rattrapage avec la bonne image.

L'image Docker doit correspondre **exactement** à la version de
`@playwright/test` installée (`package.json`, fixée sans `^` pour cette
raison) : `npm ci` installe les binaires JS d'une version, l'image fournit
les navigateurs d'une autre -- un `npm i --save-dev @playwright/test@X.Y.Z`
suivi d'un changement du tag `vX.Y.Z-noble` ci-dessus doivent toujours aller
ensemble.

## Limites connues

- Branché en CI (`.github/workflows/ci.yml`, job `e2e`) contre une instance
  `next start` éphémère -- la commande ci-dessus reste utile pour un run
  manuel contre la prod réelle en HTTPS (piège `__Secure-` inclus), que la
  CI ne peut pas reproduire (elle tourne en HTTP simple, voir le commentaire
  du workflow).
- Le rate limiting (login 10/5min, inscription 5/15min, par IP) s'applique
  aussi aux tests -- éviter de relancer la suite en boucle rapprochée
  pendant le développement (le réel motif de la plupart des échecs
  intermittents de connexion en cours de session, pas une régression).
