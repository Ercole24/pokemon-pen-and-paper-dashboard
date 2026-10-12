// Collegamento con il server e "archivio" dei dati della campagna nel browser.
// - api(): chiamata HTTP alle API (/api/...).
// - useCampaignStore(): carica tutti i documenti di una campagna e li tiene aggiornati ascoltando socket.io
//   ('doc' = creato/modificato, 'del' = cancellato, 'campaign', 'reload'). Le pagine leggono i dati con useStore().
// - Tipi TypeScript dei documenti (Mon, Trainer, Zone, MapDoc…), uguali a quelli salvati dal server.
// - Piccole utilità: cache delle risposte del Pokédex, URL degli sprite, dado.
import {createContext, useContext, useEffect, useMemo, useReducer, useState} from 'react';
import {io} from 'socket.io-client';
import {LANG} from './i18n';

/** Un'unica connessione socket.io per tutta l'app (stesso indirizzo da cui arriva la pagina). */
export const socket = io({autoConnect: true});

/**
 * Da usare nelle pagine del master: il server conta le sue schede aperte e, se restano a zero,
 * spegne tutto dopo qualche minuto (spegnimento automatico, vedi server/src/index.ts).
 */
export function useMaster() {
  useEffect(() => {
    const hello = () => socket.emit('master', true);
    hello();
    socket.on('connect', hello); // dopo una riconnessione il server non ci conosce più
    return () => { socket.off('connect', hello); socket.emit('master', false); };
  }, []);
}

/** Chiama /api<path> con JSON; se la risposta è un errore lancia un Error con il messaggio del server (già nella lingua scelta). */
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method, headers: {'x-lang': LANG, ...body !== undefined && {'content-type': 'application/json'}},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  return data;
}

/** Le sei statistiche di un Pokémon (sigle di Showdown). */
export type Stats = Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>;
/** Un Pokémon: place = 'party' (squadra), 'pc' (box) o 'npc'; owner = Allenatore; order = posizione in squadra. */
export type Mon = {
  id?: string, species: string, nickname?: string, level: number, gender: string, nature: string,
  ability: string, ivs: Stats, evs: Stats, moves: string[], shiny: boolean, item?: string,
  place?: 'party' | 'pc' | 'npc', owner?: string, team?: string, notes?: string, order?: number,
  /** PS attuali tra una lotta e l'altra (assente = pieni, 0 = KO), stato alterato rimasto, livello prima dell'ultima crescita */
  hp?: number, status?: string, prevLevel?: number,
};
/**
 * Una campagna: generazione, regione, impostazioni di gioco, nomi Showdown, mappa attiva, tipo di avventura.
 * teamMode 'own' = ogni Allenatore ha squadra e PC suoi (Pokémon divisi per owner); assente/'shared' = squadra unica.
 * sharedBadges = medaglie della campagna (badges) invece che di ogni Allenatore.
 */
export type Campaign = {
  id: string, name: string, gen: number, region: string, shinyRate: number, hiddenAbilityChance: number,
  teamUser: string, gmUser: string, activeZone?: string, activeMap?: string, moveRange?: number, sharedBadges?: boolean, badges?: number[],
  teamMode?: 'own' | 'shared',
  /** livelli dati dal master e già spesi dai giocatori (squadra condivisa; con squadre personali stanno nell'Allenatore) */
  levelsGiven?: number, levelsSpent?: number,
};

/** I tre tipi di avventura: squadre e medaglie personali; squadra condivisa e medaglie personali; tutto condiviso. */
export const ADVENTURES = [
  {id: 'solo', label: 'Ognuno per sé (squadre e medaglie personali)', teamMode: 'own', sharedBadges: false},
  {id: 'team', label: 'Squadra condivisa, medaglie personali', teamMode: 'shared', sharedBadges: false},
  {id: 'all', label: 'Tutto condiviso (squadra e medaglie)', teamMode: 'shared', sharedBadges: true},
] as const;
/** Tipo di avventura di una campagna (vedi ADVENTURES). */
export const adventureOf = (c: Pick<Campaign, 'teamMode' | 'sharedBadges'>) => c.teamMode === 'own' ? 'solo' : c.sharedBadges ? 'all' : 'team';
/** Scheda di un Allenatore (giocatore). */
export type Trainer = {
  id?: string, name: string, player?: string, age?: string, hometown?: string, className: string,
  customClass?: any, hiddenPower?: string, bag?: string, notes?: string, badges?: number[], money?: number,
  gender?: 'M' | 'F', sprite?: string, levelsGiven?: number, levelsSpent?: number,
};
/** Una specie in una zona: probabilità (peso relativo nello stesso modo), livelli, modo d'incontro. */
export type ZoneEntry = {species: string, rate: number, minLevel: number, maxLevel: number, method?: string};
/** Una zona d'incontri (percorso, grotta…). */
export type Zone = {id?: string, name: string, entries: ZoneEntry[], notes?: string};
/** Un'immagine divisa in tile (caselle) quadrate; dataUrl è l'immagine. */
export type Tileset = {id?: string, name: string, tileSize: number, dataUrl: string, columns: number, rows: number};
/**
 * Un livello della mappa: data ha un numero per casella (riga per riga).
 * tile: 0 = vuoto, altrimenti gid (indice globale del tile); collision: 1 = bloccato; zone: indice+1 in zoneRefs.
 */
