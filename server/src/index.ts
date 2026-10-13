// Server della dashboard (punto d'ingresso: npx tsx server/src/index.ts).
// - API REST con Fastify sotto /api (JSON in entrata e in uscita).
// - Tempo reale con socket.io: ogni salvataggio viene mandato ai browser della stessa campagna ("stanza" = id campagna),
//   così master e telefoni vedono subito le modifiche.
// - Ponte verso Showdown (showdown.ts) per creare, seguire e chiudere le lotte.
// - File statici: l'interfaccia compilata (web/dist).
// Gli errori lanciati nelle route diventano risposte JSON {error, message} con il codice statusCode (default 500),
// tradotti nella lingua chiesta dall'interfaccia (header x-lang, vedi i18n.ts).
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import {Server} from 'socket.io';
import {existsSync, readFileSync} from 'node:fs';
import * as db from './db.ts';
import * as dex from './dex.ts';
import * as sd from './showdown.ts';
import {catchResult, classTypeBonus, type CatchInput} from './rules.ts';
import {CLASSES} from './classes.ts';
import {methodLabel, methodOf} from './methods.ts';
import {fail, translate, type Lang} from './i18n.ts';
import {trusted} from './trusted.ts';
import {evoCheck, formatBag, isItem, itemEffect, parseBag} from './items.ts';
import {pickDoor, reachable, type DoorGroup} from './field.ts';

/**
 * Porta (3000 di default), server Fastify (limite 60 MB: le mappe caricate a mano viaggiano come immagini dentro il JSON)
 * e socket.io agganciato allo stesso server HTTP.
 */
const PORT = +(process.env.PORT || 3000);
const app = Fastify({bodyLimit: 60 * 1024 * 1024});
const io = new Server(app.server, {allowRequest: (req, cb) => cb(null, trusted(req.headers))});
app.addHook('onRequest', async (req, reply) => { if (!trusted(req.headers)) return reply.code(403).send({error: 'Forbidden', message: 'Forbidden'}); });
/** Lingua dell'interfaccia che fa la richiesta (header x-lang; senza, inglese). */
const langOf = (req: {headers: Record<string, unknown>}): Lang => req.headers['x-lang'] === 'it' ? 'it' : 'en';
/** Ogni errore diventa {error, message}: l'interfaccia mostra il messaggio all'utente, nella sua lingua. */
app.setErrorHandler((err: any, req, reply) => {
  const message = translate(langOf(req), err.message, err.vars);
  reply.code(err.statusCode || 500).send({error: message, message});
});

/** Tipi di documento ammessi nelle API generiche. */
const KINDS = new Set(['trainer', 'mon', 'zone', 'map', 'tileset', 'npcteam', 'log', 'note', 'track']);
/** Campagna per id, o errore 404. */
const campaign = (cid: string) => {
  const c = db.get(cid);
  if (!c) throw fail(404, 'Campagna inesistente');
  return c;
};
/**
 * Mappa senza i livelli di tile (il grosso dei dati): l'elenco e gli aggiornamenti in tempo reale viaggiano così,
 * la mappa completa si scarica solo quando la si apre (GET /api/c/<id>/map/<mappa>). layersRev cambia quando cambiano i livelli.
 */
const liteMap = ({layers: _, ...m}: db.Doc) => m;
const zoneKey = (n: string) => n.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
/**
 * Zona incontri di una mappa: quella dipinta su più caselle, altrimenti la zona con lo stesso nome della mappa
 * (solo esterni: gli interni, con « · », non ne hanno). Serve a preselezionarla in Lotta quando cambia la mappa al tavolo.
 */
function mapZone(cid: string, mapId?: string): string | undefined {
  const map = mapId && db.get(mapId);
  if (!map) return;
  const count = new Map<number, number>();
  for (const v of map.layers?.find((l: any) => l.type === 'zone')?.data || []) if (v) count.set(v, (count.get(v) || 0) + 1);
  const top = [...count].sort((a, b) => b[1] - a[1])[0];
  if (top) return map.zoneRefs?.[top[0] - 1];
  if (!map.name.includes(' · ')) return db.list(cid, 'zone').find((z: any) => zoneKey(z.name) === zoneKey(map.name))?.id;
}
/** Campagna con la nuova mappa al tavolo: la zona attiva segue la mappa (se la mappa non ne ha, resta quella di prima). */
const withMap = (c: any, mapId?: string) => ({...c, activeMap: mapId, activeZone: mapZone(c.id, mapId) || c.activeZone});
/** Avvisa i browser della campagna che un documento è cambiato. */
const emitDoc = (cid: string, kind: string, doc: db.Doc) => io.to(cid).emit('doc', {kind, doc: kind === 'map' ? liteMap(doc) : doc});
/** Salva nel database e avvisa i browser: è il modo standard di scrivere. */
const save = (cid: string, kind: string, doc: any) => {
  if (kind === 'map' && doc.id) {
    const old = db.get(doc.id);
    // salvataggio senza livelli (da una mappa "leggera"): tiene quelli salvati
    if (old && !doc.layers) doc = {...doc, layers: old.layers, layersRev: old.layersRev};
    else if (old && JSON.stringify(old.layers) !== JSON.stringify(doc.layers)) doc = {...doc, layersRev: Date.now()};
  }
  if (kind === 'mon' && doc.id) {
    // ricorda il livello prima dell'ultima crescita: la scheda mostra di quanto sono salite le statistiche
    const old = db.get(doc.id);
    if (old && doc.level > old.level) doc = {...doc, prevLevel: old.level};
  }
  const d = db.put(cid, kind, doc); emitDoc(cid, kind, d); return d;
};
/** Aggiunge una riga al diario della campagna (lotte, catture…). */
const log = (cid: string, text: string, type = 'info') => save(cid, 'log', {t: Date.now(), text, type});

/** Indirizzo da cui l'interfaccia carica sprite e audio (scelto nel launcher, PNP_ASSETS) e versione installata. */
const CONFIG = {
  assets: process.env.PNP_ASSETS || 'https://play.pokemonshowdown.com/',
  version: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
};
/** Caricato da web/index.html prima dell'interfaccia: window.PNP = {assets, version}. */
app.get('/api/config.js', async (_req, reply) => reply.type('text/javascript').send(`window.PNP = ${JSON.stringify(CONFIG)};`));

