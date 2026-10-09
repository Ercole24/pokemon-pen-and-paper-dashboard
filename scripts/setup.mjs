// Installazione senza Docker (npm run setup), da lanciare una volta (e dopo scripts/update-showdown.mjs):
// 1. scarica Pokémon Showdown in showdown/ alla versione di .env e ne installa le dipendenze;
// 2. copia il plugin e scrive config/config.js (configurazione di esempio + showdown-plugin/config-overrides.js);
// 3. compila Showdown con il suo esbuild (diverso da quello del progetto: per questo ESBUILD_BINARY_PATH);
// 4. compila il client di Showdown (showdown-client/, versione di .env) e lo mette in showdown/server/static (senza immagini: arrivano da play.pokemonshowdown.com);
// 5. installa le dipendenze di server e web.
import {execSync} from 'node:child_process';
import {existsSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';

/** Esegue un comando mostrandolo, nella cartella indicata; si ferma al primo errore. */
const run = (cmd, cwd = '.') => { console.log(`> ${cmd}`); execSync(cmd, {cwd, stdio: 'inherit'}); };

/** Versioni fissate in .env (SHOWDOWN_REF, CLIENT_REF); senza .env l'ultima versione. */
const refs = Object.fromEntries((existsSync('.env') ? readFileSync('.env', 'utf8') : '').split('\n').map(l => l.split('=')));
/** Porta la cartella al commit indicato (scarica solo quello). */
const checkout = (dir, repo, ref = 'master') => {
  mkdirSync(dir, {recursive: true});
  if (!existsSync(`${dir}/.git`)) run('git init -q', dir);
  run(`git fetch -q --depth 1 https://github.com/smogon/${repo}.git ${ref}`, dir);
  run('git checkout -q -f FETCH_HEAD', dir); // -f: scarta le modifiche nostre (es. routes.json), rifatte sotto
};

checkout('showdown', 'pokemon-showdown', refs.SHOWDOWN_REF);
run('npm ci --omit=optional --no-audit --no-fund', 'showdown');
// il binario di esbuild è una dipendenza opzionale: senza, install.js prenderebbe quello del progetto (altra versione)
const esbuild = JSON.parse(readFileSync('showdown/node_modules/esbuild/package.json', 'utf8')).version;
run(`npm install --no-save --no-audit --no-fund esbuild@${esbuild}`, 'showdown');
run('node node_modules/esbuild/install.js', 'showdown'); // npm >= 11 non esegue i postinstall
copyFileSync('showdown-plugin/pnp.ts', 'showdown/server/chat-plugins/pnp.ts');
const example = readFileSync('showdown/config/config-example.js', 'utf8');
writeFileSync('showdown/config/config.js', example + readFileSync('showdown-plugin/config-overrides.js', 'utf8'));
const bin = `${process.cwd()}/showdown/node_modules/esbuild/bin/esbuild`;
// se è ancora lo script node (install.js non ha messo il binario), esbuild rilancerebbe sé stesso all'infinito
if (readFileSync(bin).subarray(0, 2).toString() === '#!') throw new Error(`${bin} non è il binario di esbuild`);
process.env.ESBUILD_BINARY_PATH = bin; // esbuild proprio di Showdown
run('node build', 'showdown');
checkout('showdown-client', 'pokemon-showdown-client', refs.CLIENT_REF);
run('npm ci --no-audit --no-fund', 'showdown-client');
// "pnp-host": segnaposto per gli indirizzi, trasformati in percorsi relativi da client.mjs
const routes = 'showdown-client/config/routes.json';
writeFileSync(routes, readFileSync(routes, 'utf8').replace('"client": "play.pokemonshowdown.com"', '"client": "pnp-host"'));
mkdirSync('showdown-client/caches', {recursive: true});
if (!existsSync('showdown-client/caches/pokemon-showdown')) symlinkSync('../../showdown', 'showdown-client/caches/pokemon-showdown');
run('node build full --no-update', 'showdown-client');
// config/ contiene link simbolici verso ../../config: copia i file veri, saltando i link rotti
cpSync('showdown-client/play.pokemonshowdown.com', 'showdown/server/static', {recursive: true, dereference: true, filter: existsSync});
for (const d of ['sprites', 'fx']) rmSync(`showdown/server/static/${d}`, {recursive: true, force: true});
run('node showdown-plugin/client.mjs showdown-client/play.pokemonshowdown.com/caches/index-old.html showdown/server/static');
delete process.env.ESBUILD_BINARY_PATH;
run('npm install --no-audit --no-fund');
run('node node_modules/esbuild/install.js'); // per Vite
console.log('\nPronto. Avvia con: npm start');
