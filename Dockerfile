# Multi-stage : deps -> build (Next.js standalone) -> runtime.
# Self-hosters n'ont pas besoin de Node en local, `docker compose up` construit tout.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
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

# On garde le node_modules complet (pruned) plutot que le sous-ensemble
# "standalone" trace par Next.js : le CLI Prisma (utilise par l'entrypoint
# pour les migrations/seed) a des dependances transitives (ex. "effect")
# que le tracage de Next.js ne suit pas puisqu'elles ne sont jamais
# importees par le code applicatif lui-meme.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/prisma ./prisma
# Scripts de maintenance ponctuels sous prisma/ (ex. backfillImages.ts)
# reutilisent des utilitaires de src/server/ -- pas necessaire au serveur
# Next.js lui-meme (deja bundle dans .next/standalone), juste a `tsx`.
COPY --from=build /app/src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