// --- campagne ---
/** Elenco delle campagne. */
app.get('/api/campaigns', async () => db.list('_', 'campaign'));
/** Crea o aggiorna una campagna; ai campi mancanti si danno i valori di default. */
/** I contatori dei livelli si cambiano solo con /levels e /levelup: un salvataggio normale tiene quelli già salvati. */
const keepLevelCounters = (body: any) => {
  const old = body?.id && db.get(body.id);
  return {...body, levelsGiven: old?.levelsGiven, levelsSpent: old?.levelsSpent};
};
app.put('/api/campaigns', async req => {
  let body: any = keepLevelCounters(req.body);
  if (body.id && body.activeMap && body.activeMap !== db.get(body.id)?.activeMap) body = withMap(body, body.activeMap);
  const c = db.put('_', 'campaign', {gen: 9, region: '', shinyRate: 4096, hiddenAbilityChance: 0.05,
    teamUser: langOf(req) === 'it' ? 'squadra' : 'team', gmUser: 'master', ...body});
  io.emit('campaign', c);
  return c;
});
/** Elimina una campagna con tutti i suoi dati. */
app.delete('/api/campaigns/:cid', async req => {
  db.removeCampaign((req.params as any).cid);
  return {ok: true};
});

// --- documenti generici della campagna ---
/** API generiche: elenco dei documenti di un tipo (es. GET /api/c/<id>/zone). */
app.get('/api/c/:cid/:kind', async req => {
  const {cid, kind} = req.params as any;
  if (!KINDS.has(kind)) throw fail(400, 'Tipo sconosciuto');
  const docs = db.list(cid, kind);
  return kind === 'map' ? docs.map(liteMap) : docs;
});
/** Un documento completo (le mappe con i livelli). */
app.get('/api/c/:cid/:kind/:id', async req => {
  const d = db.get((req.params as any).id);
  if (!d) throw fail(404, 'Non trovato');
  return d;
});
/** Crea o aggiorna un documento (con id = aggiorna, senza = crea). */
app.put('/api/c/:cid/:kind', async req => {
  const {cid, kind} = req.params as any;
  campaign(cid);
  if (!KINDS.has(kind)) throw fail(400, 'Tipo sconosciuto');
  return save(cid, kind, kind === 'trainer' ? keepLevelCounters(req.body) : req.body);
});
/** Cancella un documento e avvisa i browser. */
app.delete('/api/c/:cid/:kind/:id', async req => {
  const {cid, kind, id} = req.params as any;
  db.remove(id);
  io.to(cid).emit('del', {kind, id});
  return {ok: true};
});
/** Scrive una riga nel diario. */
app.post('/api/c/:cid/log', async req => log((req.params as any).cid, (req.body as any).text, (req.body as any).type));

// --- livelli distribuiti dai giocatori ---
/**
 * Il master dà livelli (levelsGiven), i giocatori li spendono sui Pokémon (levelsSpent): mai più spesi che dati.
 * Squadra condivisa = un'unica scorta nella campagna; squadre personali = una per Allenatore.
 */
const poolOwner = (c: db.Doc, trainerId?: string) => {
  if (c.teamMode !== 'own') return {doc: c, kind: 'campaign'};
  const t = trainerId && db.get(trainerId);
  if (!t) throw fail(400, 'Il Pokémon non ha un Allenatore: assegnalo prima');
  return {doc: t, kind: 'trainer'};
};
const savePool = (cid: string, o: {doc: db.Doc, kind: string}) => {
  if (o.kind === 'campaign') io.emit('campaign', db.put('_', 'campaign', o.doc));
  else save(cid, 'trainer', o.doc);
};
/** Master: aggiunge (o toglie, se non ancora spesi) livelli da distribuire. */
app.post('/api/c/:cid/levels', async req => {
  const {cid} = req.params as any;
  const {trainerId, n} = req.body as {trainerId?: string, n: number};
  const o = poolOwner(campaign(cid), trainerId);
  const given = (o.doc.levelsGiven || 0) + Math.trunc(n), spent = o.doc.levelsSpent || 0;
  if (given < spent) throw fail(400, 'Non puoi togliere livelli già spesi');
  o.doc = {...o.doc, levelsGiven: given, levelsSpent: spent};
  savePool(cid, o);
  const tr = (s: string, vars?: Record<string, unknown>) => translate(langOf(req), s, vars);
  const what = tr(n > 0 ? 'Il Master dà {n} livelli da distribuire' : 'Il Master toglie {n} livelli da distribuire', {n: Math.abs(n)});
  log(cid, `${what}${o.kind === 'trainer' ? tr(' a {name}', {name: o.doc.name}) : ''} ${tr('(disponibili: {n}).', {n: given - spent})}`);
  return o.doc;
});
/** Giocatore: +1 livello a un suo Pokémon, solo se nella scorta ne resta uno. Risponde con mosse nuove ed evoluzioni possibili. */
app.post('/api/c/:cid/levelup', async req => {
  const {cid} = req.params as any;
  const {monId, who} = req.body as {monId: string, who?: string};
  const c = campaign(cid);
  const mon = db.get(monId);
  if (!mon) throw fail(404, 'Pokémon non trovato');
  if (mon.level >= 100) throw fail(400, 'È già al livello 100');
  const o = poolOwner(c, mon.owner);
  const given = o.doc.levelsGiven || 0, spent = o.doc.levelsSpent || 0;
  if (spent >= given) throw fail(400, 'Non ci sono livelli da distribuire: li dà il Master');
  o.doc = {...o.doc, levelsSpent: spent + 1};
  savePool(cid, o);
  save(cid, 'mon', {...mon, level: mon.level + 1});
  log(cid, translate(langOf(req), '{who}: {name} sale al LV {level} (livelli rimasti: {left}).',
    {who: who || translate(langOf(req), 'Un giocatore'), name: mon.nickname || mon.species, level: mon.level + 1, left: given - spent - 1}), 'catch');
  return dex.levelUpInfo(c.gen, mon.species, mon.level, mon.level + 1);
});

