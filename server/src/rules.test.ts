// Test automatici (npm test): regole dei dadi, cattura e generatore di Pokémon per generazione.
// Usano il test runner integrato in Node (node:test), senza librerie esterne.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fudgeOutcome, catchResult, classTypeBonus} from './rules.ts';
import {generateMon, levelUpMoves, packTeam, speciesList} from './dex.ts';

/** Ogni combinazione di facce dà l'esito previsto dal libretto; due vuote = Introforza anche con malus. */
test('dadi Fudge', () => {
  assert.equal(fudgeOutcome(['+', '+']).outcome, 'super');
  assert.equal(fudgeOutcome(['+', ' ']).outcome, 'success');
  assert.equal(fudgeOutcome(['+', '-']).outcome, 'net');
  assert.equal(fudgeOutcome(['-', ' ']).outcome, 'notvery');
  assert.equal(fudgeOutcome(['-', '-']).outcome, 'critical');
  assert.equal(fudgeOutcome([' ', ' '], -3).outcome, 'blanks');
  assert.equal(fudgeOutcome(['-', ' '], 2).outcome, 'success');
});

/** Somma dei modificatori, soglia della cattura difficile e bonus di classe. */
test('cattura', () => {
  const r = catchResult(70, {ball: 'great', hpPercent: 20, status: 'slp', wildLevel: 5, ownLevel: 10});
  assert.equal(r.bonus, 10 + 20 + 15 + 5);
  assert.ok(r.caught);
  assert.equal(catchResult(95, {ball: 'poke', hpPercent: 100, wildLevel: 50, hardCatch: true}).caught, false);
  assert.equal(classTypeBonus({value: 15, types: ['Water']}, ['Water', 'Ice']), 15);
  assert.equal(classTypeBonus({value: 5, types: 'ALL'}, ['Bug']), 5);
});

/** Il Pokédex rispetta la generazione; in Gen 1 niente abilità né sesso; le mosse e le squadre di Showdown funzionano. */
test('generatore per generazione', () => {
  assert.ok(speciesList(4).every(s => s.gen <= 4));
  assert.ok(!speciesList(4).some(s => s.name === 'Snivy'));
  const m = generateMon({gen: 4}, 'Pidgey', 12, () => 0.3);
  assert.equal(m.level, 12);
  assert.ok(m.moves.length >= 1 && m.moves.length <= 4);
  assert.ok(m.nature && m.ability);
  const g1 = generateMon({gen: 1}, 'Pidgey', 12);
  assert.equal(g1.ability, '');
  assert.equal(g1.gender, 'N');
  assert.ok(levelUpMoves(4, 'Pidgey').some(m => m.move === 'Gust'));
  assert.match(packTeam([m]), /Pidgey/);
});
