# Sviluppo / Development

Note per chi lavora sul codice. Per installare e giocare: [README](README.md).

## Avvio con Docker, a mano
```
docker compose up -d --build   # la prima volta costruisce le immagini (qualche minuto)
docker compose logs -f         # log
docker compose down            # ferma tutto
```
Due container: `showdown` (porta 8000, con il plugin già installato) e `app` (dashboard, porta 3000).
Il segreto condiviso tra i due viene creato da solo al primo avvio. Le campagne restano nella cartella `data/`
(un'altra cartella con `PNP_DATA_DIR=/percorso docker compose up -d`); i container girano come utente uid 1000.
Le versioni di Showdown sono fissate in `.env`; per passare all'ultima: `node scripts/update-showdown.mjs --build`.
`PNP_AUTO_STOP=<minuti>`: spegnimento quando il master chiude la dashboard (predefinito 2, `0` = mai).

## Installazione senza Docker (una volta)
Servono Node.js 22+ e git.
```
npm run setup
```
Scarica e compila Pokémon Showdown e il suo client in `showdown/` con il plugin `showdown-plugin/pnp.ts`.

## Avvio senza Docker
```
npm start
```
Stampa gli indirizzi: dashboard su `http://<IP>:3000`, Showdown su `http://<IP>:8000`.
- Giocatori: `http://<IP>:3000/c/<campagna>/giocatore`
- Chi gestisce le lotte apre Showdown e sceglie il nome impostato nella campagna (default `team`, o `squadra` se la campagna è creata in italiano; il Master `master`).

Sviluppo: `npm run dev` (Vite su :5173). Test: `npm test`.

## Nuova versione
1. Cambia `"version"` in `package.json` (es. `1.1.0`) e fai commit.
2. `git tag v1.1.0 && git push origin main v1.1.0`
3. GitHub Actions controlla che tag e versione coincidano, compila l'installer e pubblica la release
   (le note della release si vedono nel launcher sotto "Novità"). Da lì i launcher installati propongono l'aggiornamento.

## Sicurezza
- **Solo rete di casa**: dashboard (porta 3000) e Showdown (8000) non hanno password, chiunque sia sulla stessa rete
  può usarli; Showdown accetta nomi senza password (`noguestsecurity`). Non avviare su Wi-Fi pubbliche o condivise.
- Un sito aperto nel browser non può usare la dashboard: sono accettate solo richieste dalla dashboard stessa
  (indirizzo IP, `localhost`, nome del PC o `.local`) — vedi `server/src/trusted.ts`.
- Il launcher ascolta solo su `127.0.0.1` e accetta comandi solo dalla sua finestra. Gli aggiornamenti arrivano dalle
  release di questo repository su GitHub (HTTPS).
- Con un indirizzo di immagini e audio diverso da quello di Showdown, l'unico file eseguito (`data/pokedex-mini.js`)
  viene accettato solo se contiene dati.

## Traduzioni
I testi stanno in `server/src/en.ts` (chiave = testo italiano del codice); `npm test` segnala quelli senza traduzione.

## Dati e impostazioni
- Campagne in `data/pnp.db` (SQLite): per un backup basta copiare la cartella `data/`.
- Scelte del launcher in `.launcher.json` (lingua, browser, spegnimento automatico, indirizzo di immagini e audio;
  a mano: `PNP_ASSETS=…`).
