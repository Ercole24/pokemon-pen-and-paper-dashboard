// Avvio facile (icona creata dall'installer): una finestra al posto del terminale.
// 1. avvia un piccolo server locale (solo 127.0.0.1) e apre scripts/launcher.html come finestra "app"
//    di un browser Chromium (Edge, Chrome, Brave…: niente barra degli indirizzi); senza Chromium, una scheda normale;
// 2. nella finestra si scelgono lingua, browser per la dashboard e spegnimento automatico
//    (salvati in .launcher.json; con "ricorda" parte da solo dopo 3 secondi);
//    All'apertura controlla su GitHub se c'è una versione nuova (release vX.Y.Z): "Aggiorna" scarica il codice della release,
//    lo mette al posto di quello installato (campagne in data/ e scelte restano) e riapre il launcher;
// 3. Gioca: controlla che immagini e audio di Showdown siano raggiungibili (se no si può scrivere un altro indirizzo),
//    ferma i container già accesi, docker compose up -d con le scelte (senza toccare .env), poi aspetta che
//    entrambi i container siano in esecuzione, rispondano e la dashboard sia collegata a Showdown;
// 4. solo allora apre la dashboard nel browser scelto, chiude la finestra ed esce.
// Uso: node scripts/launch.mjs
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
process.chdir(ROOT);
const SETTINGS_FILE = '.launcher.json';
const DASHBOARD = 'http://localhost:3000';
const REPO = 'Ercole24/pokemon-pen-and-paper-dashboard';
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
/** Da dove dashboard e client di Showdown caricano sprite, effetti e audio (cambiabile nella finestra se non risponde). */
const DEFAULT_ASSETS = 'https://play.pokemonshowdown.com/';

// --- browser installati ---

/** Divide una riga di comando rispettando le virgolette. */
const splitArgs = line => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);

/** Browser installati: [{name, cmd}] con "%u" al posto dell'indirizzo. Il primo è sempre quello di sistema. */
function findBrowsers() {
  const system = {win32: ['explorer', '%u'], darwin: ['open', '%u']}[process.platform] || ['xdg-open', '%u'];
  const list = [{name: 'Browser predefinito del sistema', cmd: system}];
  if (process.platform === 'linux') {
    // file .desktop con categoria WebBrowser (pacchetti, flatpak, snap)
    const home = os.homedir();
    const dirs = ['/usr/share/applications', '/usr/local/share/applications', `${home}/.local/share/applications`,
      '/var/lib/flatpak/exports/share/applications', `${home}/.local/share/flatpak/exports/share/applications`, '/var/lib/snapd/desktop/applications'];
    for (const dir of dirs.filter(existsSync)) {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.desktop'))) {
        const entry = readFileSync(path.join(dir, file), 'utf8').split(/^\[(?!Desktop Entry\])/m)[0]; // solo [Desktop Entry]
        const get = key => entry.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1].trim();
        if (!/(^|;)WebBrowser(;|$)/.test(get('Categories') || '') || get('NoDisplay') === 'true' || get('Hidden') === 'true' || !get('Exec')) continue;
        const cmd = splitArgs(get('Exec')).filter(a => !/^@@\w?$/.test(a)) // segnaposto di flatpak
          .map(a => /^%[uUfF]$/.test(a) ? '%u' : a).filter(a => !/^%\w$/.test(a));
        if (!cmd.includes('%u')) cmd.push('%u');
        list.push({name: get('Name'), cmd});
      }
    }
  } else if (process.platform === 'win32') {
    // browser registrati in Windows (HKLM e HKCU\SOFTWARE\Clients\StartMenuInternet)
    const reg = args => { try { return execFileSync('reg', ['query', ...args], {encoding: 'utf8'}); } catch { return ''; } };
    const value = out => out.match(/REG_(?:EXPAND_)?SZ\s+(.*)/)?.[1].trim();
    for (const hive of ['HKLM', 'HKCU']) {
      const root = `${hive}\\SOFTWARE\\Clients\\StartMenuInternet`;
      for (const key of reg([root]).split(/\r?\n/).filter(l => l.startsWith(root + '\\'))) {
        const exe = value(reg([`${key}\\shell\\open\\command`, '/ve']));
        if (exe) list.push({name: value(reg([key, '/ve'])) || path.basename(key), cmd: [splitArgs(exe)[0], '%u']});
      }
    }
  } else if (process.platform === 'darwin') {
    const known = ['Safari', 'Google Chrome', 'Firefox', 'Microsoft Edge', 'Brave Browser', 'Opera', 'Vivaldi', 'Arc', 'Chromium'];
    for (const dir of ['/Applications', `${os.homedir()}/Applications`].filter(existsSync)) {
      for (const app of readdirSync(dir)) {
        const name = app.replace(/\.app$/, '');
        if (known.includes(name)) list.push({name, cmd: ['open', '-a', name, '%u']});
      }
    }
  }
  return list.filter((b, i) => list.findIndex(o => o.name === b.name) === i); // niente doppioni (es. HKLM + HKCU)
}

