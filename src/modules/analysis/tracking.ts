import { attributeNumber, FM_ATTRIBUTES, FM_FIELDS, fmIdentity, normalizeSaveId, readFMValue } from '../../domain/fm-data.ts';
import { MINUTE_ROLES, POSITIONS } from '../../domain/model.ts';
import type { DynastyState, MinutePlan, Player, PlayerObservation, SnapshotContext, SquadSnapshot, TrackingState } from '../../domain/model.ts';
import { validatePlayer } from '../../domain/players.ts';
import { applyFMImport, importableRows, playerNameKey } from '../import-export/fm-csv.ts';
import type { ImportRow } from '../import-export/fm-csv.ts';

export const emptyTracking = (): TrackingState => ({ snapshots: [], minutePlans: [] });
const text = (value: unknown, max = 80): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const contextKey = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
export function validGameDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2999-12-31') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateSnapshotContext(context: SnapshotContext): string | null {
  if (!validGameDate(context.gameDate) || !validGameDate(context.statsFrom) || !validGameDate(context.statsTo)) return 'Escribe fechas válidas de la partida y del periodo estadístico.';
  if (context.statsFrom > context.statsTo || context.statsTo > context.gameDate) return 'El periodo debe empezar antes de terminar y no superar la fecha de la partida.';
  if (!text(context.season) || !text(context.competition)) return 'Indica temporada y competición o alcance estadístico (máximo 80 caracteres).';
  return null;
}
// Separadores de miles inequívocos; no se interpreta 4,5 o 1.5 como minutos enteros.
export function parseMinutes(raw: string): number | null {
  const value = raw.trim();
  const valid = /^\d+$/.test(value) || /^\d{1,3}([., ])\d{3}(\1\d{3})*$/.test(value);
  const number = valid ? Number(value.replace(/[., ]/g, '')) : NaN;
  return Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000 ? number : null;
}
function parseRating(raw: string): number | null {
  const value = /^\d{1,2}([.,]\d{1,2})?$/.test(raw.trim()) ? Number(raw.trim().replace(',', '.')) : NaN;
  return value >= 1 && value <= 10 ? value : null;
}
export function observePlayer(player: Player, playerId = player.id): PlayerObservation {
  const attributes: Record<string, number> = {};
  for (const attribute of FM_ATTRIBUTES) {
    const value = attributeNumber(readFMValue(player.fm, attribute.aliases));
    if (value !== null) attributes[attribute.key] = value;
  }
  return { playerId, name: player.name, age: player.age, position: player.position, ca: player.ca, pa: player.pa, attributes,
    minutes: parseMinutes(readFMValue(player.fm, FM_FIELDS.minutes)), rating: parseRating(readFMValue(player.fm, FM_FIELDS.rating)) };
}
export function snapshotKey(snapshot: SnapshotContext & { saveId: string }) {
  return JSON.stringify([normalizeSaveId(snapshot.saveId), snapshot.gameDate, contextKey(snapshot.season), contextKey(snapshot.competition), snapshot.statsFrom, snapshot.statsTo]);
}
export function importWithTracking(state: DynastyState, rows: ImportRow[], saveId: string, context?: SnapshotContext, makeId: () => string = () => crypto.randomUUID()) {
  if (!text(saveId)) throw new Error('Indica una partida válida.');
  const accepted = importableRows(rows);
  if (!accepted.length) throw new Error('No hay filas válidas para importar.');
  if (accepted.some(row => !row.draft.fm || normalizeSaveId(row.draft.fm.saveId) !== normalizeSaveId(saveId))) throw new Error('La partida de las filas no coincide con la importación.');
  if (context) {
    if (state.tracking.snapshots.length >= 2000) throw new Error('Se alcanzó el límite de 2.000 cortes. Exporta una copia antes de continuar sin registrar histórico.');
    const error = validateSnapshotContext(context);
    if (error) throw new Error(error);
    if (state.tracking.snapshots.some(snapshot => snapshotKey(snapshot) === snapshotKey({ ...context, saveId }))) throw new Error('Ya existe un corte para esa fecha, temporada, alcance y periodo. Elige otro contexto o importa sin registrar histórico.');
    if (state.tracking.snapshots.some(snapshot => normalizeSaveId(snapshot.saveId) === normalizeSaveId(saveId) && snapshot.gameDate > context.gameDate)) throw new Error('La fecha es anterior al último corte de esta partida. Para otra rama de la partida, usa otro nombre de origen; también puedes importar sin registrar histórico.');
  }
  const result = applyFMImport(state.players, rows, makeId);
  if (!context) return { ...result, state: { ...state, fmSaveId: saveId.trim(), players: result.players } };
  const observations = accepted.map(row => {
    const data = row.draft.fm!;
    const target = row.targetId ? result.players.find(p => p.id === row.targetId) : data.uniqueId
      ? result.players.find(p => p.fm?.uniqueId && fmIdentity(p.fm.saveId, p.fm.uniqueId) === fmIdentity(data.saveId, data.uniqueId!))
      : result.players.find(p => p.fm && normalizeSaveId(p.fm.saveId) === normalizeSaveId(saveId) && playerNameKey(p.name) === playerNameKey(row.draft.name));
    if (!target) throw new Error('No se pudo vincular una fila del corte con su jugador.');
    // Lee la fila original, nunca la ficha combinada con atributos de importaciones anteriores.
    return observePlayer({ ...row.draft, id: target.id });
  });
  const snapshot: SquadSnapshot = { ...context, season: context.season.trim(), competition: context.competition.trim(), id: makeId(), saveId: saveId.trim(), recordedAt: accepted[0].draft.fm!.importedAt, sourceFile: accepted[0].draft.fm!.sourceFile, players: observations };
  return { ...result, state: { ...state, fmSaveId: saveId.trim(), players: result.players, tracking: { ...state.tracking, snapshots: [...state.tracking.snapshots, snapshot] } } };
}
// Corrección de un corte ya registrado (p. ej. fecha escrita como DD/MM en lugar de MM/DD). Conserva jugadores y observaciones.
export function updateSnapshotContext(tracking: TrackingState, id: string, context: SnapshotContext): TrackingState {
  const current = tracking.snapshots.find(s => s.id === id);
  if (!current) throw new Error('El corte ya no existe.');
  const error = validateSnapshotContext(context);
  if (error) throw new Error(error);
  if (tracking.snapshots.some(s => s.id !== id && snapshotKey(s) === snapshotKey({ ...context, saveId: current.saveId }))) throw new Error('Ya existe otro corte con esa fecha, temporada, alcance y periodo.');
  const { gameDate, statsFrom, statsTo } = context;
  return { ...tracking, snapshots: tracking.snapshots.map(s => s.id === id ? { ...s, gameDate, statsFrom, statsTo, season: context.season.trim(), competition: context.competition.trim() } : s) };
}
export function deleteSnapshot(tracking: TrackingState, id: string): TrackingState {
  if (!tracking.snapshots.some(s => s.id === id)) throw new Error('El corte ya no existe.');
  return { ...tracking, snapshots: tracking.snapshots.filter(s => s.id !== id) };
}

