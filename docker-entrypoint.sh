#!/bin/sh
set -e

# La base SQLite vit dans le volume monte /app/data (voir docker-compose.yml).
# On applique les migrations a chaque demarrage (idempotent), puis on seed
# uniquement si la base est vide (voir prisma/seed.ts : no-op si l'utilisateur
# a deja des plantes).
# Le seed reste best-effort au demarrage (une base deja peuplee ou un hoquet
# reseau pendant le mirroring d'images ne doivent pas empecher le conteneur
# de demarrer, voir libraryPhotos.ts) -- mais un echec reel ne doit jamais
# passer inapercu (audit15.md, #5) : contrairement a un simple `|| true`, on
# affiche un avertissement bien visible dans les logs avant de continuer.
prisma migrate deploy
if ! prisma db seed; then
  echo "ERREUR : le seed a echoue (voir la trace ci-dessus) -- demarrage du conteneur malgre tout, mais la base peut etre partiellement initialisee." >&2
fi

exec "$@"