/** Avvia un comando di browser staccato dallo script. */
function run([cmd, ...args]) {
  spawn(cmd, args, {detached: true, stdio: 'ignore'}).on('error', () => {}).unref();
}
const openBrowser = (browser, url) => run(browser.cmd.map(a => a === '%u' ? url : a));
const isChromium = b => /chrom|brave|edge|vivaldi|opera/i.test(b.cmd.join(' ') + b.name);

/** Apre la finestra del launcher: modalità "app" di un browser Chromium (preferito quello scelto), altrimenti una scheda. */
function openWindow(browsers, chosen, url) {
  const b = [chosen, ...browsers].find(x => x && isChromium(x));
  if (!b) return openBrowser(browsers[0], url);
  if (b.cmd[0] === 'open') return run(['open', '-na', b.cmd[2], '--args', `--app=${url}`, '--window-size=560,680']);
  run(b.cmd.flatMap(a => a === '%u' ? [`--app=${url}`, '--window-size=560,680'] : [a]));
}

// --- impostazioni ---

const DEFAULTS = {lang: 'en', autoStop: 2, browser: null, remember: false, assets: DEFAULT_ASSETS};
const load = () => { try { return {...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))}; } catch { return {...DEFAULTS}; } };
const save = s => writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2) + '\n');

// --- immagini e audio di Showdown ---

/** Indirizzo http(s) normalizzato (con / finale), o null se non valido. */
function assetsUrl(text) {
  try { const u = new URL(String(text).trim()); return /^https?:$/.test(u.protocol) ? u.href.replace(/\/?$/, '/') : null; } catch { return null; }
}
/** Un file preso da quell'indirizzo risponde: uno sprite e i dati che servono a costruire il client di Showdown. */
async function assetsReachable(base) {
  const get = async file => { try { return (await fetch(base + file, {signal: AbortSignal.timeout(10000)})).ok; } catch { return false; } };
  return (await Promise.all(['sprites/gen5/pikachu.png', 'data/pokedex-mini.js'].map(get))).every(Boolean);
}

// --- aggiornamenti (release su GitHub con tag vX.Y.Z = version di package.json) ---

