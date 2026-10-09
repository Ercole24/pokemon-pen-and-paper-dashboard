// Avvio senza Docker (npm start; npm run dev per lo sviluppo):
// - crea (una volta) il segreto condiviso in data/.pnp-secret e lo passa a entrambi i processi;
// - copia il plugin aggiornato in Showdown e ricompila (incrementale, pochi secondi);
// - avvia Showdown (porta 8000) e il server della dashboard (porta 3000); con --dev anche Vite (5173);
// - stampa gli indirizzi da aprire sui telefoni; se un processo muore, ferma tutto.
import {execSync, spawn} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import os from 'node:os';

const dev = process.argv.includes('--dev');
mkdirSync('data', {recursive: true});
const secretFile = 'data/.pnp-secret';
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(16).toString('hex'));
const env = {...process.env, PNP_SECRET: readFileSync(secretFile, 'utf8').trim()};

if (!existsSync('showdown/dist')) {
  console.error('Showdown non installato: esegui prima "npm run setup".');
  process.exit(1);
}
// plugin sempre aggiornato: copia e ricompila (incrementale, pochi secondi)
copyFileSync('showdown-plugin/pnp.ts', 'showdown/server/chat-plugins/pnp.ts');
// Showdown deve usare il proprio esbuild, non quello del progetto (versioni diverse)
execSync('node build', {cwd: 'showdown', stdio: 'inherit', env: {...process.env, ESBUILD_BINARY_PATH: `${process.cwd()}/showdown/node_modules/esbuild/bin/esbuild`}});
const procs = [
  spawn('node', ['pokemon-showdown', 'start', '--skip-build'], {cwd: 'showdown', env, stdio: ['ignore', 'ignore', 'inherit']}),
  spawn('npx', ['tsx', dev ? 'watch' : '', 'src/index.ts'].filter(Boolean), {cwd: 'server', env, stdio: 'inherit'}),
];
if (dev) procs.push(spawn('npx', ['vite', '--host'], {cwd: 'web', env, stdio: 'inherit'}));

/** Indirizzi IPv4 del PC in rete locale, da mostrare per collegare i telefoni. */
const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
setTimeout(() => {
  console.log('\n=== Pokémon Pen & Paper ===');
  for (const ip of ['localhost', ...ips]) {
    console.log(`Dashboard:  http://${ip}:${dev ? 5173 : 3000}`);
  }
  for (const ip of ips) console.log(`Showdown:   http://${ip}:8000  (da aprire sui telefoni)`);
  console.log('');
}, 3000);

/** Chiusura pulita: ferma tutti i processi figli (Ctrl+C o arresto). */
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', code => { if (code) { console.error('Processo terminato con codice', code); stop(); } });
