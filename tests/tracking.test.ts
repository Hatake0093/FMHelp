import test from 'node:test';
import assert from 'node:assert/strict';
import type { MinutePlan, Player, SnapshotContext, SquadSnapshot } from '../src/domain/model.ts';
import { emptyState, parseState } from '../src/services/storage.ts';
import { blockedTalent, compareObservations, deleteSnapshot, importWithTracking, updateSnapshotContext, minuteProgress, observePlayer, parseMinutes, upsertMinutePlan, validGameDate, validateSnapshotContext } from '../src/modules/analysis/tracking.ts';
import { previewImport, readCSV, suggestMapping } from '../src/modules/import-export/fm-csv.ts';

const player = (id = 'a', overrides: Partial<Player> = {}): Player => ({ id, name: id, age: 20, position: 'DC', ca: 60, pa: 100, notes: 'Conservar', fm: { uniqueId: id === 'a' ? '1' : id === 'b' ? '2' : '3', saveId: 'Chippenham', sourceFile: 'test.csv', importedAt: '2026-11-01T12:00:00Z', values: { Minutos: '100', Velocidad: '12', Remate: '11' } }, ...overrides });
const context: SnapshotContext = { gameDate: '2026-10-01', season: '2026/27', competition: 'Liga', statsFrom: '2026-07-01', statsTo: '2026-10-01' };
const plan: MinutePlan = { id: 'p1', playerId: 'a', saveId: 'Chippenham', season: '2026/27', competition: 'Liga', startDate: '2026-07-01', endDate: '2027-07-01', targetMinutes: 2000, role: 'Desarrollo', notes: 'Minutos en liga' };
const snapshot = (overrides: Partial<SquadSnapshot> = {}): SquadSnapshot => ({ ...context, id: 's1', saveId: 'Chippenham', recordedAt: '2026-11-01T12:00:00Z', sourceFile: 'test.csv', players: [observePlayer(player())], ...overrides });
const csvRows = (csv: string, existing: Player[] = []) => { const table = readCSV(csv); return previewImport(table, suggestMapping(table.headers), existing, {}, { saveId: 'Chippenham', sourceFile: 'test.csv', importedAt: '2026-11-01T12:00:00Z' }); };
const csv = 'Unique ID;Jugador;Edad;Mejor pos.;CA;CP;Minutos;Remate\n1;Jugador renombrado;20;DC;62;100;200;12';

test('migración v1→v2 preserva plantilla, notas, metadatos y partida sin inventar históricos', () => {
  const legacy = { version: 1, stageId: 2, players: [player()], fmSaveId: 'Chippenham' };
  const migrated = parseState(JSON.stringify(legacy));
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.players, legacy.players);
  assert.equal(migrated.fmSaveId, 'Chippenham');
  assert.deepEqual(migrated.tracking, { snapshots: [], minutePlans: [] });
  assert.equal(legacy.version, 1);
});

test('fechas reales, años bisiestos y límites del periodo estadístico', () => {
  for (const date of ['2026-02-29', '2026-13-01', '2026-00-00', '2026-04-31', '01/11/2026', '1899-01-01', '3000-01-01']) assert.equal(validGameDate(date), false, date);
  assert.equal(validGameDate('2028-02-29'), true);
  assert.equal(validateSnapshotContext(context), null);
  assert.ok(validateSnapshotContext({ ...context, statsTo: '2026-11-01' }));
  assert.ok(validateSnapshotContext({ ...context, statsFrom: '2026-10-02' }));
  assert.ok(validateSnapshotContext({ ...context, season: '' }));
});

test('minutos: cero es una medición; ausentes y decimales no se convierten en cero', () => {
  assert.equal(parseMinutes('0'), 0); assert.equal(parseMinutes('90'), 90);
  for (const value of ['1,200', '1.200', '1 200']) assert.equal(parseMinutes(value), 1200);
  for (const value of ['', '—', '-', '4,5', '1.5', '12.34', '-90', '1e3', '90 min', '1000001']) assert.equal(parseMinutes(value), null, value);
});

test('el corte observa exclusivamente el CSV nuevo y conserva los atributos antiguos en la ficha', () => {
  const state = { ...emptyState(), players: [player()] };
  const result = importWithTracking(state, csvRows(csv, state.players), 'Chippenham', context, () => 'cut');
  assert.equal(result.state.players[0].fm?.values.Velocidad, '12');
  const cut = result.state.tracking.snapshots[0];
  assert.equal(cut.players[0].playerId, 'a');
  assert.equal(cut.players[0].ca, 62);
  assert.equal(cut.players[0].minutes, 200);
  assert.deepEqual(cut.players[0].attributes, { finishing: 12 });
  assert.equal(result.state.players[0].notes, 'Conservar');
  assert.equal(state.players[0].ca, 60);
  assert.equal(state.tracking.snapshots.length, 0);
});

