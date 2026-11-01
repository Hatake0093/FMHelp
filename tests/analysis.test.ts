import test from 'node:test';
import assert from 'node:assert/strict';
import { FM_ATTRIBUTES, mergeFMValues } from '../src/domain/fm-data.ts';
import type { Player } from '../src/domain/model.ts';
import { compareRole, evaluateRole, playerAttribute, ROLE_PROFILES, rolesForPlayer } from '../src/modules/analysis/roles.ts';
import { applyFMImport, previewImport, readCSV, suggestMapping } from '../src/modules/import-export/fm-csv.ts';

const role = ROLE_PROFILES.find(r => r.id === 'advancedForward')!;
function player(values: Record<string, string>, id = 'a', position: Player['position'] = 'DC'): Player {
  return { id, name: id, age: 20, position, ca: 65, pa: 110, notes: '', fm: { uniqueId: id === 'a' ? '123' : '124', saveId: 'Chippenham', sourceFile: 'test.csv', importedAt: '2026-11-01T12:00:00Z', values } };
}
const all = (value: string) => Object.fromEntries(FM_ATTRIBUTES.map(a => [a.label, value]));

test('todos los perfiles usan atributos reconocidos, pesos positivos y claves obligatorias', () => {
  assert.equal(new Set(ROLE_PROFILES.map(r => r.id)).size, ROLE_PROFILES.length);
  const keys = new Set(FM_ATTRIBUTES.map(a => a.key));
  assert.equal(keys.size, FM_ATTRIBUTES.length);
  for (const profile of ROLE_PROFILES) {
    for (const [key, weight] of Object.entries(profile.weights)) { assert.ok(keys.has(key), key); assert.ok(weight >= 1 && weight <= 3); }
    for (const key of profile.essential) assert.ok(profile.weights[key]);
  }
});

test('datos escasos, ausentes o inválidos no producen puntuaciones', () => {
  const p = player({ Remate: '20', Desmarques: '—', Velocidad: '21', Aceleración: '0', Serenidad: '4.5' });
  const result = evaluateRole(p, role);
  assert.equal(result.ready, false);
  assert.equal(result.score, null);
  assert.deepEqual(result.known, ['finishing']);
  assert.equal(playerAttribute(p, 'pace'), null);
  assert.equal(evaluateRole(player({}), role).coverage, 0);
});

test('cobertura suficiente sigue exigiendo todas las claves del rol', () => {
  const values = all('12'); delete values.Desmarques;
  const result = evaluateRole(player(values), role);
  assert.ok(result.coverage >= 0.8);
  assert.equal(result.ready, false);
  assert.equal(result.score, null);
  assert.deepEqual(result.missingEssential, ['offTheBall']);
});

test('un perfil empatado no inventa prioridades de entrenamiento', () => {
  assert.deepEqual(evaluateRole(player(all('12')), role).priorities, []);
});

test('índice ponderado respeta escala y umbral del 80%', () => {
  assert.equal(evaluateRole(player(all('20')), role).score, 100);
  assert.equal(evaluateRole(player(all('1')), role).score, 5);
  assert.equal(evaluateRole(player(all('12')), role).score, 60);
  const values = all('12'); delete values.Serenidad; delete values.Anticipación;
  assert.equal(evaluateRole(player(values), role).coverage, 0.8);
  assert.equal(evaluateRole(player(values), role).score, 60);
  delete values.Regate;
  assert.equal(evaluateRole(player(values), role).score, null);
});

test('comparación usa solo atributos comunes, aunque el individual sea distinto', () => {
  const valuesA = all('12'); valuesA.Regate = '20';
  const valuesB = all('12'); delete valuesB.Regate;
  const a = player(valuesA), b = player(valuesB, 'b');
  assert.ok(evaluateRole(a, role).score! > 60);
  const result = compareRole(a, b, role);
  assert.equal(result.ready, true);
  assert.equal(result.scoreA, 60); assert.equal(result.scoreB, 60);
  assert.equal(result.rows.find(r => r.key === 'dribbling')?.difference, null);
  delete valuesA['Primer toque']; delete valuesB.Serenidad; delete valuesB.Anticipación;
  assert.equal(compareRole(a, b, role).scoreA, null);
});

test('no compara distintas partidas, a sí mismo ni mezcla porteros y campo', () => {
  const a = player(all('12')), b = player(all('14'), 'b');
  b.fm!.saveId = 'Otra partida';
  assert.equal(compareRole(a, b, role).ready, false);
  assert.equal(compareRole(a, a, role).scoreA, null);
  b.fm!.saveId = ' CHIPPENHAM ';
  assert.equal(compareRole(a, b, role).ready, true);
  b.position = 'POR';
  assert.equal(compareRole(a, b, role).scoreA, null);
  assert.ok(rolesForPlayer(b).every(r => r.role.position === 'POR'));
  assert.ok(rolesForPlayer(a).every(r => r.role.position !== 'POR'));
});

test('nuevos atributos se reconocen por alias y conservan columnas omitidas', () => {
  const p = player({ Salidas: '14', Concentración: '11' });
  p.fm!.values = mergeFMValues(p.fm!.values, { 'Rushing Out': '16', Strength: '13', 'Saques de esquina': '12' });
  assert.equal(playerAttribute(p, 'rushingOut'), 16);
  assert.equal(playerAttribute(p, 'strength'), 13);
  assert.equal(playerAttribute(p, 'corners'), 12);
  assert.equal(playerAttribute(p, 'concentration'), 11);
  assert.equal(p.fm!.values.Salidas, undefined);
});

test('importaciones graduales por ID completan un rol sin perder notas ni atributos', () => {
  const original = player({ Remate: '13', Velocidad: '14', Aceleración: '14', 'Primer toque': '12', Serenidad: '12', Regate: '13' });
  original.notes = 'Plan individual existente';
  assert.equal(evaluateRole(original, role).score, null);
  const table = readCSV('Unique ID;Jugador;Edad;CA;CP;Mejor pos.;Desmarques;Anticipación;Decisiones\n123;a;20;65;110;DC;13;12;12');
  const rows = previewImport(table, suggestMapping(table.headers), [original], {}, { saveId: 'Chippenham' });
  const updated = applyFMImport([original], rows).players[0];
  assert.equal(updated.id, original.id);
  assert.equal(updated.notes, original.notes);
  assert.equal(playerAttribute(updated, 'finishing'), 13);
  assert.equal(playerAttribute(updated, 'offTheBall'), 13);
  assert.equal(evaluateRole(updated, role).coverage, 1);
  assert.ok(evaluateRole(updated, role).score! > 0);
});
