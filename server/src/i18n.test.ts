// Controlla che ogni testo mostrato abbia la traduzione inglese in en.ts.
// Raccoglie: il primo argomento di t()/tj()/tr() e il testo di fail() nel codice, gli errori del plugin di Showdown,
// e le liste di dati tradotte quando si mostrano (classi, statistiche, modi d'incontro, spunti, menu…).
// node --import tsx server/src/i18n.test.ts --list  stampa le chiavi mancanti (comodo per aggiungerle).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {EN} from './en.ts';
import {CLASSES, STAT_GROUPS, ALL_STATS} from './classes.ts';
import {METHODS} from './methods.ts';
import {catchModifiers, fudgeOutcome} from './rules.ts';

const root = new URL('../../', import.meta.url).pathname;
const files = (dir: string) => readdirSync(root + dir, {recursive: true}).map(String)
  .filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('en.ts')).map(f => `${dir}/${f}`);
const read = (f: string) => readFileSync(root + f, 'utf8');
/** Stringhe letterali (senza ${}) in un pezzo di codice; non quelle confrontate (kind === 'wild'). */
const literals = (code: string) => [...code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`/g)]
  .filter(m => !/[!=]==\s*$/.test(code.slice(0, m.index))).map(m => (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1'));

/** Argomento n (da 0) di ogni chiamata a una delle funzioni, come testo. */
function args(code: string, fns: string[], n: number) {
  const out: string[] = [];
  for (const m of code.matchAll(new RegExp(`(?<![\\w.])(${fns.join('|')})\\(`, 'g'))) {
    let i = m.index! + m[0].length, depth = 0, arg = 0, start = i;
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === "'" || c === '"' || c === '`') { const q = c; for (i++; i < code.length && code[i] !== q; i++) if (code[i] === '\\') i++; continue; }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (!depth--) break; }
      else if (c === ',' && !depth) { if (arg === n) break; arg++; start = i + 1; }
    }
    if (arg === n) out.push(code.slice(start, i));
  }
  return out;
}

/** Corpo (tra le parentesi) della dichiarazione `const NAME`. */
function block(code: string, name: string) {
  const at = code.search(new RegExp(`const ${name}\\b[^=]*=\\s*`));
  assert.ok(at >= 0, `const ${name} non trovata`);
  let i = code.indexOf('=', at) + 1, depth = 0, start = -1;
  for (; i < code.length; i++) {
    const c = code[i];
    if (c === "'" || c === '"' || c === '`') { const q = c; for (i++; code[i] !== q; i++) if (code[i] === '\\') i++; continue; }
    if ('[{'.includes(c)) { if (!depth++) start = i; }
    else if (']}'.includes(c) && !--depth) return code.slice(start, i + 1);
  }
  throw new Error(name);
}

function keys() {
  const set = new Set<string>();
  const add = (s: string) => s.trim() && set.add(s);
  for (const f of [...files('web/src'), ...files('server/src')]) {
    const code = read(f);
    for (const a of args(code, ['t', 'tj', 'tr'], 0)) literals(a).forEach(add);
    for (const a of args(code, ['fail'], 1)) literals(a).forEach(add);
  }
  const plugin = read('showdown-plugin/pnp.ts');
  for (const m of plugin.matchAll(/['`]\|pnperror\|([^|`'$]+)/g)) add(m[1]);
  for (const a of args(plugin, ['fail'], 0)) literals(a).forEach(s => add(s.split('|')[0]));
  // liste di dati del server
  CLASSES.forEach(c => { add(c.name); if (c.note) add(c.note); });
  [...ALL_STATS, ...Object.keys(STAT_GROUPS)].forEach(add);
  METHODS.forEach(m => { add(m.label); add(m.short); });
  for (const o of ['super', 'success', 'net', 'notvery', 'critical', 'blanks'] as const) {
    const faces = {super: ['+', '+'], success: ['+', ' '], net: ['+', '-'], notvery: ['-', ' '], critical: ['-', '-'], blanks: [' ', ' ']}[o] as any;
    add(fudgeOutcome(faces).label);
  }
  for (const ball of ['poke', 'great', 'ultra'] as const) for (const hpPercent of [100, 70, 40, 10]) for (const status of ['slp', 'par', 'frz', 'psn', 'brn'])
    catchModifiers({ball, hpPercent, status, confused: true, infatuated: true, ownLevel: 5, wildLevel: hpPercent > 50 ? 3 : 9, typeBonus: 5}).mods.forEach(m => add(m.label));
  // liste di dati dell'interfaccia
  const web = (f: string) => read(`web/src/${f}`);
  for (const name of ['WHO', 'DOES', 'WHAT', 'PLOTS']) literals(block(web('pages/Stories.tsx'), name)).forEach(add);
  for (const [f, name] of [['components.tsx', 'STATUS_IT'], ['components.tsx', 'CAT_IT'], ['pages/Music.tsx', 'REPEAT_LABEL'], ['pages/Player.tsx', 'TAB_LABEL']])
    literals(block(web(f), name)).forEach(add);
  for (const m of block(web('main.tsx'), 'NAV').matchAll(/\['[^']*', '([^']+)'/g)) add(m[1]);
  for (const m of block(web('pages/MapEditor.tsx'), 'TOOLS').matchAll(/\['\w+', '([^']+)'/g)) add(m[1]);
  for (const m of block(web('api.ts'), 'ADVENTURES').matchAll(/label: '([^']+)'/g)) add(m[1]);
  for (const m of block(web('pages/Home.tsx'), 'REGIONS').matchAll(/\['([^']+)'/g)) add(m[1]);
  for (const m of block(web('trainers.ts'), 'NPC_CLASSES').matchAll(/\['((?:[^'\\]|\\.)+)'/g)) add(m[1].replace(/\\(.)/g, '$1'));
  return [...set];
}

if (process.argv.includes('--list')) {
  for (const k of keys().filter(k => !(k in EN))) console.log(JSON.stringify(k));
} else {
  test('ogni testo ha la traduzione inglese', () => {
    const missing = keys().filter(k => !(k in EN));
    assert.deepEqual(missing, [], `testi senza traduzione in en.ts:\n${missing.join('\n')}`);
  });
  test('i segnaposto {nome} sono gli stessi nelle due lingue', () => {
    const ph = (s: string) => [...s.matchAll(/\{\w+\}/g)].map(m => m[0]).sort().join();
    const wrong = Object.entries(EN).filter(([it, en]) => ph(it) !== ph(en)).map(([it]) => it);
    assert.deepEqual(wrong, []);
  });
}
