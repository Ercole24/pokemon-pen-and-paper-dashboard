// Bot "Arbitro" collegato al server Showdown locale via WebSocket.
// - Crea le lotte con i comandi del nostro plugin (/pnpbattle, /pnpend, /pnprename, /pnpusers: vedi showdown-plugin/pnp.ts),
//   firmati con il segreto condiviso PNP_SECRET.
// - Osserva le stanze di lotta e ne ricava uno stato semplice (Pokémon in campo, PS, stato, esausti, vincitore)
//   che la dashboard mostra al master e usa per la cattura.
// Protocollo di Showdown: messaggi di testo; ">roomid" sulla prima riga indica la stanza, poi righe "|tipo|dati|...".
import {EventEmitter} from 'node:events';
import {fail} from './i18n.ts';

/** Indirizzo del WebSocket di Showdown (in Docker: ws://showdown:8000/...), nome del bot e segreto. */
const URL = process.env.SHOWDOWN_WS || 'ws://localhost:8000/showdown/websocket';
const BOT_NAME = process.env.PNP_BOT || 'Arbitro';
const SECRET = process.env.PNP_SECRET || '';

/** Il Pokémon in campo di un lato, come lo vede la dashboard (PS in percentuale). */
export type SideMon = {name: string, species: string, level: number, hp: number, status: string, fainted: boolean};
/** Stato di una lotta seguita dal bot. meta = dati della dashboard (campagna, selvatico, Pokémon usati). */
export type BattleState = {
  roomid: string, title: string, format: string, auto: boolean, ended: boolean, winner?: string, turn: number,
  players: {p1?: string, p2?: string},
  active: {p1?: SideMon, p2?: SideMon},
  volatiles: {p2: string[]},
  fainted: {p1: string[], p2: string[]},
  log: string[],
  meta?: any,
  /** PS (in %), stato ed esausto di ogni Pokémon della squadra (p1) visto in campo, per nome; hpSaved = già salvati a fine lotta */
  p1mons: Record<string, {hp: number, status: string, fainted: boolean}>,
  hpSaved?: boolean,
};

/** Eventi verso index.ts: 'status' (collegato/scollegato) e 'battle' (stato aggiornato), girati ai browser. */
export const events = new EventEmitter();
/** Lotte conosciute, per roomid. */
export const battles = new Map<string, BattleState>();

/** Connessione, stato "bot loggato" e richieste in attesa di risposta dal plugin (in ordine di invio). */
let ws: WebSocket | undefined;
let ready = false;
const pending: {resolve: (roomid: string) => void, reject: (e: Error) => void}[] = [];

/** Stato della connessione per l'interfaccia. */
export function status() {
  return {connected: ready, bot: BOT_NAME};
}

/** Invia una riga a Showdown; errore se la connessione non è aperta. */
function send(line: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) throw fail(503, 'Showdown non collegato');
  ws.send(line);
}