const github = url => fetch(url, {headers: {'user-agent': 'pnp-dashboard', accept: 'application/vnd.github+json'}, signal: AbortSignal.timeout(15000)});
/** Ultima release: {version, notes, url, archive}. */
async function latestRelease() {
  const r = await github(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!r.ok) throw new Error(`GitHub: HTTP ${r.status}`);
  const j = await r.json();
  return {version: j.tag_name.replace(/^v/, ''), notes: j.body || '', url: j.html_url, archive: j.tarball_url};
}
/** a è più recente di b (1.10.0 > 1.9.2). */
const newer = (a, b) => {
  const [x, y] = [a, b].map(v => v.split('.').map(n => parseInt(n) || 0));
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
/** Da tenere aggiornando: campagne, scelte del launcher, disinstallatore di Windows (unins000.exe…). */
const KEEP = f => f === 'data' || f === SETTINGS_FILE || f.startsWith('unins');

let updating = false;
/** Scarica la release, la mette al posto del codice installato e riapre il launcher (nuovo codice, nuova finestra). */
async function update() {
  updating = true;
  try {
    if (existsSync('.git')) throw new Error('Questa è una copia di sviluppo (git): aggiorna con git pull.');
    const rel = await latestRelease();
    emit({update: 'download'});
    const res = await github(rel.archive);
    if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pnp-dashboard-'));
    try {
      writeFileSync(path.join(tmp, 'src.tar.gz'), Buffer.from(await res.arrayBuffer()));
      mkdirSync(path.join(tmp, 'src'));
      // tar c'è su Linux, Mac e Windows 10+; percorsi relativi (su Windows "C:" confonderebbe tar)
      const x = spawnSync('tar', ['-xzf', 'src.tar.gz', '-C', 'src', '--strip-components', '1'], {cwd: tmp, encoding: 'utf8'});
      if (x.status !== 0 || !existsSync(path.join(tmp, 'src/scripts/launch.mjs'))) throw new Error(`tar: ${(x.stderr || x.error?.message || '').trim()}`);
      emit({update: 'install'});
      // controllato tutto: ora sostituisce il codice (come l'installer)
      for (const f of readdirSync(ROOT).filter(f => !KEEP(f))) rmSync(f, {recursive: true, force: true});
      cpSync(path.join(tmp, 'src'), ROOT, {recursive: true});
    } finally {
      rmSync(tmp, {recursive: true, force: true});
    }
    spawn(process.execPath, ['scripts/launch.mjs'], {cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true}).unref();
    emit({updated: rel.version});
    setTimeout(() => process.exit(0), 1000);
  } catch (e) {
    emit({updateError: e.message});
    updating = false;
  }
}

// --- avvio dei container, con i passi mostrati nella finestra ---

let clients = [];
/** Manda un evento alla finestra (Server-Sent Events). */
const emit = data => { for (const c of clients) c.write(`data: ${JSON.stringify(data)}\n\n`); };
const step = (id, state, text) => emit({step: id, state, text});
const wait = ms => new Promise(r => setTimeout(r, ms));

/** docker con l'output inoltrato alla finestra (ultima riga); rifiuta se fallisce. */
function docker(args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', args, {env: {...process.env, ...env}});
    const log = d => { const line = String(d).trim().split(/\r?\n|\r/).pop(); if (line) emit({log: line}); };
    p.stdout.on('data', log);
    p.stderr.on('data', log);
    p.on('error', reject);
    p.on('close', code => code ? reject(Object.assign(new Error('docker {args} non riuscito'), {vars: {args: args.join(' ')}})) : resolve());
  });
}

/** Container di questo progetto in esecuzione: {servizio: true}. */
function runningServices() {
  const out = spawnSync('docker', ['compose', 'ps', '--format', 'json'], {encoding: 'utf8'}).stdout || '';
  const list = out.trim().startsWith('[') ? JSON.parse(out) : out.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  return Object.fromEntries(list.filter(c => c.State === 'running').map(c => [c.Service, true]));
}
const ok = async (url, check = () => true) => { try { const r = await fetch(url); return r.ok && check(await r.text()); } catch { return false; } };

