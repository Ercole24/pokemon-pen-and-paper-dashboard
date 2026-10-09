#!/bin/bash
# Disinstalla (Linux e Mac): ferma e cancella container e immagini Docker, toglie icone e programma.
# Chiede se tenere le campagne (cartella data/). Docker e Node.js restano installati.
# Lingua: quella scelta nel launcher (.launcher.json), di base inglese.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
NAME="Pokémon Pen & Paper"
L=en; grep -q '"lang": *"it"' "$DIR/.launcher.json" 2>/dev/null && L=it
m() { if [ "$L" = it ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }
ask() { local a; read -r -p "$1 $(m '[Y/n]' '[S/n]') " a </dev/tty || a=; case "$a" in [nN]*) return 1;; esac; }

[ -f "$DIR/compose.yaml" ] || { echo "$(m "Installation not found in" "Non trovo l'installazione in") $DIR"; exit 1; }
ask "$(m "Uninstall $NAME from $DIR?" "Disinstallo $NAME da $DIR?")" || exit 0

echo "$(m "Stopping and deleting containers and images…" "Fermo e cancello container e immagini…")"
(cd "$DIR" && docker compose down --rmi all -v) || echo "$(m "Docker is not responding: containers and images remain (remove them with: docker compose down --rmi all)." "Docker non risponde: container e immagini restano (si tolgono con: docker compose down --rmi all).")"

apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
desk="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
rm -f "$apps/pnp-dashboard.desktop" "$apps/pnp-dashboard-uninstall.desktop" "$desk/pnp-dashboard.desktop" "$HOME/Desktop/$NAME.command"

if [ -d "$DIR/data" ] && ask "$(m "Keep the campaigns (folder $DIR/data)?" "Tengo le campagne (cartella $DIR/data)?")"; then
  find "$DIR" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
  echo "$(m "Uninstalled. The campaigns are still in" "Disinstallato. Le campagne restano in") $DIR/data"
else
  rm -rf "$DIR"
  echo "$(m "Uninstalled." "Disinstallato.")"
fi
read -r -p "$(m "Press Enter to close…" "Premi Invio per chiudere…") " _ </dev/tty || true
