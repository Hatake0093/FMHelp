import test from 'node:test';
import assert from 'node:assert/strict';
import type { Player, SquadConstructionPlan, SquadSlot } from '../src/domain/model.ts';
import { FM_ATTRIBUTES } from '../src/domain/fm-data.ts';
import { ROLE_PROFILES } from '../src/modules/analysis/roles.ts';
import { analyzePair, analyzeSlot, commonRoleBasis, contractReview, formationSlots, parseContractDate, upsertSquadPlan, validateSquadPlan } from '../src/modules/analysis/construction.ts';
import { emptyState, parseState } from '../src/services/storage.ts';

const attributes = (value: number) => Object.fromEntries(FM_ATTRIBUTES.map(a => [a.label, String(value)]));
const player = (id: string, value = 12, overrides: Partial<Player> = {}): Player => ({ id, name: id, age: 27, position: 'DFC', ca: 100, pa: 120, notes: '', fm: { uniqueId: String(id.charCodeAt(0)), saveId: 'Chippenham', sourceFile: 'test.csv', importedAt: '2026-11-01T12:00:00Z', values: { ...attributes(value), Final: '30/6/2048' } }, ...overrides });
const slot = (overrides: Partial<SquadSlot> = {}): SquadSlot => ({ id: 's1', name: 'Central derecho', roleId: 'centreBack', starterId: 'a', backupId: '', prospectId: '', notes: '', ...overrides });
const plan = (slots = [slot()]): SquadConstructionPlan => ({ id: 'main', saveId: 'Chippenham', name: 'Mi plan', gameDate: '2047-07-01', slots });

test('migraciones v1 y v2 conservan la plantilla y el seguimiento sin inventar asignaciones', () => {
  const legacy = { version: 1, stageId: 2, players: [player('a')], fmSaveId: 'Chippenham' };
  const current = parseState(JSON.stringify(legacy));
  assert.equal(current.version, 3); assert.deepEqual(current.squadPlans, []); assert.deepEqual(current.players, legacy.players);
  const v2 = { ...emptyState(), version: 2 }; delete (v2 as Record<string, unknown>).squadPlans;
  assert.deepEqual(parseState(JSON.stringify(v2)), emptyState());
  assert.equal(legacy.version, 1);
});

test('esquemas iniciales crean 11 puestos vacíos, identificados y con roles válidos', () => {
  for (const formation of ['4-4-2', '4-2-3-1', '4-3-3'] as const) {
    let id = 0; const slots = formationSlots(formation, () => String(++id));
    assert.equal(slots.length, 11); assert.equal(new Set(slots.map(s => s.id)).size, 11);
    assert.ok(slots.every(s => !s.starterId && !s.backupId && !s.prospectId && ROLE_PROFILES.some(r => r.id === s.roleId)));
  }
});

test('el plan rechaza titulares duplicados, autorrecambios y puestos inválidos', () => {
  assert.equal(validateSquadPlan(plan()), null);
  for (const slots of [[slot(), slot({ id: 's2' })], [slot({ backupId: 'a' })], [slot({ prospectId: 'a' })], [slot({ roleId: 'inventado' })], [slot(), slot()], []]) assert.ok(validateSquadPlan(plan(slots)));
  assert.equal(validateSquadPlan(plan([slot({ backupId: 'b', prospectId: 'b' })])), null);
  assert.ok(validateSquadPlan({ ...plan(), gameDate: '2047-02-30' }));
});

test('guardar un plan valida la partida y distingue porteros de jugadores de campo', () => {
  const a = player('a'), b = player('b');
  const plans = upsertSquadPlan([], plan([slot({ backupId: 'b' })]), [a, b]);
  assert.equal(plans.length, 1);
  assert.equal(upsertSquadPlan(plans, { ...plans[0], name: 'Nuevo nombre' }, [a, b]).length, 1);
  assert.throws(() => upsertSquadPlan(plans, { ...plans[0], id: 'duplicate' }, [a, b]));
  assert.throws(() => upsertSquadPlan([], plan([slot({ backupId: 'b' })]), [a, { ...b, position: 'POR' }]));
  assert.throws(() => upsertSquadPlan([], plan([slot({ backupId: 'b' })]), [a, { ...b, fm: { ...b.fm!, saveId: 'Otra' } }]));
  assert.throws(() => upsertSquadPlan([], plan([slot({ backupId: 'missing' })]), [a]));
  assert.equal(upsertSquadPlan([], plan([slot({ backupId: 'b' })]), [a, { ...b, position: 'MC/MCD' }]).length, 1);
});

