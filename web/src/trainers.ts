// Sprite degli Allenatori (immagini di Showdown), classi delle squadre PNG e medaglie per regione.
// trainerSprites.json è l'elenco dei nomi degli sprite disponibili su Showdown (es. 'brock', 'brock-gen3').
import SPRITES from './trainerSprites.json';
import {LANG} from './i18n';
import {CONFIG} from './api';

/** Per sapere velocemente se uno sprite esiste. */
const ALL = new Set<string>(SPRITES as string[]);

/** Sceglie la variante dello sprite più adatta alla generazione della campagna. */
export function resolveTrainerSprite(base: string, gen: number): string {
  if (!base) return '';
  const variants = (SPRITES as string[]).filter(n => n === base || n.startsWith(base + '-'));
  if (!variants.length) return ALL.has(base) ? base : '';
  const genOf = (n: string) => +(/-gen(\d)/.exec(n)?.[1] || 0);
  const plain = variants.filter(n => !/-(masters|lgpe|anime|jp)/.test(n) && !/jp$/.test(n));
  for (let g = gen; g >= 1; g--) {
    const exact = plain.find(n => n === `${base}-gen${g}`) || plain.find(n => genOf(n) === g);
    if (exact) return exact;
  }
  return ALL.has(base) ? base : plain[0] || variants[0];
}

/** URL dell'immagine di uno sprite, da internet (Showdown). */
export const trainerSpriteUrl = (name: string) => name ? `${CONFIG.assets}sprites/trainers/${name}.png` : '';

/** Classi del libretto → sprite [maschio, femmina]. */
export const CLASS_SPRITES: Record<string, [string, string]> = {
  'Fantallenatore': ['acetrainer', 'acetrainerf'],
  'Saccopelista': ['backpacker', 'backpackerf'],
  'Bellezza': ['gentleman', 'beauty'],
  'Centauro/Ciclista': ['biker', 'cyclistf'],
  'Ornitologo': ['birdkeeper', 'birdkeeper'],
  'Cinturanera': ['blackbelt', 'battlegirl'],
  'Allevatore': ['pokemonbreeder', 'pokemonbreederf'],
  'Pigliamosche': ['bugcatcher', 'bugcatcher'],
  'Ladro': ['burglar', 'burglar'],
  'Medium': ['psychic', 'channeler'],
  'Cuoco/Chef/Fornaio': ['chef', 'baker'],
  'Domadraghi': ['dragontamer', 'dragontamer'],
  'Pescatore': ['fisherman', 'fisherman'],
  "Giocatore d'azzardo": ['gambler', 'gambler'],
  'Giocoliere/Mangiafuoco': ['juggler', 'firebreather'],
  'Bullo/Pupa': ['youngster', 'lass'],
  'Musicista': ['guitarist', 'musician'],
  'Pokéfan': ['pokefan', 'pokefanf'],
  'Sensitivo': ['psychic', 'psychicf'],
  'Saggio': ['sage', 'sage'],
  'Scienziato/Ingegnere': ['scientist', 'scientistf'],
  'Nuotatore': ['swimmer', 'swimmerf'],
};

/** Sprite di un Allenatore: quello scelto a mano, altrimenti quello della sua classe e del suo sesso. */
export function spriteForTrainer(t: {className?: string, gender?: string, sprite?: string}, gen: number) {
  if (t.sprite) return resolveTrainerSprite(t.sprite, gen);
  const pair = CLASS_SPRITES[t.className || ''] || ['acetrainer', 'acetrainerf'];
  return resolveTrainerSprite(t.gender === 'F' ? pair[1] : pair[0], gen);
}

/** Classi per le squadre PNG: [nome italiano (si traduce con t()), sprite]. */
export const NPC_CLASSES: [string, string][] = [
  ['Capopalestra', ''], ['Superquattro', ''], ['Campione', ''], ['Rivale', ''],
  ['Recluta Team Rocket', 'rocketgrunt'], ['Recluta Team Rocket (F)', 'rocketgruntf'],
  ['Recluta Team Idro', 'aquagrunt'], ['Recluta Team Magma', 'magmagrunt'],
  ['Recluta Team Galassia', 'galacticgrunt'], ['Recluta Team Galassia (F)', 'galacticgruntf'],
  ['Recluta Team Plasma', 'plasmagrunt'], ['Recluta Team Flare', 'flaregrunt'], ['Recluta Team Skull', 'skullgrunt'],
  ['Fantallenatore', 'acetrainer'], ['Fantallenatrice', 'acetrainerf'], ['Montanaro', 'hiker'], ['Campeggiatore', 'camper'],
  ['Picnic', 'picnicker'], ['Gentiluomo', 'gentleman'], ['Signorina', 'lady'], ['Poliziotto', 'policeman'],
  ['Bullo', 'youngster'], ['Pupa', 'lass'], ['Pigliamosche', 'bugcatcher'], ['Cinturanera', 'blackbelt'], ['Lottatrice', 'battlegirl'],
  ['Pescatore', 'fisherman'], ['Nuotatore', 'swimmer'], ['Nuotatrice', 'swimmerf'], ['Ornitologo', 'birdkeeper'],
  ['Sensitivo', 'psychic'], ['Sensitiva', 'psychicf'], ['Medium', 'channeler'], ['Scienziato', 'scientist'], ['Saggio', 'sage'],
  ['Centauro', 'biker'], ['Ciclista', 'cyclistf'], ['Bellezza', 'beauty'], ['Giocoliere', 'juggler'], ['Mangiafuoco', 'firebreather'],
  ['Chitarrista', 'guitarist'], ['Giocatore d\'azzardo', 'gambler'], ['Ladro', 'burglar'], ['Domadraghi', 'dragontamer'],
  ['Allevatore', 'pokemonbreeder'], ['Allevatrice', 'pokemonbreederf'], ['Pokéfan', 'pokefan'], ['Ranger Pokémon', 'pokemonranger'],
  ['Kimono', 'kimonogirl'], ['Ninja', 'ninjaboy'], ['Infermiera', 'nurse'],
];

