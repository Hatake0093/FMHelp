import { normalizeSaveId } from '../../domain/fm-data.ts';
import type { Evaluation, Player, SquadConstructionPlan } from '../../domain/model.ts';
import { evaluateSquad } from '../../domain/players.ts';
import { referenceCA } from '../../domain/stages.ts';

export type SaleLevel = 'sell' | 'consider' | 'keep';
export const SALE_LABELS: Record<SaleLevel, string> = { sell: 'Recomendada', consider: 'Valorar', keep: 'Mantener' };
// Por debajo de esta edad el PA se considera poco concluyente y la venta solo se sugiere valorar.
export const YOUNG_PA_AGE = 20;

export interface SaleReview {
  player: Player;
  evaluation: Evaluation;
  level: SaleLevel;
  kind: 'ceiling' | 'surplus' | null;
  reasons: string[];
  pending: string[];
  changes: string[];
  slots: string[];
}

// Propuesta orientativa: solo los jugadores en revisión pueden recibir «Recomendada», y nunca si ocupan un puesto de tu plan.
export function reviewDepartures(players: Player[], stageId: number, plans: SquadConstructionPlan[]): SaleReview[] {
  const order: Record<SaleLevel, number> = { sell: 0, consider: 1, keep: 2 };
  return evaluateSquad(players, stageId).map(evaluation => {
    const { player } = evaluation;
    const review: SaleReview = { player, evaluation, level: 'keep', kind: null, reasons: [], pending: [], changes: [], slots: [] };
    if (evaluation.group !== 'review') { review.reasons.push(evaluation.reason); return review; }

    const depth = referenceCA(stageId, player.position, 'depth');
    review.kind = evaluation.eligible === 'review' ? 'ceiling' : 'surplus';
    if (review.kind === 'surplus') {
      review.reasons.push(evaluation.reason);
      review.changes.push('Dejaría de ser excedente si sale otro jugador de su grupo o si mejora más que quien ocupa la plaza.');
    } else {
      review.reasons.push(player.age > 23
        ? `${player.age} años: ya no entra en desarrollo y su CA (${player.ca}) está por debajo de la rotación (${depth}).`
        : `PA ${player.pa} por debajo del objetivo de desarrollo (${evaluation.targetPA}) y CA ${player.ca} por debajo de la rotación (${depth}).`);
      review.changes.push(`Cambiaría si su CA llegara a ${depth}${player.age <= 23 ? ` o su PA a ${evaluation.targetPA}` : ''}.`);
    }

    const plan = player.fm ? plans.find(p => normalizeSaveId(p.saveId) === normalizeSaveId(player.fm!.saveId)) : undefined;
    const assigned = plan?.slots.some(s => s.starterId || s.backupId || s.prospectId) ?? false;
    review.slots = plan ? plan.slots.filter(s => [s.starterId, s.backupId, s.prospectId].includes(player.id)).map(s => s.name) : [];
    review.level = 'sell';
    if (review.slots.length) {
      review.level = 'consider';
      review.reasons.push(`Figura en tu plan (${review.slots.join(', ')}): reasígnalo antes de venderlo.`);
    } else if (!plan || !assigned) {
      review.level = 'consider';
      review.pending.push(!plan ? 'Sin plan de plantilla para su partida: no se sabe si ocupa un puesto.' : 'Tu plan aún no tiene asignaciones: no se sabe si ocupa un puesto.');
    } else review.reasons.push('No ocupa ningún puesto de tu plan.');

    if (review.kind === 'ceiling' && player.age <= YOUNG_PA_AGE) {
      review.level = 'consider';
      review.pending.push(`Tiene ${player.age} años: confirma su PA con más datos o ojeadores antes de venderlo.`);
    }
    return review;
  }).sort((a, b) => order[a.level] - order[b.level] || Number(b.kind === 'ceiling') - Number(a.kind === 'ceiling') || b.player.age - a.player.age || a.player.ca - b.player.ca || a.player.id.localeCompare(b.player.id));
}
