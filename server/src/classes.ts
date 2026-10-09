// Classi da Allenatore del libretto (traduzione italiana).
// Ogni classe modifica le statistiche dell'Allenatore (+n / -n) e dà un bonus alla cattura contro certi tipi.

/** Le 12 statistiche dell'Allenatore, divise in Corpo, Mente e Anima. */
export const STAT_GROUPS = {
  CORPO: ['Salute', 'Forza', 'Rapidità', 'Difesa'],
  MENTE: ['Percezione', 'Saggezza', 'Intelletto', 'Nervi'],
  ANIMA: ['Carisma', 'Sicurezza', 'Intuito', 'Fortuna'],
} as const;

/** Le 12 statistiche in un'unica lista. */
export const ALL_STATS = Object.values(STAT_GROUPS).flat();

/** Una classe: nome, modificatori alle statistiche, bonus cattura (valore + tipi, o 'ALL' per tutti), nota. */
export type TrainerClass = {
  name: string,
  mods: Record<string, number>,
  catchBonus: {value: number, types: string[] | 'ALL'},
  note?: string,
};

/** Scorciatoia per scrivere la tabella qui sotto in una riga per classe. */
const c = (name: string, mods: Record<string, number>, value: number, types: string[] | 'ALL', note?: string): TrainerClass =>
  ({name, mods, catchBonus: {value, types}, note});

/** Tabella delle classi. I tipi sono in inglese perché così li usa Showdown. */
export const CLASSES: TrainerClass[] = [
  c('Fantallenatore', {Nervi: 1, Rapidità: 1, Intuito: 1, Sicurezza: 1, Carisma: -1}, 5, 'ALL'),
  c('Saccopelista', {Forza: 1, Difesa: 1, Percezione: 1}, 10, ['Rock', 'Ground']),
  c('Bellezza', {Salute: 1, Carisma: 2, Sicurezza: 2, Intelletto: -1, Saggezza: -1, Intuito: -1}, 10, ['Fire', 'Ice']),
  c('Centauro/Ciclista', {Nervi: 1, Difesa: 2, Rapidità: 1, Carisma: -1}, 10, ['Poison', 'Flying']),
  c('Ornitologo', {Percezione: 2, Rapidità: 1}, 15, ['Flying']),
  c('Cinturanera', {Forza: 1, Difesa: 2, Rapidità: 1, Fortuna: -1}, 15, ['Fighting']),
  c('Allevatore', {Fortuna: 1, Carisma: 1, Intuito: 1, Forza: -1}, 10, ['Normal', 'Fairy']),
  c('Pigliamosche', {Rapidità: 2, Intelletto: 1, Percezione: 1, Carisma: -2}, 15, ['Bug']),
  c('Ladro', {Rapidità: 1, Sicurezza: 2, Nervi: 1, Intuito: -1}, 5, 'ALL'),
  c('Medium', {Intuito: 3, Salute: -1}, 15, ['Ghost']),
  c('Cuoco/Chef/Fornaio', {Carisma: 3, Nervi: -1}, 10, ['Fairy', 'Normal']),
  c('Domadraghi', {Sicurezza: 2}, 15, ['Dragon'], '+/- Saggezza vicino a un Drago'),
  c('Pescatore', {Saggezza: 2, Fortuna: 1, Intuito: 1, Rapidità: -1}, 15, ['Water']),
  c("Giocatore d'azzardo", {Fortuna: 4, Intuito: -1, Nervi: -1, Salute: -1, Saggezza: -1, Difesa: -1}, 10, ['Dark', 'Normal']),
  c('Giocoliere/Mangiafuoco', {Rapidità: 2, Percezione: 1, Nervi: 1, Carisma: -1}, 10, ['Fire', 'Poison']),
  c('Bullo/Pupa', {Fortuna: 1, Nervi: 1, Carisma: 1, Sicurezza: 1, Forza: -1, Saggezza: -1}, 10, ['Normal', 'Fighting']),
  c('Musicista', {Rapidità: 1, Carisma: 1, Salute: 1}, 10, ['Electric', 'Rock']),
  c('Pokéfan', {Intuito: 2, Intelletto: 1}, 5, 'ALL'),
  c('Sensitivo', {Saggezza: 2, Intuito: 1, Salute: 1, Forza: -1, Difesa: -1}, 15, ['Psychic']),
  c('Saggio', {Saggezza: 4, Forza: -4}, 10, ['Grass', 'Psychic', 'Ice']),
  c('Scienziato/Ingegnere', {Intelletto: 4, Carisma: -2, Forza: -1}, 10, ['Electric', 'Steel']),
  c('Nuotatore', {Difesa: 1, Forza: 1, Percezione: 1}, 10, ['Water', 'Ice']),
];