export function validateMinutePlan(plan: MinutePlan): string | null {
  if (!text(plan.id, 200) || !text(plan.playerId, 200) || !text(plan.saveId) || !text(plan.season) || !text(plan.competition)) return 'Completa jugador, partida, temporada y competición.';
  if (!validGameDate(plan.startDate) || !validGameDate(plan.endDate) || plan.startDate >= plan.endDate) return 'El objetivo necesita una fecha final posterior a la inicial.';
  if (!Number.isInteger(plan.targetMinutes) || plan.targetMinutes < 1 || plan.targetMinutes > 100_000) return 'El objetivo debe ser un entero de 1 a 100.000 minutos.';
  if (!MINUTE_ROLES.includes(plan.role) || typeof plan.notes !== 'string' || plan.notes.length > 1000) return 'Revisa el papel previsto y las notas (máximo 1.000 caracteres).';
  return null;
}
export function upsertMinutePlan(tracking: TrackingState, plan: MinutePlan): TrackingState {
  const error = validateMinutePlan(plan); if (error) throw new Error(error);
  if (tracking.minutePlans.length >= 10_000 && !tracking.minutePlans.some(p => p.id === plan.id)) throw new Error('Se alcanzó el límite de 10.000 planes de minutos.');
  const normalized = { ...plan, saveId: plan.saveId.trim(), season: plan.season.trim(), competition: plan.competition.trim() };
  if (tracking.minutePlans.some(p => p.id !== plan.id && p.playerId === plan.playerId && normalizeSaveId(p.saveId) === normalizeSaveId(plan.saveId) && contextKey(p.season) === contextKey(plan.season) && contextKey(p.competition) === contextKey(plan.competition) && p.startDate <= plan.endDate && p.endDate >= plan.startDate)) throw new Error('Ya hay un plan de este jugador que se solapa en esa temporada y competición. Edita el plan existente o usa otro periodo.');
  return { ...tracking, minutePlans: [...tracking.minutePlans.filter(p => p.id !== plan.id), normalized] };
}
const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
export function matchingPlanContext(plan: MinutePlan, snapshot: SquadSnapshot) {
  return normalizeSaveId(plan.saveId) === normalizeSaveId(snapshot.saveId) && contextKey(plan.season) === contextKey(snapshot.season) && contextKey(plan.competition) === contextKey(snapshot.competition);
}
export function minuteProgress(plan: MinutePlan, snapshots: SquadSnapshot[]) {
  const matches = snapshots.filter(s => matchingPlanContext(plan, s) && s.statsFrom === plan.startDate && s.statsTo >= plan.startDate && s.statsTo <= plan.endDate && s.players.some(p => p.playerId === plan.playerId));
  // El corte más reciente del mismo periodo, no la suma de acumulados.
  const snapshot = [...matches].sort((a, b) => b.statsTo.localeCompare(a.statsTo) || b.gameDate.localeCompare(a.gameDate) || b.recordedAt.localeCompare(a.recordedAt))[0];
  const observation = snapshot?.players.find(p => p.playerId === plan.playerId);
  const actual = observation?.minutes ?? null;
  const elapsed = snapshot ? Math.max(0, Math.min(1, daysBetween(plan.startDate, snapshot.statsTo) / daysBetween(plan.startDate, plan.endDate))) : 0;
  const expected = Math.round(plan.targetMinutes * elapsed);
  const percentage = actual === null ? null : actual / plan.targetMinutes * 100;
  const status = actual === null ? 'pending' : actual >= plan.targetMinutes ? 'achieved' : elapsed >= 1 ? 'missed' : elapsed === 0 ? 'starting' : actual < expected * 0.8 ? 'behind' : 'onTrack';
  return { snapshot, actual, expected, percentage, elapsed, status };
}
export function compareObservations(before: PlayerObservation, after: PlayerObservation) {
  if (before.playerId !== after.playerId) throw new Error('Los cortes pertenecen a jugadores distintos.');
  return { ca: after.ca - before.ca, pa: after.pa - before.pa,
    attributes: FM_ATTRIBUTES.filter(a => a.key in before.attributes || a.key in after.attributes).map(a => ({ key: a.key, label: a.label, lowerIsBetter: Boolean(a.lowerIsBetter), before: before.attributes[a.key] ?? null, after: after.attributes[a.key] ?? null, delta: a.key in before.attributes && a.key in after.attributes ? after.attributes[a.key] - before.attributes[a.key] : null })) };
}
export interface BlockedCriteria { maxAge: number; minHeadroom: number; lowMinutes: number; minimumDays: number; minimumCompetitors: number }
export const DEFAULT_BLOCKED_CRITERIA: BlockedCriteria = { maxAge: 23, minHeadroom: 15, lowMinutes: 450, minimumDays: 30, minimumCompetitors: 2 };
export function blockedTalent(snapshot: SquadSnapshot, currentPlayers: Player[], plans: MinutePlan[], criteria = DEFAULT_BLOCKED_CRITERIA) {
  const priority: Record<string, number> = { blocked: 0, watch: 1, pending: 2, ok: 3 };
  const activeIds = new Set(currentPlayers.filter(p => p.fm && normalizeSaveId(p.fm.saveId) === normalizeSaveId(snapshot.saveId)).map(p => p.id));
  const observed = snapshot.players.filter(p => activeIds.has(p.playerId));
  return observed.filter(p => p.age <= criteria.maxAge && p.pa - p.ca >= criteria.minHeadroom).map(player => {
    const competitors = observed.filter(p => p.playerId !== player.playerId && p.position === player.position && p.ca > player.ca).sort((a, b) => b.ca - a.ca);
    const plan = plans.find(p => p.playerId === player.playerId && matchingPlanContext(p, snapshot) && p.startDate <= snapshot.statsTo && p.endDate >= snapshot.statsTo);
    const progress = plan ? minuteProgress(plan, [snapshot]) : null;
    const enoughTime = daysBetween(snapshot.statsFrom, snapshot.statsTo) >= criteria.minimumDays;
    const pending = player.minutes === null || !enoughTime || (progress !== null && progress.actual === null);
    const lowParticipation = !pending && (progress ? ['behind', 'missed'].includes(progress.status) : player.minutes! < criteria.lowMinutes);
    const status = pending ? 'pending' : lowParticipation && competitors.length >= criteria.minimumCompetitors ? 'blocked' : lowParticipation ? 'watch' : 'ok';
    const reason = player.minutes === null ? 'Faltan minutos en este corte.' : !enoughTime ? `Periodo inferior a ${criteria.minimumDays} días: espera más observaciones.` : progress && progress.actual === null ? 'El periodo del corte no permite medir su plan de minutos.' : status === 'blocked' ? 'Participación baja y competencia por delante en este grupo de posición.' : status === 'watch' ? 'Participación baja; revisa oportunidades y contexto.' : 'Sin señal de bloqueo con estos criterios.';
    return { player, competitors, plan, progress, status, reason };
  }).sort((a, b) => priority[a.status] - priority[b.status] || b.player.pa - b.player.ca - (a.player.pa - a.player.ca));
}

