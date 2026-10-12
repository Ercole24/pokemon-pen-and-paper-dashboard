#!/bin/bash
# Installer per Linux e Mac (su Mac si scarica come install-mac.command: doppio clic, poi tasto destro > Apri la prima volta).
#   bash install.sh            installa o aggiorna (le campagne in data/ restano)
# 0. lingua: inglese o italiano (PNP_LANG=en|it per non chiederla); diventa anche la lingua del launcher;
# 1. Docker: se manca lo installa (Linux: chiede la password per sudo; Mac: Docker Desktop con Homebrew o dal sito);
# 2. Node.js (serve al launcher): se manca o è vecchio lo installa;
# 3. scarica da GitHub l'ultima release (senza release: il ramo main; PNP_ARCHIVE = altro URL o file .tar.gz locale, utile per provare);
# 4. icona nel menu (Linux) e, se richiesta, sul desktop; disinstallazione con installer/uninstall.sh.
set -euo pipefail

REPO=Ercole24/pokemon-pen-and-paper-dashboard
# codice dell'ultima release (gli aggiornamenti dal launcher usano le stesse release); senza release, il ramo main
latest() { curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | sed -n 's/.*"tarball_url": *"\([^"]*\)".*/\1/p' || true; }
ARCHIVE="${PNP_ARCHIVE:-$(latest)}"
ARCHIVE="${ARCHIVE:-https://github.com/$REPO/archive/refs/heads/main.tar.gz}"
NAME="Pokémon Pen & Paper"
if [ "$(uname)" = Darwin ]; then MAC=1; DIR="$HOME/Library/Application Support/pnp-dashboard"; else MAC=; DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pnp-dashboard"; fi

# --- lingua (legge dal terminale anche con curl ... | bash) ---
L="${PNP_LANG:-}"
if [ "$L" != en ] && [ "$L" != it ]; then
  read -r -p "Language / Lingua: [1] English  [2] Italiano  (1) " a </dev/tty || a=
  case "$a" in 2|[iI]*) L=it;; *) L=en;; esac
