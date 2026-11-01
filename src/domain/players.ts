import { POSITIONS } from './model.ts';
import type { Evaluation, Group, Player, PlayerDraft } from './model.ts';
import { nextStageId, referenceCA } from './stages.ts';

export const CAPACITY = { competitive: 20, development: 10 } as const;
export const CORE_SLOTS = 10;
export const GROUP_LABELS: Record<Group, string> = {
  competitive: 'Competitivo', development: 'Desarrollo', review: 'En revisión',
};

export function validatePlayer(p: PlayerDraft): string | null {
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > 80) return 'Escribe un nombre de entre 1 y 80 caracteres.';
  if (!POSITIONS.includes(p.position)) return 'Selecciona una posición válida.';
  if (!Number.isInteger(p.age) || p.age < 14 || p.age > 60) return 'La edad debe ser un entero entre 14 y 60 años.';
  if (!Number.isInteger(p.ca) || p.ca < 1 || p.ca > 200) return 'El CA debe ser un entero entre 1 y 200.';
  if (!Number.isInteger(p.pa) || p.pa < p.ca || p.pa > 200) return 'El PA debe estar entre el CA y 200.';
  if (typeof p.notes !== 'string' || p.notes.length > 1000) return 'Las notas admiten hasta 1.000 caracteres.';
  return null;
}

export function evaluateSquad(players: Player[], stageId: number): Evaluation[] {
  const evaluations: Evaluation[] = players.map(player => {
    const targetCA = referenceCA(stageId, player.position);
    const depthCA = referenceCA(stageId, player.position, 'depth');
    const targetPA = referenceCA(nextStageId(stageId), player.position);
    let eligible: Group = 'review';
    let reason = 'CA bajo y PA inferior al objetivo de desarrollo.';
    if (player.ca >= depthCA) {
      eligible = 'competitive';
      reason = 'CA suficiente para la etapa actual.';
    } else if (player.age <= 23 && player.pa >= targetPA) {
      eligible = 'development';
      reason = 'Hasta 23 años y PA de la siguiente etapa.';
    } else if (player.age > 23) {
      reason = 'CA insuficiente; supera los 23 años de desarrollo.';
    }
    return { player, group: eligible, eligible, reason, targetCA, targetPA };
  });
  // No depende del orden visible ni descarta registros al superar las 30 plazas.
  for (const group of ['competitive', 'development'] as const) {
    const candidates = evaluations.filter(e => e.eligible === group).sort((a, b) =>
      group === 'competitive'
        ? (b.player.ca - b.targetCA) - (a.player.ca - a.targetCA) || b.player.pa - a.player.pa || a.player.id.localeCompare(b.player.id)
        : (b.player.pa - b.targetPA) - (a.player.pa - a.targetPA) || b.player.ca - a.player.ca || a.player.age - b.player.age || a.player.id.localeCompare(b.player.id),
    );
    candidates.slice(CAPACITY[group]).forEach(e => {
      e.group = 'review';
      e.reason = `Cumple el perfil ${GROUP_LABELS[group].toLowerCase()}, pero no hay plaza (${CAPACITY[group]} máximo).`;
    });
    if (group === 'competitive') {
      // Núcleo: las 10 primeras plazas exigen el CA completo de la etapa; el resto es rotación con umbral menor.
      let core = 0;
      candidates.slice(0, CAPACITY.competitive).forEach(e => {
        if (core < CORE_SLOTS && e.player.ca >= e.targetCA) {
          core++; e.tier = 'core'; e.reason = 'Núcleo: CA de la etapa actual.';
        } else {
          e.tier = 'depth';
          e.reason = e.player.ca >= e.targetCA ? `Rotación: ya hay ${CORE_SLOTS} jugadores de núcleo.` : `Rotación: por debajo del CA de núcleo (${e.targetCA}), dentro del mínimo de rotación.`;
        }
      });
    }
  }
  return evaluations;
}