export type MapLayer = {name: string, type: 'tile' | 'collision' | 'zone', data: number[], visible?: boolean};
/**
 * Una mappa (compatibile con Tiled): tileset usati con il primo gid, livelli, zone, oggetti (porte, PNG, Poké Ball,
 * segnaposto) e tokens = segnalini degli Allenatori in gioco.
 */
export type MapDoc = {
  id?: string, name: string, layersRev?: number, width: number, height: number, tileSize: number, group?: string,
  tilesets: {id: string, firstgid: number}[], layers: MapLayer[],
  zoneRefs: string[], // indice (valore-1) nel livello zone -> id zona
  // obstacle = albero/masso/roccia da MN (field = valore in FIELD, server/src/field.ts)
  objects: {id: string, x: number, y: number, kind: 'warp' | 'npc' | 'marker' | 'item' | 'obstacle', label: string, color?: string, toMap?: string, toX?: number, toY?: number, field?: number,
    npcTeam?: string, item?: string, hidden?: boolean, sprite?: string, text?: string, gmText?: string}[], // text = cosa dice ai giocatori, gmText = note solo per il master
  // kind assente = Allenatore; pokemon/npc/trap = segnalini del master; hidden = solo il master lo vede (semitrasparente)
  tokens?: {id: string, x: number, y: number, label: string, color: string, kind?: 'pokemon' | 'npc' | 'trap', sprite?: string, hidden?: boolean}[],
};
/** Mappa nell'elenco della campagna: tutto tranne i livelli di tile, che si scaricano con useMap() solo per la mappa aperta. */
export type MapSummary = Omit<MapDoc, 'layers'>;
/** Un brano di YouTube ascoltato nella campagna (pagina Musica): link normalizzato, titolo, categoria, ultimo ascolto. */
export type Track = {id?: string, link: string, title?: string, category?: string, t: number};
/** Una riga del diario della campagna. */
export type LogEntry = {id: string, t: number, text: string, type: string};

/** Tutti i documenti di una campagna, divisi per tipo. */
type State = {
  trainer: Trainer[], mon: Mon[], zone: Zone[], map: MapSummary[], tileset: Tileset[], npcteam: any[], log: LogEntry[], note: any[], track: Track[],
};
const KINDS = ['trainer', 'mon', 'zone', 'map', 'tileset', 'npcteam', 'log', 'note', 'track'] as const;
const empty: State = {trainer: [], mon: [], zone: [], map: [], tileset: [], npcteam: [], log: [], note: [], track: []};

/** Modifiche all'archivio: carica un tipo intero, aggiorna/aggiunge un documento, ne toglie uno. */
type Action = {type: 'load', kind: keyof State, docs: any[]} | {type: 'doc', kind: keyof State, doc: any} | {type: 'del', kind: keyof State, id: string};
/** Applica una modifica all'archivio (useReducer di React: lo stato non si modifica mai, se ne crea uno nuovo). */
function reducer(s: State, a: Action): State {
  if (a.type === 'load') return {...s, [a.kind]: a.docs};
  const arr = s[a.kind] as any[];
  if (a.type === 'del') return {...s, [a.kind]: arr.filter(d => d.id !== a.id)};
  const i = arr.findIndex(d => d.id === a.doc.id);
  return {...s, [a.kind]: i >= 0 ? arr.map(d => d.id === a.doc.id ? a.doc : d) : [...arr, a.doc]};
}

/** Quello che le pagine ottengono da useStore(): dati + funzioni per salvare, cancellare, aggiornare la campagna, scrivere nel diario. */
export type Store = State & {
  campaign: Campaign, ready: boolean,
  save: <T extends object>(kind: keyof State, doc: T) => Promise<T & {id: string}>,
  remove: (kind: keyof State, id: string) => Promise<void>,
  updateCampaign: (patch: Partial<Campaign>) => Promise<void>,
  log: LogEntry[], addLog: (text: string, type?: string) => Promise<void>,
};

/** Contesto React che rende l'archivio disponibile a tutte le pagine della campagna. */
export const StoreCtx = createContext<Store | null>(null);
/** Hook per leggere l'archivio dentro un componente. */
export const useStore = () => useContext(StoreCtx)!;

