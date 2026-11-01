import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlayerObservation, SquadSnapshot } from '../src/domain/model.ts';
import { ROLE_PROFILES } from '../src/modules/analysis/roles.ts';
import { bestObservedRole, DEFAULT_PERFORMANCE_CRITERIA, observedRoleScore, performanceVsProfile } from '../src/modules/analysis/performance.ts';

const keys = [...new Set(ROLE_PROFILES.filter(r => r.position === 'DFC').flatMap(r => Object.keys(r.weights)))];
const attributes = (value: number) => Object.fromEntries(keys.map(key => [key, value]));
const obs = (id: string, value: number, rating: number | null, minutes: number | null, overrides: Partial<PlayerObservation> = {}): PlayerObservation => ({ playerId: id, name: id, age: 25, position: 'DFC', ca: 60, pa: 70, attributes: attributes(value), minutes, rating, ...overrides });
const cut = (players: PlayerObservation[]): SquadSnapshot => ({ id: 's', saveId: 'Chippenham', gameDate: '2026-11-01', season: '2026/27', competition: 'Liga', statsFrom: '2026-07-01', statsTo: '2026-11-01', recordedAt: '2026-11-01T12:00:00Z', sourceFile: 't.csv', players });
const find = (rows: ReturnType<typeof performanceVsProfile>, id: string) => rows.find(r => r.observation.playerId === id)!;
// Cinco centrales con perfil creciente (10…14) y calificaciones que lo siguen, salvo las que cada prueba altera.
const base = (rating: (i: number) => number) => [10, 11, 12, 13, 14].map((v, i) => obs(`d${i}`, v, rating(i), 900));

test('el índice usa los atributos del corte y exige cobertura y esenciales', () => {
  const role = ROLE_PROFILES.find(r => r.id === 'centreBack')!;
  assert.equal(observedRoleScore(obs('a', 12, 7, 900), role), 60);
  assert.equal(observedRoleScore(obs('a', 12, 7, 900, { attributes: {} }), role), null);
  assert.equal(bestObservedRole(obs('a', 12, 7, 900))?.role.position, 'DFC');
  assert.equal(bestObservedRole(obs('a', 12, 7, 900, { position: 'DC' })), null, 'no usa roles de otro grupo de posición');
});

test('un jugador cuyo rendimiento sigue a su perfil queda acorde', () => {
  const rows = performanceVsProfile(cut(base(i => 6.5 + i * 0.1)));
  assert.ok(rows.every(r => r.status === 'aligned'));
  assert.equal(Math.round(find(rows, 'd4').profilePct!), 100);
});

test('detecta quien rinde por encima y por debajo de su perfil', () => {
  const rows = performanceVsProfile(cut(base(i => [7.4, 6.5, 6.6, 6.7, 6.0][i])));
  assert.equal(find(rows, 'd0').status, 'over');
  assert.equal(find(rows, 'd4').status, 'under');
  assert.ok(find(rows, 'd0').gap! >= DEFAULT_PERFORMANCE_CRITERIA.gap);
});

test('buen perfil con pocos minutos es «sin jugar», y con perfil flojo queda pendiente', () => {
  const rows = performanceVsProfile(cut([...base(i => 6.5 + i * 0.1), obs('bench', 18, 7, 100), obs('weak', 5, 6, 100)]));
  assert.equal(find(rows, 'bench').status, 'unused');
  assert.equal(find(rows, 'weak').status, 'pending');
  assert.equal(rows[0].observation.playerId, 'bench');
});

test('sin datos suficientes todo queda pendiente con un motivo, nunca en cero', () => {
  assert.ok(performanceVsProfile(cut(base(() => 7).slice(0, 3))).every(r => r.status === 'pending' && r.profilePct === null));
  const missing = performanceVsProfile(cut([...base(i => 6.5 + i * 0.1), obs('noRating', 12, null, 900), obs('noAttr', 12, 7, 900, { attributes: {} }), obs('noMinutes', 12, 7, null)]));
  assert.ok(find(missing, 'noRating').reason.includes('calificación'));
  assert.ok(find(missing, 'noAttr').reason.includes('atributos'));
  assert.ok(find(missing, 'noMinutes').reason.includes('minutos'));
});