/**
 * Evoluzione (giocatori e Master): solo se ha i requisiti (evoCheck in items.ts). Una pietra si toglie dallo zaino
 * dell'Allenatore che la possiede (prima il proprietario del Pokémon); scambio e amicizia può deciderli solo il Master (gm).
 * L'abilità resta nello stesso slot (prima, seconda o nascosta).
 */
app.post('/api/c/:cid/evolve', async req => {
  const {cid} = req.params as any;
  // level: il Master può aver alzato il livello nell'editor senza ancora salvare
  const {monId, to, who, gm, level} = req.body as {monId: string, to: string, who?: string, gm?: boolean, level?: number};
  const c = campaign(cid);
  const mon = db.get(monId);
  const sp = mon && dex.species(c.gen, mon.species), ev = dex.species(c.gen, to);
  if (!mon || !sp || !ev || !sp.evos.includes(ev.name)) throw fail(400, 'Evoluzione non valida');
  const lang = langOf(req), tr = (s: string, vars?: Record<string, unknown>) => translate(lang, s, vars);
  const trainers = db.list(cid, 'trainer').sort((a, b) => +(b.id === mon.owner) - +(a.id === mon.owner));
  const chk = evoCheck(ev, gm && level ? level : mon.level, trainers.map(t => t.bag || ''), lang);
  if (!chk.ok && !(gm && chk.gmOnly)) throw fail(400, 'Non può ancora evolversi in {name}: {why}', {name: ev.name, why: chk.why});
  let used = '';
  if (chk.item) {
    const t = trainers.find(x => parseBag(x.bag).some(([name, n]) => n > 0 && isItem(name, chk.item!)))!;
    const items = parseBag(t.bag), i = items.findIndex(([name, n]) => n > 0 && isItem(name, chk.item!));
    used = tr(' usando {item} di {trainer}', {item: items[i][0], trainer: t.name});
    save(cid, 'trainer', {...t, bag: formatBag(items.map((it, j) => j === i ? [it[0], it[1] - 1] : it))});
  }
  const slot = Object.keys(sp.abilities).find(k => (sp.abilities as any)[k] === mon.ability) || '0';
  const ability = (ev.abilities as any)[slot] || ev.abilities[0];
  const saved = save(cid, 'mon', {...mon, species: ev.name, ability});
  log(cid, tr('{who}: {name} si evolve in {to}{used}!', {who: who || tr(gm ? 'Il Master' : 'Un giocatore'), name: mon.nickname || mon.species, to: ev.name, used}), 'catch');
  return saved;
});

// --- dati Pokémon ---
/** Pokédex della generazione. */
app.get('/api/dex/:gen/species', async req => dex.speciesList(+(req.params as any).gen));
/** Mosse della generazione. */
app.get('/api/dex/:gen/moves', async req => dex.moveList(+(req.params as any).gen));
/** Nature con il nome italiano. */
app.get('/api/dex/natures', async () => dex.NATURES_IT);
/** Tabella dei tipi della generazione (per il calcolatore dei tipi difensivi). */
app.get('/api/dex/:gen/types', async req => dex.typeChart(+(req.params as any).gen));
/** Classi da Allenatore del libretto. */
app.get('/api/dex/classes', async () => CLASSES);
/** Mosse di una specie: per livello e tutte quelle che può imparare. */
app.get('/api/dex/:gen/learnset/:species', async req => {
  const {gen, species} = req.params as any;
  return {levelUp: dex.levelUpMoves(+gen, species), all: dex.learnableMoves(+gen, species)};
});
/** Genera un Pokémon (sesso, natura, IV, abilità, mosse) secondo le regole della generazione e della campagna. */
app.post('/api/dex/:gen/generate', async req => {
  const {gen} = req.params as any;
  const {species, level, cid} = req.body as any;
  const c = cid ? campaign(cid) : {gen: +gen};
  return dex.generateMon({...c, gen: +gen} as any, species, level);
});
/** Cosa succede salendo di livello: nuove mosse ed evoluzioni possibili. */
app.post('/api/dex/:gen/levelup', async req => {
  const {species, from, to} = req.body as any;
  return dex.levelUpInfo(+(req.params as any).gen, species, from, to);
});
/** Squadra in formato testo, da incollare nel teambuilder di Showdown. */
app.post('/api/dex/export', async req => ({text: dex.exportTeam((req.body as any).mons)}));

// --- incontri ---
/**
 * Incontro casuale in una zona: sceglie la specie secondo le probabilità del modo richiesto
 * (erba, surf, amo…), un livello nell'intervallo e genera il Pokémon.
 */
app.post('/api/c/:cid/encounter', async req => {
  const {cid} = req.params as any;
  const c = campaign(cid);
  const zone = db.get((req.body as any).zoneId);
  const all = (zone?.entries || []).filter((e: any) => e.species && e.rate > 0);
  // metodo richiesto (erba, surf, amo…); senza metodo si usa l'erba se c'è
  const wanted = (req.body as any).method || (all.some((e: any) => methodOf(e) === 'walk') ? 'walk' : methodOf(all[0] || {}));
  const entries = all.filter((e: any) => methodOf(e) === wanted);
  if (!entries.length) throw fail(400, 'In questa zona non ci sono Pokémon per: {method}', {method: translate(langOf(req), methodLabel(wanted))});
  let r = Math.random() * entries.reduce((a: number, e: any) => a + e.rate, 0);
  const entry = entries.find((e: any) => (r -= e.rate) < 0) || entries.at(-1);
  const lo = Math.min(entry.minLevel, entry.maxLevel), hi = Math.max(entry.minLevel, entry.maxLevel);
  const level = lo + Math.floor(Math.random() * (hi - lo + 1));
  return {zone: zone!.name, method: wanted, mon: dex.generateMon(c as any, entry.species, level)};
});