/** Tutti gli sprite di base (senza varianti di generazione), per la scelta libera. */
export const BASE_SPRITES = [...new Set((SPRITES as string[]).map(n => n.replace(/-.*/, '')))].sort();

// --- medaglie ---
/** Nomi delle 8 medaglie per regione (tabelle a parte: lo stesso nome italiano può avere traduzioni diverse). */
const BADGES_IT: Record<string, string[]> = {
  Kanto: ['Sasso', 'Cascata', 'Tuono', 'Arcobaleno', 'Anima', 'Palude', 'Vulcano', 'Terra'],
  Johto: ['Zefiro', 'Alveare', 'Piana', 'Nebbia', 'Tempesta', 'Minerale', 'Gelo', 'Levante'],
  Hoenn: ['Pietra', 'Nocca', 'Dinamo', 'Calore', 'Equilibrio', 'Piuma', 'Mente', 'Pioggia'],
  Sinnoh: ['Carbone', 'Foresta', 'Lastra', 'Palude', 'Reliquia', 'Miniera', 'Ghiacciolo', 'Faro'],
  Unima: ['Trio', 'Base', 'Coleottero', 'Saetta', 'Sisma', 'Jet', 'Gelo', 'Leggenda'],
  Kalos: ['Coleottero', 'Parete', 'Lotta', 'Pianta', 'Voltaggio', 'Folletto', 'Psiche', 'Iceberg'],
  Galar: ['Erba', 'Acqua', 'Fuoco', 'Lotta', 'Folletto', 'Roccia', 'Buio', 'Drago'],
};
const BADGES_EN: Record<string, string[]> = {
  Kanto: ['Boulder', 'Cascade', 'Thunder', 'Rainbow', 'Soul', 'Marsh', 'Volcano', 'Earth'],
  Johto: ['Zephyr', 'Hive', 'Plain', 'Fog', 'Storm', 'Mineral', 'Glacier', 'Rising'],
  Hoenn: ['Stone', 'Knuckle', 'Dynamo', 'Heat', 'Balance', 'Feather', 'Mind', 'Rain'],
  Sinnoh: ['Coal', 'Forest', 'Cobble', 'Fen', 'Relic', 'Mine', 'Icicle', 'Beacon'],
  Unima: ['Trio', 'Basic', 'Insect', 'Bolt', 'Quake', 'Jet', 'Freeze', 'Legend'],
  Kalos: ['Bug', 'Cliff', 'Rumble', 'Plant', 'Voltage', 'Fairy', 'Psychic', 'Iceberg'],
  Galar: ['Grass', 'Water', 'Fire', 'Fighting', 'Fairy', 'Rock', 'Dark', 'Dragon'],
};
/** Numero delle 8 medaglie per regione nelle immagini di PokeAPI (sprites/badges/<n>.png; Unima e Galar ne hanno di più). */
const BADGE_IDS: Record<string, number[]> = {
  Kanto: [1, 2, 3, 4, 5, 6, 7, 8], Johto: [9, 10, 11, 12, 13, 14, 15, 16], Hoenn: [17, 18, 19, 20, 21, 22, 23, 24],
  Sinnoh: [25, 26, 27, 28, 29, 30, 31, 32], Unima: [33, 34, 36, 37, 38, 39, 40, 41], Kalos: [43, 44, 45, 46, 47, 48, 49, 50],
  Galar: [51, 52, 53, 54, 56, 57, 59, 60],
};
/** Immagine di una medaglia, da internet (PokeAPI). */
export const badgeUrl = (region: string, i: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${BADGE_IDS[region][i]}.png`;
/** Medaglie di una regione, o null se la regione non ha medaglie. */
export const badgesOf = (region: string) => (LANG === 'it' ? BADGES_IT : BADGES_EN)[region] || null;
