import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evoCheck, formatBag, itemEffect, parseBag} from './items.ts';

test('zaino: lettura, scrittura ed effetti in lotta', () => {
  assert.deepEqual(parseBag('Poké Ball x5, Pozione x2\nAntidoto'), [['Poké Ball', 5], ['Pozione', 2], ['Antidoto', 1]]);
  assert.equal(formatBag([['Pozione', 1], ['Antidoto', 0], ['Poké Ball', 3]]), 'Pozione, Poké Ball x3');
  assert.deepEqual(itemEffect(' Super  Potion '), {heal: 50});
  assert.deepEqual(itemEffect('Revitalizzante'), {revive: 0.5});
  assert.deepEqual(itemEffect('Poké Ball'), {ball: 'poke'});
  assert.equal(itemEffect('MN03'), undefined);
});

test('evoluzioni: livello, pietra nello zaino, scambio solo Master', () => {
  assert.equal(evoCheck({evoLevel: 16}, 15, []).ok, false);
  assert.equal(evoCheck({evoLevel: 16}, 16, []).ok, true);
  assert.equal(evoCheck({evoType: 'useItem', evoItem: 'Thunder Stone'}, 5, ['Pozione']).ok, false);
  assert.equal(evoCheck({evoType: 'useItem', evoItem: 'Thunder Stone'}, 5, ['Pozione, Pietratuono']).ok, true);
  assert.deepEqual([evoCheck({evoType: 'trade'}, 50, []).ok, evoCheck({evoType: 'trade'}, 50, []).gmOnly], [false, true]);
});
