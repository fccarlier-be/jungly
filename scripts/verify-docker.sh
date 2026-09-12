#!/bin/sh
set -e

# Verification locale (lint + tests + build) dans un conteneur Docker
# jetable, SANS jamais ecrire dans le vrai depot :
#
# - node_modules/, .next/, generated/ sont montes comme volumes Docker
#   NOMMES (persistants entre deux executions, jamais le depot lui-meme) --
#   sans ca, "npm ci"/"next build" a l'interieur du conteneur ecrivait
#   directement dans ces dossiers du DEPOT REEL (bind-montes via -v
#   "$(pwd)":/app), en tant que root (utilisateur par defaut de l'image
#   node:22) : incident constate le 2026-09-12, ces trois dossiers
#   entierement root-owned sur le vrai depot apres une session de
#   verifications repetees (invisibles dans `git status` car tous les
#   trois gitignores -- d'ou la decouverte tardive).
# - Ces memes volumes nommes servent aussi de CACHE : plus besoin de
#   reinstaller node_modules a chaque execution, seul un `npm ci`
#   incremental (lockfile inchange = quasi instantane) est necessaire.
#
# Usage : ./scripts/verify-docker.sh [commande a executer, defaut: tout]
# Exemples :
#   ./scripts/verify-docker.sh                  # lint + test + build
#   ./scripts/verify-docker.sh "npm test -- --run"

CMD="${1:-npm run lint && npm test -- --run && npm run build}"

docker run --rm \
  -v "$(pwd)":/app \
  -v plantes-verify-node-modules:/app/node_modules \
  -v plantes-verify-next-cache:/app/.next \
  -v plantes-verify-generated:/app/generated \
  -v plantes-verify-npm-cache:/root/.npm \
  -w /app \
  -e DATABASE_URL="file:./ci.db" \
  node:22 \
  sh -c "npm ci --silent && npx prisma generate >/dev/null && npx prisma migrate deploy >/dev/null && $CMD"
