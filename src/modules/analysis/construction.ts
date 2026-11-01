import { FM_FIELDS, normalizeSaveId, readFMValue } from '../../domain/fm-data.ts';
import type { Player, Position, SquadConstructionPlan, SquadSlot } from '../../domain/model.ts';
import { attributeLabel, evaluateRole, MIN_ROLE_COVERAGE, playerAttribute, ROLE_PROFILES, sameSave } from './roles.ts';
import type { RoleProfile } from './roles.ts';
import { validGameDate } from './tracking.ts';

const text = (value: unknown, max = 80): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
export const roleById = (id: string) => ROLE_PROFILES.find(r => r.id === id);
export const belongsToSave = (player: Player, saveId: string) => Boolean(player.fm && normalizeSaveId(player.fm.saveId) === normalizeSaveId(saveId));
const compatible = (player: Player, role: RoleProfile) => (player.position === 'POR') === (role.position === 'POR');

export function validateSquadPlan(plan: SquadConstructionPlan): string | null {
  if (!plan || !text(plan.id, 200) || !text(plan.saveId) || !text(plan.name)) return 'Indica nombre e identidad del plan y su partida.';
  if (!validGameDate(plan.gameDate)) return 'Indica una fecha válida de la partida para revisar los contratos.';
  if (!Array.isArray(plan.slots) || !plan.slots.length || plan.slots.length > 20) return 'Define entre 1 y 20 puestos en el plan.';
  const ids = new Set<string>(), starters = new Set<string>();
  for (const slot of plan.slots) {
    if (!slot || !text(slot.id, 200) || ids.has(slot.id) || !text(slot.name) || !roleById(slot.roleId) || typeof slot.notes !== 'string' || slot.notes.length > 1000) return 'Revisa nombres, roles, notas e identidad de los puestos.';
    ids.add(slot.id);
    if ([slot.starterId, slot.backupId, slot.prospectId].some(id => typeof id !== 'string' || id.length > 200)) return 'Las asignaciones de un puesto no son válidas.';
    if (slot.starterId && (starters.has(slot.starterId) || slot.starterId === slot.backupId || slot.starterId === slot.prospectId)) return 'Un jugador no puede ser titular de dos puestos ni ser su propio recambio.';
    if (slot.starterId) starters.add(slot.starterId);
  }
  return null;
}
export function upsertSquadPlan(plans: SquadConstructionPlan[], plan: SquadConstructionPlan, players?: Player[]) {
  const error = validateSquadPlan(plan); if (error) throw new Error(error);
  if (players) for (const slot of plan.slots) for (const id of [slot.starterId, slot.backupId, slot.prospectId].filter(Boolean)) {
    const player = players.find(p => p.id === id);
    if (!player || !belongsToSave(player, plan.saveId) || !compatible(player, roleById(slot.roleId)!)) throw new Error('Hay una asignación a un jugador ausente, de otra partida o incompatible con portería/campo.');
  }
  const existing = plans.find(p => normalizeSaveId(p.saveId) === normalizeSaveId(plan.saveId));
  if (!existing && plans.length >= 100) throw new Error('Se alcanzó el límite de 100 planes de partidas distintas.');
  if (existing && existing.id !== plan.id) throw new Error('Ya hay un plan principal para esta partida. Edita el existente.');
  if (plans.some(p => p.id === plan.id && normalizeSaveId(p.saveId) !== normalizeSaveId(plan.saveId))) throw new Error('El identificador del plan pertenece a otra partida.');
  const saved = { ...plan, saveId: plan.saveId.trim(), name: plan.name.trim(), slots: plan.slots.map(s => ({ ...s, name: s.name.trim() })) };
  return [...plans.filter(p => p.id !== saved.id), saved];
}
export function parseSquadPlans(value: unknown): SquadConstructionPlan[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Los planes de plantilla no son válidos.');
  let plans: SquadConstructionPlan[] = [];
  const ids = new Set<string>(), saves = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || validateSquadPlan(raw as SquadConstructionPlan)) throw new Error('Hay un plan de plantilla inválido.');
    const p = raw as SquadConstructionPlan;
    if (ids.has(p.id) || saves.has(normalizeSaveId(p.saveId))) throw new Error('Hay planes de plantilla repetidos.');
    ids.add(p.id); saves.add(normalizeSaveId(p.saveId));
    plans = upsertSquadPlan(plans, { id: p.id, saveId: p.saveId, name: p.name, gameDate: p.gameDate, slots: p.slots.map(s => ({ id: s.id, name: s.name, roleId: s.roleId, starterId: s.starterId, backupId: s.backupId, prospectId: s.prospectId, notes: s.notes })) });
  }
  return plans;
}

