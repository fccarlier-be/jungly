# Multi-stage : deps -> build (Next.js standalone) -> runtime.
# Self-hosters n'ont pas besoin de Node en local, `docker compose up` construit tout.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# @playwright/test (devDependency, tests E2E sous e2e/) telecharge sinon des
# navigateurs (~300 Mo) au moindre `npm ci` -- inutile pour construire
# l'image de prod, qui n'execute jamais ces tests.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci 2>/dev/null || npm install

FROM node:22-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_* est fige au moment du `next build`, jamais relu au runtime :
# la cle VAPID publique doit donc passer en build arg (docker-compose.yml
# build.args), pas seulement en variable d'environnement du conteneur.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Cache de build Next.js (compilation incrementale SWC) persiste entre les
# `docker compose build` successifs sur cette machine -- sans lui, chaque
# build repart de zero meme pour un changement d'une ligne, ce qui est lent
# sur un serveur qui partage ses ressources avec beaucoup d'autres services.
RUN --mount=type=cache,target=/app/.next/cache npm run build
# Retire les devDependencies (typescript, tailwind, vitest...) : prisma et
# tsx restent (deplaces en dependencies, voir package.json) car necessaires
# a l'entrypoint en production (migrations + seed).
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
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
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /app/prisma ./prisma
# Scripts de maintenance ponctuels sous prisma/ (ex. backfillImages.ts)
# reutilisent des utilitaires de src/server/ -- pas necessaire au serveur
# Next.js lui-meme (deja bundle dans .next/standalone), juste a `tsx`.
COPY --from=build --chown=node:node /app/src ./src
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER node

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