// --- lotte ---
/** Il bot è collegato a Showdown? */
app.get('/api/showdown/status', async () => sd.status());
/** Lotte in corso o finite (finché non vengono rimosse). */
app.get('/api/battles', async () => [...sd.battles.values()]);
/** Chi è collegato a Showdown ora. */
app.get('/api/showdown/users', async () => sd.onlineUsers());
/** Dà un nome (Squadra/Master) a un Guest collegato a Showdown. */
app.post('/api/showdown/rename', async req => {
  const {from, to} = req.body as {from: string, to: string};
  return {name: await sd.renameUser(from, to)};
});
/**
 * Crea una lotta su Showdown: Pokémon della squadra contro selvatico o Squadra PNG.
 * L'avversario lo controlla sempre il master; il formato è gen<N>customgame (regole della generazione, nessun limite di squadra).
 */
app.post('/api/c/:cid/battle', async req => {
  const {cid} = req.params as any;
  const c = campaign(cid);
  const body = req.body as {playerMonIds: string[], opponent: dex.Mon[], kind: 'wild' | 'trainer', title?: string, gmControls?: boolean, teamUser?: string, gmUser?: string, npcTeamId?: string, rotate?: boolean};
  const chosen = body.playerMonIds.map(id => db.get(id)).filter(Boolean) as any[];
  if (!chosen.length) throw fail(400, 'Scegli almeno un Pokémon della squadra');
  // i Pokémon KO restano fuori: non si riprendono da soli tra una lotta e l'altra
  const mine = chosen.filter(m => m.hp !== 0);
  if (!mine.length) throw fail(400, 'I Pokémon scelti sono tutti KO: curali prima (Centro Pokémon o strumenti).');
  if (!body.opponent?.length) throw fail(400, "Manca l'avversario");
  const tr = (s: string, vars?: Record<string, unknown>) => translate(langOf(req), s, vars);
  body.gmControls = true; // l'avversario lo controlla sempre il Master
  const title = body.title || (body.kind === 'wild' ? tr('Selvatico: {species}', {species: body.opponent[0].species}) : tr('Lotta tra Allenatori'));
  const roomid = await sd.createBattle({
    format: dex.formatId(c.gen), p1: body.teamUser || c.teamUser, p2: body.gmControls ? (body.gmUser || c.gmUser) : undefined,
    team1: dex.packTeam(mine), team2: dex.packTeam(body.opponent), title,
    hp1: mine.map(m => ({hp: m.hp ?? null, status: m.status || ''})), // PS e stato rimasti dalla lotta precedente
    meta: {cid, kind: body.kind, opponent: body.opponent, playerMonIds: mine.map(m => m.id), lang: langOf(req), npcTeamId: body.kind === 'trainer' ? body.npcTeamId : undefined,
      // comando a turno: ogni Pokémon avversario lo affronta il prossimo Allenatore collegato a Showdown (col suo nome)
      rotate: body.rotate ? db.list(cid, 'trainer').map(t => t.name) : undefined},
  });
  log(cid, tr('Lotta iniziata: {title}', {title}), 'battle');
  return {roomid};
});
/** Toglie una lotta dall'elenco della dashboard. */
app.delete('/api/battle/:roomid', async req => {
  sd.battles.delete((req.params as any).roomid);
  io.emit('battle-removed', (req.params as any).roomid);
  return {ok: true};
});
/** Chiude una lotta su Showdown (il perdente si ritira). */
app.post('/api/battle/:roomid/end', async req => {
  sd.endBattle((req.params as any).roomid, (req.body as any)?.loser || 'p2');
  return {ok: true};
});

/**
 * Tentativo di cattura con la tabella del libretto (tiro + modificatori, bonus della classe dell'Allenatore).
 * Se riesce, il Pokémon va in squadra (o nel PC se la squadra è piena: con squadre personali, quella di chi l'ha catturato)
 * e si scrive nel diario.
 */
type CatchBody = {wild: dex.Mon, input: CatchInput, roll: number, trainerId?: string, roomid?: string, hardCatch?: boolean, nickname?: string};
app.post('/api/c/:cid/catch', async req => {
  const {cid} = req.params as any;
  const body = req.body as CatchBody;
  return catchApply(cid, body, catchCalc(cid, body), langOf(req));
});
/** Esito di un tentativo di cattura (senza salvare nulla): tabella del libretto con il bonus della Classe. */
function catchCalc(cid: string, body: CatchBody) {
  const c = campaign(cid);
  const sp = dex.species(c.gen, body.wild.species);
  const trainer = body.trainerId ? db.get(body.trainerId) : undefined;
  const cls = trainer && (trainer.className === 'Personalizzata' ? trainer.customClass : CLASSES.find(k => k.name === trainer.className));
  const input: CatchInput = {
    ...body.input, wildLevel: body.wild.level,
    typeBonus: classTypeBonus(cls?.catchBonus, sp?.types || []),
    hardCatch: body.hardCatch ?? (!!sp && (sp.finalEvo || sp.legendary)),
  };
  return catchResult(body.roll, input);
}
/** «+ 5» / «− 5» per i tiri nel diario e in lotta. */
const signed = (n: number) => n >= 0 ? `+ ${n}` : `− ${-n}`;
/** Cattura riuscita: il Pokémon va in squadra o nel PC; in ogni caso una riga nel diario (nella lingua di chi ha lanciato la Poké Ball). */
function catchApply(cid: string, body: CatchBody, res: ReturnType<typeof catchResult>, lang: Lang) {
  const c = campaign(cid);
  const tr = (s: string, vars?: Record<string, unknown>) => translate(lang, s, vars);
  const who = (body.trainerId && db.get(body.trainerId)?.name) || tr('La squadra');
  if (res.caught) {
    // squadre personali (teamMode 'own'): conta solo la squadra di chi ha lanciato la Poké Ball
    const party = db.list(cid, 'mon').filter(m => m.place === 'party' && (c.teamMode !== 'own' || (m.owner || '') === (body.trainerId || '')));
    const mon = save(cid, 'mon', {...body.wild, id: undefined, nickname: body.nickname || '', owner: body.trainerId || '',
      place: party.length < 6 ? 'party' : 'pc', caughtAt: Date.now()});
    log(cid, tr(mon.place === 'pc' ? '{who} ha catturato {species} (LV {level}) → PC di Bill! Tiro {roll} {bonus} = {total}' : '{who} ha catturato {species} (LV {level})! Tiro {roll} {bonus} = {total}', {who, species: mon.species, level: mon.level, roll: res.roll, bonus: signed(res.bonus), total: res.total}), 'catch');
    return {...res, mon};
  }
  log(cid, tr('{who} non riesce a catturare {species}: {roll} {bonus} = {total} (serve {need})', {who, species: body.wild.species, roll: res.roll, bonus: signed(res.bonus), total: res.total, need: res.threshold}), 'catch');
  return res;
}

