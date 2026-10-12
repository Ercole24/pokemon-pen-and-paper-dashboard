// Movimento sulla mappa: caselle raggiungibili, mosse da campo (MN) e bicicletta, voto per le porte.
// Funzioni pure, usate dal server e dalla dashboard (come items.ts): vedi field.test.ts.
import {parseBag} from './items.ts';

/**
 * Ostacoli da MN: si attraversano con la MN giusta nello zaino di chi si muove e la medaglia della regione
 * (indice da 0 nella lista delle medaglie; regione senza voce = basta la MN).
 * Acqua e cascata si dipingono nel livello collisioni (valore coll; 0 libero, 1 muro); albero, masso e roccia
 * sono oggetti della mappa (kind 'obstacle', field = coll), con l'icona sulla casella.
 * en = [nome, mossa] in inglese; words = parole che riconoscono la MN nello zaino («MN03», «MN Surf», «Surf», «HM03»…).
 */
export const FIELD: {coll: number, label: string, move: string, en: [string, string], color: string, icon: string, object?: boolean, words: string[], mn: number, badge: Record<string, number>}[] = [
  {coll: 2, label: 'Acqua', move: 'Surf', en: ['Water', 'Surf'], color: '#2f6fdf', icon: '🌊', words: ['surf'], mn: 3, badge: {Kanto: 4, Johto: 3, Hoenn: 4, Sinnoh: 4}},
  {coll: 3, label: 'Albero', move: 'Taglio', en: ['Tree', 'Cut'], color: '#2f9e4f', icon: '🌳', object: true, words: ['taglio', 'cut'], mn: 1, badge: {Kanto: 1, Johto: 1, Hoenn: 0, Sinnoh: 1}},
  {coll: 4, label: 'Masso', move: 'Forza', en: ['Boulder', 'Strength'], color: '#9c6b30', icon: '🪨', object: true, words: ['forza', 'strength'], mn: 4, badge: {Kanto: 3, Johto: 2, Hoenn: 3, Sinnoh: 5}},
  {coll: 5, label: 'Roccia', move: 'Spaccaroccia', en: ['Rock', 'Rock Smash'], color: '#7c7c96', icon: '⛏️', object: true, words: ['spaccaroccia', 'rock smash'], mn: 6, badge: {Hoenn: 1, Sinnoh: 0}},
  {coll: 6, label: 'Cascata', move: 'Cascata', en: ['Waterfall', 'Waterfall'], color: '#1f9fa8', icon: '💧', words: ['cascata', 'waterfall'], mn: 7, badge: {Kanto: 6, Johto: 7, Hoenn: 7, Sinnoh: 7}},
];
export const fieldOf = (coll: number) => FIELD.find(f => f.coll === coll);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Lo zaino contiene la MN di quella mossa (per nome o per numero)? */
function hasMn(bag: string, f: typeof FIELD[0]) {
  return parseBag(bag).some(([name, n]) => {
    if (n <= 0) return false;
    const x = norm(name), num = /^(?:mn|hm) ?0*(\d+)$/.exec(x);
    return num ? +num[1] === f.mn : f.words.some(w => x.includes(w));
  });
}

/** Valori di collisione che chi ha questo zaino e queste medaglie può attraversare. */
export function fieldPass(bag: string, badges: number[], region: string) {
  return new Set(FIELD.filter(f => hasMn(bag, f) && (f.badge[region] === undefined || badges.includes(f.badge[region]))).map(f => f.coll));
}

/** Cosa manca per attraversare: «MN Surf» e, se serve, l'indice della medaglia. */
export function fieldNeed(coll: number, region: string, lang: 'it' | 'en' = 'it') {
  const f = fieldOf(coll);
  return f && {label: lang === 'it' ? f.label : f.en[0], move: lang === 'it' ? f.move : f.en[1], badge: f.badge[region]};
}

/** Bicicletta nello zaino: movimento doppio. */
export const hasBike = (bag = '') => parseBag(bag).some(([name, n]) => n > 0 && /\bbici|bicicletta|bike|bicycle/.test(norm(name)));

type Grid = {width: number, height: number, layers: {type: string, data: number[]}[], objects: {kind: string, x: number, y: number, hidden?: boolean, field?: number}[]};

/**
 * Caselle raggiungibili a passi (4 direzioni), senza attraversare collisioni e ostacoli (tranne i valori in pass) né fermarsi
 * su altri segnalini. Restituisce le chiavi "x,y".
 */
export function reachable(map: Grid, from: {x: number, y: number}, range: number, occupied: Set<string>, pass = new Set<number>()) {
  const coll = map.layers.find(l => l.type === 'collision');
  // PNG e oggetti visibili bloccano; gli ostacoli da MN solo se chi si muove non li può superare
  const solid = new Set(map.objects.filter(o => ((o.kind === 'npc' || o.kind === 'item') && !o.hidden) || (o.kind === 'obstacle' && !pass.has(o.field || 0)))
    .map(o => `${o.x},${o.y}`));
  const blocked = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height || solid.has(`${x},${y}`)) return true;
    const v = coll?.data[y * map.width + x] || 0;
    return v !== 0 && !pass.has(v);
  };
  const dist = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    const d = dist.get(`${c.x},${c.y}`)!;
    if (d >= range) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (dist.has(k) || blocked(nx, ny)) continue;
      dist.set(k, d + 1);
      queue.push({x: nx, y: ny});
    }
  }
  dist.delete(`${from.x},${from.y}`);
  for (const k of occupied) dist.delete(k);
  return new Set(dist.keys());
}

/** Voto: passa con più della metà dei votanti. */
export const majority = (yes: number, voters: number) => yes * 2 > voters;
