#!/bin/sh
set -e

# La base SQLite vit dans le volume monte /app/data (voir docker-compose.yml).
# On applique les migrations a chaque demarrage (idempotent), puis on seed
# uniquement si la base est vide (voir prisma/seed.ts : no-op si l'utilisateur
# a deja des plantes).
prisma migrate deploy
prisma db seed || true

exec "$@"