test('cortes parciales no inventan observaciones de jugadores ausentes', () => {
  const state = { ...emptyState(), players: [player(), player('b')] };
  const result = importWithTracking(state, csvRows(csv, state.players), 'Chippenham', context, () => 'cut');
  assert.equal(result.state.players.length, 2);
  assert.equal(result.state.tracking.snapshots[0].players.length, 1);
});

test('importación sin histórico sigue disponible y filas de otra partida se rechazan', () => {
  const state = { ...emptyState(), players: [player()] };
  assert.equal(importWithTracking(state, csvRows(csv, state.players), 'Chippenham').state.tracking.snapshots.length, 0);
  assert.throws(() => importWithTracking(state, csvRows(csv, state.players), 'Otra partida', context));
});

test('cortes nuevos asignan identidad local y no aceptan duplicados ni retrocesos de fecha', () => {
  let i = 0;
  const result = importWithTracking(emptyState(), csvRows(csv), 'Chippenham', context, () => `id-${++i}`);
  assert.equal(result.state.tracking.snapshots[0].players[0].playerId, result.state.players[0].id);
  const rows = csvRows(csv, result.state.players);
  assert.throws(() => importWithTracking(result.state, rows, ' CHIPPenham ', context), /Ya existe/);
  assert.throws(() => importWithTracking(result.state, rows, 'Chippenham', { ...context, gameDate: '2026-09-01', statsTo: '2026-09-01' }), /anterior/);
  assert.equal(result.state.tracking.snapshots.length, 1);
});

test('un corte con día y mes invertidos se corrige o se elimina y desbloquea la importación', () => {
  const wrong = { ...context, gameDate: '2026-12-10', statsTo: '2026-12-10' }; // 12/10 escrito en vez de 10/12... bloquea fechas intermedias
  const first = importWithTracking(emptyState(), csvRows(csv), 'Chippenham', wrong);
  const rows = csvRows(csv, first.state.players);
  assert.throws(() => importWithTracking(first.state, rows, 'Chippenham', context), /anterior/);
  const id = first.state.tracking.snapshots[0].id;
  const fixed = updateSnapshotContext(first.state.tracking, id, { ...wrong, gameDate: '2026-10-12', statsTo: '2026-10-12' });
  assert.equal(fixed.snapshots[0].gameDate, '2026-10-12');
  assert.equal(fixed.snapshots[0].players.length, 1);
  assert.throws(() => updateSnapshotContext(first.state.tracking, id, { ...wrong, gameDate: '2026-13-01' }), /fechas válidas/);
  assert.equal(importWithTracking({ ...first.state, tracking: deleteSnapshot(first.state.tracking, id) }, rows, 'Chippenham', context).state.tracking.snapshots.length, 1);
  assert.throws(() => deleteSnapshot(first.state.tracking, 'nope'), /no existe/);
});

test('evolución compara solo pares de atributos presentes y exige la misma identidad', () => {
  const before = observePlayer(player());
  const after = { ...before, ca: 64, pa: 102, attributes: { finishing: 14, stamina: 12 } };
  const result = compareObservations(before, after);
  assert.equal(result.ca, 4); assert.equal(result.pa, 2);
  assert.equal(result.attributes.find(a => a.key === 'finishing')?.delta, 3);
  assert.equal(result.attributes.find(a => a.key === 'pace')?.delta, null);
  assert.equal(result.attributes.find(a => a.key === 'stamina')?.delta, null);
  assert.throws(() => compareObservations(before, { ...after, playerId: 'other' }));
});

test('planes: guardado, edición, validación y solapes en el mismo contexto', () => {
  const initial = emptyState().tracking;
  const tracking = upsertMinutePlan(initial, plan);
  assert.equal(initial.minutePlans.length, 0);
  assert.equal(upsertMinutePlan(tracking, { ...plan, targetMinutes: 2500 }).minutePlans.length, 1);
  assert.throws(() => upsertMinutePlan(tracking, { ...plan, id: 'p2' }), /solapa/);
  assert.equal(upsertMinutePlan(tracking, { ...plan, id: 'p2', competition: 'Copa' }).minutePlans.length, 2);
  for (const override of [{ targetMinutes: 0 }, { targetMinutes: 1.5 }, { startDate: '2027-07-01' }, { endDate: '2026-02-29' }]) assert.throws(() => upsertMinutePlan(initial, { ...plan, ...override }));
});

test('minutos acumulados: usa la última medición comparable sin sumar cortes', () => {
  const older = snapshot({ id: 'older', gameDate: '2026-09-01', statsTo: '2026-09-01', players: [{ ...observePlayer(player()), minutes: 100 }] });
  const newer = snapshot({ players: [{ ...observePlayer(player()), minutes: 300 }] });
  const progress = minuteProgress(plan, [newer, older]);
  assert.equal(progress.actual, 300);
  assert.equal(progress.snapshot?.id, 's1');
  assert.equal(progress.percentage, 15);
  assert.equal(progress.status, 'behind');
});

