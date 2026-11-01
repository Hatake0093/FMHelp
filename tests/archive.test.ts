import test from 'node:test';
import assert from 'node:assert/strict';
import type { DynastyState, Player } from '../src/domain/model.ts';
import { emptyState, parseState } from '../src/services/storage.ts';
import { archivePlayer, purgeArchived, restorePlayer } from '../src/modules/archive/index.ts';
import { evaluateSquad } from '../src/domain/players.ts';

const player = (id: string, overrides: Partial<Player> = {}): Player => ({ id, name: id, age: 24, position: 'DC', ca: 70, pa: 80, notes: 'Conservar', ...overrides });
const squad = (...players: Player[]): DynastyState => ({ ...emptyState(), players });
const fm = (uniqueId: string) => ({ uniqueId, saveId: 'Chippenham', sourceFile: 'x.csv', importedAt: '2026-11-01T12:00:00Z', values: { Velocidad: '12' } });
const now = new Date('2026-11-01T12:00:00Z');

test('archivar saca al jugador de la plantilla y de la evaluación sin perder su ficha', () => {
  const state = archivePlayer(squad(player('a'), player('b')), 'a', 'sold', '2027-01-10', now);
  assert.deepEqual(state.players.map(p => p.id), ['b']);
  assert.equal(state.archive[0].player.notes, 'Conservar');
  assert.deepEqual({ reason: state.archive[0].reason, date: state.archive[0].date }, { reason: 'sold', date: '2027-01-10' });
  assert.equal(evaluateSquad(state.players, 0).length, 1);
  assert.throws(() => archivePlayer(state, 'a', 'free', ''), /ya no está/);
  assert.throws(() => archivePlayer(squad(player('a')), 'a', 'free', '2027-13-40'), /fecha/);
  assert.equal(archivePlayer(squad(player('a')), 'a', 'free', '', now).archive[0].date, '');
});

test('restaurar devuelve la ficha completa y rechaza duplicados de identidad FM', () => {
  const archived = archivePlayer(squad(player('a', { fm: fm('1') }), player('b')), 'a', 'free', '', now);
  const restored = restorePlayer(archived, 'a');
  assert.deepEqual(restored.players.map(p => p.id), ['b', 'a']);
  assert.equal(restored.archive.length, 0);
  assert.equal(restored.players[1].fm?.uniqueId, '1');
  const clash = { ...archived, players: [...archived.players, player('nuevo', { fm: fm('1') })] };
  assert.throws(() => restorePlayer(clash, 'a'), /mismo ID de FM/);
  assert.throws(() => restorePlayer(archived, 'zzz'), /ya no existe/);
});

test('eliminar definitivamente borra solo la ficha archivada', () => {
  const archived = archivePlayer(squad(player('a'), player('b')), 'a', 'sold', '', now);
  const purged = purgeArchived(archived, 'a');
  assert.equal(purged.archive.length, 0);
  assert.deepEqual(purged.players.map(p => p.id), ['b']);
  assert.throws(() => purgeArchived(purged, 'a'), /ya no existe/);
});

test('copia v4 conserva exjugadores; v3 migra con archivo vacío; datos de salida corruptos se rechazan', () => {
  const state = archivePlayer(squad(player('a', { fm: fm('1') }), player('b')), 'a', 'sold', '2027-01-10', now);
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  const v3 = { version: 3, stageId: 0, players: [player('b')], tracking: { snapshots: [], minutePlans: [] }, squadPlans: [] };
  assert.deepEqual(parseState(JSON.stringify(v3)).archive, []);
  const entry = state.archive[0];
  for (const bad of [{ ...entry, reason: 'robado' }, { ...entry, date: '10/01/2027' }, { ...entry, archivedAt: 'ayer' }, { ...entry, player: { ...entry.player, id: 'b' } }, { ...entry, player: { ...entry.player, ca: 0 } }, null]) {
    assert.throws(() => parseState(JSON.stringify({ ...state, archive: [bad] })));
  }
  assert.throws(() => parseState(JSON.stringify({ ...state, archive: 'no' })));
});
