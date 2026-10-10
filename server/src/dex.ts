// Dati Pokémon presi dalla build locale di Pokémon Showdown (showdown/dist/sim) + generatore di Pokémon selvatici.
// Showdown contiene il Pokédex completo di ogni generazione (specie, statistiche base, mosse, learnset, strumenti,
// abilità, tabella dei tipi). Dex.mod('genN') restituisce i dati "come erano" in quella generazione.
// Qui li trasformiamo nel formato che serve alla dashboard e prepariamo le squadre per le lotte.
import {createRequire} from 'node:module';
import {fail} from './i18n.ts';

/** Showdown è CommonJS: lo carichiamo con require dentro un modulo ES. */
const require = createRequire(import.meta.url);
const {Dex, Teams} = require('../../showdown/dist/sim');

/** Le sei statistiche dei Pokémon, con le sigle usate da Showdown. */
export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
type Stats = Record<typeof STATS[number], number>;

/** Nomi italiani dei tipi (Showdown li usa in inglese). */
export const TYPES_IT: Record<string, string> = {
  Normal: 'Normale', Fire: 'Fuoco', Water: 'Acqua', Electric: 'Elettro', Grass: 'Erba', Ice: 'Ghiaccio',
  Fighting: 'Lotta', Poison: 'Veleno', Ground: 'Terra', Flying: 'Volante', Psychic: 'Psico', Bug: 'Coleottero',
  Rock: 'Roccia', Ghost: 'Spettro', Dragon: 'Drago', Dark: 'Buio', Steel: 'Acciaio', Fairy: 'Folletto',
};

/** Nomi italiani delle nature. */
export const NATURES_IT: Record<string, string> = {
  Hardy: 'Ardita', Lonely: 'Schiva', Brave: 'Audace', Adamant: 'Decisa', Naughty: 'Birbona',
  Bold: 'Sicura', Docile: 'Docile', Relaxed: 'Placida', Impish: 'Scaltra', Lax: 'Fiacca',
  Timid: 'Timida', Hasty: 'Lesta', Serious: 'Seria', Jolly: 'Allegra', Naive: 'Ingenua',
  Modest: 'Modesta', Mild: 'Mite', Quiet: 'Quieta', Bashful: 'Ritrosa', Rash: 'Ardente',
  Calm: 'Calma', Gentle: 'Gentile', Sassy: 'Vivace', Careful: 'Cauta', Quirky: 'Furba',
};

/** Nome scritto dall'utente -> nome di Showdown: «Nidoran♀» e «Nidoran♂» diventano Nidoran-F e Nidoran-M. */
const spName = (n: string) => String(n || '').replace(/♀/g, '-F').replace(/♂/g, '-M');

/** Pokédex di una generazione (limitata tra 1 e 9). */
const dexFor = (gen: number) => Dex.mod(`gen${Math.min(Math.max(gen, 1), 9)}`);

/** Le informazioni su una specie che servono all'interfaccia. */
export type SpeciesInfo = {
  id: string, name: string, num: number, gen: number, types: string[], spriteid: string,
  gender: string, genderRatio: {M: number, F: number}, abilities: Record<string, string>,
  baseStats: Stats, evos: string[], prevo: string, evoLevel?: number, evoType?: string, evoItem?: string,
  evoCondition?: string, legendary: boolean, finalEvo: boolean,
};

/** Le liste per generazione si calcolano una volta sola e restano in memoria. */
const speciesCache = new Map<number, SpeciesInfo[]>();
/** Tutte le specie disponibili in una generazione (niente forme solo da lotta, niente Totem), in ordine di Pokédex. */
export function speciesList(gen: number): SpeciesInfo[] {
  if (speciesCache.has(gen)) return speciesCache.get(gen)!;
  const dex = dexFor(gen);
  const list = dex.species.all()
    .filter((s: any) => s.exists && s.num > 0 && s.gen <= gen && !s.battleOnly &&
      (!s.isNonstandard || s.isNonstandard === 'Past') && !s.name.endsWith('-Totem'))
    .map((s: any) => toInfo(dex, s))
    .sort((a: SpeciesInfo, b: SpeciesInfo) => a.num - b.num || a.name.localeCompare(b.name));
  speciesCache.set(gen, list);
  return list;
}