export function parseTracking(value: unknown): TrackingState {
  if (!object(value) || !Array.isArray(value.snapshots) || !Array.isArray(value.minutePlans) || value.snapshots.length > 2000 || value.minutePlans.length > 10_000) throw new Error('El histórico o los planes de minutos no son válidos.');
  const ids = new Set<string>(), contexts = new Set<string>();
  const snapshots = value.snapshots.map(raw => {
    if (!object(raw)) throw new Error('Corte histórico inválido.');
    const s = raw as unknown as SquadSnapshot;
    if (!text(s.id, 200) || ids.has(s.id) || !text(s.saveId) || validateSnapshotContext(s) || !text(s.sourceFile, 255) || typeof s.recordedAt !== 'string' || !Number.isFinite(Date.parse(s.recordedAt)) || !Array.isArray(s.players) || s.players.length > 10_000 || contexts.has(snapshotKey(s))) throw new Error('Fecha, contexto o identidad de un corte inválidos o repetidos.');
    ids.add(s.id); contexts.add(snapshotKey(s));
    const observedIds = new Set<string>();
    const players = s.players.map(p => {
      if (!object(p) || !text(p.playerId, 200) || observedIds.has(p.playerId) || validatePlayer({ ...p, notes: '' }) || !POSITIONS.includes(p.position) || !object(p.attributes)) throw new Error('Jugador de histórico inválido o repetido.');
      observedIds.add(p.playerId);
      if (!Object.entries(p.attributes).every(([key, v]) => FM_ATTRIBUTES.some(a => a.key === key) && Number.isInteger(v) && v >= 1 && v <= 20) || !(p.minutes === null || Number.isInteger(p.minutes) && p.minutes >= 0 && p.minutes <= 1_000_000) || !(p.rating === null || Number.isFinite(p.rating) && p.rating >= 1 && p.rating <= 10)) throw new Error('Atributos, minutos o calificación de histórico inválidos.');
      return { playerId: p.playerId, name: p.name, age: p.age, position: p.position, ca: p.ca, pa: p.pa, attributes: { ...p.attributes }, minutes: p.minutes, rating: p.rating };
    });
    return { id: s.id, saveId: s.saveId, gameDate: s.gameDate, season: s.season, competition: s.competition, statsFrom: s.statsFrom, statsTo: s.statsTo, recordedAt: s.recordedAt, sourceFile: s.sourceFile, players };
  });
  let result: TrackingState = { snapshots, minutePlans: [] };
  const planIds = new Set<string>();
  for (const raw of value.minutePlans) {
    if (!object(raw)) throw new Error('Plan de minutos inválido.');
    const plan = raw as unknown as MinutePlan;
    if (planIds.has(plan.id)) throw new Error('Hay planes de minutos repetidos.');
    planIds.add(plan.id);
    result = upsertMinutePlan(result, { id: plan.id, playerId: plan.playerId, saveId: plan.saveId, season: plan.season, competition: plan.competition, startDate: plan.startDate, endDate: plan.endDate, targetMinutes: plan.targetMinutes, role: plan.role, notes: plan.notes });
  }
  return result;
}
