import test from 'node:test';
import assert from 'node:assert/strict';
import type { Player, SnapshotContext } from '../src/domain/model.ts';
import { evaluateSquad } from '../src/domain/players.ts';
import { evaluateYouth, squadOf } from '../src/domain/squads.ts';
import { emptyState, parseState } from '../src/services/storage.ts';
import { importWithTracking } from '../src/modules/analysis/tracking.ts';
import { applyFMImport, previewImport, readCSV, suggestMapping } from '../src/modules/import-export/fm-csv.ts';
import { buildCSVRows } from '../src/modules/import-export/index.ts';
import type { SquadId } from '../src/domain/model.ts';

const player = (id: string, overrides: Partial<Player> = {}): Player => ({ id, name: id, age: 17, position: 'DC', ca: 30, pa: 80, notes: '', ...overrides });
const rowsFor = (csv: string, squad?: SquadId, existing: Player[] = []) => {
  const table = readCSV(csv);
  return previewImport(table, suggestMapping(table.headers), existing, {}, { saveId: 'Chippenham', sourceFile: 'x.csv', importedAt: '2026-11-01T12:00:00Z', ...(squad ? { squad } : {}) });
};
const header = 'Unique ID;Jugador;Edad;Mejor pos.;CA;CP;Minutos;Remate';
const csvAna = `${header}\n1;Ana;17;DC;62;100;200;12`;
const csvBeto = `${header}\n2;Beto;19;DC;70;110;300;13`;
const context: SnapshotContext = { gameDate: '2026-10-01', season: '2026/27', competition: 'Liga', statsFrom: '2026-07-01', statsTo: '2026-10-01' };

test('sin plantilla indicada, el jugador es del primer equipo; los juveniles no consumen sus cupos', () => {
  assert.equal(squadOf(player('a')), 'first');
  const players = [player('a', { ca: 60 }), player('b', { squad: 'u21', ca: 90 }), player('c', { squad: 'u18', ca: 90 })];
  const result = evaluateSquad(players, 0);
  assert.deepEqual(result.map(e => e.player.id), ['a']);
});

test('Sub-21: sube con CA de rotación; proyecto con PA de la siguiente etapa; supera 21 años = revisar', () => {
  const status = (p: Partial<Player>, stage = 0) => evaluateYouth([player('x', { squad: 'u21', age: 20, ...p })], 'u21', stage)[0].status;
  assert.equal(status({ ca: 40 }), 'promote'); // rotación etapa 0 = 40
  assert.equal(status({ ca: 39, pa: 65 }), 'project'); // PA objetivo = núcleo etapa 1 = 65
  assert.equal(status({ ca: 39, pa: 64 }), 'review');
  assert.equal(status({ ca: 39, pa: 90, age: 22 }), 'review');
  assert.equal(status({ ca: 45, age: 22 }), 'promote'); // si ya tiene el nivel, la edad no lo impide
  assert.equal(status({ position: 'LAT', ca: 38 }), 'promote'); // LAT: dos puntos menos
  assert.match(evaluateYouth([player('x', { squad: 'u21', age: 22, ca: 30 })], 'u21', 0)[0].reason, /21 años/);
});

test('Sub-18 admite 15 a 18 años: sube desde los 17 con PA de proyecto; pasar de 18 obliga a subir o salir', () => {
  const status = (p: Partial<Player>) => evaluateYouth([player('x', { squad: 'u18', ...p })], 'u18', 0)[0].status;
  assert.equal(status({ age: 15, pa: 80 }), 'project');
  assert.equal(status({ age: 16, pa: 80 }), 'project');
  assert.equal(status({ age: 17, pa: 80 }), 'promote');
  assert.equal(status({ age: 18, pa: 64 }), 'review');
  assert.equal(status({ age: 19, pa: 80 }), 'promote');
  assert.equal(status({ age: 19, pa: 60 }), 'review');
  assert.equal(status({ age: 16, pa: 60 }), 'review');
});

test('importar un CSV con plantilla etiqueta a los jugadores, y un CSV sin plantilla los asciende', () => {
  const u21 = rowsFor(csvAna, 'u21');
  assert.equal(u21[0].draft.squad, 'u21');
  const imported = applyFMImport([], u21, () => 'id-1').players;
  assert.equal(imported[0].squad, 'u21');
  const promoted = rowsFor(csvAna, undefined, imported);
  assert.equal(promoted[0].action, 'update');
  assert.equal(promoted[0].fromSquad, 'u21');
  const after = applyFMImport(imported, promoted).players;
  assert.equal(after[0].squad, undefined);
  assert.equal(squadOf(after[0]), 'first');
  assert.equal(rowsFor(csvAna, undefined, after)[0].fromSquad, undefined);
});

test('cada plantilla tiene su corte aunque compartan fecha y contexto; repetir el mismo se rechaza', () => {
  let i = 0; const id = () => `id-${++i}`;
  const first = importWithTracking(emptyState(), rowsFor(csvAna), 'Chippenham', context, id);
  const both = importWithTracking(first.state, rowsFor(csvBeto, 'u21', first.state.players), 'Chippenham', context, id);
  assert.deepEqual(both.state.tracking.snapshots.map(s => s.squad), [undefined, 'u21']);
  assert.throws(() => importWithTracking(both.state, rowsFor(csvBeto, 'u21', both.state.players), 'Chippenham', context, id), /Ya existe/);
  assert.throws(() => importWithTracking(both.state, rowsFor(csvAna, undefined, both.state.players), 'Chippenham', context, id), /Ya existe/);
});

test('la partida conserva la plantilla de jugadores y cortes; valores inválidos se rechazan; CSV las distingue', () => {
  let i = 0; const id = () => `id-${++i}`;
  const first = importWithTracking(emptyState(), rowsFor(csvAna), 'Chippenham', context, id);
  const state = importWithTracking(first.state, rowsFor(csvBeto, 'u18', first.state.players), 'Chippenham', context, id).state;
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  const raw = JSON.parse(JSON.stringify(state));
  raw.players[1].squad = 'u40';
  assert.throws(() => parseState(JSON.stringify(raw)));
  const raw2 = JSON.parse(JSON.stringify(state));
  raw2.tracking.snapshots[1].squad = 'first';
  assert.throws(() => parseState(JSON.stringify(raw2)));
  const rows = buildCSVRows(state);
  const col = rows[0].indexOf('Plantilla');
  assert.deepEqual(rows.slice(1).map(r => r[col]), ['Primer equipo', 'Sub-18']);
});
