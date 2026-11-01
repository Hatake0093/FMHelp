import { TACTIC_PHASES } from '../../domain/model.ts';
import type { TacticChange, TacticInstruction, TacticPeriod, TacticPhase, TacticsState } from '../../domain/model.ts';
import { validGameDate } from './tracking.ts';

export const PHASE_LABELS: Record<TacticPhase, string> = { possession: 'Con posesión', noPossession: 'Sin posesión' };
const MAX_INSTRUCTIONS = 100;
const MAX_RECORDS = 500;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const short = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const named = (value: unknown, max: number): value is string => short(value, max) && value.trim().length > 0;
const count = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1000;
const byDate = <T extends { gameDate: string }>(a: T, b: T) => a.gameDate.localeCompare(b.gameDate);

export const emptyTactics = (): TacticsState => ({ formation: '', style: '', mentality: '', notes: '', instructions: [], periods: [], changes: [] });
export const hasTactics = (t: TacticsState) => Boolean(t.formation || t.style || t.mentality || t.notes || t.instructions.length);

// Táctica principal anotada el 2026-11-01. Solo se carga si el usuario lo pide; los valores cortados en pantalla quedan marcados.
export function seedTactics(): TacticsState {
  const rows: [TacticPhase, string, string][] = [
    ['possession', 'Pases directos', 'Estándar'], ['possession', 'Ritmo de juego', 'Mucho más alto'], ['possession', 'Perder tiempo', 'Menos a menudo'],
    ['possession', 'Transición ofensiva', 'Contraataque'], ['possession', 'Amplitud del ataque', 'Más estrecho'], ['possession', 'Jugar buscando el balón parado', 'Mantener el balón en juego'],
    ['possession', 'Libertad creativa', 'Equilibrado'], ['possession', 'Estrategia previa', 'Jugar superando… (texto cortado, completar)'], ['possession', 'Saques de puerta', 'En corto'],
    ['possession', 'Distribución del portero (a quién)', 'Centrales'], ['possession', 'Carreras de apoyo', 'Equilibrado'], ['possession', 'Regate', 'Animar'],
    ['possession', 'Progresar por', 'Equilibrada'], ['possession', 'Recepción de pase', 'Pasar al espacio'], ['possession', 'Paciencia', 'Intentar llevar el balón al área'],
    ['possession', 'Disparos lejanos', 'Desanimar'], ['possession', 'Estilo de centros', 'Centros rasos'], ['possession', 'Distribución del portero (cómo)', 'Equilibrada'],
  ];
  return {
    formation: '5-0-5 Onslaught', style: 'Contrapresión', mentality: 'Positiva',
    notes: 'Sin posesión: línea de cinco; Hepworth y Nathan Evans bajan a mediocentros, los dos extremos retroceden a las bandas.\nTensiones a contrastar: velocidad frente a paciencia, salida corta con centrales débiles, ataque estrecho con cuatro jugadores abiertos, regate «Animar», balón parado ignorado, medios sin relevo en el banquillo.\nPendiente: registrar las instrucciones sin posesión. Más detalle en docs/tactica.md.',
    instructions: rows.map(([phase, name, value]) => ({ id: crypto.randomUUID(), phase, name, value })),
    periods: [], changes: [],
  };
}

export function validateSetup(t: TacticsState): string | null {
  if (!short(t.formation, 80) || !short(t.style, 80) || !short(t.mentality, 80)) return 'Esquema, estilo y mentalidad admiten hasta 80 caracteres.';
  if (!short(t.notes, 5000)) return 'Las notas admiten hasta 5.000 caracteres.';
  if (!Array.isArray(t.instructions) || t.instructions.length > MAX_INSTRUCTIONS) return `Máximo ${MAX_INSTRUCTIONS} instrucciones.`;
  const ids = new Set<string>();
  for (const i of t.instructions) {
    if (!object(i) || !named(i.id, 200) || ids.has(i.id) || !TACTIC_PHASES.includes(i.phase) || !named(i.name, 80) || !short(i.value, 120)) return 'Cada instrucción necesita nombre (máximo 80 caracteres) y un valor de hasta 120.';
    ids.add(i.id);
  }
  return null;
}

export function validatePeriod(p: TacticPeriod): string | null {
  if (!validGameDate(p.gameDate)) return 'Escribe una fecha válida de la partida.';
  if (!named(p.label, 80)) return 'Nombra el periodo (máximo 80 caracteres).';
  if (![p.played, p.wins, p.draws, p.losses, p.goalsFor, p.goalsAgainst, p.setPieceFor, p.setPieceAgainst].every(count)) return 'Partidos y goles deben ser enteros de 0 a 1.000.';
  if (p.wins + p.draws + p.losses !== p.played) return 'Victorias, empates y derrotas deben sumar los partidos jugados.';
  if (p.setPieceFor > p.goalsFor || p.setPieceAgainst > p.goalsAgainst) return 'Los goles de balón parado no pueden superar el total de goles.';
  if (![p.xgFor, p.xgAgainst].every(x => x === null || Number.isFinite(x) && x >= 0 && x <= 1000)) return 'El xG debe estar entre 0 y 1.000, o quedar vacío.';
  if (!short(p.notes, 1000)) return 'Las notas admiten hasta 1.000 caracteres.';
  return null;
}

export function validateChange(c: TacticChange): string | null {
  if (!validGameDate(c.gameDate)) return 'Escribe una fecha válida de la partida.';
  if (!named(c.change, 300)) return 'Describe el cambio (máximo 300 caracteres).';
  if (!short(c.expected, 500) || !short(c.result, 500)) return 'Lo esperado y el resultado admiten hasta 500 caracteres.';
  return null;
}