/** Converte una specie di Showdown in SpeciesInfo; le evoluzioni di generazioni successive vengono escluse. */
function toInfo(dex: any, s: any): SpeciesInfo {
  const evos = (s.evos || []).filter((e: string) => dex.species.get(e).gen <= dex.gen);
  return {
    id: s.id, name: s.name, num: s.num, gen: s.gen, types: s.types, spriteid: s.spriteid,
    gender: s.gender || '', genderRatio: s.genderRatio, abilities: s.abilities, baseStats: s.baseStats,
    evos, prevo: s.prevo, evoLevel: s.evoLevel, evoType: s.evoType, evoItem: s.evoItem, evoCondition: s.evoCondition,
    legendary: s.tags.some((t: string) => /Legendary|Mythical/.test(t)),
    finalEvo: !evos.length && !!s.prevo,
  };
}

/** Una specie per nome (accetta anche id come 'mrmime'), o undefined. */
export function species(gen: number, name: string): SpeciesInfo | undefined {
  const s = dexFor(gen).species.get(spName(name));
  return s.exists ? toInfo(dexFor(gen), s) : undefined;
}

/** Tutte le mosse esistenti in una generazione (niente mosse Z/Dynamax), in ordine alfabetico. */
export function moveList(gen: number) {
  return dexFor(gen).moves.all()
    .filter((m: any) => m.exists && m.gen <= gen && (!m.isNonstandard || m.isNonstandard === 'Past') && !m.isZ && !m.isMax)
    .map((m: any) => ({id: m.id, name: m.name, type: m.type, category: m.category, power: m.basePower, accuracy: m.accuracy, pp: m.pp}))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
}

/** Mosse apprese salendo di livello, nella generazione più recente <= gen che ha dati. */
export function levelUpMoves(gen: number, speciesName: string): {move: string, level: number}[] {
  const dex = dexFor(gen);
  let s = dex.species.get(spName(speciesName));
  for (let guard = 0; guard < 3 && s.exists; guard++) {
    const data = dex.species.getLearnsetData(s.id);
    if (data?.learnset) {
      const byGen = new Map<number, {move: string, level: number}[]>();
      for (const [moveid, sources] of Object.entries<string[]>(data.learnset)) {
        for (const src of sources) {
          const m = /^(\d)L(\d+)$/.exec(src);
          if (!m || +m[1] > gen) continue;
          const g = +m[1];
          if (!byGen.has(g)) byGen.set(g, []);
          byGen.get(g)!.push({move: dex.moves.get(moveid).name, level: +m[2]});
        }
      }
      if (byGen.size) {
        const best = byGen.get(Math.max(...byGen.keys()))!;
        return best.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
      }
    }
    // forme alternative senza learnset proprio: usa la specie base
    s = dex.species.get(s.changesFrom || s.baseSpecies);
    if (s.id === speciesName) break;
  }
  return [];
}

/** Tutte le mosse che la specie può imparare in qualsiasi modo fino a gen (incluse quelle delle pre-evoluzioni). */
export function learnableMoves(gen: number, speciesName: string): string[] {
  const dex = dexFor(gen);
  const out = new Set<string>();
  let s = dex.species.get(spName(speciesName));
  const seen = new Set<string>();
  while (s.exists && !seen.has(s.id)) {
    seen.add(s.id);
    const data = dex.species.getLearnsetData(s.id)?.learnset ||
      dex.species.getLearnsetData(dex.species.get(s.changesFrom || s.baseSpecies).id)?.learnset || {};
    for (const [moveid, sources] of Object.entries<string[]>(data)) {
      if (sources.some(src => +src[0] <= gen)) out.add(dex.moves.get(moveid).name);
    }
    s = dex.species.get(s.prevo);
  }
  return [...out].sort();
}

/** Generatore di numeri casuali tra 0 e 1 (Math.random; nei test uno fisso per risultati ripetibili). */
export type Rng = () => number;
/** Elemento a caso di una lista. */
const pick = <T>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)];

/** Impostazioni della campagna che influenzano il generatore. */
export type Settings = {gen: number, shinyRate?: number, hiddenAbilityChance?: number};

/** Un Pokémon come lo salva la dashboard (squadra, PC, squadre PNG, selvatici). */
export type Mon = {
  id?: string, species: string, nickname?: string, level: number, gender: string, nature: string,
  ability: string, ivs: Stats, evs: Stats, moves: string[], shiny: boolean, item?: string,
  place?: string, owner?: string, team?: string, notes?: string,
  /** PS attuali tra una lotta e l'altra (assente = pieni, 0 = KO) e stato alterato rimasto (par, psn, slp…) */
  hp?: number, status?: string,
};