let starting = false;
async function start(s, browser, skipAssets) {
  starting = true;
  try {
    step('assets', 'wait', s.assets);
    if (!skipAssets && !await assetsReachable(s.assets)) {
      throw Object.assign(new Error('Immagini e audio non raggiungibili da {url}. Il sito potrebbe essere giù o spostato: scrivi un altro indirizzo o riprova più tardi.'), {vars: {url: s.assets}, assets: true});
    }
    step('assets', 'ok', s.assets);

    step('docker', 'wait');
    if (spawnSync('docker', ['compose', 'version'], {stdio: 'ignore'}).status !== 0) throw new Error('Docker (con Compose) non trovato: installa Docker Desktop da docker.com e riprova.');
    if (spawnSync('docker', ['info'], {stdio: 'ignore'}).status !== 0) throw new Error('Docker è installato ma non è avviato: apri Docker Desktop (o avvia il servizio docker) e riprova.');
    step('docker', 'ok');

    step('stop', 'wait');
    if (Object.keys(runningServices()).length) await docker(['compose', 'down']);
    step('stop', 'ok');

    step('up', 'wait', 'la prima volta costruisce le immagini: qualche minuto');
    await docker(['compose', 'up', '-d', '--build'], {PNP_AUTO_STOP: String(s.autoStop), PNP_ASSETS: s.assets});
    step('up', 'ok');

    // pronti davvero: entrambi i container in esecuzione, server che rispondono, dashboard collegata a Showdown
    step('showdown', 'wait'); step('app', 'wait'); step('link', 'wait');
    const done = {};
    for (let i = 0; Object.keys(done).length < 3; i++) {
      if (i > 180) throw new Error('I container non sono pronti dopo 3 minuti. Log: docker compose logs');
      const up = runningServices();
      if (!up.showdown || !up.app) {
        if (i > 10) throw Object.assign(new Error('Il container {name} si è fermato. Log: docker compose logs'), {vars: {name: !up.showdown ? 'showdown' : 'app'}});
      }
      if (!done.showdown && up.showdown && await ok('http://localhost:8000/')) { done.showdown = 1; step('showdown', 'ok'); }
      if (!done.app && up.app && await ok(DASHBOARD)) { done.app = 1; step('app', 'ok'); }
      if (done.app && !done.link && await ok(`${DASHBOARD}/api/showdown/status`, t => JSON.parse(t).connected)) { done.link = 1; step('link', 'ok'); }
      await wait(1000);
    }

    openBrowser(browser, DASHBOARD);
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    emit({done: true, browser: browser.name, ips});
    setTimeout(() => process.exit(0), 8000); // la finestra si chiude da sola; se resta aperta (scheda normale) esce comunque
  } catch (e) {
    emit({error: e.message, vars: e.vars, assets: e.assets}); // la finestra traduce il testo (chiave italiana + segnaposto)
    starting = false;
  }
}

// --- server della finestra ---

const STATIC = {'/style.css': 'web/src/style.css', '/': 'scripts/launcher.html'};
const TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg'};
const browsers = findBrowsers();
let origin;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  // font della dashboard: solo nomi di file semplici dentro web/public/fonts
  const m = url.pathname.match(/^\/(fonts)\/([\w.-]+)$/);
  const file = STATIC[url.pathname] || (m && `web/public/${m[1]}/${m[2]}`);
  if (req.method === 'GET' && file && existsSync(file)) {
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    return res.end(readFileSync(file));
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    res.writeHead(200, {'content-type': 'application/json'});
    return res.end(JSON.stringify({settings: load(), browsers: browsers.map(b => b.name), version: VERSION, defaultAssets: DEFAULT_ASSETS,
      repo: REPO, system: `${os.type()} ${os.release()} (${os.arch()})`}));
  }
  if (req.method === 'GET' && url.pathname === '/api/update') {
    // {current, latest, notes, url, available} o {current, error} (senza rete, repo privata, nessuna release…)
    const info = await latestRelease().then(r => ({...r, available: newer(r.version, VERSION)}), e => ({error: e.message}));
    res.writeHead(200, {'content-type': 'application/json'});
    return res.end(JSON.stringify({current: VERSION, ...info}));
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache'});
    clients.push(res);
    // finestra chiusa prima di avviare: esce
    req.on('close', () => { clients = clients.filter(c => c !== res); setTimeout(() => { if (!clients.length && !starting) process.exit(0); }, 3000); });
    return;
  }
  // azioni: solo dalla finestra stessa (un sito qualunque non può comandare il launcher)
  if (req.method === 'POST' && req.headers.origin === origin) {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : {};
    if (url.pathname === '/api/start' && !starting && !updating) {
      const browser = browsers.find(b => b.name === data.browser) || browsers[0];
      const s = {autoStop: Math.max(0, +data.autoStop || 0), browser, remember: !!data.remember, assets: assetsUrl(data.assets) || load().assets};
      save({...load(), ...s});
      start(s, browser, !!data.skipAssets);
    }
    if (url.pathname === '/api/update' && !starting && !updating) update();
    if (url.pathname === '/api/lang') save({...load(), lang: data.lang === 'it' ? 'it' : 'en'});
    if (url.pathname === '/api/quit') setTimeout(() => process.exit(0), 100);
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(404);
  res.end();
});

server.listen(0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Launcher: ${origin}`);
  openWindow(browsers, load().browser, origin);
});
