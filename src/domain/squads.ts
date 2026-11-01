import type { Player, SquadId } from './model.ts';
import { nextStageId, referenceCA } from './stages.ts';

export const SQUAD_LABELS: Record<SquadId, string> = { first: 'Primer equipo', u21: 'Sub-21', u18: 'Sub-18' };
export type YouthSquad = Exclude<SquadId, 'first'>;
export const squadOf = (player: Pick<Player, 'squad'>): SquadId => player.squad ?? 'first';
export const inFirstTeam = (player: Pick<Player, 'squad'>) => squadOf(player) === 'first';
// Ascenso manual: Sub-18 → Sub-21 → Primer equipo.
export const PROMOTES_TO: Record<YouthSquad, SquadId> = { u18: 'u21', u21: 'first' };

// Referencias propias, no reglas de FM. Edad máxima de la plantilla, cupo orientativo y, en Sub-18, edad desde la que se considera subir.
export const YOUTH_RULES: Record<YouthSquad, { maxAge: number; capacity: number; promoteAge: number }> = {
  u21: { maxAge: 21, capacity: 25, promoteAge: 0 },
  u18: { maxAge: 18, capacity: 25, promoteAge: 17 },
};

export type YouthStatus = 'promote' | 'project' | 'review';
export const YOUTH_STATUS_LABELS: Record<YouthStatus, string> = { promote: 'Listo para subir', project: 'Proyecto', review: 'Revisar' };
export interface YouthEvaluation { player: Player; status: YouthStatus; reason: string; targetPA: number; promoteCA: number | null }

// Los juveniles no se miden por CA actual sino por camino de ascenso: edad límite, potencial y, en Sub-21, nivel de rotación del primer equipo.
export function evaluateYouth(players: Player[], squad: YouthSquad, stageId: number): YouthEvaluation[] {
  const rules = YOUTH_RULES[squad];
  const next = SQUAD_LABELS[PROMOTES_TO[squad]];
  return players.filter(p => squadOf(p) === squad).map(player => {
    const targetPA = referenceCA(nextStageId(stageId), player.position);
    const promoteCA = squad === 'u21' ? referenceCA(stageId, player.position, 'depth') : null;
    const projectOk = player.pa >= targetPA;
    const over = player.age > rules.maxAge;
    let status: YouthStatus, reason: string;
    if (promoteCA !== null && player.ca >= promoteCA) { status = 'promote'; reason = `CA de rotación del primer equipo (${promoteCA}).`; }
    else if (over && projectOk && squad === 'u18') { status = 'promote'; reason = `Supera los ${rules.maxAge} años con PA de proyecto: sube a ${next}.`; }
    else if (over) { status = 'review'; reason = `Supera los ${rules.maxAge} años: debe subir o salir.`; }
    else if (squad === 'u18' && projectOk && player.age >= rules.promoteAge) { status = 'promote'; reason = `${rules.promoteAge} años o más y PA de proyecto (${targetPA}): puede subir a ${next}.`; }
    else if (projectOk) { status = 'project'; reason = `PA de proyecto (${targetPA}) dentro del límite de ${rules.maxAge} años.`; }
    else { status = 'review'; reason = `PA por debajo del proyecto (${targetPA}).`; }
    return { player, status, reason, targetPA, promoteCA };
  });
}
