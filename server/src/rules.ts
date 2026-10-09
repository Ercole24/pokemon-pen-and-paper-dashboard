// Regole di Pokémon Pen & Paper Version: dadi Fudge (2dF) e tabella di cattura del libretto.
// Funzioni "pure" (nessun accesso a database o rete), quindi facili da testare: vedi rules.test.ts.

/** Faccia di un dado Fudge: '+', '-' o vuota. */
export type Face = '+' | '-' | ' ';

/** Risultato di un tiro: facce, modificatore, totale ed esito con la sua etichetta. */
export type FudgeResult = {
  faces: Face[], modifier: number, total: number,
  outcome: 'super' | 'success' | 'net' | 'notvery' | 'critical' | 'blanks', label: string,
};

/** Etichette italiane degli esiti. */
const LABELS = {
  super: 'Superefficace!', success: 'Successo', net: 'Pari', notvery: 'Non molto efficace',
  critical: 'Fallimento critico', blanks: 'Vuote: Introforza!',
};

/** Tira un dado Fudge (tre facce equiprobabili). rng si può sostituire nei test. */
export function rollFace(rng = Math.random): Face {
  return (['+', '-', ' '] as Face[])[Math.floor(rng() * 3)];
}

/**
 * 2dF + modificatore di Classe (+1 per ogni "+", -1 per ogni "-").
 * Due facce vuote = successo con Introforza, indipendentemente dai modificatori.
 */
export function fudgeOutcome(faces: Face[], modifier = 0): FudgeResult {
  const sum = faces.reduce((a, f) => a + (f === '+' ? 1 : f === '-' ? -1 : 0), 0);
  const total = sum + modifier;
  let outcome: FudgeResult['outcome'];
  if (faces.length >= 2 && faces.slice(0, 2).every(f => f === ' ')) outcome = 'blanks';
  else if (total >= 2) outcome = 'super';
  else if (total === 1) outcome = 'success';
  else if (total === 0) outcome = 'net';
  else if (total === -1) outcome = 'notvery';
  else outcome = 'critical';
  return {faces, modifier, total, outcome, label: LABELS[outcome]};
}

/** Dati per un tentativo di cattura: ball, PS rimasti, stato alterato, livelli, bonus di classe, cattura difficile. */
export type CatchInput = {
  ball: 'poke' | 'great' | 'ultra',
  hpPercent: number,
  status?: string, // slp, par, frz, psn, tox, brn
  confused?: boolean, infatuated?: boolean,
  ownLevel?: number, wildLevel: number,
  typeBonus?: number,
  hardCatch?: boolean, // evoluzione finale o leggendario
};

/**
 * Calcola i modificatori della tabella di cattura (ball, PS, stato, livello, classe).
 * Restituisce l'elenco con etichette, la somma e la soglia da raggiungere (90, o 99 per finali/leggendari).
 */
export function catchModifiers(c: CatchInput) {
  const mods: {label: string, value: number}[] = [];
  mods.push({label: {poke: 'Poké Ball', great: 'Mega Ball', ultra: 'Ultra Ball'}[c.ball], value: {poke: 0, great: 10, ultra: 20}[c.ball]});
  const hp = c.hpPercent;
  mods.push(hp > 75 ? {label: 'PS 100%', value: -10} : hp > 50 ? {label: 'PS 75%', value: 0} :
    hp > 25 ? {label: 'PS 50%', value: 10} : {label: 'PS 25%', value: 20});
  const st: Record<string, [string, number]> = {
    slp: ['Sonno', 15], par: ['Paralisi', 10], frz: ['Congelamento', 10],
    psn: ['Avvelenamento', 5], tox: ['Avvelenamento', 5], brn: ['Scottatura', 5],
  };
  if (c.status && st[c.status]) mods.push({label: st[c.status][0], value: st[c.status][1]});
  if (c.confused) mods.push({label: 'Confusione', value: 5});
  if (c.infatuated) mods.push({label: 'Infatuazione', value: 5});
  if (c.ownLevel !== undefined && c.ownLevel !== c.wildLevel) {
    mods.push(c.ownLevel > c.wildLevel ? {label: 'Tuo LV più alto', value: 5} : {label: 'Tuo LV più basso', value: -5});
  }
  if (c.typeBonus) mods.push({label: 'Bonus tipo (Classe)', value: c.typeBonus});
  const bonus = mods.reduce((a, m) => a + m.value, 0);
  return {mods, bonus, threshold: c.hardCatch ? 99 : 90};
}

/** Esito della cattura: tiro d100 + modificatori >= soglia. */
export function catchResult(roll: number, c: CatchInput) {
  const m = catchModifiers(c);
  const total = roll + m.bonus;
  return {...m, roll, total, caught: total >= m.threshold};
}

/** Bonus cattura di una Classe contro i tipi del Pokémon selvatico. */
export function classTypeBonus(catchBonus: {value: number, types: string[] | 'ALL'} | undefined, wildTypes: string[]) {
  if (!catchBonus) return 0;
  if (catchBonus.types === 'ALL') return catchBonus.value;
  return wildTypes.some(t => (catchBonus.types as string[]).includes(t)) ? catchBonus.value : 0;
}
