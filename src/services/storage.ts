import type { DynastyState, Player } from '../domain/model.ts';
import { validatePlayer } from '../domain/players.ts';
import { STAGES } from '../domain/stages.ts';
import { fmIdentity, validFMData } from '../domain/fm-data.ts';
import { emptyTracking, parseTracking } from '../modules/analysis/tracking.ts';
import { parseSquadPlans } from '../modules/analysis/construction.ts';

import { dbGet, dbSet } from './db.ts';

const STATE_KEY = 'state';
export const emptyState = (): DynastyState => ({ version: 3, stageId: 0, players: [], tracking: emptyTracking(), squadPlans: [] });

export function parseState(raw: string): DynastyState {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('El archivo no contiene una partida válida.');
  const state = value as Omit<DynastyState, 'version' | 'tracking' | 'squadPlans'> & { version: number; tracking?: unknown; squadPlans?: unknown };
  if (![1, 2, 3].includes(state.version) || !Number.isInteger(state.stageId) || !STAGES[state.stageId] || !Array.isArray(state.players)) throw new Error('Versión, etapa o plantilla no válidas.');
  const ids = new Set<string>();
  const fmIds = new Set<string>();
  if (state.fmSaveId !== undefined && (typeof state.fmSaveId !== 'string' || !state.fmSaveId.trim() || state.fmSaveId.length > 80)) throw new Error('Identificador de partida inválido.');
  const players: Player[] = state.players.map(p => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id) || validatePlayer(p)) throw new Error('Hay jugadores inválidos o identificadores repetidos.');
    ids.add(p.id);
    if (p.fm !== undefined) {
      if (!validFMData(p.fm)) throw new Error('Los datos importados de FM no son válidos.');
      if (p.fm.uniqueId) {
        const key = fmIdentity(p.fm.saveId, p.fm.uniqueId);
        if (fmIds.has(key)) throw new Error('Hay IDs de FM repetidos en la misma partida.');
        fmIds.add(key);
      }
    }
    return { id: p.id, name: p.name.trim(), age: p.age, position: p.position, ca: p.ca, pa: p.pa, notes: p.notes, ...(p.fm ? { fm: { ...p.fm, values: { ...p.fm.values } } } : {}) };
  });
  // Migración explícita: conserva plantilla e identidad; nunca inventa fechas ni históricos.
  const tracking = state.version === 1 ? emptyTracking() : parseTracking(state.tracking);
  const squadPlans = state.version < 3 ? [] : parseSquadPlans(state.squadPlans);
  return { version: 3, stageId: state.stageId, players, tracking, squadPlans, ...(state.fmSaveId ? { fmSaveId: state.fmSaveId } : {}) };
}

export async function loadState(): Promise<{ state: DynastyState; error: string | null }> {
  try {
    const raw = await dbGet<string>(STATE_KEY);
    return { state: raw ? parseState(raw) : emptyState(), error: null };
  } catch {
    return { state: emptyState(), error: 'No se pudo leer el guardado local. No se sobrescribirá hasta que elijas empezar de nuevo o importes una copia.' };
  }
}

export async function saveState(state: DynastyState): Promise<void> {
  await dbSet(STATE_KEY, JSON.stringify(state));
}