/**
 * Crea l'archivio di una campagna: carica tutto, entra nella stanza socket.io della campagna
 * e applica gli aggiornamenti che arrivano dal server. ready = primo caricamento completato.
 */
export function useCampaignStore(cid: string): Store | null {
  const [state, dispatch] = useReducer(reducer, empty);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    api<Campaign[]>('/campaigns').then(list => alive && setCampaign(list.find(c => c.id === cid) || null));
    const loadAll = () => Promise.all(KINDS.map(k => api(`/c/${cid}/${k}`).then(docs => alive && dispatch({type: 'load', kind: k, docs}))));
    loadAll().then(() => alive && setReady(true));
    socket.on('reload', loadAll);
    const join = () => socket.emit('join', cid);
    join();
    socket.on('connect', join);
    const onDoc = ({kind, doc}: any) => dispatch({type: 'doc', kind, doc});
    const onDel = ({kind, id}: any) => dispatch({type: 'del', kind, id});
    const onCampaign = (c: Campaign) => c.id === cid && setCampaign(c);
    socket.on('doc', onDoc);
    socket.on('del', onDel);
    socket.on('campaign', onCampaign);
    return () => { alive = false; socket.off('connect', join); socket.off('doc', onDoc); socket.off('del', onDel); socket.off('campaign', onCampaign); socket.off('reload', loadAll); };
  }, [cid]);

  return useMemo(() => campaign && {
    ...state, campaign, ready,
    save: (kind, doc) => api(`/c/${cid}/${kind}`, 'PUT', doc),
    remove: async (kind, id) => { await api(`/c/${cid}/${kind}/${id}`, 'DELETE'); },
    updateCampaign: async patch => { setCampaign(await api('/campaigns', 'PUT', {...campaign, ...patch})); },
    addLog: async (text, type = 'info') => { await api(`/c/${cid}/log`, 'POST', {text, type}); },
  } as Store, [state, campaign, ready, cid]);
}

/**
 * Mappa completa (con i livelli) per id: undefined = non esiste, null = in caricamento.
 * Segnalini, oggetti e nome arrivano in tempo reale dall'elenco; i livelli si riscaricano solo quando cambiano (layersRev).
 */
export function useMap(id?: string): MapDoc | null | undefined {
  const {map, campaign} = useStore();
  const lite = map.find(m => m.id === id);
  const [full, setFull] = useState<MapDoc | null>(null);
  useEffect(() => {
    if (!id || !lite) return;
    let alive = true;
    api<MapDoc>(`/c/${campaign.id}/map/${id}`).then(m => alive && setFull(m)).catch(() => {});
    return () => { alive = false; };
  }, [id, !lite, lite?.layersRev]);
  if (!lite) return undefined;
  return full && full.id === id ? {...full, ...lite, layers: full.layers} : null;
}

// --- tiri di dado condivisi ---
/** Un tiro visto da tutti: chi, colore del giocatore, risultato. */
export type Roll = {who: string, color?: string, text: string, t: number};
/** Chi sta tirando i dadi in questa vista (il giocatore sul telefono, altrimenti il Master). */
export const RollerCtx = createContext<{who: string, color?: string}>({who: 'Master', color: '#16213f'});
/** Hook: funzione che manda un tiro a tutti i browser della campagna. */
export function useShareRoll() {
  const {campaign} = useStore();
  const me = useContext(RollerCtx);
  return (text: string) => socket.emit('roll', {cid: campaign.id, ...me, text});
}
/** Ultimi tiri della campagna, aggiornati in tempo reale. */
export function useRolls() {
  const {campaign} = useStore();
  const [list, setList] = useState<Roll[]>([]);
  useEffect(() => {
    api<Roll[]>(`/c/${campaign.id}/rolls`).then(setList).catch(() => {});
    const on = (r: Roll) => setList(l => [r, ...l].slice(0, 30));
    socket.on('roll', on);
    return () => { socket.off('roll', on); };
  }, [campaign.id]);
  return list;
}

/** Stato del tavolo (server/src/index.ts): coda delle porte scelte (gruppi, vedi pickDoor) e turni sulla mappa, aggiornati in tempo reale. */
export type Table = {
  vote: {queue: {mapId: string, warpId: string, trainers: string[]}[]} | null,
  turns: {order: string[], current: number, seconds: number, endsAt?: number, start?: {x: number, y: number}} | null,
};
export function useTable() {
  const {campaign} = useStore();
  const [table, setTable] = useState<Table>({vote: null, turns: null});
  useEffect(() => {
    const load = () => api<Table>(`/c/${campaign.id}/table`).then(setTable).catch(() => {});
    load();
    socket.on('table', setTable);
    socket.on('connect', load);
    return () => { socket.off('table', setTable); socket.off('connect', load); };
  }, [campaign.id]);
  return table;
}

