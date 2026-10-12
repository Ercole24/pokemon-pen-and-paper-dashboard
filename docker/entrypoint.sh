#!/bin/sh
# Segreto condiviso tra dashboard e Showdown (comandi /pnpbattle, /pnpend…): creato una volta nel volume dei dati.
set -e
SECRET_FILE="${PNP_SECRET_FILE:-/app/data/.pnp-secret}"
if [ -z "$PNP_SECRET" ]; then
  mkdir -p "$(dirname "$SECRET_FILE")"
  [ -s "$SECRET_FILE" ] || (umask 077; set -C; head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$SECRET_FILE") 2>/dev/null || true
  PNP_SECRET="$(cat "$SECRET_FILE")"
  export PNP_SECRET
fi
# Showdown: pnpBoot cambia a ogni avvio del container (letto dalla pagina del client, vedi client.mjs):
# i nomi ricordati dai telefoni valgono finché Showdown non si ferma
[ -d server/static/config ] && echo "Config.pnpBoot = \"$(date +%s)\";" > server/static/config/pnp.js
exec "$@"