/** PS massimi con la formula dei giochi (Gen 3+, Shedinja = 1). */
export function maxHp(gen: number, m: Mon) {
  const sp = species(gen, m.species);
  if (!sp) return 0;
  if (sp.baseStats.hp === 1) return 1;
  return Math.floor((2 * sp.baseStats.hp + (m.ivs?.hp ?? 31) + Math.floor((m.evs?.hp ?? 0) / 4)) * m.level / 100) + m.level + 10;
}

/** Crea un Pokémon selvatico con sesso, natura, IV, abilità e mosse casuali secondo le regole della generazione. */
export function generateMon(settings: Settings, speciesName: string, level: number, rng: Rng = Math.random): Mon {
  const gen = settings.gen;
  const s = dexFor(gen).species.get(spName(speciesName));
  if (!s.exists) throw fail(400, 'Specie sconosciuta: {name}', {name: speciesName});
  level = Math.max(1, Math.min(100, Math.round(level)));

  let gender = 'N';
  if (gen >= 2) gender = s.gender || (rng() < s.genderRatio.M ? 'M' : 'F');

  const ivs = Object.fromEntries(STATS.map(st => [st, Math.floor(rng() * 32)])) as Stats;
  const evs = Object.fromEntries(STATS.map(st => [st, 0])) as Stats;
  const nature = gen >= 3 ? pick(Object.keys(NATURES_IT), rng) : '';

  let ability = '';
  if (gen >= 3) {
    const normal = [s.abilities[0], s.abilities[1]].filter(Boolean);
    const hidden = gen >= 5 ? s.abilities.H : undefined;
    ability = hidden && rng() < (settings.hiddenAbilityChance ?? 0.05) ? hidden : pick(normal, rng);
  }

  const rate = settings.shinyRate ?? (gen >= 6 ? 4096 : 8192);
  const shiny = gen >= 2 && rng() < 1 / rate;

  // le ultime 4 mosse imparate entro il livello, senza doppioni
  const moves: string[] = [];
  for (const m of levelUpMoves(gen, s.name).filter(m => m.level <= level).reverse()) {
    if (!moves.includes(m.move)) moves.push(m.move);
    if (moves.length === 4) break;
  }
  if (!moves.length) moves.push(gen >= 1 ? 'Tackle' : 'Struggle');

  return {species: s.name, level, gender, nature, ability, ivs, evs, moves: moves.reverse(), shiny};
}

/** Squadra nel formato "packed" di Showdown. */
export function packTeam(mons: Mon[]): string {
  return Teams.pack(mons.map(m => ({
    name: m.nickname || '', species: m.species, item: m.item || '', ability: m.ability || '',
    moves: m.moves.filter(Boolean), nature: m.nature || '', gender: m.gender === 'N' ? '' : m.gender,
    evs: m.evs, ivs: m.ivs, level: m.level, shiny: m.shiny,
  })));
}

/** Testo esportabile nel teambuilder di Showdown. */
export function exportTeam(mons: Mon[]): string {
  return Teams.export(Teams.unpack(packTeam(mons)));
}

/** Cosa cambia salendo da oldLevel a newLevel: nuove mosse ed evoluzioni per livello. */
export function levelUpInfo(gen: number, speciesName: string, oldLevel: number, newLevel: number) {
  const newMoves = levelUpMoves(gen, speciesName).filter(m => m.level > oldLevel && m.level <= newLevel);
  const s = species(gen, speciesName);
  const evolutions = (s?.evos || []).map(e => species(gen, e)!).filter(Boolean).map(e => ({
    name: e.name, level: e.evoLevel, type: e.evoType, item: e.evoItem, condition: e.evoCondition,
    ready: !!e.evoLevel && e.evoLevel <= newLevel && !e.evoType,
  }));
  return {newMoves, evolutions};
}

/** Tabella dei tipi della generazione: per ogni tipo difensivo, 0 neutro, 1 debole, 2 resiste, 3 immune. */
export function typeChart(gen: number) {
  const dex = dexFor(gen);
  const types = dex.types.all().filter((t: any) => !t.isNonstandard).map((t: any) => t.name);
  const chart: Record<string, Record<string, number>> = {};
  for (const t of types) {
    const dt = dex.types.get(t).damageTaken;
    chart[t] = Object.fromEntries(types.map((a: string) => [a, dt[a] ?? 0]));
  }
  return {types, chart};
}

export function formatId(gen: number) {
  return `gen${gen}customgame`;
}