test('la copia v3 conserva asignaciones archivadas y rechaza planes corruptos', () => {
  const state = { ...emptyState(), squadPlans: [plan()] };
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  for (const squadPlans of [undefined, [plan(), plan()], [plan([slot({ roleId: 'missing' })])], [plan([slot({ starterId: 'a', backupId: 'a' })])]]) assert.throws(() => parseState(JSON.stringify({ ...state, squadPlans })));
  assert.equal(state.squadPlans[0].slots[0].starterId, 'a');
});

test('la base común nunca puntúa usando atributos diferentes por jugador', () => {
  const a = player('a', 15), b = player('b', 12), role = ROLE_PROFILES.find(r => r.id === 'centreBack')!;
  const basis = commonRoleBasis(role, [a, b]);
  assert.equal(basis.score(a), 75); assert.equal(basis.score(b), 60);
  delete b.fm!.values.Colocación;
  assert.equal(commonRoleBasis(role, [a, b]).score(a), null);
  assert.equal(commonRoleBasis(role, []).ready, false);
});

test('parejas distinguen recursos aportados y carencias compartidas sin inventar sinergia', () => {
  const a = player('a'), b = player('b');
  for (const name of ['Alcance de salto', 'Cabeceo', 'Fuerza']) { a.fm!.values[name] = '16'; b.fm!.values[name] = '8'; }
  for (const name of ['Velocidad', 'Aceleración', 'Anticipación']) { a.fm!.values[name] = '8'; b.fm!.values[name] = '16'; }
  for (const name of ['Pases', 'Primer toque', 'Serenidad', 'Decisiones']) { a.fm!.values[name] = '8'; b.fm!.values[name] = '8'; }
  const result = analyzePair(a, b, 'defenders');
  assert.equal(result.dimensions.find(d => d.id === 'aerial')?.status, 'resourceA');
  assert.equal(result.dimensions.find(d => d.id === 'recovery')?.status, 'resourceB');
  assert.equal(result.dimensions.find(d => d.id === 'buildUp')?.status, 'sharedWeakness');
  assert.equal(result.sharedWeaknesses, 1);
  assert.equal(result.pending, 0);
});

test('parejas requieren datos comunes y jugadores distintos de la misma partida y puesto', () => {
  const a = player('a'), b = player('b'); delete b.fm!.values.Velocidad;
  const result = analyzePair(a, b, 'defenders');
  assert.equal(result.dimensions.find(d => d.id === 'recovery')?.status, 'pending');
  assert.equal(result.dimensions.find(d => d.id === 'recovery')?.valueA, null);
  assert.throws(() => analyzePair(a, a, 'defenders'));
  assert.throws(() => analyzePair(a, { ...b, position: 'DC' }, 'defenders'));
  assert.throws(() => analyzePair(a, { ...b, fm: { ...b.fm!, saveId: 'Otra' } }, 'defenders'));
  assert.throws(() => analyzePair(a, b, 'defenders', 21));
});

test('dependencia usa reservas disponibles, excluyendo a otros titulares', () => {
  const a = player('a', 15), b = player('b', 18), c = player('c', 12);
  const primary = slot(); const p = plan([primary, slot({ id: 's2', name: 'Central izquierdo', starterId: 'b' })]);
  const result = analyzeSlot(p, primary, [a, b, c]);
  assert.deepEqual(result.reserves.map(p => p.id), ['c']);
  assert.equal(result.bestReserve?.player.id, 'c');
  assert.equal(result.gap, 15); assert.equal(result.status, 'high');
  assert.equal(analyzeSlot(p, primary, [a, b]).status, 'noBackup');
});

test('un recambio asignado a otro puesto y la cobertura compartida se señalan', () => {
  const a = player('a'), b = player('b'), c = player('c');
  const s = slot({ backupId: 'b' });
  const p = plan([s, slot({ id: 's2', name: 'Otro puesto', starterId: 'b' }), slot({ id: 's3', name: 'Tercer puesto', starterId: 'c', backupId: 'b' })]);
  const result = analyzeSlot(p, s, [a, b, c]);
  assert.deepEqual(result.backupOtherSlot, ['Otro puesto']);
  assert.deepEqual(result.sharedBackupSlots, ['Tercer puesto']);
  assert.equal(result.status, 'noBackup');
});