fi
# testo nella lingua scelta: m "inglese" "italiano"
m() { if [ "$L" = it ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
# domanda sì/no (predefinito sì)
ask() { local a; read -r -p "$1 $(m '[Y/n]' '[S/n]') " a </dev/tty || a=; case "$a" in [nN]*) return 1;; esac; }
pause() { read -r -p "$1 " _ </dev/tty || true; }
has() { command -v "$1" >/dev/null 2>&1; }
node_ok() { has node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; }
relogin=

# --- Docker ---
if ! has docker; then
  say "$(m "Docker is not installed: it runs the dashboard and Showdown." "Docker non è installato: serve per far girare la dashboard e Showdown.")"
  ask "$(m "Install Docker now?" "Installo Docker adesso?")" || die "$(m "Installation cancelled: Docker is required." "Installazione annullata: Docker è necessario.")"
  if [ -n "$MAC" ]; then
    if has brew; then brew install --cask docker-desktop || brew install --cask docker
    else open https://www.docker.com/products/docker-desktop/; pause "$(m "Install Docker Desktop, then press Enter…" "Installa Docker Desktop, poi premi Invio…")"; fi
    open -a Docker || true
  else
    if has pacman; then sudo pacman -S --needed --noconfirm docker docker-compose
    else curl -fsSL https://get.docker.com | sudo sh; fi
    sudo systemctl enable --now docker
    sudo usermod -aG docker "$USER"
    relogin=1
  fi
fi
# su Mac il comando docker compare solo dopo il primo avvio di Docker Desktop
until docker compose version >/dev/null 2>&1; do
  [ -n "$MAC" ] || die "$(m "Docker is installed but Docker Compose is missing: install the docker-compose-plugin package and try again." "Docker c'è ma manca Docker Compose: installa il pacchetto docker-compose-plugin e riprova.")"
  pause "$(m "Open Docker Desktop (Applications > Docker), accept the terms and press Enter…" "Apri Docker Desktop (Applicazioni > Docker), accetta le condizioni e premi Invio…")"
done

# --- Node.js ---
if ! node_ok; then
  say "$(m "Node.js 22 or newer not found: the start window needs it." "Node.js 22 o più recente non trovato: serve alla finestra di avvio.")"
  ask "$(m "Install Node.js now?" "Installo Node.js adesso?")" || die "$(m "Installation cancelled: Node.js is required." "Installazione annullata: Node.js è necessario.")"
  if [ -n "$MAC" ]; then
    if has brew; then brew install node
    else open https://nodejs.org/en/download; until has node; do pause "$(m "Install Node.js, then press Enter…" "Installa Node.js, poi premi Invio…")"; done; fi
  elif has dnf; then sudo dnf install -y nodejs
  elif has apt-get; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
  elif has pacman; then sudo pacman -S --needed --noconfirm nodejs
  elif has zypper; then sudo zypper install -y nodejs22
  else die "$(m "Install Node.js 22 from https://nodejs.org and run the installer again." "Installa Node.js 22 da https://nodejs.org e rilancia l'installer.")"; fi
  node_ok || die "$(m "The installed Node.js is older than version 22: install it from https://nodejs.org and run the installer again." "Node.js installato è più vecchio della versione 22: installalo da https://nodejs.org e rilancia l'installer.")"
fi

# --- progetto ---
say "$(m "Downloading $NAME to $DIR" "Scarico $NAME in $DIR")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if [ -f "$ARCHIVE" ]; then cp "$ARCHIVE" "$tmp/src.tar.gz"; else curl -fL --progress-bar "$ARCHIVE" -o "$tmp/src.tar.gz"; fi
mkdir -p "$tmp/src" "$DIR" "$DIR/data" # data creata da noi: creata da Docker sarebbe di root
tar -xzf "$tmp/src.tar.gz" -C "$tmp/src" --strip-components 1
# aggiornamento: sostituisce il codice, tiene campagne (data/) e scelte del launcher
find "$DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name .launcher.json -exec rm -rf {} +
cp -R "$tmp/src/." "$DIR/"
chmod +x "$DIR/installer/"*.sh
# prima installazione: il launcher parte nella lingua scelta qui
[ -f "$DIR/.launcher.json" ] || printf '{"lang": "%s"}\n' "$L" > "$DIR/.launcher.json"

# --- icone ---
NODE="$(command -v node)"
if [ -n "$MAC" ]; then
  if ask "$(m "Create a desktop icon?" "Creo l'icona sul desktop?")"; then
    printf '#!/bin/sh\nexec "%s" "%s/scripts/launch.mjs"\n' "$NODE" "$DIR" > "$HOME/Desktop/$NAME.command"
    chmod +x "$HOME/Desktop/$NAME.command"
  fi
else
  apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$apps"
  cat > "$apps/pnp-dashboard.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$NAME
Comment=$(m "Starts the dashboard and Showdown" "Avvia la dashboard e Showdown")
Exec="$NODE" "$DIR/scripts/launch.mjs"
Icon=$DIR/installer/icon.svg
Terminal=false
Categories=Game;
EOF
  cat > "$apps/pnp-dashboard-uninstall.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$(m "Uninstall" "Disinstalla") $NAME
Exec="$DIR/installer/uninstall.sh"
Icon=$DIR/installer/icon.svg
Terminal=true
Categories=Game;
EOF
  if ask "$(m "Create a desktop icon?" "Creo l'icona sul desktop?")"; then
    desk="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
    mkdir -p "$desk"
    cp "$apps/pnp-dashboard.desktop" "$desk/"
    chmod +x "$desk/pnp-dashboard.desktop"
    gio set "$desk/pnp-dashboard.desktop" metadata::trusted true 2>/dev/null || true # GNOME: icona avviabile senza conferma
  fi
fi

if [ -n "$MAC" ]; then
  say "$(m "Done! Start $NAME from its icon." "Fatto! Avvia $NAME dall'icona.")"
  echo "$(m "To uninstall:" "Per disinstallare:") \"$DIR/installer/uninstall.sh\""
else
  say "$(m "Done! Start $NAME from its icon or from the applications menu." "Fatto! Avvia $NAME dall'icona o dal menu delle applicazioni.")"
  echo "$(m "To uninstall: \"Uninstall $NAME\" in the menu, or" "Per disinstallare: \"Disinstalla $NAME\" nel menu, oppure") \"$DIR/installer/uninstall.sh\""
fi
[ -n "$relogin" ] && echo "$(m "IMPORTANT: log out and back in (or restart the computer) before the first start, so Docker works without sudo." "IMPORTANTE: esci e rientra nella sessione (o riavvia il PC) prima del primo avvio, così Docker funziona senza sudo.")"
exit 0
