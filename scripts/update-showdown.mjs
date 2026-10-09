// Aggiorna le versioni di Showdown (server + client) fissate in .env, sempre insieme: il client legge i dati del server.
// Chiede a GitHub l'ultimo commit di ciascun repo (git ls-remote, non scarica nulla) e, se è cambiato, riscrive .env.
// Il download vero lo fa `docker compose build` (o `npm run setup`): cambia lo sha, cambia la cache di Docker.
// Uso: node scripts/update-showdown.mjs [--build]   (--build lancia anche docker compose build)
import {execSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';

const REPOS = {SHOWDOWN_REF: 'smogon/pokemon-showdown', CLIENT_REF: 'smogon/pokemon-showdown-client'};
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const current = Object.fromEntries(env.split('\n').map(l => l.split('=')).filter(([k]) => k in REPOS));

let out = env, changed = false;
for (const [key, repo] of Object.entries(REPOS)) {
  const sha = execSync(`git ls-remote https://github.com/${repo}.git HEAD`, {encoding: 'utf8'}).split('\t')[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`risposta inattesa da GitHub per ${repo}: ${sha}`);
  if (current[key] === sha) { console.log(`${repo}: già aggiornato (${sha.slice(0, 7)})`); continue; }
  console.log(current[key]
    ? `${repo}: ${current[key].slice(0, 7)} -> ${sha.slice(0, 7)}  https://github.com/${repo}/compare/${current[key]}...${sha}`
    : `${repo}: ${sha.slice(0, 7)}`);
  out = key in current ? out.replace(`${key}=${current[key]}`, `${key}=${sha}`) : out + `${key}=${sha}\n`;
  changed = true;
}
if (changed) writeFileSync('.env', out);
if (process.argv.includes('--build')) execSync('docker compose build', {stdio: 'inherit'});
else if (changed) console.log('\nVersioni aggiornate in .env. Applica con: docker compose build && docker compose up -d');