test('un corte posterior sin minutos queda pendiente en lugar de reutilizar un valor antiguo', () => {
  const earlier = snapshot({ id: 'earlier', statsTo: '2026-09-01', gameDate: '2026-09-01' });
  const missing = snapshot({ players: [{ ...observePlayer(player()), minutes: null }] });
  assert.equal(minuteProgress(plan, [earlier, missing]).actual, null);
  assert.equal(minuteProgress(plan, [earlier, missing]).status, 'pending');
  assert.equal(minuteProgress(plan, [snapshot({ players: [{ ...observePlayer(player()), minutes: 0 }] })]).actual, 0);
});

test('no mezcla temporadas, alcances, inicios de acumulado o partidas', () => {
  for (const override of [{ saveId: 'Otra' }, { season: '2027/28' }, { competition: 'Copa' }, { statsFrom: '2026-08-01' }, { statsTo: '2027-08-01', gameDate: '2027-08-01' }]) assert.equal(minuteProgress(plan, [snapshot(override)]).status, 'pending');
  assert.equal(minuteProgress(plan, [snapshot({ saveId: ' CHIPPENHAM ', competition: ' LIGA ' })]).actual, 100);
});

test('objetivo conseguido, cerrado por debajo y comienzo del plan', () => {
  const final = snapshot({ gameDate: plan.endDate, statsTo: plan.endDate });
  assert.equal(minuteProgress(plan, [final]).status, 'missed');
  assert.equal(minuteProgress(plan, [snapshot({ players: [{ ...observePlayer(player()), minutes: 2100 }] })]).status, 'achieved');
  assert.equal(minuteProgress(plan, [snapshot({ gameDate: plan.startDate, statsTo: plan.startDate, players: [{ ...observePlayer(player()), minutes: 0 }] })]).status, 'starting');
});

test('talento bloqueado exige poco uso, margen de desarrollo y competencia observada', () => {
  const players = [player(), player('b', { ca: 70 }), player('c', { ca: 75 })];
  const cut = snapshot({ players: players.map(p => observePlayer(p)) });
  const result = blockedTalent(cut, players, []).find(r => r.player.playerId === 'a')!;
  assert.equal(result.status, 'blocked'); assert.equal(result.competitors.length, 2);
  assert.equal(blockedTalent(cut, [players[0]], [])[0].status, 'watch');
  assert.equal(blockedTalent(cut, players.map(p => ({ ...p, fm: { ...p.fm!, saveId: 'Otra' } })), []).length, 0);
});

test('jóvenes sin minutos o con un periodo corto quedan pendientes', () => {
  const players = [player()];
  assert.equal(blockedTalent(snapshot({ players: [{ ...observePlayer(players[0]), minutes: null }] }), players, [])[0].status, 'pending');
  assert.equal(blockedTalent(snapshot({ statsFrom: '2026-09-20' }), players, [])[0].status, 'pending');
  assert.equal(blockedTalent(snapshot({ players: [{ ...observePlayer(players[0]), age: 24 }] }), players, []).length, 0);
});

test('el plan aplicable tiene prioridad sobre el umbral absoluto de minutos bajos', () => {
  const players = [player(), player('b', { ca: 70 }), player('c', { ca: 75 })];
  const cut = snapshot({ players: players.map(p => ({ ...observePlayer(p), minutes: 500 })) });
  assert.equal(blockedTalent(cut, players, [])[0].status, 'ok');
  assert.equal(blockedTalent(cut, players, [{ ...plan, targetMinutes: 8000 }]).find(r => r.player.playerId === 'a')?.status, 'blocked');
  assert.equal(blockedTalent(cut, players, [{ ...plan, startDate: '2026-08-01' }]).find(r => r.player.playerId === 'a')?.status, 'pending');
});

test('backup v2 conserva históricos y planes incluso si el jugador ya no está en plantilla', () => {
  const state = { ...emptyState(), tracking: { snapshots: [snapshot()], minutePlans: [plan] } };
  assert.deepEqual(parseState(JSON.stringify(state)), state);
});

test('backup v2 rechaza histórico corrupto, observaciones inválidas y planes duplicados', () => {
  const base = { ...emptyState(), tracking: { snapshots: [snapshot()], minutePlans: [plan] } };
  const invalid = [
    { ...base, tracking: undefined },
    { ...base, tracking: { ...base.tracking, snapshots: [snapshot(), snapshot()] } },
    { ...base, tracking: { ...base.tracking, snapshots: [snapshot({ gameDate: '2026-02-30' })] } },
    { ...base, tracking: { ...base.tracking, snapshots: [snapshot({ players: [{ ...observePlayer(player()), attributes: { pace: 0 } }] })] } },
    { ...base, tracking: { ...base.tracking, snapshots: [snapshot({ players: [{ ...observePlayer(player()), minutes: -1 }] })] } },
    { ...base, tracking: { ...base.tracking, minutePlans: [plan, plan] } },
  ];
  for (const value of invalid) assert.throws(() => parseState(JSON.stringify(value)));
});
