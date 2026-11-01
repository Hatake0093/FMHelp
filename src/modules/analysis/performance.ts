import type { PlayerObservation, Position, SquadSnapshot } from '../../domain/model.ts';
import { MIN_ROLE_COVERAGE, ROLE_PROFILES } from './roles.ts';
import type { RoleProfile } from './roles.ts';

export type PerformanceStatus = 'over' | 'under' | 'aligned' | 'unused' | 'pending';
export interface PerformanceCriteria { minMinutes: number; minGroup: number; gap: number; strongProfile: number }
// Referencias propias de planificación: percentiles dentro del grupo de posición del mismo corte.
export const DEFAULT_PERFORMANCE_CRITERIA: PerformanceCriteria = { minMinutes: 450, minGroup: 4, gap: 25, strongProfile: 60 };

// Mismo cálculo que evaluateRole, pero con los atributos de la observación del corte, no con los de la ficha actual.
export function observedRoleScore(observation: PlayerObservation, role: RoleProfile): number | null {
  const keys = Object.keys(role.weights), known = keys.filter(key => key in observation.attributes);
  const total = keys.reduce((sum, key) => sum + role.weights[key], 0), weight = known.reduce((sum, key) => sum + role.weights[key], 0);
  if (!weight || weight / total < MIN_ROLE_COVERAGE || !role.essential.every(key => known.includes(key))) return null;
  return known.reduce((sum, key) => sum + observation.attributes[key] * role.weights[key], 0) / weight * 5;
}
// Los roles del propio grupo de posición; no se explora la reconversión.
export function bestObservedRole(observation: PlayerObservation) {
  const scored = ROLE_PROFILES.filter(role => role.position === observation.position).map(role => ({ role, score: observedRoleScore(observation, role) }));
  return scored.filter((s): s is { role: RoleProfile; score: number } => s.score !== null).sort((a, b) => b.score - a.score || a.role.id.localeCompare(b.role.id))[0] ?? null;
}
// 0 = el peor del grupo, 100 = el mejor; los empates comparten el valor medio.
const percentile = (values: number[], value: number) => {
  const below = values.filter(v => v < value).length, equal = values.filter(v => v === value).length;
  return (below + (equal - 1) / 2) / (values.length - 1) * 100;
};

export function performanceVsProfile(snapshot: SquadSnapshot, criteria = DEFAULT_PERFORMANCE_CRITERIA) {
  const entries = snapshot.players.map(observation => ({ observation, best: bestObservedRole(observation) }));
  const groupOf = (position: Position) => entries.filter(e => e.observation.position === position);
  const rated = (e: typeof entries[number]) => e.observation.rating !== null && e.observation.minutes !== null && e.observation.minutes >= criteria.minMinutes;
  const order: Record<PerformanceStatus, number> = { unused: 0, under: 1, over: 2, aligned: 3, pending: 4 };
  return entries.map(({ observation, best }) => {
    const group = groupOf(observation.position);
    const profiled = group.filter(e => e.best), raters = group.filter(e => e.best && rated(e));
    const profilePct = best && profiled.length >= criteria.minGroup ? percentile(profiled.map(e => e.best!.score), best.score) : null;
    const ratingPct = best && rated({ observation, best }) && raters.length >= criteria.minGroup ? percentile(raters.map(e => e.observation.rating!), observation.rating!) : null;
    const gap = profilePct !== null && ratingPct !== null ? ratingPct - profilePct : null;
    const minutes = observation.minutes;
    let status: PerformanceStatus = 'pending', reason: string;
    if (!best) reason = 'Faltan atributos para puntuar su perfil en este corte.';
    else if (profilePct === null) reason = `Menos de ${criteria.minGroup} jugadores de ${observation.position} con perfil evaluable: grupo demasiado pequeño para comparar.`;
    else if (minutes === null) reason = 'Faltan los minutos de este corte.';
    else if (minutes < criteria.minMinutes) {
      status = profilePct >= criteria.strongProfile ? 'unused' : 'pending';
      reason = status === 'unused' ? `Buen perfil para su grupo (percentil ${Math.round(profilePct)}) con solo ${minutes} min: revisa si recibe oportunidades.` : `Solo ${minutes} min: pocos para fiarse de la calificación.`;
    } else if (observation.rating === null) reason = 'Sin calificación en este corte.';
    else if (ratingPct === null) reason = `Menos de ${criteria.minGroup} jugadores de ${observation.position} con calificación y minutos suficientes.`;
    else {
      status = gap! >= criteria.gap ? 'over' : gap! <= -criteria.gap ? 'under' : 'aligned';
      reason = status === 'over' ? 'Rinde por encima de lo que sugiere su perfil.' : status === 'under' ? 'Rinde por debajo de lo que sugiere su perfil: revisa rol, posición y contexto.' : 'Rendimiento acorde con su perfil.';
    }
    return { observation, role: best?.role ?? null, score: best?.score ?? null, profilePct, ratingPct, gap, status, reason };
  }).sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0) || a.observation.name.localeCompare(b.observation.name, 'es'));
}
