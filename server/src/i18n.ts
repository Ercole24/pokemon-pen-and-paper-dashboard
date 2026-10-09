// Traduzioni, condivise da server e interfaccia.
// La chiave è il testo italiano (la lingua in cui è scritto il codice); EN (en.ts) lo traduce in inglese.
// Un testo senza traduzione resta in italiano. I segnaposto {nome} vengono sostituiti da vars.
import {EN} from './en.ts';

export type Lang = 'it' | 'en';
export const LANGS: Lang[] = ['en', 'it'];

/** Testo nella lingua scelta, con i segnaposto sostituiti. */
export function translate(lang: Lang, s: string, vars?: Record<string, unknown>): string {
  const text = lang === 'en' ? EN[s] ?? s : s;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : text;
}

/** Errore con un testo da tradurre (chiave + segnaposto) e un codice HTTP. */
export const fail = (statusCode: number, message: string, vars?: Record<string, unknown>) =>
  Object.assign(new Error(message), {statusCode, vars});