// --- tavolo: voto per le porte e turni sulla mappa attiva (in memoria: un riavvio del server li azzera) ---
/**
 * Porte scelte dai giocatori: coda di gruppi (porta + chi l'ha scelta), anche di mappe diverse (gruppo diviso).
 * Il Master fa passare un gruppo alla volta; gli altri restano in coda anche se cambia la scena.
 */
type Vote = {queue: DoorGroup[]};
/** Turni a rotazione: ordine degli Allenatori, di chi è il turno, da dove è partito (i passi si contano da lì), scadenza. */
type Turns = {order: string[], current: number, seconds: number, endsAt?: number, start?: {x: number, y: number}};
const votes = new Map<string, Vote>(), turns = new Map<string, Turns>(), turnTimers = new Map<string, NodeJS.Timeout>();
const table = (cid: string) => ({vote: votes.get(cid) || null, turns: turns.get(cid) || null});
const emitTable = (cid: string) => io.to(cid).emit('table', table(cid));
/** Mappa attiva e Allenatori che ci hanno il segnalino, nell'ordine in cui sono stati creati. */
function tableMap(cid: string) {
  const c = campaign(cid), map = c.activeMap && db.get(c.activeMap);
  if (!map) throw fail(400, 'Nessuna mappa al tavolo');
  const ids = new Set((map.tokens || []).filter((t: any) => !t.kind).map((t: any) => t.id));
  return {c, map, trainers: db.list(cid, 'trainer').filter(t => ids.has(t.id)).map(t => t.id as string)};
}
/**
 * Gli Allenatori who passano dalla porta (all = tutti gli Allenatori della campagna, da qualsiasi mappa): la mappa d'arrivo
 * diventa quella attiva (la scena) e i loro segnalini ci si spostano, sulla casella d'arrivo della porta e quelle libere più vicine
 * (senza casella d'arrivo li mette il Master). Chi è già sulla mappa d'arrivo resta dov'è.
 */
function passWarp(cid: string, mapId: string, warpId: string, lang: Lang, who: string[], all = false) {
  const c = campaign(cid), from = db.get(mapId), warp = from?.objects.find((o: any) => o.id === warpId), to = warp?.toMap && db.get(warp.toMap);
  if (!from || !to) return emitTable(cid);
  const ids = new Set<string>(all ? db.list(cid, 'trainer').map(t => t.id as string) : who);
  const sources = db.list(cid, 'map').filter(m => m.id !== to.id && (m.tokens || []).some((t: any) => !t.kind && ids.has(t.id)));
  const moving = sources.flatMap(m => (m.tokens || []).filter((t: any) => !t.kind && ids.has(t.id)));
  if (warp.toX !== undefined && warp.toY !== undefined && moving.length) {
    const dest = {x: warp.toX, y: warp.toY};
    const others = new Set<string>((to.tokens || []).map((t: any) => `${t.x},${t.y}`));
    const spots = [`${dest.x},${dest.y}`, ...reachable(to as any, dest, 6, others)].filter(k => !others.has(k));
    const placed = moving.map((t: any, i: number) => { const [x, y] = (spots[i] || spots[0]).split(',').map(Number); return {...t, x, y}; });
    save(cid, 'map', {...to, tokens: (to.tokens || []).concat(placed)});
    for (const m of sources) save(cid, 'map', {...db.get(m.id), tokens: (m.tokens || []).filter((t: any) => t.kind || !ids.has(t.id))});
  }
  io.emit('campaign', db.put('_', 'campaign', withMap(c, to.id)));
  const names = db.list(cid, 'trainer').filter(t => ids.has(t.id)).map(t => t.name).join(', ');
  const vars = {who: names || translate(lang, 'Il gruppo'), map: to.name, door: warp.label};
  const one = who.length === 1;
  log(cid, translate(lang, all ? (warp.label ? 'Tutti entrano in {map} ({door}).' : 'Tutti entrano in {map}.')
    : warp.label ? (one ? '{who} entra in {map} ({door}).' : '{who} entrano in {map} ({door}).')
    : (one ? '{who} entra in {map}.' : '{who} entrano in {map}.'), vars), 'info');
  const t = turns.get(cid);
  if (t) startTurn(cid, t.current); else emitTable(cid);
}
/**
 * Porte: pick (un Allenatore sulla mappa attiva sceglie una porta, vedi pickDoor), go (il Master fa passare il gruppo n. index
 * della coda; con all passano tutti gli Allenatori, ovunque siano, e la coda si svuota), clear (il Master svuota la coda).
 */
app.post('/api/c/:cid/vote', async req => {
  const {cid} = req.params as any;
  const {action, trainerId, warpId, index, all} = req.body as {action: string, trainerId?: string, warpId?: string, index?: number, all?: boolean};
  const queue = votes.get(cid)?.queue || [];
  const set = (q: DoorGroup[]) => { if (q.length) votes.set(cid, {queue: q}); else votes.delete(cid); };
  if (action === 'pick') {
    const {map, trainers} = tableMap(cid);
    if (!trainers.includes(trainerId!)) throw fail(400, 'Non sei sulla mappa: non voti');
    if (!map.objects.some((o: any) => o.id === warpId && o.kind === 'warp' && o.toMap)) throw fail(400, 'Porta non trovata');
    set(pickDoor(queue, trainerId!, map.id, warpId!));
  } else if (action === 'go') {
    const g = queue[index ?? -1];
    if (!g) throw fail(400, 'Gruppo non trovato');
    set(all ? [] : queue.filter(x => x !== g));
    return passWarp(cid, g.mapId, g.warpId, langOf(req), g.trainers, !!all), table(cid);
  } else if (action === 'clear') votes.delete(cid);
  emitTable(cid);
  return table(cid);
});

