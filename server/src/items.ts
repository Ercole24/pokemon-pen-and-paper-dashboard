// Zaino degli Allenatori e strumenti usabili in lotta su Showdown.
// Lo zaino è salvato come testo («Poké Ball x5, Pozione x2»); qui si legge e si riscrive (lo usa anche la scheda Allenatore).
// BAG_ITEMS dice cosa fa ogni strumento quando la Squadra lo usa in lotta (vedi /pnpitem in showdown-plugin/pnp.ts).

import {translate, type Lang} from './i18n.ts';

/** Testo dello zaino -> elenco di [oggetto, quantità]. */
export const parseBag = (bag = '') => bag.split(/[,\n]/).map(x => x.trim()).filter(Boolean)
  .map(x => { const m = x.match(/^(.*?)\s*[x×]\s*(\d+)$/i); return m ? [m[1], +m[2]] as [string, number] : [x, 1] as [string, number]; });
/** Elenco di [oggetto, quantità] -> testo dello zaino (gli oggetti finiti spariscono). */
export const formatBag = (items: [string, number][]) => items.filter(([, n]) => n > 0).map(([name, n]) => n > 1 ? `${name} x${n}` : name).join(', ');

/**
 * Effetto di uno strumento in lotta: heal = PS curati (0 = tutti), cure = stati curati ('all' = tutti),
 * revive = frazione dei PS con cui torna in sé un Pokémon KO, boost = statistiche aumentate (solo il Pokémon in campo),
 * volatile = effetto aggiunto al Pokémon in campo (es. Diretto X = focusenergy).
 */
export type ItemEffect = {heal?: number, cure?: string[] | 'all', revive?: number, boost?: Record<string, number>, volatile?: string,
  /** Poké Ball: solo contro i selvatici, la cattura la calcola la dashboard (tabella del libretto, vedi rules.ts) */
  ball?: 'poke' | 'great' | 'ultra', caught?: boolean, text?: string};

/** Strumenti usabili, con i nomi italiani e inglesi (minuscoli, senza spazi doppi). */
const TABLE: [string[], ItemEffect][] = [
  [['pozione', 'potion'], {heal: 20}],
  [['superpozione', 'super potion'], {heal: 50}],
  [['iperpozione', 'hyper potion'], {heal: 200}],
  [['pozione max', 'max potion'], {heal: 0}],
  [['ricarica totale', 'full restore'], {heal: 0, cure: 'all'}],
  [['acqua fresca', 'fresh water'], {heal: 50}],
  [['gassosa', 'soda pop'], {heal: 60}],
  [['lemonsucco', 'lemonade'], {heal: 80}],
  [['latte mumu', 'moomoo milk'], {heal: 100}],
  [['baccarancia', 'oran berry'], {heal: 10}],
  [['antidoto', 'antidote'], {cure: ['psn', 'tox']}],
  [['antiparalisi', 'paralyze heal'], {cure: ['par']}],
  [['antiscottatura', 'burn heal'], {cure: ['brn']}],
  [['antigelo', 'ice heal'], {cure: ['frz']}],
  [['sveglia', 'awakening'], {cure: ['slp']}],
  [['cura totale', 'full heal'], {cure: 'all'}],
  [['revitalizzante', 'revive'], {revive: 0.5}],
  [['revitalizzante max', 'max revive'], {revive: 1}],
  [['attacco x', 'x attack'], {boost: {atk: 1}}],
  [['difesa x', 'x defend', 'x defense'], {boost: {def: 1}}],
  [['velocità x', 'velocita x', 'x speed'], {boost: {spe: 1}}],
  [['special x', 'x special', 'attacco sp. x', 'x sp. atk'], {boost: {spa: 1}}],
  [['difesa sp. x', 'x sp. def'], {boost: {spd: 1}}],
  [['precisione x', 'x accuracy'], {boost: {accuracy: 1}}],
  [['diretto x', 'dire hit'], {volatile: 'focusenergy'}],
  [['poké ball', 'poke ball', 'pokéball', 'pokeball'], {ball: 'poke'}],
  [['mega ball', 'great ball', 'megaball'], {ball: 'great'}],
  [['ultra ball', 'ultraball'], {ball: 'ultra'}],
];
const BY_NAME = new Map(TABLE.flatMap(([names, e]) => names.map(n => [n, e] as const)));

/** Effetto in lotta di uno strumento dello zaino, o undefined se in lotta non si usa (MT, oggetti di trama…). */
export const itemEffect = (name: string) => BY_NAME.get(name.trim().toLowerCase().replace(/\s+/g, ' '));

/** Pietre evolutive: nome inglese (come in Showdown) -> nome italiano. */
const STONES_IT: Record<string, string> = {
  'Fire Stone': 'Pietrafocaia', 'Water Stone': 'Pietraidrica', 'Thunder Stone': 'Pietratuono', 'Leaf Stone': 'Pietrafoglia',
  'Moon Stone': 'Pietralunare', 'Sun Stone': 'Pietrasolare', 'Shiny Stone': 'Pietrabrillo', 'Dusk Stone': 'Neropietra',
  'Dawn Stone': 'Pietralbore', 'Ice Stone': 'Pietragelo',
};
/** Nome italiano di uno strumento evolutivo (se lo conosciamo). */
export const itemIt = (en: string) => STONES_IT[en] || en;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** Lo strumento dello zaino (nome italiano o inglese) è lo strumento evolutivo en? */
export const isItem = (bagName: string, en: string) => [norm(en), norm(itemIt(en))].includes(norm(bagName));

/**
 * Requisiti di un'evoluzione: per livello (livello raggiunto) o con uno strumento (nello zaino di un Allenatore);
 * scambio, amicizia e casi speciali non si possono controllare: gmOnly = li decide il Master. why = cosa manca, nella lingua lang.
 */
export function evoCheck(ev: {evoLevel?: number, evoType?: string, evoItem?: string, evoCondition?: string}, level: number, bags: string[], lang: Lang = 'it') {
  const tr = (s: string, vars?: Record<string, unknown>) => translate(lang, s, vars);
  if (!ev.evoType && ev.evoLevel) return {ok: level >= ev.evoLevel, gmOnly: false, why: tr('serve il LV {level}', {level: ev.evoLevel})};
  if (ev.evoType === 'useItem' && ev.evoItem) {
    const has = bags.some(bag => parseBag(bag).some(([name, n]) => n > 0 && isItem(name, ev.evoItem!)));
    return {ok: has, gmOnly: false, why: tr('serve {item} nello zaino', {item: lang === 'it' ? itemIt(ev.evoItem) : ev.evoItem}), item: ev.evoItem};
  }
  const why = ev.evoType === 'trade' ? tr('si evolve con lo scambio') : ev.evoType === 'levelFriendship' ? tr('si evolve con l\'amicizia')
    : ev.evoCondition || ev.evoType || tr('condizione speciale');
  return {ok: false, gmOnly: true, why: tr('{why}: decide il Master', {why})};
}
