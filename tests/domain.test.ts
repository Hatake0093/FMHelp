import test from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '../src/domain/model.ts';
import { evaluateSquad, validatePlayer } from '../src/domain/players.ts';
import { nextStageId, referenceCA, STAGES } from '../src/domain/stages.ts';
import { compareBy, nextSort } from '../src/domain/sorting.ts';
import { parseState } from '../src/services/storage.ts';
import { csvCell } from '../src/modules/import-export/index.ts';

const player = (overrides: Partial<Player> = {}): Player => ({ id: 'a', name: 'Prueba', age: 23, position: 'DFC', ca: 64, pa: 75, notes: '', ...overrides });
const group = (p: Partial<Player>, stage = 0) => evaluateSquad([player(p)], stage)[0].group;

test('las nueve etapas reproducen la tabla maestra y el ajuste LAT', () => {
  assert.deepEqual(STAGES.map(s => referenceCA(s.id, 'DFC')), [55, 65, 75, 90, 105, 120, 130, 140, 150]);
  assert.deepEqual(STAGES.map(s => referenceCA(s.id, 'LAT')), [53, 63, 73, 88, 103, 118, 128, 138, 148]);
  assert.deepEqual(STAGES.map(s => referenceCA(s.id, 'DFC', 'depth')), [40, 50, 60, 75, 90, 105, 115, 125, 135]);
  assert.equal(nextStageId(8), 8);
});
test('CA suficiente tiene prioridad incluso para un joven', () => {
  assert.equal(group({ age: 18, ca: 55 }), 'competitive');
  assert.equal(group({ age: 45, ca: 55 }), 'competitive');
  assert.equal(group({ position: 'LAT', ca: 53 }), 'competitive');
});
test('desarrollo incluye los 23 años y exige PA de siguiente etapa por posición', () => {
  assert.equal(group({ ca: 39, pa: 65 }), 'development');
  assert.equal(group({ ca: 39, pa: 65, age: 24 }), 'review');
  assert.equal(group({ ca: 39, pa: 64 }), 'review');
  assert.equal(group({ position: 'LAT', ca: 37, pa: 63 }), 'development');
  assert.equal(group({ position: 'LAT', ca: 37, pa: 62 }), 'review');
  assert.equal(group({ ca: 134, pa: 150 }, 8), 'development');
  assert.equal(group({ ca: 135, pa: 150 }, 8), 'competitive');
});
test('de los 20 competitivos, 10 son núcleo (CA de la etapa) y el resto rotación con 15 puntos menos', () => {
  const players = [...Array.from({ length: 12 }, (_, i) => player({ id: `n${i}`, ca: 151 + i, pa: 170 })), ...Array.from({ length: 9 }, (_, i) => player({ id: `r${i}`, ca: 136 + i, pa: 150 }))];
  const result = evaluateSquad(players, 8);
  const tier = (id: string) => result.find(e => e.player.id === id)!;
  assert.equal(result.filter(e => e.tier === 'core').length, 10);
  assert.equal(result.filter(e => e.tier === 'depth').length, 10);
  assert.ok(result.filter(e => e.tier === 'core').every(e => e.player.ca >= 150));
  assert.equal(tier('n0').tier, 'depth'); // CA 151: el núcleo ya tiene 10 con más CA
  assert.match(tier('n0').reason, /ya hay 10/);
  assert.equal(tier('n11').tier, 'core');
  assert.equal(tier('r0').group, 'review'); // CA 136: sin plaza, 21.º competitivo
  assert.equal(tier('r1').tier, 'depth');
  assert.equal(group({ ca: 134, pa: 134 }, 8), 'review');
});
test('cupos 20 y 10 sin eliminar jugadores; orden determinista y excedente visible', () => {
  const players = [...Array.from({ length: 22 }, (_, i) => player({ id: `c${i}`, ca: 70 + i, pa: 110 })), ...Array.from({ length: 12 }, (_, i) => player({ id: `d${i}`, ca: 30, pa: 80 + i }))];
  const result = evaluateSquad(players, 0);
  assert.equal(result.length, 34);
  assert.equal(result.filter(e => e.group === 'competitive').length, 20);
  assert.equal(result.filter(e => e.group === 'development').length, 10);
  assert.equal(result.filter(e => e.group === 'review').length, 4);
  assert.equal(result.find(e => e.player.id === 'c0')?.group, 'review');
  const assignments = (p: Player[]) => Object.fromEntries(evaluateSquad(p, 0).map(e => [e.player.id, e.group]));
  assert.deepEqual(assignments(players), assignments([...players].reverse()));
});
test('cambiar etapa reevalúa la plantilla sin mutarla', () => {
  const p = player({ ca: 45, pa: 70 });
  assert.equal(group(p, 0), 'competitive');
  assert.equal(group(p, 1), 'review');
  assert.equal(p.ca, 45);
});
test('ordenar: sentido del primer clic, inversión, orden original y ausentes siempre al final', () => {
  assert.deepEqual(nextSort(null, 'age', 'asc'), { key: 'age', dir: 'asc' });
  assert.deepEqual(nextSort({ key: 'age', dir: 'asc' }, 'age', 'asc'), { key: 'age', dir: 'desc' });
  assert.equal(nextSort({ key: 'age', dir: 'desc' }, 'age', 'asc'), null);
  assert.deepEqual(nextSort({ key: 'age', dir: 'desc' }, 'ca', 'desc'), { key: 'ca', dir: 'desc' });
  const rows = [{ n: 'b', v: 3 }, { n: 'a', v: 3 }, { n: 'c', v: null }, { n: 'd', v: 9 }];
  const order = (dir: 'asc' | 'desc') => [...rows].sort(compareBy({ key: 'v', dir }, r => r.v, r => r.n)).map(r => r.n).join('');
  assert.equal(order('asc'), 'abdc');
  assert.equal(order('desc'), 'dabc');
});
test('validación de números, límites y PA no inferior a CA', () => {
  assert.equal(validatePlayer(player()), null);
  for (const values of [{ ca: 0 }, { ca: 201, pa: 201 }, { ca: 76, pa: 75 }, { age: 23.5 }, { age: NaN }, { name: ' ' }, { pa: Infinity }]) assert.ok(validatePlayer(player(values)));
});
test('copias: ida y vuelta, rechazo de versión, etapa, estructura y duplicados', () => {
  const state = { version: 1, stageId: 2, players: [player()] };
  assert.deepEqual(parseState(JSON.stringify(state)), { ...state, version: 4, archive: [], tracking: { snapshots: [], minutePlans: [] }, squadPlans: [] });
  for (const data of [null, { ...state, version: 2 }, { ...state, stageId: 9 }, { ...state, players: [null] }, { ...state, players: [player(), player()] }, { ...state, players: [player({ pa: 1 })] }]) assert.throws(() => parseState(JSON.stringify(data)));
});
test('CSV conserva comillas y neutraliza fórmulas en nombres y notas', () => {
  assert.equal(csvCell('Juan "El 9"'), '"Juan ""El 9"""');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
});
