import type { DepartureReason, DynastyState } from '../../domain/model.ts';
import { fmIdentity } from '../../domain/fm-data.ts';
import { validGameDate } from '../analysis/tracking.ts';

export const DEPARTURE_LABELS: Record<DepartureReason, string> = { sold: 'Vendido', free: 'Libre (carta de libertad)' };
const MAX_ARCHIVE = 10_000;

// Saca al jugador de la plantilla sin perder su ficha: los cortes, planes y evaluación dejan de contarlo, y se puede restaurar.
export function archivePlayer(state: DynastyState, playerId: string, reason: DepartureReason, date: string, now = new Date()): DynastyState {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('El jugador ya no está en la plantilla.');
  if (!(date === '' || validGameDate(date))) throw new Error('La fecha de salida no es válida.');
  if (state.archive.length >= MAX_ARCHIVE) throw new Error('Se alcanzó el límite de exjugadores. Elimina algunos definitivamente.');
  return { ...state, players: state.players.filter(p => p.id !== playerId), archive: [...state.archive, { player, reason, date, archivedAt: now.toISOString() }] };
}

export function restorePlayer(state: DynastyState, playerId: string): DynastyState {
  const entry = state.archive.find(e => e.player.id === playerId);
  if (!entry) throw new Error('El exjugador ya no existe.');
  const { fm } = entry.player;
  const duplicate = state.players.some(p => p.id === playerId || Boolean(fm?.uniqueId && p.fm?.uniqueId && fmIdentity(p.fm.saveId, p.fm.uniqueId) === fmIdentity(fm.saveId, fm.uniqueId)));
  if (duplicate) throw new Error('Ya hay un jugador activo con el mismo ID de FM. Elimina el duplicado antes de restaurar.');
  return { ...state, players: [...state.players, entry.player], archive: state.archive.filter(e => e.player.id !== playerId) };
}

// Borrado definitivo de la ficha archivada. Los cortes históricos conservan sus observaciones.
export function purgeArchived(state: DynastyState, playerId: string): DynastyState {
  if (!state.archive.some(e => e.player.id === playerId)) throw new Error('El exjugador ya no existe.');
  return { ...state, archive: state.archive.filter(e => e.player.id !== playerId) };
}