export const FORMATIONS = ['4-4-2', '4-2-3-1', '4-3-3'] as const;
export function formationSlots(formation: typeof FORMATIONS[number], makeId = () => crypto.randomUUID()): SquadSlot[] {
  const base = [['Portero', 'keeper'], ['Lateral derecho', 'fullBack'], ['Central derecho', 'centreBack'], ['Central izquierdo', 'ballPlaying'], ['Lateral izquierdo', 'fullBack']];
  const rest = formation === '4-4-2' ? [['Banda derecha', 'winger'], ['Pivote', 'anchor'], ['Organizador', 'deepPlaymaker'], ['Banda izquierda', 'winger'], ['Delantero de referencia', 'targetForward'], ['Delantero al espacio', 'advancedForward']]
    : formation === '4-2-3-1' ? [['Pivote', 'anchor'], ['Organizador', 'deepPlaymaker'], ['Banda derecha', 'winger'], ['Mediapunta', 'attackingPlaymaker'], ['Banda izquierda', 'insideForward'], ['Delantero', 'advancedForward']]
    : [['Pivote', 'anchor'], ['Interior creador', 'deepPlaymaker'], ['Interior de recorrido', 'boxToBox'], ['Banda derecha', 'winger'], ['Banda izquierda', 'insideForward'], ['Delantero', 'advancedForward']];
  return [...base, ...rest].map(([name, roleId]) => ({ id: makeId(), name, roleId, starterId: '', backupId: '', prospectId: '', notes: '' }));
}

// Base común para todo el grupo evaluable; ningún índice se ordena con atributos distintos.
export function commonRoleBasis(role: RoleProfile, players: Player[]) {
  const keys = Object.keys(role.weights);
  const known = keys.filter(key => players.length > 0 && players.every(p => playerAttribute(p, key) !== null));
  const weight = known.reduce((sum, key) => sum + role.weights[key], 0);
  const coverage = weight / keys.reduce((sum, key) => sum + role.weights[key], 0);
  const missing = keys.filter(key => !known.includes(key));
  const ready = players.length > 0 && coverage >= MIN_ROLE_COVERAGE && role.essential.every(key => known.includes(key));
  const score = (player: Player) => ready && known.every(key => playerAttribute(player, key) !== null) ? known.reduce((sum, key) => sum + playerAttribute(player, key)! * role.weights[key], 0) / weight * 5 : null;
  return { known, missing, coverage, ready, score };
}

interface PairDimension { id: string; name: string; attributes: string[] }
export const PAIR_PROFILES: { id: string; name: string; position: Position; roles: [string, string]; dimensions: PairDimension[] }[] = [
  { id: 'defenders', name: 'Pareja de centrales', position: 'DFC', roles: ['centreBack', 'ballPlaying'], dimensions: [
    { id: 'defending', name: 'Defensa del área', attributes: ['marking', 'tackling', 'positioning', 'anticipation', 'concentration'] },
    { id: 'aerial', name: 'Juego aéreo', attributes: ['jumping', 'heading', 'strength'] },
    { id: 'recovery', name: 'Cobertura al espacio', attributes: ['pace', 'acceleration', 'anticipation'] },
    { id: 'buildUp', name: 'Salida de balón', attributes: ['passing', 'firstTouch', 'composure', 'decisions'] },
  ] },
  { id: 'midfield', name: 'Doble pivote', position: 'MC/MCD', roles: ['anchor', 'deepPlaymaker'], dimensions: [
    { id: 'shield', name: 'Protección defensiva', attributes: ['tackling', 'positioning', 'anticipation', 'concentration'] },
    { id: 'creation', name: 'Creación de juego', attributes: ['passing', 'vision', 'decisions', 'firstTouch'] },
    { id: 'movement', name: 'Llegada y apoyos', attributes: ['offTheBall', 'anticipation', 'acceleration'] },
    { id: 'work', name: 'Trabajo y recorrido', attributes: ['stamina', 'workRate', 'teamwork'] },
  ] },
  { id: 'forwards', name: 'Dupla de delanteros', position: 'DC', roles: ['targetForward', 'advancedForward'], dimensions: [
    { id: 'finishing', name: 'Finalización', attributes: ['finishing', 'composure', 'offTheBall'] },
    { id: 'link', name: 'Asociación y apoyos', attributes: ['passing', 'firstTouch', 'teamwork', 'decisions'] },
    { id: 'space', name: 'Amenaza al espacio', attributes: ['pace', 'acceleration', 'offTheBall'] },
    { id: 'aerial', name: 'Referencia aérea', attributes: ['jumping', 'heading', 'strength'] },
  ] },
];
export function analyzePair(a: Player, b: Player, profileId: string, threshold = 12) {
  const profile = PAIR_PROFILES.find(p => p.id === profileId);
  if (!profile || a.id === b.id || !sameSave(a, b) || a.position !== profile.position || b.position !== profile.position || !Number.isFinite(threshold) || threshold < 1 || threshold > 20) throw new Error('Selecciona dos jugadores distintos, del mismo puesto y partida, y una referencia de 1 a 20.');
  const dimensions = profile.dimensions.map(d => {
    const virtualRole: RoleProfile = { id: d.id, name: d.name, purpose: d.name, position: profile.position, weights: Object.fromEntries(d.attributes.map(key => [key, 1])), essential: [d.attributes[0]] };
    const basis = commonRoleBasis(virtualRole, [a, b]);
    const scoreA = basis.score(a), scoreB = basis.score(b);
    const valueA = scoreA === null ? null : scoreA / 5, valueB = scoreB === null ? null : scoreB / 5;
    const status = valueA === null || valueB === null ? 'pending' : valueA >= threshold && valueB >= threshold ? 'both' : valueA < threshold && valueB < threshold ? 'sharedWeakness' : valueA >= threshold ? 'resourceA' : 'resourceB';
    return { ...d, coverage: basis.coverage, missing: basis.missing, valueA, valueB, status };
  });
  return { profile, dimensions, resources: dimensions.filter(d => ['both', 'resourceA', 'resourceB'].includes(d.status)).length, sharedWeaknesses: dimensions.filter(d => d.status === 'sharedWeakness').length, pending: dimensions.filter(d => d.status === 'pending').length,
    attributes: [...new Set(profile.dimensions.flatMap(d => d.attributes))].map(key => ({ key, label: attributeLabel(key), valueA: playerAttribute(a, key), valueB: playerAttribute(b, key) })) };
}

