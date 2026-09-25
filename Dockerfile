# Multi-stage : deps -> build (Next.js standalone) -> runtime.
# Self-hosters n'ont pas besoin de Node en local, `docker compose up` construit tout.

# Digest fige (node:22-alpine) : reproductibilite du build -- un tag mobile
# pourrait sinon pointer vers une image differente d'un build a l'autre.
# Mettre a jour manuellement (docker pull node:22-alpine puis docker inspect
# --format '{{index .RepoDigests 0}}') lors d'une montee de version Node
# deliberee, pas automatiquement par Dependabot (pas suivi sur les digests
# Docker).
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS deps
WORKDIR /app
# better-sqlite3 (adapter Prisma 7, voir src/server/db.ts) compile un binaire
# natif a l'installation (node-gyp) -- absent de l'image Alpine de base.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
# @playwright/test (devDependency, tests E2E sous e2e/) telecharge sinon des
# navigateurs (~300 Mo) au moindre `npm ci` -- inutile pour construire
# l'image de prod, qui n'execute jamais ces tests.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# node_modules de production prepare a part, a partir des SEULS fichiers de
# dependances (etage deps) : tant que package-lock.json ne change pas, cet
# etage, sa copie dans l'image finale et l'export de cette couche (la plus
# grosse de l'image) sont servis par le cache. Avant (2026-09-25), le
# `npm prune` suivait `COPY . .` dans l'etage build : la moindre ligne de
# code produisait un nouveau node_modules a recopier et exporter (~3 min
# sur le homelab pour un changement d'une ligne).
FROM deps AS prod-deps
RUN npm prune --omit=dev

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prisma generate` n'a besoin d'aucune connexion reelle (il ne fait
# qu'inspecter le schema), mais prisma.config.ts valide desormais que
# DATABASE_URL resout a quelque chose des cette etape -- valeur factice,
# ecrasee au runtime par docker-compose.yml (DATABASE_URL=/app/data/...).
ENV DATABASE_URL="file:./build-placeholder.db"
RUN npx prisma generate
# Aucune configuration d'instance figee dans l'image : la cle VAPID publique
# est lue au runtime (PLANTES_VAPID_PUBLIC_KEY, voir getVapidPublicKey dans
# src/server/notifications/webPush.ts) -- une meme image sert n'importe
# quelle instance, y compris celle publiee par la CI sur GHCR.
# Identifie la revision exacte a l'origine d'un deploiement (affiche dans
# Parametres > A propos) : utile pour situer une instance dans l'historique
# du projet (support, ou comparaison en cas de reutilisation commerciale non
# autorisee du code -- voir LICENSE.md). Sans valeur passee, reste vide plutot
# que d'echouer le build. Declare ici, juste avant `next build` qui l'inline,
# et non en tete d'etage : la CI passe un SHA different a chaque commit, qui
# invaliderait sinon le cache de la copie de node_modules ci-dessus.
ARG GIT_SHA=""
ENV NEXT_PUBLIC_GIT_SHA=${GIT_SHA}
# Cache de build Next.js (compilation incrementale SWC) persiste entre les
# `docker compose build` successifs sur cette machine -- sans lui, chaque
# build repart de zero meme pour un changement d'une ligne, ce qui est lent
# sur un serveur qui partage ses ressources avec beaucoup d'autres services.
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"
# Le scheduler (src/server/notifications/scheduler.ts) calcule les
# echeances/le digest quotidien avec des methodes Date locales
# (getHours/setHours/...) -- sans fuseau explicite, un conteneur tournerait
# en UTC. Node.js embarque son propre ICU et resout TZ tout seul, meme sans
# le paquet tzdata cote OS (absent d'Alpine) -- deja effectif via
# `environment: TZ=...` dans docker-compose.yml, fixe ici aussi pour que
# l'image reste correcte par defaut meme lancee hors de ce compose precis.
ENV TZ=Europe/Brussels

# On garde le node_modules complet (pruned) plutot que le sous-ensemble
# "standalone" trace par Next.js : le CLI Prisma (utilise par l'entrypoint
# pour les migrations/seed) a des dependances transitives (ex. "effect")
# que le tracage de Next.js ne suit pas puisqu'elles ne sont jamais
# importees par le code applicatif lui-meme.
#
# Ne pas tourner en root : l'image accepte des fichiers uploades par
# l'utilisateur, des images traitees par sharp et des ZIP d'import -- un
# gain defensif reel meme derriere Cloudflare. "node" est l'utilisateur
# non-root deja fourni par l'image officielle (uid/gid 1000).
# --chown sur chaque COPY (proprietaire pose pendant la copie, une seule
# passe) plutot qu'un `RUN chown -R` separe apres coup (parcours recursif
# de tout node_modules en plus de la copie elle-meme -- deux fois le
# travail, deux fois le pic memoire sur un hote deja charge). Les
# repertoires bind-montes (/app/data, /app/public/uploads, voir
# docker-compose.yml) doivent etre prealablement chownes cote hote au meme
# uid : un COPY --chown ne les couvre pas, un bind mount remplace le
# contenu de l'image a cet endroit au demarrage.
# Depuis prod-deps (devDependencies retirees : typescript, tailwind,
# vitest... ; prisma et tsx restent, deplaces en dependencies dans
# package.json car necessaires a l'entrypoint -- migrations + seed), pas
# depuis build : couche identique tant que package-lock.json ne change pas.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/prisma ./prisma
# Client Prisma genere hors de node_modules (voir prisma/schema.prisma,
# generator.output) : le CLI (migrate deploy/db seed, via docker-entrypoint.sh)
# et les scripts prisma/*.ts executes par tsx en ont besoin directement, pas
# seulement le serveur Next.js (deja bundle dans .next/standalone).
COPY --from=build --chown=node:node /app/generated ./generated
# Scripts de maintenance ponctuels sous prisma/ (ex. backfillImages.ts)
# reutilisent des utilitaires de src/server/ -- pas necessaire au serveur
# Next.js lui-meme (deja bundle dans .next/standalone), juste a `tsx`.
COPY --from=build --chown=node:node /app/src ./src
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# ENV ne traverse pas les etages d'un build multi-stage -- necessaire ici
# car Parametres > A propos le lit via process.env dans un Server Component,
# execute par ce conteneur runtime, pas au moment du `next build` de l'etage
# precedent. En fin d'etage : une valeur differente a chaque commit (CI)
# n'invalide ainsi aucune des copies ci-dessus.
ARG GIT_SHA=""
ENV NEXT_PUBLIC_GIT_SHA=${GIT_SHA}

USER node

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
