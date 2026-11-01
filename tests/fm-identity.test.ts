import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { DynastyState, Player } from '../src/domain/model.ts';
import { attributeNumber, attributeWarnings, findColumn, FM_ATTRIBUTES, FM_FIELDS, mergeFMValues, readFMValue } from '../src/domain/fm-data.ts';
import { applyFMImport, importableRows, previewImport, readCSV, suggestMapping } from '../src/modules/import-export/fm-csv.ts';
import { parseState } from '../src/services/storage.ts';
import { buildCSVRows } from '../src/modules/import-export/index.ts';

const date = '2026-11-01T08:00:00.000Z';
const options = { saveId: 'Chippenham', sourceFile: 'plantilla.csv', importedAt: date };
const header = 'Unique ID;Jugador;Edad;Mejor pos.;CA;CP;Velocidad;Aceleración;Calificación;Disputados;Sueldo;Final';
const source = `${header}\n2002103581;Juan Pérez;22;DF (C);165;169;15;16;6,92;10 (1);350m € p/m;30/6/2052`;
const preview = (csv = source, existing: Player[] = [], extra = {}) => {
  const table = readCSV(csv);
  return previewImport(table, suggestMapping(table.headers), existing, {}, { ...options, ...extra });
};
const loadReal = (file: string) => readCSV(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));

test('archivo nuevo: 54 IDs, 37 columnas y todos los datos conservados', () => {
  const table = loadReal('moneyball_export_20261101_013742.csv');
  const rows = previewImport(table, suggestMapping(table.headers), [], {}, options);
  assert.equal(rows.length, 54);
  assert.equal(table.headers.length, 37);
  assert.equal(importableRows(rows).length, 54);
  assert.equal(rows.flatMap(r => r.warnings).length, 0);
  assert.equal(rows[0].draft.fm?.uniqueId, '2002103581');
  assert.equal(typeof rows[0].draft.fm?.uniqueId, 'string');
  assert.equal(rows[0].draft.fm?.values['Sueldo'], '350m € p/m');
  assert.equal(rows[0].draft.fm?.values['Calificación'], '6,92');
  assert.equal(rows[0].draft.fm?.values['Reflejos'], '2');
  assert.equal(FM_ATTRIBUTES.filter(a => findColumn(table.headers, a.aliases) >= 0).length, 22);
  let i = 0;
  const first = applyFMImport([], rows, () => `local-${i++}`);
  assert.equal(first.added, 54);
  const second = applyFMImport(first.players, previewImport(table, suggestMapping(table.headers), first.players, {}, options));
  assert.equal(second.added, 0);
  assert.equal(second.updated, 54);
  assert.equal(second.players.length, 54);
  assert.deepEqual(second.players.map(p => p.id), first.players.map(p => p.id));
});

test('el ID actualiza aunque cambie el nombre y mantiene notas e ID local', () => {
  const first = applyFMImport([], preview(), () => 'local-one').players;
  first[0].notes = 'Mi nota manual';
  const next = preview(source.replace('Juan Pérez', 'Apodo nuevo').replace(';165;169;', ';166;170;'), first);
  assert.equal(next[0].action, 'update');
  const result = applyFMImport(first, next);
  assert.equal(result.updated, 1);
  assert.equal(result.players[0].id, 'local-one');
  assert.equal(result.players[0].name, 'Apodo nuevo');
  assert.equal(result.players[0].ca, 166);
  assert.equal(result.players[0].notes, 'Mi nota manual');
  assert.equal(first[0].ca, 165);
});

test('IDs distintos admiten homónimos y un mismo ID en otra partida no se sobrescribe', () => {
  const first = applyFMImport([], preview(), () => 'one').players;
  const otherId = preview(source.replace('2002103581', '2002103582'), first);
  assert.equal(otherId[0].action, 'add');
  const differentSave = preview(source, first, { saveId: 'Otra partida' });
  assert.equal(differentSave[0].action, 'add');
  assert.equal(applyFMImport(first, differentSave, () => 'two').players.length, 2);
  assert.equal(preview(source, first, { saveId: '  CHIPPENHAM  ' })[0].action, 'update');
});

test('IDs repetidos, vacíos, cero o científicos se bloquean sin recurrir al nombre', () => {
  assert.equal(importableRows(preview(`${source}\n2002103581;Otro;22;DFC;160;180;10;11;7;5;100;2052`)).length, 0);
  for (const id of ['', '0', '2.002E9', '123.0', '-1']) assert.equal(importableRows(preview(source.replace('2002103581', id))).length, 0);
  const sameNames = preview(`${source}\n2002103582;Juan Pérez;22;DFC;160;180;10;11;7;5;100;2052`);
  assert.equal(importableRows(sameNames).length, 2);
});