test('reservas con datos pendientes no generan una dependencia alta definitiva', () => {
  const a = player('a', 15), b = player('b', 10), c = player('c', 20);
  c.fm!.values = {};
  const result = analyzeSlot(plan(), slot(), [a, b, c]);
  assert.equal(result.gap, 25); assert.equal(result.status, 'pending');
  assert.equal(result.rankedReserves.find(p => p.player.id === 'c')?.score, null);
  assert.equal(result.losses.length, 0);
  assert.equal(analyzeSlot(plan(), slot(), [a, c]).starterScore, 75);
  assert.equal(analyzeSlot(plan(), slot(), [a, c]).status, 'pending');
});

test('una reserva con encaje suficiente sí reduce la brecha aunque otra tenga datos pendientes', () => {
  const a = player('a', 15), b = player('b', 15), c = player('c'); c.fm!.values = {};
  assert.equal(analyzeSlot(plan(), slot(), [a, b, c]).status, 'low');
});

test('recursos perdidos exigen datos válidos de todas las reservas pertinentes', () => {
  const a = player('a', 15), b = player('b', 11), c = player('c', 10);
  const result = analyzeSlot(plan(), slot(), [a, b, c]);
  assert.ok(result.losses.length > 0);
  assert.ok(result.losses.every(loss => loss.starter === 15 && loss.reserve === 11 && loss.gap === 4));
  delete c.fm!.values.Marcaje;
  assert.ok(!analyzeSlot(plan(), slot(), [a, b, c]).losses.some(loss => loss.key === 'marking'));
});

test('contratos usan fechas españolas/ISO y la fecha de partida, con horizonte mensual real', () => {
  assert.equal(parseContractDate('30/6/2048'), '2048-06-30');
  assert.equal(parseContractDate('2048-06-30'), '2048-06-30');
  assert.equal(parseContractDate('31/2/2048'), null);
  const a = player('a');
  assert.equal(contractReview(a, '2047-07-01').status, 'soon');
  assert.equal(contractReview(a, '2046-07-01').status, 'later');
  assert.equal(contractReview(a, '2049-07-01').status, 'past');
  assert.equal(contractReview(a, '').status, 'pending');
  a.fm!.values.Final = '29/2/2048';
  assert.equal(contractReview(a, '2048-01-31', 1).status, 'soon');
  a.fm!.values.Final = '-';
  assert.equal(contractReview(a, '2047-07-01').status, 'pending');
});

test('la sucesión separa cercanía actual de techo de PA y no escala atributos con PA', () => {
  const a = player('a', 15, { age: 31, ca: 150, pa: 160 });
  const b = player('b', 14.5, { age: 20, ca: 145, pa: 190 });
  // Atributos enteros: un joven con el mismo perfil actual puede ser cercano.
  b.fm!.values = { ...attributes(15), Final: '30/6/2050' };
  let result = analyzeSlot(plan(), slot(), [a, b]);
  assert.equal(result.prospectStatus, 'close'); assert.equal(result.candidate?.player.id, 'b');
  b.fm!.values = { ...attributes(10), Final: '30/6/2050' };
  result = analyzeSlot(plan(), slot(), [a, b]);
  assert.equal(result.prospectStatus, 'development'); assert.equal(result.candidate?.score, 50);
  b.pa = 200;
  assert.equal(analyzeSlot(plan(), slot(), [a, b]).candidate?.score, 50);
});

test('un relevo asignado puede quedar fuera de criterios o necesitar liberar otro puesto', () => {
  const a = player('a', 15, { age: 31, ca: 150, pa: 160 }), b = player('b', 15, { age: 25, ca: 145, pa: 190 });
  const s = slot({ prospectId: 'b' });
  assert.equal(analyzeSlot(plan([s]), s, [a, b]).prospectStatus, 'criteria');
  b.age = 20;
  const occupied = plan([s, slot({ id: 's2', name: 'Otro', starterId: 'b' })]);
  assert.equal(analyzeSlot(occupied, s, [a, b]).prospectStatus, 'occupied');
});

test('un jugador archivado u otra partida no se interpreta como titular disponible', () => {
  const a = player('a'), b = player('b'); b.fm!.saveId = 'Otra partida';
  assert.equal(analyzeSlot(plan(), slot(), [b]).status, 'unassigned');
  assert.equal(analyzeSlot(plan(), slot(), [a, b]).status, 'noBackup');
  assert.deepEqual(analyzeSlot(plan(), slot(), []).unavailableAssignments, ['a']);
});