/** Apre la connessione e la riapre da sola ogni 2 s se cade (es. Showdown riavviato). */
export function connect() {
  ws = new WebSocket(URL);
  ws.onmessage = e => { for (const chunk of String(e.data).split('\n>').map((c, i) => i ? '>' + c : c)) onChunk(chunk); };
  ws.onclose = () => {
    ready = false;
    events.emit('status', status());
    // se Showdown si riavvia le stanze spariscono: chiudi le lotte aperte
    for (const id of battles.keys()) markEnded(id);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => {};
}

/** Gestisce un blocco di messaggi: login del bot, risposte del plugin, righe delle stanze di lotta. */
function onChunk(chunk: string) {
  let roomid = '';
  let lines = chunk.split('\n');
  if (lines[0].startsWith('>')) { roomid = lines[0].slice(1).trim(); lines = lines.slice(1); }
  for (const line of lines) {
    if (line.startsWith('|challstr|')) send(`|/trn ${BOT_NAME},0,`);
    else if (line.startsWith('|updateuser|') && line.includes(`${BOT_NAME}|1`)) { ready = true; events.emit('status', status()); }
    else if (line.startsWith('|pnpbattle|') || line.startsWith('|pnprenamed|')) pending.shift()?.resolve(line.slice(line.indexOf('|', 1) + 1));
    else if (line.startsWith('|pnperror|')) pending.shift()?.reject(pluginError(line.slice(10)));
    else if (line.startsWith('|pnpusers|')) usersWaiters.splice(0).forEach(r => r(JSON.parse(line.slice(10))));
    else if (roomid.startsWith('battle-') && (line.startsWith('|deinit') || line.startsWith('|noinit'))) markEnded(roomid);
    else if (roomid.startsWith('battle-')) onBattleLine(roomid, line);
  }
  if (roomid && battles.has(roomid)) events.emit('battle', battles.get(roomid));
}

/** Errore del plugin: "testo con {0}|valore" (vedi showdown-plugin/pnp.ts), da tradurre come gli altri. */
function pluginError(msg: string) {
  const [text, arg] = msg.split('|');
  return fail(400, text, {0: arg});
}

/** Legge "p2a: Pidgey", "Pidgey, L5, M", "20/100 par" in un SideMon parziale. */
function parseMon(ident: string, details?: string, condition?: string): Partial<SideMon> {
  const out: Partial<SideMon> = {name: ident.replace(/^p\da: /, '')};
  if (details) {
    const parts = details.split(', ');
    out.species = parts[0];
    out.level = +(parts.find(p => /^L\d+$/.test(p))?.slice(1) || 100);
  }
  if (condition) Object.assign(out, parseCondition(condition));
  return out;
}

/** "20/100 par" -> PS in percentuale e stato; "0 fnt" -> esausto. */
function parseCondition(cond: string) {
  const [hpPart, status = ''] = cond.split(' ');
  if (hpPart === '0' || status === 'fnt') return {hp: 0, status: '', fainted: true};
  const [cur, max] = hpPart.split('/').map(Number);
  return {hp: Math.round((cur / (max || 100)) * 100), status, fainted: false};
}

/** Aggiorna lo stato della lotta riga per riga (cambi, danni, stati, esausti, vittoria) e tiene un breve registro. */
function onBattleLine(roomid: string, line: string) {
  const b = battles.get(roomid);
  if (!b) return;
  const p = line.split('|');
  const side = (s: string) => s?.slice(0, 2) as 'p1' | 'p2';
  // "p1a: Pikachu" o "p1: Pikachu" (fuori dal campo, es. Campana Cura) -> stato salvato per quel nome
  const own = (ident: string, patch: Partial<{hp: number, status: string, fainted: boolean}>) => {
    if (side(ident) !== 'p1') return;
    const name = ident.replace(/^p\d[a-z]?: /, '');
    b.p1mons[name] = {...(b.p1mons[name] || {hp: 100, status: '', fainted: false}), ...patch};
  };
  switch (p[1]) {
  case 'player': if (p[3]) b.players[p[2] as 'p1' | 'p2'] = p[3]; break;
  case 'turn': b.turn = +p[2]; break;
  case 'switch': case 'drag': case 'replace': {
    const s = side(p[2]);
    b.active[s] = {status: '', fainted: false, hp: 100, level: 100, species: '', ...parseMon(p[2], p[3], p[4])} as SideMon;
    if (p[4]) own(p[2], parseCondition(p[4]));
    if (s === 'p2') b.volatiles.p2 = [];
    break;
  }
  case '-damage': case '-heal': case '-sethp': {
    const s = side(p[2]);
    if (b.active[s]) Object.assign(b.active[s]!, parseCondition(p[3]));
    own(p[2], parseCondition(p[3]));
    break;
  }
  case '-status': { const s = side(p[2]); if (b.active[s]) b.active[s]!.status = p[3]; own(p[2], {status: p[3]}); break; }
  case '-curestatus': { const s = side(p[2]); if (b.active[s] && p[2].includes('a: ')) b.active[s]!.status = ''; own(p[2], {status: ''}); break; }
  case '-start': if (side(p[2]) === 'p2') b.volatiles.p2.push(p[3].replace('move: ', '')); break;
  case '-end': if (side(p[2]) === 'p2') b.volatiles.p2 = b.volatiles.p2.filter(v => v !== p[3].replace('move: ', '')); break;
  case 'faint': {
    const s = side(p[2]);
    b.fainted[s].push(p[2].replace(/^p\da: /, ''));
    if (b.active[s]) Object.assign(b.active[s]!, {hp: 0, fainted: true});
    own(p[2], {hp: 0, status: '', fainted: true});
    break;
  }
  case 'win': b.ended = true; b.winner = p[2]; break;
  case 'tie': b.ended = true; break;
  case 'request': if (b.auto && p[2]) autoChoose(roomid, JSON.parse(p[2])); return;
  }
  if (/^\|(move|switch|-damage|-heal|faint|win|turn|-status|cant|-supereffective|-crit|-miss)\|/.test(line)) {
    b.log.push(line);
    if (b.log.length > 60) b.log.shift();
  }
}

/** IA minima per i selvatici: mossa casuale tra quelle usabili, cambio al primo Pokémon disponibile. */
function autoChoose(roomid: string, req: any) {
  if (req.wait) return;
  let choice = 'default';
  if (req.forceSwitch) {
    const idx = req.side.pokemon.findIndex((m: any) => !m.active && !m.condition.endsWith(' fnt'));
    choice = idx >= 0 ? `switch ${idx + 1}` : 'pass';
  } else if (req.active) {
    const usable = req.active[0].moves.map((m: any, i: number) => ({...m, i})).filter((m: any) => !m.disabled && (m.pp ?? 1) > 0);
    choice = usable.length ? `move ${usable[Math.floor(Math.random() * usable.length)].i + 1}` : 'move 1';
  }
  setTimeout(() => send(`${roomid}|/choose ${choice}|${req.rqid}`), 600);
}

/** Manda un comando al plugin e aspetta la risposta (massimo 8 s). */
function request(line: string): Promise<string> {
  if (!ready) return Promise.reject(fail(503, 'Showdown non collegato: il server è avviato?'));
  return new Promise<string>((resolve, reject) => {
    const entry = {resolve, reject};
    pending.push(entry);
    setTimeout(() => {
      const i = pending.indexOf(entry);
      if (i >= 0) { pending.splice(i, 1); reject(fail(504, 'Showdown non risponde')); }
    }, 8000);
    send(line);
  });
}

/** Spegne Showdown (spegnimento automatico: vedi index.ts). */
export function shutdown() {
  if (ready) send('|/pnpshutdown ' + JSON.stringify({secret: SECRET}));
}

/** Rinomina un utente collegato a Showdown (un Guest diventa "Squadra" o "Master") senza password. */
export function renameUser(from: string, to: string) {
  return request('|/pnprename ' + JSON.stringify({secret: SECRET, from, to}));
}

/**
 * Crea una lotta tra p1 (giocatori) e p2 (master) con le squadre in formato "packed".
 * Se p2 manca, combatte il bot (modalità automatica, oggi non usata: il master controlla sempre l'avversario).
 * Il bot entra nella stanza come spettatore per leggere PS e stato.
 */
export async function createBattle(opts: {format: string, p1: string, p2?: string, team1: string, team2: string, title: string, hp1?: {hp: number | null, status: string}[], meta?: any}) {
  if (!ready) throw fail(503, 'Showdown non collegato: il server è avviato?');
  const auto = !opts.p2;
  const roomid = await new Promise<string>((resolve, reject) => {
    const entry = {resolve, reject};
    pending.push(entry);
    setTimeout(() => {
      const i = pending.indexOf(entry);
      if (i >= 0) { pending.splice(i, 1); reject(fail(504, 'Showdown non risponde')); }
    }, 8000);
    send('|/pnpbattle ' + JSON.stringify({
      secret: SECRET, format: opts.format, p1: opts.p1, p2: opts.p2 || BOT_NAME,
      team1: opts.team1, team2: opts.team2, title: opts.title, hp1: opts.hp1,
    }));
  });
  battles.set(roomid, {
    roomid, title: opts.title, format: opts.format, auto, ended: false, turn: 0,
    players: {p1: opts.p1, p2: opts.p2 || BOT_NAME}, active: {}, volatiles: {p2: []}, fainted: {p1: [], p2: []}, log: [], meta: opts.meta, p1mons: {},
  });
  if (!auto) send(`|/join ${roomid}`); // il bot osserva per leggere PS e stato del selvatico
  return roomid;
}

/** Segna una lotta come finita e lo comunica (anche se la stanza è sparita da Showdown). */
function markEnded(roomid: string) {
  const b = battles.get(roomid);
  if (!b || b.ended) return;
  b.ended = true;
  events.emit('battle', b);
}

/** Chiude una lotta facendo ritirare il lato perdente. */
export function endBattle(roomid: string, loser: 'p1' | 'p2' = 'p2') {
  send('|/pnpend ' + JSON.stringify({secret: SECRET, roomid, loser}));
  // se la stanza non esiste più su Showdown non arriverà nessun |win|
  setTimeout(() => markEnded(roomid), 2500);
}

/** Utente collegato a Showdown; guest = nome provvisorio ("Guest 123"). */
export type OnlineUser = {id: string, name: string, guest: boolean};
const usersWaiters: ((list: OnlineUser[]) => void)[] = [];
/** Chi è collegato a Showdown ora (per scegliere chi diventa Squadra o Master); [] dopo 3 s senza risposta. */
export function onlineUsers(): Promise<OnlineUser[]> {
  if (!ready) return Promise.resolve([]);
  return new Promise(resolve => {
    usersWaiters.push(resolve);
    send('|/pnpusers');
    setTimeout(() => resolve([]), 3000);
  });
}
