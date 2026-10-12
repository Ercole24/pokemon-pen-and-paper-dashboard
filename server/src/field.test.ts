import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldPass, hasBike, pickDoor, reachable} from './field.ts';

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

test('bicicletta', () => {
  assert.equal(hasBike('Bicicletta, Pozione'), true);
  assert.equal(hasBike('Pozione'), false);
});

test('coda delle porte: gruppi per porta, nuova porta in fondo, stessa porta = toglie', () => {
  let q = pickDoor([], 'a', 'm1', 'w1');
  q = pickDoor(q, 'b', 'm1', 'w2');
  q = pickDoor(q, 'c', 'm1', 'w2');
  q = pickDoor(q, 'd', 'm1', 'w3');
  assert.deepEqual(q.map(g => g.trainers), [['a'], ['b', 'c'], ['d']]);
  q = pickDoor(q, 'a', 'm2', 'w9'); // a è entrato in un'altra mappa e sceglie una porta nuova: in fondo
  assert.deepEqual(q.map(g => [g.warpId, g.trainers]), [['w2', ['b', 'c']], ['w3', ['d']], ['w9', ['a']]]);
  q = pickDoor(q, 'd', 'm1', 'w3'); // di nuovo la stessa: tolta, il gruppo vuoto sparisce
  assert.deepEqual(q.map(g => g.warpId), ['w2', 'w9']);
});