/** Inizia il turno n. i (con il punto di partenza del segnalino) e il timer che passa al prossimo. */
function startTurn(cid: string, i: number) {
  const t = turns.get(cid);
  clearTimeout(turnTimers.get(cid));
  if (!t) return emitTable(cid);
  try { t.order = tableMap(cid).trainers.length ? tableMap(cid).trainers : t.order; } catch {}
  t.current = t.order.length ? (i + t.order.length) % t.order.length : 0;
  const map = db.get(campaign(cid).activeMap);
  const tok = (map?.tokens || []).find((k: any) => k.id === t.order[t.current]);
  t.start = tok && {x: tok.x, y: tok.y};
  t.endsAt = t.seconds ? Date.now() + t.seconds * 1000 : undefined;
  // campagna eliminata nel frattempo: i turni si fermano
  if (t.seconds) turnTimers.set(cid, setTimeout(() => { try { nextTurn(cid); } catch { turns.delete(cid); } }, t.seconds * 1000));
  emitTable(cid);
}
/** Passa al prossimo Allenatore (l'ordine si rilegge: chi è stato tolto o aggiunto alla mappa esce o entra). */
function nextTurn(cid: string) {
  const t = turns.get(cid);
  if (!t) return;
  const prev = t.order[t.current];
  try { t.order = tableMap(cid).trainers; } catch {}
  const i = t.order.indexOf(prev);
  startTurn(cid, i < 0 ? t.current : i + 1);
}
/** Turni: on (Master, seconds = durata, 0 = senza timer), off, next (il Master o chi è di turno). */
app.post('/api/c/:cid/turns', async req => {
  const {cid} = req.params as any;
  const {action, seconds, trainerId, gm} = req.body as {action: string, seconds?: number, trainerId?: string, gm?: boolean};
  if (action === 'on') {
    const {trainers} = tableMap(cid);
    if (!trainers.length) throw fail(400, 'Nessun Allenatore sulla mappa');
    turns.set(cid, {order: trainers, current: 0, seconds: Math.max(0, Math.min(3600, +(seconds || 0)))});
    startTurn(cid, 0);
  } else if (action === 'off') { turns.delete(cid); clearTimeout(turnTimers.get(cid)); emitTable(cid); }
  else if (action === 'next') {
    const t = turns.get(cid);
    if (!t) throw fail(400, 'I turni non sono attivi');
    if (!gm && t.order[t.current] !== trainerId) throw fail(400, 'Non è il tuo turno');
    nextTurn(cid);
  }
  return table(cid);
});
app.get('/api/c/:cid/table', async req => table((req.params as any).cid));

// --- tempo reale ---
/** Ultimi tiri di dado per campagna (dal più recente). */
const rolls = new Map<string, {who: string, color?: string, text: string, t: number}[]>();
app.get('/api/c/:cid/rolls', async req => rolls.get((req.params as any).cid) || []);
/**
 * Tempo reale: ogni browser entra nella stanza della sua campagna; i segnalini spostati sulla mappa
 * vengono salvati nella mappa e così arrivano a tutti.
 */
io.on('connection', socket => {
  socket.on('join', (cid: string) => socket.join(cid));
  socket.on('master', (on: boolean) => { if (on) masters.add(socket.id); else masters.delete(socket.id); checkMasters(); });
  socket.on('disconnect', () => { masters.delete(socket.id); checkMasters(); });
  socket.emit('status', sd.status());
  socket.on('token', ({cid, mapId, token}) => {
    // spostamento segnalini sulla mappa: salva e inoltra
    const map = db.get(mapId);
    if (!map) return;
    map.tokens = (map.tokens || []).filter((t: any) => t.id !== token.id).concat(token);
    save(cid, 'map', map);
  });
  // tiro di dado: va a tutti (notifica e storico); gli ultimi 30 restano in memoria, non nel database
  socket.on('roll', (r: any) => {
    if (!r?.cid) return;
    const roll = {who: String(r.who || '?').slice(0, 40), color: r.color, text: String(r.text || '').slice(0, 120), t: Date.now()};
    const list = rolls.get(r.cid) || [];
    rolls.set(r.cid, [roll, ...list].slice(0, 30));
    io.to(r.cid).emit('roll', roll);
  });
  // puntatore laser: non si salva, si inoltra agli altri browser della campagna
  socket.on('laser', (l: any) => l?.cid && socket.to(l.cid).emit('laser', l));
  socket.on('untoken', ({cid, mapId, id}) => {
    // segnalino tolto dalla mappa (master)
    const map = db.get(mapId);
    if (!map) return;
    map.tokens = (map.tokens || []).filter((t: any) => t.id !== id);
    save(cid, 'map', map);
  });
});
/**
 * Spegnimento automatico (PNP_AUTO_STOP = minuti, 0 = mai): quando il master ha chiuso tutte le sue schede
 * per quel tempo, spegne Showdown ed esce. Con restart: on-failure i due container si fermano da soli.
 * Il conto parte solo dopo che il master si è collegato almeno una volta (e ricomincia se torna).
 */
