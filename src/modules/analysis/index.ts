import type { Evaluation } from '../../domain/model.ts';

// Resumen de planificación; los perfiles y comparativas se calculan en roles.ts.
export function summarizeSquad(evaluations: Evaluation[]) {
  const count = (group: Evaluation['group']) => evaluations.filter(e => e.group === group).length;
  return { competitive: count('competitive'), development: count('development'), review: count('review') };
}