// --- dati Pokémon (cache per generazione) ---
/** Specie del Pokédex come la manda il server (vedi server/src/dex.ts). */
export type SpeciesInfo = {
  id: string, name: string, num: number, gen: number, types: string[], spriteid: string, gender: string,
  genderRatio: {M: number, F: number}, abilities: Record<string, string>, baseStats: Stats,
  evos: string[], prevo: string, evoLevel?: number, evoType?: string, evoItem?: string, evoCondition?: string,
  legendary: boolean, finalEvo: boolean,
};
/** Risposte che non cambiano (Pokédex, mosse…): una richiesta sola per percorso, condivisa da tutta l'app. */
const cache = new Map<string, Promise<any>>();
/** Chiede un percorso una volta sola; se fallisce si potrà riprovare. */
export function cached<T>(path: string): Promise<T> {
  if (!cache.has(path)) cache.set(path, api(path).catch(e => { cache.delete(path); throw e; }));
  return cache.get(path)!;
}
/** Hook: valore di un percorso in cache (undefined finché non arriva). */
export function useCached<T>(path: string | null): T | undefined {
  const [v, setV] = useState<T>();
  useEffect(() => { if (path) cached<T>(path).then(setV); else setV(undefined); }, [path]);
  return v;
}
/** Pokédex della generazione con ricerca per nome o id ("Mr. Mime" e "mrmime" vanno bene entrambi). */
export function useSpecies(gen: number) {
  const list = useCached<SpeciesInfo[]>(`/dex/${gen}/species`);
  return useMemo(() => {
    const byName = new Map<string, SpeciesInfo>();
    for (const s of list || []) { byName.set(s.name.toLowerCase(), s); byName.set(s.id, s); }
    // «Nidoran♀» / «Nidoran♂» come li scrivono i giochi = Nidoran-F / Nidoran-M di Showdown
    const norm = (name: string) => name?.toLowerCase?.().replace(/♀/g, 'f').replace(/♂/g, 'm');
    return {list: list || [], get: (name: string) => byName.get(name?.toLowerCase?.()) || byName.get(norm(name)?.replace(/[^a-z0-9]/g, ''))};
  }, [list]);
}

/** Nomi italiani dei tipi. */
export const TYPES_IT: Record<string, string> = {
  Normal: 'Normale', Fire: 'Fuoco', Water: 'Acqua', Electric: 'Elettro', Grass: 'Erba', Ice: 'Ghiaccio',
  Fighting: 'Lotta', Poison: 'Veleno', Ground: 'Terra', Flying: 'Volante', Psychic: 'Psico', Bug: 'Coleottero',
  Rock: 'Roccia', Ghost: 'Spettro', Dragon: 'Drago', Dark: 'Buio', Steel: 'Acciaio', Fairy: 'Folletto',
};
const STAT_IT: Record<string, string> = {hp: 'PS', atk: 'Att', def: 'Dif', spa: 'AttSp', spd: 'DifSp', spe: 'Vel'};
const STAT_EN: Record<string, string> = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
/** Sigle delle statistiche dei Pokémon nella lingua scelta, nell'ordine di Showdown. */
export const STAT_NAMES = LANG === 'it' ? STAT_IT : STAT_EN;
/** Nome di un tipo nella lingua scelta (i dati usano i nomi inglesi di Showdown). */
export const typeName = (type: string) => LANG === 'it' ? TYPES_IT[type] || type : type;
/** Nome di una natura nella lingua scelta (natures = nomi italiani dal server). */
export const natureName = (n: string, natures?: Record<string, string>) => LANG === 'it' ? natures?.[n] || n : n;

/** Impostazioni del server (/api/config.js): indirizzo di sprite e audio, versione installata. */
export const CONFIG: {assets: string, version: string} = (window as any).PNP || {assets: 'https://play.pokemonshowdown.com/', version: '?'};

/** Sprite di un Pokémon da internet (Showdown), nello stile della generazione (fino alla 5). */
export function spriteUrl(spriteid: string | undefined, gen: number, shiny = false) {
  if (!spriteid) return '';
  const folder = gen <= 1 ? 'gen1' : gen === 2 ? 'gen2' : gen === 3 ? 'gen3' : gen === 4 ? 'gen4' : 'gen5';
  // gen1 non ha cromatici
  return `${CONFIG.assets}sprites/${folder}${shiny && gen > 1 ? '-shiny' : ''}/${spriteid}.png`;
}

/** Indirizzo di Showdown: stesso PC della dashboard, porta 8000. */
export const showdownUrl = () => `http://${location.hostname}:8000`;
/** Tira un dado da n facce. */
export const d = (n: number) => 1 + Math.floor(Math.random() * n);