test('vincular legado requiere elección explícita y coincidencia única', () => {
  const legacy: Player = { id: 'manual', name: 'Juan Pérez', age: 20, ca: 150, pa: 170, position: 'DFC', notes: 'Conservar' };
  assert.equal(importableRows(preview(source, [legacy])).length, 0);
  const linked = preview(source, [legacy], { linkByName: true });
  assert.equal(linked[0].action, 'link');
  const result = applyFMImport([legacy], linked);
  assert.equal(result.linked, 1);
  assert.equal(result.players[0].id, 'manual');
  assert.equal(result.players[0].notes, 'Conservar');
  assert.equal(result.players[0].fm?.uniqueId, '2002103581');
  assert.equal(importableRows(preview(source, [legacy, { ...legacy, id: 'other' }], { linkByName: true })).length, 0);
});

test('CSV parcial con ID: cuatro actualizaciones conservan jugadores y atributos omitidos', () => {
  const latest = loadReal('moneyball_export_20261101_013742.csv');
  let i = 0;
  const full = applyFMImport([], previewImport(latest, suggestMapping(latest.headers), [], {}, options), () => `p-${i++}`).players;
  const included = latest.headers.map((header, index) => ({ header, index })).filter(column => !['Velocidad', 'Aceleración'].includes(column.header));
  const four = { ...latest, headers: included.map(column => column.header), rows: latest.rows.slice(0, 4).map(row => included.map(column => row[column.index])) };
  const update = applyFMImport(full, previewImport(four, suggestMapping(four.headers), full, {}, options));
  assert.equal(update.updated, 4);
  assert.equal(update.players.length, 54);
  assert.equal(update.players[0].fm?.values['Velocidad'], '15');
});

test('atributos inválidos no se convierten en ceros y generan avisos', () => {
  assert.equal(attributeNumber('20'), 20);
  for (const raw of ['', '-', '0', '21', '4,5', '3-7']) assert.equal(attributeNumber(raw), null);
  assert.equal(attributeWarnings({ Velocidad: '21', Reflejos: '-', Aceleración: '15' }).length, 1);
  const rows = preview(source.replace(';15;16;', ';21;-;'));
  assert.equal(rows[0].warnings.length, 1);
  assert.equal(importableRows(rows).length, 1);
});

test('columnas omitidas se conservan; alias nuevos y vacíos sustituyen datos anteriores', () => {
  const merged = mergeFMValues({ Velocidad: '15', Sueldo: '100 €', ColumnaFutura: 'X' }, { Pace: '', Wage: '200 €' });
  assert.equal(merged.Velocidad, undefined);
  assert.equal(merged.Pace, '');
  assert.equal(merged.Sueldo, undefined);
  assert.equal(merged.Wage, '200 €');
  assert.equal(merged.ColumnaFutura, 'X');
});

test('JSON conserva todos los datos FM y admite copias antiguas sin metadata', () => {
  const players = applyFMImport([], preview(), () => 'one').players;
  const state: DynastyState = { version: 4, stageId: 5, players, archive: [], fmSaveId: 'Chippenham', tracking: { snapshots: [], minutePlans: [] }, squadPlans: [] };
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  const legacy = { ...players[0] }; delete legacy.fm;
  assert.deepEqual(parseState(JSON.stringify({ version: 1, stageId: 0, players: [legacy] })).players[0], legacy);
  assert.throws(() => parseState(JSON.stringify({ ...state, players: [players[0], { ...players[0], id: 'other-local' }] })));
  assert.throws(() => parseState(JSON.stringify({ ...state, players: [{ ...players[0], fm: { ...players[0].fm, values: { Velocidad: 15 } } }] })));
  assert.throws(() => parseState(JSON.stringify({ ...state, fmSaveId: '' })));
});

test('exportación CSV incluye identidad y columnas FM con sus valores originales', () => {
  const players = applyFMImport([], preview(), () => 'one').players;
  const rows = buildCSVRows({ version: 4, stageId: 0, players, archive: [], tracking: { snapshots: [], minutePlans: [] }, squadPlans: [] });
  assert.equal(rows[1][rows[0].indexOf('Unique ID')], '2002103581');
  assert.equal(rows[1][rows[0].indexOf('FM · Calificación')], '6,92');
  assert.equal(rows[1][rows[0].indexOf('FM · Disputados')], '10 (1)');
  assert.equal(readFMValue(players[0].fm, FM_FIELDS.wage), '350m € p/m');
});
