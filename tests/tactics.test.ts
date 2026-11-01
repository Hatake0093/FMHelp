import test from 'node:test';
import assert from 'node:assert/strict';
import type { TacticPeriod } from '../src/domain/model.ts';
import { emptyState, parseState } from '../src/services/storage.ts';
import { emptyTactics, parseTactics, periodStats, removePeriod, seedTactics, totalPeriods, upsertChange, upsertPeriod } from '../src/modules/analysis/tactics.ts';

const period = (over: Partial<TacticPeriod> = {}): TacticPeriod => ({ id: 'p1', gameDate: '2026-10-01', label: 'Agosto a octubre', played: 10, wins: 6, draws: 2, losses: 2, goalsFor: 20, goalsAgainst: 10, setPieceFor: 5, setPieceAgainst: 4, xgFor: 18.5, xgAgainst: 11, notes: '', ...over });

test('un periodo calcula puntos, diferencia, balón parado y xG', () => {
  const stats = periodStats(period());
  assert.equal(stats.points, 20);
  assert.equal(stats.perGame, 2);
  assert.equal(stats.goalDiff, 10);
  assert.equal(stats.setPieceShareFor, 0.25);
  assert.equal(stats.setPieceShareAgainst, 0.4);
  assert.equal(stats.xgDiff, 7.5);
});

test('sin goles no hay porcentaje de balón parado y sin xG no hay diferencia', () => {
  const stats = periodStats(period({ goalsFor: 0, setPieceFor: 0, xgFor: null }));
  assert.equal(stats.setPieceShareFor, null);
  assert.equal(stats.xgDiff, null);
});

test('rechaza periodos que no cuadran', () => {
  const tactics = emptyTactics();
  assert.throws(() => upsertPeriod(tactics, period({ wins: 7 })), /sumar/);
  assert.throws(() => upsertPeriod(tactics, period({ setPieceFor: 21 })), /balón parado/);
  assert.throws(() => upsertPeriod(tactics, period({ gameDate: '2026-02-31' })), /fecha/);
  assert.throws(() => upsertPeriod(tactics, period({ goalsFor: 1.5 })), /enteros/);
  assert.throws(() => upsertPeriod(tactics, period({ xgFor: -1 })), /xG/);
});

test('guardar un periodo existente lo sustituye y la lista queda por fecha', () => {
  let tactics = upsertPeriod(emptyTactics(), period({ id: 'b', gameDate: '2026-12-01' }));
  tactics = upsertPeriod(tactics, period({ id: 'a', gameDate: '2026-10-01' }));
  tactics = upsertPeriod(tactics, period({ id: 'a', gameDate: '2026-10-01', label: 'Corregido' }));
  assert.deepEqual(tactics.periods.map(p => p.id), ['a', 'b']);
  assert.equal(tactics.periods[0].label, 'Corregido');
  assert.equal(removePeriod(tactics, 'a').periods.length, 1);
});

test('los totales suman periodos y el xG solo si todos lo tienen', () => {
  const periods = [period({ id: 'a' }), period({ id: 'b', gameDate: '2026-12-01', played: 5, wins: 5, draws: 0, losses: 0, goalsFor: 10, goalsAgainst: 1, setPieceFor: 0, setPieceAgainst: 0 })];
  const total = totalPeriods(periods);
  assert.equal(total.played, 15);
  assert.equal(total.goalsFor, 30);
  assert.equal(total.xgFor, 37);
  assert.equal(totalPeriods([periods[0], { ...periods[1], xgFor: null }]).xgFor, null);
});

test('un cambio exige fecha válida y descripción', () => {
  const change = { id: 'c', gameDate: '2026-11-01', change: 'Saques rápidos', expected: 'Más contraataques', result: '' };
  assert.equal(upsertChange(emptyTactics(), change).changes.length, 1);
  assert.throws(() => upsertChange(emptyTactics(), { ...change, change: '  ' }), /Describe/);
  assert.throws(() => upsertChange(emptyTactics(), { ...change, gameDate: 'ayer' }), /fecha/);
});

test('la táctica inicial es válida y sobrevive al guardado', () => {
  const tactics = seedTactics();
  assert.equal(tactics.instructions.filter(i => i.phase === 'possession').length, 18);
  assert.deepEqual(parseTactics(JSON.parse(JSON.stringify(tactics))), tactics);
});

test('una copia sin táctica se lee como antes y una inválida se rechaza', () => {
  const base = JSON.parse(JSON.stringify(emptyState()));
  assert.equal(parseState(JSON.stringify(base)).tactics, undefined);
  const withTactics = parseState(JSON.stringify({ ...base, tactics: upsertPeriod(emptyTactics(), period()) }));
  assert.equal(withTactics.tactics?.periods.length, 1);
  assert.throws(() => parseState(JSON.stringify({ ...base, tactics: { ...emptyTactics(), periods: [period({ wins: 99 })] } })), /táctica/);
  assert.throws(() => parseState(JSON.stringify({ ...base, tactics: { ...emptyTactics(), periods: [period(), period()] } })), /táctica/);
});
