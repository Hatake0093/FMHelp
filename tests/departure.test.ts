import test from 'node:test';
import assert from 'node:assert/strict';
import type { Player, SquadConstructionPlan } from '../src/domain/model.ts';
import { reviewDepartures } from '../src/modules/analysis/departure.ts';

const player = (id: string, overrides: Partial<Player> = {}): Player => ({ id, name: id, age: 27, position: 'DFC', ca: 60, pa: 70, notes: '', fm: { saveId: 'Chippenham', sourceFile: 't.csv', importedAt: '2026-11-01T12:00:00Z', values: {} }, ...overrides });
const plan = (starterId = 'ok', backupId = ''): SquadConstructionPlan => ({ id: 'p', saveId: 'Chippenham', name: 'Plan', gameDate: '2026-11-01', slots: [{ id: 's', name: 'Central', roleId: 'centreBack', starterId, backupId, prospectId: '', notes: '' }] });
const find = (reviews: ReturnType<typeof reviewDepartures>, id: string) => reviews.find(r => r.player.id === id)!;
// Etapa 0: rotación DFC 40, núcleo 55, PA objetivo 65.
const veteran = player('veteran', { age: 31, ca: 30, pa: 30 });

test('un jugador competitivo se mantiene aunque no figure en el plan', () => {
  const result = find(reviewDepartures([player('ok'), veteran], 0, [plan('veteran')]), 'ok');
  assert.equal(result.level, 'keep'); assert.equal(result.kind, null);
});

test('techo bajo y fuera del plan se recomienda vender, con motivos y condiciones', () => {
  const result = find(reviewDepartures([player('ok'), veteran], 0, [plan('ok')]), 'veteran');
  assert.equal(result.level, 'sell'); assert.equal(result.kind, 'ceiling');
  assert.ok(result.reasons.some(r => r.includes('No ocupa ningún puesto')));
  assert.ok(result.changes[0].includes('40'));
});

test('sin plan o con plan vacío solo se sugiere valorar y se avisa del dato pendiente', () => {
  for (const plans of [[], [plan('')]]) {
    const result = find(reviewDepartures([player('ok'), veteran], 0, plans), 'veteran');
    assert.equal(result.level, 'consider'); assert.equal(result.pending.length, 1);
  }
});

test('quien ocupa un puesto del plan nunca se recomienda vender', () => {
  const result = find(reviewDepartures([player('ok'), veteran], 0, [plan('ok', 'veteran')]), 'veteran');
  assert.equal(result.level, 'consider'); assert.deepEqual(result.slots, ['Central']);
});

test('muy joven con PA bajo se valora en lugar de recomendar', () => {
  const kid = player('kid', { age: 18, ca: 20, pa: 40 });
  const result = find(reviewDepartures([player('ok'), kid], 0, [plan('ok')]), 'kid');
  assert.equal(result.level, 'consider'); assert.ok(result.pending[0].includes('18 años'));
});

test('el excedente de cupo sin puesto en el plan se recomienda y se ordena por prioridad', () => {
  const squad = [player('ok'), ...Array.from({ length: 20 }, (_, i) => player(`c${String(i).padStart(2, '0')}`, { ca: 45 + i, pa: 80 })), veteran];
  const reviews = reviewDepartures(squad, 0, [plan('ok')]);
  const surplus = reviews.filter(r => r.kind === 'surplus');
  assert.equal(surplus.length, 1); assert.ok(surplus.every(r => r.level === 'sell'));
  assert.equal(reviews[0].level, 'sell'); assert.equal(reviews[0].kind, 'ceiling'); assert.equal(reviews[0].player.id, 'veteran');
});