export interface ConstructionCriteria { highGap: number; mediumGap: number; resourceFloor: number; resourceGap: number; prospectAge: number; ageReview: number; contractMonths: number }
export const DEFAULT_CONSTRUCTION_CRITERIA: ConstructionCriteria = { highGap: 8, mediumGap: 4, resourceFloor: 12, resourceGap: 3, prospectAge: 23, ageReview: 30, contractMonths: 12 };
export function parseContractDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (validGameDate(trimmed)) return trimmed;
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!parts) return null;
  const date = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return validGameDate(date) ? date : null;
}
export function contractReview(player: Player, gameDate: string, months = 12) {
  const raw = readFMValue(player.fm, FM_FIELDS.contract), endDate = parseContractDate(raw);
  if (!validGameDate(gameDate) || !endDate) return { raw, endDate, status: 'pending' };
  const current = new Date(`${gameDate}T00:00:00Z`);
  const monthIndex = current.getUTCMonth() + months;
  const year = current.getUTCFullYear() + Math.floor(monthIndex / 12), month = monthIndex % 12;
  const day = Math.min(current.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const horizon = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  return { raw, endDate, status: endDate < gameDate ? 'past' : endDate <= horizon ? 'soon' : 'later' };
}

export function analyzeSlot(plan: SquadConstructionPlan, slot: SquadSlot, roster: Player[], criteria = DEFAULT_CONSTRUCTION_CRITERIA) {
  const role = roleById(slot.roleId);
  if (!role) throw new Error('El rol del puesto no existe.');
  const players = roster.filter(p => belongsToSave(p, plan.saveId));
  const find = (id: string) => players.find(p => p.id === id && compatible(p, role));
  const starter = find(slot.starterId), assignedBackup = find(slot.backupId), assignedProspect = find(slot.prospectId);
  const starters = new Set(plan.slots.map(s => s.starterId).filter(Boolean));
  const unavailableAssignments = [slot.starterId, slot.backupId, slot.prospectId].filter(id => id && !find(id));
  const reserves = players.filter(p => p.id !== starter?.id && !starters.has(p.id) && (p.position === role.position || p.id === assignedBackup?.id || p.id === assignedProspect?.id) && compatible(p, role));
  const readyReserves = reserves.filter(p => evaluateRole(p, role).ready);
  const basisPlayers = [starter, ...readyReserves, assignedBackup, assignedProspect].filter((p): p is Player => Boolean(p));
  const basis = commonRoleBasis(role, [...new Map(basisPlayers.map(p => [p.id, p])).values()]);
  const rankedReserves = reserves.map(player => ({ player, score: evaluateRole(player, role).ready ? basis.score(player) : null })).sort((a, b) => Number(b.score !== null) - Number(a.score !== null) || (b.score ?? 0) - (a.score ?? 0) || b.player.ca - a.player.ca || a.player.id.localeCompare(b.player.id));
  const bestReserve = rankedReserves.find(p => p.score !== null);
  const starterScore = starter ? basis.score(starter) : null;
  const gap = starterScore !== null && bestReserve ? starterScore - bestReserve.score! : null;
  const incompleteReserves = readyReserves.length < reserves.length;
  const status = !starter ? 'unassigned' : !reserves.length ? 'noBackup' : gap === null || gap >= criteria.mediumGap && incompleteReserves ? 'pending' : gap >= criteria.highGap ? 'high' : gap >= criteria.mediumGap ? 'medium' : 'low';
  const losses = starter && reserves.length ? Object.keys(role.weights).flatMap(key => {
    const value = playerAttribute(starter, key), others = reserves.map(p => playerAttribute(p, key));
    if (value === null || value < criteria.resourceFloor || others.some(v => v === null)) return [];
    const best = Math.max(...others as number[]);
    return value - best >= criteria.resourceGap ? [{ key, label: attributeLabel(key), starter: value, reserve: best, gap: value - best }] : [];
  }).sort((a, b) => b.gap - a.gap).slice(0, 3) : [];
  const prospects = rankedReserves.filter(p => starter && p.player.age <= criteria.prospectAge && p.player.age < starter.age && p.player.pa >= starter.ca)
    .sort((a, b) => Number(b.score !== null) - Number(a.score !== null) || (b.score ?? 0) - (a.score ?? 0) || b.player.pa - a.player.pa || a.player.age - b.player.age);
  const candidate = assignedProspect ? rankedReserves.find(p => p.player.id === assignedProspect.id) : prospects[0];
  const prospectEligible = Boolean(candidate && starter && candidate.player.age <= criteria.prospectAge && candidate.player.age < starter.age && candidate.player.pa >= starter.ca);
  const prospectGap = candidate?.score !== null && candidate?.score !== undefined && starterScore !== null ? starterScore - candidate.score : null;
  const prospectStatus = !candidate ? assignedProspect ? 'occupied' : 'none' : !prospectEligible ? 'criteria' : prospectGap === null ? 'pending' : prospectGap <= criteria.mediumGap && starter && starter.ca - candidate.player.ca <= 10 ? 'close' : 'development';
  const backupOtherSlot = assignedBackup ? plan.slots.filter(s => s.id !== slot.id && s.starterId === assignedBackup.id).map(s => s.name) : [];
  const sharedBackupSlots = assignedBackup ? plan.slots.filter(s => s.id !== slot.id && s.backupId === assignedBackup.id).map(s => s.name) : [];
  const contract = starter ? contractReview(starter, plan.gameDate, criteria.contractMonths) : null;
  const reasons: string[] = [];
  if (status === 'noBackup') reasons.push('No hay otro jugador registrado disponible para cubrir este rol sin mover un titular.');
  if (status === 'high') reasons.push(`El mejor recambio evaluable queda ${gap!.toFixed(1)} puntos por debajo en la misma base de atributos.`);
  if (contract?.status === 'soon') reasons.push(`El contrato termina dentro del horizonte de ${criteria.contractMonths} meses de la fecha de partida.`);
  if (contract?.status === 'past') reasons.push('El fin de contrato es anterior a la fecha de partida; revisa la exportación.');
  if (starter && starter.age >= criteria.ageReview) reasons.push(`Edad registrada de ${starter.age} años: revisar el horizonte de relevo, sin asumir un declive.`);
  if (starter && prospectStatus === 'none') reasons.push('No se ha identificado un relevo joven que cumpla edad y techo de PA en las reservas registradas.');
  if (prospectStatus === 'criteria') reasons.push('El relevo asignado no cumple los criterios de edad, juventud relativa o techo de PA de esta consulta.');
  if (prospectStatus === 'occupied') reasons.push('El relevo asignado ya ocupa otro puesto titular; su traslado necesita un segundo relevo.');
  const priority = !starter ? 'unassigned' : ['noBackup', 'high'].includes(status) || ['soon', 'past'].includes(contract?.status ?? '') ? 'review' : status === 'pending' || prospectStatus === 'pending' || contract?.status === 'pending' || unavailableAssignments.length > 0 ? 'pending' : reasons.length ? 'plan' : 'covered';
  return { slot, role, starter, assignedBackup, assignedProspect, unavailableAssignments, reserves, rankedReserves, bestReserve, basis, starterScore, gap, status, losses, prospects, candidate, prospectStatus, prospectGap, backupOtherSlot, sharedBackupSlots, contract, reasons, priority };
}
