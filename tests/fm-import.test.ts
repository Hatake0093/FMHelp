import test from 'node:test';
import assert from 'node:assert/strict';
import { importableRows, mapFMPosition, previewImport, readCSV, suggestMapping } from '../src/modules/import-export/fm-csv.ts';
import type { Player } from '../src/domain/model.ts';
import { evaluateSquad } from '../src/domain/players.ts';

const header = 'Jugador;Edad;Mejor pos.;CA;CP';
const preview = (csv: string, existing: Player[] = []) => {
  const table = readCSV(csv);
  return previewImport(table, suggestMapping(table.headers), existing);
};

test('CSV legado sin ID: CP→PA, acentos y omisión de nombres existentes', () => {
  // Fixture estable: no depende de exportaciones personales antiguas que puedan retirarse.
  const source = 'País;Jugador;Mejor pos.;Edad;CA;CP\nArgentina;Alan Giménez;MP (C);20;67;198\nTurquía;Murat Yıldız;MP (I);18;70;150\nEspaña;José Núñez;DF (C);23;75;100';
  const table = readCSV(source);
  const mapping = suggestMapping(table.headers);
  const rows = previewImport(table, mapping, []);
  assert.equal(table.delimiter, ';');
  assert.equal(table.headers.length, 6);
  assert.equal(rows.length, 3);
  assert.equal(importableRows(rows).length, 3);
  assert.equal(table.headers[mapping.pa], 'CP');
  assert.equal(rows[0].draft.name, 'Alan Giménez');
  assert.equal(rows[0].draft.ca, 67);
  assert.equal(rows[0].draft.pa, 198);
  assert.equal(rows[0].draft.position, 'MP/EXT');
  assert.match(rows[0].draft.notes, /Argentina/);
  assert.equal(rows.find(r => r.draft.name === 'Murat Yıldız')?.draft.position, 'MP/EXT');
  const players = rows.map((r, index) => ({ ...r.draft, id: `row-${index}` }));
  const evaluations = evaluateSquad(players, 0);
  assert.equal(evaluations.filter(e => e.group === 'competitive').length, 3);
  assert.ok(evaluations.filter(e => e.group === 'development').length <= 10);
  assert.equal(importableRows(previewImport(table, mapping, players)).length, 0);
});

test('CSV: BOM, CRLF, campos citados, comillas escapadas y saltos de línea', () => {
  const table = readCSV('\uFEFF"Jugador","Edad","Mejor pos.","CA","CP"\r\n"Juan, ""El 9""\nPérez",18,"DL (C)",65,100\r\n');
  const rows = previewImport(table, suggestMapping(table.headers), []);
  assert.equal(table.delimiter, ',');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].draft.name, 'Juan, "El 9"\nPérez');
  assert.equal(rows[0].draft.position, 'DC');
  assert.equal(rows[0].error, null);
});

test('posiciones: laterales, centrales, medios y extremos españoles/ingleses', () => {
  for (const p of ['DF (C)', 'D (C)', 'DFC']) assert.equal(mapFMPosition(p), 'DFC');
  for (const p of ['DF (D)', 'DF (I)', 'CR (D)', 'CR (I)', 'WB (L)']) assert.equal(mapFMPosition(p), 'LAT');
  for (const p of ['MC', 'MCD', 'ME (C)', 'M (C)', 'DM']) assert.equal(mapFMPosition(p), 'MC/MCD');
  for (const p of ['ME (D)', 'MP (I)', 'MP (C)', 'AM (R)']) assert.equal(mapFMPosition(p), 'MP/EXT');
  assert.equal(mapFMPosition('DF/CR/ME (D)'), null);
  assert.equal(mapFMPosition('Inventado'), null);
});

test('posiciones ambiguas se bloquean hasta que el usuario elige un grupo', () => {
  const table = readCSV(`${header}\nJuan;18;DF/CR/ME (D);60;100`);
  const mapping = suggestMapping(table.headers);
  assert.equal(importableRows(previewImport(table, mapping, [])).length, 0);
  assert.equal(importableRows(previewImport(table, mapping, [], { 0: 'LAT' }))[0].draft.position, 'LAT');
});

test('filas incorrectas no se importan; no convierte estrellas ni valores vacíos', () => {
  const rows = preview(`${header}\nJuan;18;POR;60;100\nSin PA;18;POR;60;\nEstrellas;18;POR;4,5;5\nPA bajo;18;POR;70;60\nMal;18;POR;60\nCA alto;18;POR;201;200`);
  assert.equal(rows.length, 6);
  assert.equal(importableRows(rows).length, 1);
  assert.equal(rows[4].error, 'El número de celdas no coincide con los encabezados.');
});

test('coincidencias existentes y nombres repetidos no se añaden ni sobrescriben', () => {
  const existing: Player = { id: 'existing', name: 'Juan Pérez', age: 20, ca: 75, pa: 110, position: 'POR', notes: 'Conservar' };
  const rows = preview(`${header}\n JUAN   PÉREZ ;18;POR;60;100\nPedro;19;POR;65;100\nPedro;20;POR;70;100`, [existing]);
  assert.equal(rows[0].duplicate, true);
  assert.equal(importableRows(rows).length, 0);
  assert.equal(existing.notes, 'Conservar');
  assert.equal(existing.age, 20);
});

test('mapeo incompleto o repetido no produce importaciones', () => {
  const table = readCSV(`${header}\nJuan;18;POR;60;100`);
  const mapping = suggestMapping(table.headers);
  assert.equal(previewImport(table, { ...mapping, pa: -1 }, []).length, 0);
  assert.equal(previewImport(table, { ...mapping, pa: mapping.ca }, []).length, 0);
});

test('archivos vacíos, encabezados repetidos y CSV roto devuelven errores claros', () => {
  for (const csv of ['', 'Nombre', header, 'Jugador;Jugador\nA;B', `${header}\n"Juan;18;POR;60;100`, `${header}\n"Juan"texto;18;POR;60;100`]) assert.throws(() => readCSV(csv));
  const table = readCSV('Name\tAge\tPosition\tCA\tPA\nJuan\t18\tGK\t65\t100');
  assert.equal(importableRows(previewImport(table, suggestMapping(table.headers), [])).length, 1);
});
