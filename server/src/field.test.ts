import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldPass, hasBike, majority, reachable} from './field.ts';

// 3x1: giocatore a sinistra, acqua in mezzo, terra a destra
const map = {width: 3, height: 1, layers: [{type: 'collision', data: [0, 2, 0]}], objects: []};

test('MN nello zaino + medaglia giusta per attraversare', () => {
  assert.deepEqual([...reachable(map, {x: 0, y: 0}, 5, new Set())], []);
  assert.deepEqual([...fieldPass('MN03', [], 'Kanto')], []); // manca la Medaglia Anima
  assert.deepEqual([...fieldPass('MN03', [4], 'Kanto')], [2]);
  assert.deepEqual([...fieldPass('MN Surf, Pozione x2', [], 'Unima')], [2]); // regione senza medaglie richieste
  assert.deepEqual([...fieldPass('Pozione', [0, 1, 2, 3, 4, 5, 6, 7], 'Kanto')], []);
  assert.deepEqual([...reachable(map, {x: 0, y: 0}, 5, new Set(), fieldPass('HM03', [4], 'Kanto'))].sort(), ['1,0', '2,0']);
  assert.deepEqual([...reachable({...map, layers: [{type: 'collision', data: [0, 1, 0]}]}, {x: 0, y: 0}, 5, new Set(), new Set([2]))], []);
  // albero (oggetto) in mezzo: serve Taglio
  const tree = {...map, layers: [{type: 'collision', data: [0, 0, 0]}], objects: [{kind: 'obstacle', x: 1, y: 0, field: 3}]};
  assert.deepEqual([...reachable(tree, {x: 0, y: 0}, 5, new Set())], []);
  assert.deepEqual([...reachable(tree, {x: 0, y: 0}, 5, new Set(), fieldPass('MN01', [1], 'Kanto'))].sort(), ['1,0', '2,0']);
});

test('bicicletta e voto a maggioranza', () => {
  assert.equal(hasBike('Bicicletta, Pozione'), true);
  assert.equal(hasBike('Pozione'), false);
  assert.equal(majority(2, 3), true);
  assert.equal(majority(2, 4), false);
  assert.equal(majority(1, 1), true);
});