const AUTO_STOP_MS = +(process.env.PNP_AUTO_STOP || 0) * 60_000;
const masters = new Set<string>();
let masterSeen = false, stopTimer: NodeJS.Timeout | undefined;
function checkMasters() {
  if (masters.size) masterSeen = true;
  clearTimeout(stopTimer);
  if (!AUTO_STOP_MS || !masterSeen || masters.size) return;
  stopTimer = setTimeout(() => {
    console.log(`Nessuna scheda del master aperta da ${AUTO_STOP_MS / 60_000} minuti: spengo.`);
    sd.shutdown();
    setTimeout(() => process.exit(0), 1000);
  }, AUTO_STOP_MS);
}
/** Stato di Showdown e delle lotte inoltrato a tutti i browser. */
sd.events.on('status', s => io.emit('status', s));
sd.events.on('battle', b => { io.emit('battle', b); if (b.ended && !b.hpSaved && b.meta?.cid) saveBattleHp(b); });
// --- zaino in lotta (vedi /pnpbag in showdown-plugin/pnp.ts): la Squadra (p1) usa gli strumenti degli Allenatori della campagna,
// il Master (p2) quelli della Squadra PNG avversaria (campo bag, come lo zaino degli Allenatori); i selvatici non hanno zaino ---
const escHtml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
type Side = 'p1' | 'p2';
/** Chi ha lo zaino per quel lato: documenti (Allenatori o Squadra PNG) e Pokémon in lotta, nell'ordine della squadra di Showdown. */
function bagOwners(b: sd.BattleState, side: Side) {
  if (side === 'p1') {
    return {kind: 'trainer', owners: db.list(b.meta.cid, 'trainer'), mons: (b.meta.playerMonIds as string[]).map(id => db.get(id)), seen: b.p1mons};
  }
  const team = b.meta.npcTeamId && db.list(b.meta.cid, 'npcteam').find(t => t.id === b.meta.npcTeamId);
  return {kind: 'npcteam', owners: team ? [team] : [], mons: (b.meta.opponent || []) as any[], seen: b.p2mons || {}};
}
/**
 * Comando a turno: ogni Pokémon avversario lo affronta un giocatore diverso (il 1° il primo Allenatore collegato, il 2° il secondo…);
 * se l'avversario rimanda in campo un Pokémon già visto, torna chi lo affrontava.
 */