function replace<T extends { id: string }>(list: T[], item: T, label: string): T[] {
  const exists = list.some(i => i.id === item.id);
  if (!exists && list.length >= MAX_RECORDS) throw new Error(`Se alcanzó el límite de ${MAX_RECORDS} ${label}.`);
  return exists ? list.map(i => i.id === item.id ? item : i) : [...list, item];
}
export function saveSetup(t: TacticsState, setup: Pick<TacticsState, 'formation' | 'style' | 'mentality' | 'notes' | 'instructions'>): TacticsState {
  const next = { ...t, ...setup, formation: setup.formation.trim(), style: setup.style.trim(), mentality: setup.mentality.trim(), instructions: setup.instructions.map(i => ({ ...i, name: i.name.trim(), value: i.value.trim() })) };
  const error = validateSetup(next); if (error) throw new Error(error);
  return next;
}
export function upsertPeriod(t: TacticsState, p: TacticPeriod): TacticsState {
  const error = validatePeriod(p); if (error) throw new Error(error);
  return { ...t, periods: replace(t.periods, { ...p, label: p.label.trim() }, 'periodos').sort(byDate) };
}
export const removePeriod = (t: TacticsState, id: string): TacticsState => ({ ...t, periods: t.periods.filter(p => p.id !== id) });
export function upsertChange(t: TacticsState, c: TacticChange): TacticsState {
  const error = validateChange(c); if (error) throw new Error(error);
  return { ...t, changes: replace(t.changes, { ...c, change: c.change.trim() }, 'cambios').sort(byDate) };
}
export const removeChange = (t: TacticsState, id: string): TacticsState => ({ ...t, changes: t.changes.filter(c => c.id !== id) });

export interface PeriodStats {
  points: number;
  perGame: number | null;
  goalDiff: number;
  setPieceShareFor: number | null;
  setPieceShareAgainst: number | null;
  xgDiff: number | null;
}
export function periodStats(p: TacticPeriod): PeriodStats {
  const points = p.wins * 3 + p.draws;
  return {
    points, perGame: p.played ? points / p.played : null, goalDiff: p.goalsFor - p.goalsAgainst,
    setPieceShareFor: p.goalsFor ? p.setPieceFor / p.goalsFor : null, setPieceShareAgainst: p.goalsAgainst ? p.setPieceAgainst / p.goalsAgainst : null,
    xgDiff: p.xgFor !== null && p.xgAgainst !== null ? p.xgFor - p.xgAgainst : null,
  };
}
// Suma los periodos. Las etiquetas y notas del resultado no importan; solo los contadores.
export function totalPeriods(periods: TacticPeriod[]): TacticPeriod {
  const sum = (key: 'played' | 'wins' | 'draws' | 'losses' | 'goalsFor' | 'goalsAgainst' | 'setPieceFor' | 'setPieceAgainst') => periods.reduce((total, p) => total + p[key], 0);
  const complete = periods.length > 0 && periods.every(p => p.xgFor !== null && p.xgAgainst !== null);
  return {
    id: 'total', gameDate: periods.at(-1)?.gameDate ?? '', label: 'Total', played: sum('played'), wins: sum('wins'), draws: sum('draws'), losses: sum('losses'),
    goalsFor: sum('goalsFor'), goalsAgainst: sum('goalsAgainst'), setPieceFor: sum('setPieceFor'), setPieceAgainst: sum('setPieceAgainst'),
    xgFor: complete ? periods.reduce((total, p) => total + (p.xgFor ?? 0), 0) : null, xgAgainst: complete ? periods.reduce((total, p) => total + (p.xgAgainst ?? 0), 0) : null, notes: '',
  };
}

// Devuelve undefined si la copia no trae táctica; lanza si existe pero es inválida, igual que el resto del guardado.
export function parseTactics(value: unknown): TacticsState | undefined {
  if (value === undefined) return undefined;
  const fail = (): never => { throw new Error('La táctica guardada no es válida.'); };
  if (!object(value) || !Array.isArray(value.instructions) || !Array.isArray(value.periods) || !Array.isArray(value.changes) || value.periods.length > MAX_RECORDS || value.changes.length > MAX_RECORDS) return fail();
  const tactics = value as unknown as TacticsState;
  if (validateSetup(tactics)) fail();
  const ids = new Set<string>();
  const unique = (id: string) => { if (ids.has(id)) fail(); ids.add(id); };
  for (const i of tactics.instructions) unique(i.id);
  const periods = tactics.periods.map((raw): TacticPeriod => {
    if (!object(raw) || !named(raw.id, 200)) return fail();
    const p = raw as unknown as TacticPeriod;
    unique(p.id);
    if (validatePeriod(p)) fail();
    return { id: p.id, gameDate: p.gameDate, label: p.label, played: p.played, wins: p.wins, draws: p.draws, losses: p.losses, goalsFor: p.goalsFor, goalsAgainst: p.goalsAgainst, setPieceFor: p.setPieceFor, setPieceAgainst: p.setPieceAgainst, xgFor: p.xgFor, xgAgainst: p.xgAgainst, notes: p.notes };
  });
  const changes = tactics.changes.map((raw): TacticChange => {
    if (!object(raw) || !named(raw.id, 200)) return fail();
    const c = raw as unknown as TacticChange;
    unique(c.id);
    if (validateChange(c)) fail();
    return { id: c.id, gameDate: c.gameDate, change: c.change, expected: c.expected, result: c.result };
  });
  const instructions: TacticInstruction[] = tactics.instructions.map(i => ({ id: i.id, phase: i.phase, name: i.name, value: i.value }));
  return { formation: tactics.formation, style: tactics.style, mentality: tactics.mentality, notes: tactics.notes, instructions, periods, changes };
}
