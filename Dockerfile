# Pokémon Pen & Paper: Showdown locale + dashboard. Due immagini dallo stesso file:
#   docker build --target showdown   -> server di lotta (porta 8000)
#   docker build --target app        -> dashboard (porta 3000), usa i dati Pokémon della stessa build di Showdown

# --- Showdown con il plugin della dashboard ---
# Versioni (commit esatti) in .env, aggiornate da scripts/update-showdown.mjs: cambia lo sha, cambia la cache.
FROM node:22-bookworm-slim AS showdown-src
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
ARG SHOWDOWN_REF=master
WORKDIR /app/showdown
RUN git init -q && git fetch -q --depth 1 https://github.com/smogon/pokemon-showdown.git ${SHOWDOWN_REF} && git checkout -q FETCH_HEAD
RUN npm ci --omit=optional --no-audit --no-fund && node node_modules/esbuild/install.js

FROM showdown-src AS showdown-build
COPY showdown-plugin/pnp.ts server/chat-plugins/pnp.ts
COPY showdown-plugin/config-overrides.js /tmp/config-overrides.js
RUN cat config/config-example.js /tmp/config-overrides.js > config/config.js && node build

# --- client di Showdown, compilato dai sorgenti con i dati dello stesso server ---
FROM showdown-src AS client-build
ARG CLIENT_REF=master
WORKDIR /app/client
RUN git init -q && git fetch -q --depth 1 https://github.com/smogon/pokemon-showdown-client.git ${CLIENT_REF} && git checkout -q FETCH_HEAD
RUN npm ci --no-audit --no-fund
# "pnp-host": segnaposto per gli indirizzi, trasformati in percorsi relativi da client.mjs
RUN sed -i 's/"client": "play.pokemonshowdown.com"/"client": "pnp-host"/' config/routes.json \
 && mkdir -p caches && ln -s /app/showdown caches/pokemon-showdown && node build full --no-update
COPY showdown-plugin/client.mjs /tmp/client.mjs
# indirizzo di immagini e audio (PNP_ASSETS, scelto nel launcher): cambiarlo rifà solo il passo qui sotto
ARG PNP_ASSETS
# config/ contiene link simbolici verso ../../config: copia i file veri (via i link rotti, es. config-test.js)
# niente immagini di gioco nell'immagine: sprite ed effetti arrivano da play.pokemonshowdown.com (vedi client.mjs)
RUN find play.pokemonshowdown.com -xtype l -delete && cp -rL play.pokemonshowdown.com /out && rm -rf /out/sprites /out/fx \
 && node /tmp/client.mjs /out/caches/index-old.html /out

FROM node:22-bookworm-slim AS showdown
WORKDIR /app/showdown
COPY --from=showdown-build --chown=node:node /app/showdown ./
# client (JS, CSS, dati) servito dal server stesso (server/static); immagini e audio da play.pokemonshowdown.com
COPY --from=client-build --chown=node:node /out server/static
COPY docker/entrypoint.sh /usr/local/bin/pnp-entrypoint
# utente non root (uid 1000); /app/shared ospita il segreto condiviso
RUN mkdir -p /app/shared && chown node:node /app/shared
USER node
EXPOSE 8000
ENTRYPOINT ["pnp-entrypoint"]
CMD ["node", "pokemon-showdown", "start", "--skip-build"]

# --- dashboard ---
FROM node:22-bookworm-slim AS app-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npm run build -w web

FROM node:22-bookworm-slim AS app
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=app-build /app/package.json ./
COPY --from=app-build /app/node_modules node_modules
COPY --from=app-build /app/server server
COPY --from=app-build /app/web/dist web/dist
# i dati Pokémon (Dex, mosse, tipi) vengono dalla build di Showdown
COPY --from=showdown-build /app/showdown/dist showdown/dist
COPY --from=showdown-build /app/showdown/package.json showdown/package.json
COPY --from=showdown-build /app/showdown/node_modules showdown/node_modules
COPY docker/entrypoint.sh /usr/local/bin/pnp-entrypoint
RUN mkdir -p /app/shared /app/data && chown node:node /app/shared /app/data
USER node
EXPOSE 3000
VOLUME /app/data
ENTRYPOINT ["pnp-entrypoint"]
CMD ["npx", "tsx", "server/src/index.ts"]