sd.events.on('foe', async (b: sd.BattleState) => {
  if (!b.meta?.rotate?.length || b.ended || !b.active.p2) return;
  const online = new Map((await sd.onlineUsers()).map(u => [u.id, u]));
  const names = (b.meta.rotate as string[]).filter(n => online.has(n.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const i = (b.meta.opponent as dex.Mon[]).findIndex(m => [m.nickname, m.species, m.species.split('-')[0]].includes(b.active.p2!.name));
  if (names.length) sd.control(b.roomid, names[Math.max(i, 0) % names.length], b.meta.lang || 'en');
});
/** Strumenti scelti e in attesa dell'esito dal simulatore, per lotta (in ordine): tolti dallo zaino solo se usati davvero. */
type Pending = {cid: string, kind: string, ownerId: string, item: string, lang: Lang, caught?: {body: CatchBody, res: ReturnType<typeof catchResult>}};
const bagPending = new Map<string, Pending[]>();
sd.events.on('bag', ({roomid, user, side}: {roomid: string, user: string, side: Side}) => {
  const b = sd.battles.get(roomid);
  if (!b?.meta?.cid || b.ended) return;
  const {owners, mons, seen} = bagOwners(b, side);
  const wild = side === 'p1' && b.meta.kind === 'wild';
  const tr = (s: string, vars?: Record<string, unknown>) => escHtml(translate(b.meta.lang || 'en', s, vars));
  const rows = owners.flatMap(t => parseBag(t.bag).filter(([name, n]) => n > 0 && itemEffect(name) && (!itemEffect(name)!.ball || wild)).map(([name, n]) => {
    const e = itemEffect(name)!;
    if (e.ball) return `<div style="margin:4px 0"><b>${escHtml(name)}</b> x${n} <small>(${escHtml(t.name)})</small><br /><button class="button" name="send" value="${escHtml(`/pnpuse ${t.id}|${name}|0`)}">${tr('Usa contro {name}', {name: b.active.p2?.species || '?'})}</button></div>`;
    const targets = mons.map((m, i) => {
      if (!m) return '';
      const label = m.nickname || m.species, st = seen[label];
      if (!!e.revive !== !!st?.fainted) return ''; // i Revitalizzanti solo sui KO, il resto solo su chi è in piedi
      const info = st ? (st.fainted ? 'KO' : `${st.hp}%${st.status ? ' ' + st.status : ''}`) : '';
      return `<button class="button" name="send" value="${escHtml(`/pnpuse ${t.id}|${name}|${i}`)}">${escHtml(label)}${info ? ` <small>${escHtml(info)}</small>` : ''}</button> `;
    }).join('');
    return targets ? `<div style="margin:4px 0"><b>${escHtml(name)}</b> x${n} <small>(${escHtml(t.name)})</small><br />${targets}</div>` : '';
  })).filter(Boolean);
  sd.showBag(roomid, user, `<div class="infobox"><strong>🎒 ${tr('Zaino')}</strong> <small>${tr('tocca il Pokémon su cui usarlo: usare uno strumento occupa il turno')}</small>` +
    (rows.length ? rows.join('') : `<p>${tr(side === 'p2' && !owners.length ? 'Nessuno strumento usabile in lotta (i selvatici non hanno zaino).' : 'Nessuno strumento usabile in lotta.')}</p>`) + '</div>');
});
sd.events.on('baguse', ({roomid, user, side, trainerId, item, idx, step}: {roomid: string, user: string, side: Side, trainerId: string, item: string, idx: number, step?: string}) => {
  const b = sd.battles.get(roomid);
  if (!b?.meta?.cid || b.ended) return;
  const {kind, owners, mons} = bagOwners(b, side);
  const t = owners.find(x => x.id === trainerId);
  const effect = itemEffect(item), have = t && parseBag(t.bag).find(([name, n]) => name === item && n > 0);
  if (!t || !effect || !have || !mons[idx]) return;
  const lang: Lang = b.meta.lang || 'en';
  let caught: Pending['caught'], who = t.name;
  if (effect.ball) {
    // Poké Ball, in tre passi come al tavolo: chi la lancia (who:<id>), riepilogo dei modificatori, lancio (go:<id>) = tiro d100
    // e tabella del libretto (stato, PS, confusione, livello, bonus della Classe di chi lancia); se preso la lotta finisce
    const wild = (b.meta.opponent || [])[0], foe = b.active.p2;
    if (side !== 'p1' || b.meta.kind !== 'wild' || !wild || !foe || foe.fainted) return;
    const tr = (s: string, vars?: Record<string, unknown>) => escHtml(translate(lang, s, vars));
    const trainers = db.list(b.meta.cid, 'trainer');
    const [act, id] = (step || '').split(':'), thrower = trainers.find(x => x.id === id);
    const body = (roll: number): CatchBody => ({wild, trainerId: thrower!.id, roll, input: {
      ball: effect.ball!, hpPercent: foe.hp, status: foe.status || undefined, wildLevel: wild.level, ownLevel: b.active.p1?.level,
      confused: b.volatiles.p2.includes('confusion'), infatuated: b.volatiles.p2.includes('Attract'),
    }});
    const cmd = (next: string) => escHtml(`/pnpuse ${t.id}|${item}|${idx}|${next}`);
    const box = (html: string) => sd.showBag(roomid, user, `<div class="infobox"><strong>🎒 ${escHtml(item)}</strong> <small>${tr('contro {name}', {name: foe.species})}</small><br />${html}</div>`);
    if (!thrower) {
      return box(`<p>${tr('Chi lancia la Poké Ball?')}</p>` + trainers.map(x => `<button class="button" name="send" value="${cmd(`who:${x.id}`)}">${escHtml(x.name)}</button> `).join(''));
    }
    if (act !== 'go') {
      const pre = catchCalc(b.meta.cid, body(0));
      const mods = pre.mods.map(m => `<li>${tr(m.label)}: ${m.value >= 0 ? '+' : ''}${m.value}</li>`).join('');
      return box(`<p>${tr('{name} lancia. Tiro d100 {bonus}: serve almeno {need} (col dado almeno {die}).', {name: thrower.name, bonus: signed(pre.bonus), need: pre.threshold, die: Math.max(1, pre.threshold - pre.bonus)})}</p>` +
        `<ul style="margin:4px 0">${mods || `<li>${tr('nessun modificatore')}</li>`}</ul>` +
        `<button class="button" name="send" value="${cmd(`go:${thrower.id}`)}"><b>🎲 ${tr('Lancia la Poké Ball')}</b></button> ` +
        `<button class="button" name="send" value="${cmd('')}">${tr('Cambia chi lancia')}</button>`);
    }
    const res = catchCalc(b.meta.cid, body(1 + Math.floor(Math.random() * 100)));
    caught = {body: body(res.roll), res};
    who = thrower.name;
    effect.caught = res.caught;
    const vars = {species: wild.species, roll: res.roll, bonus: signed(res.bonus), total: res.total, need: res.threshold};
    effect.text = translate(lang, res.caught ? '✨ {species} è stato catturato! (d100 {roll} {bonus} = {total}, serviva {need})'
      : '{species} si è liberato! (d100 {roll} {bonus} = {total}, serviva {need})', vars);
  }
  bagPending.set(roomid, [...(bagPending.get(roomid) || []), {cid: b.meta.cid, kind, ownerId: t.id, item, lang, caught}]);
  sd.useItem(roomid, {side, idx, label: item, who, effect, lang});
});
sd.events.on('bagresult', ({roomid, ok}: {roomid: string, ok: boolean}) => {
  const p = bagPending.get(roomid)?.shift();
  const t = p && db.list(p.cid, p.kind).find(x => x.id === p.ownerId);
  if (!ok || !p || !t) return;
  save(p.cid, p.kind, {...t, bag: formatBag(parseBag(t.bag).map(([name, n]) => [name, name === p.item ? n - 1 : n]))});
  if (p.caught) catchApply(p.cid, p.caught.body, p.caught.res, p.lang);
  else log(p.cid, translate(p.lang, '{who} usa {item} in lotta.', {who: t.name, item: p.item}), 'battle');
});

/**
 * Fine lotta: PS e stato dei Pokémon della squadra restano com'erano (KO compresi), così la lotta dopo riparte da lì.
 * Il bot vede i PS in percentuale (è spettatore): si riconvertono in PS veri, con al massimo 1 PS di arrotondamento.
 */
function saveBattleHp(b: sd.BattleState) {
  b.hpSaved = true;
  const c = db.get(b.meta.cid);
  if (!c) return;
  const mons = (b.meta.playerMonIds as string[]).map(id => db.get(id)).filter(Boolean) as db.Doc[];
  const used = new Set<string>(), out: string[] = [];
  for (const [name, st] of Object.entries(b.p1mons)) {
    const m = mons.find(x => !used.has(x.id) && (x.nickname || x.species) === name) || mons.find(x => !used.has(x.id) && name.startsWith(x.species));
    if (!m) continue;
    used.add(m.id);
    const max = dex.maxHp(c.gen, m as any);
    const hp = st.fainted ? 0 : Math.max(1, Math.min(max, Math.round(st.hp / 100 * max)));
    save(b.meta.cid, 'mon', {...m, hp, status: st.fainted ? '' : st.status});
    out.push(`${name} ${hp ? `${hp}/${max} ${translate(b.meta.lang || 'en', 'PS')}${st.status ? ` (${st.status})` : ''}` : 'KO'}`);
  }
  if (out.length) log(b.meta.cid, translate(b.meta.lang || 'en', 'Dopo la lotta: {list}.', {list: out.join(', ')}), 'battle');
}

// --- frontend compilato ---
/**
 * Interfaccia compilata (npm run build): file statici, e ogni percorso non-API riceve index.html
 * (le pagine le gestisce React Router nel browser).
 */
const dist = new URL('../../web/dist', import.meta.url).pathname;
if (existsSync(dist)) {
  await app.register(fastifyStatic, {root: dist});
  app.setNotFoundHandler((req, reply) => req.url.startsWith('/api') ? reply.code(404).send({error: 'Not found'}) : reply.sendFile('index.html'));
}


/** Avvio: collegamento a Showdown e server in ascolto su tutte le interfacce (raggiungibile dai telefoni in LAN). */
sd.connect();
await app.listen({port: PORT, host: '0.0.0.0'});
console.log(`Dashboard in ascolto sulla porta ${PORT}`);
