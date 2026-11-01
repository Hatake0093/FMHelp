import type { Position } from './model.ts';

// Referencias del plan maestro del usuario; no son datos oficiales de FM26.
// base: CA mínimo del núcleo (10 mejores competitivos). depth: CA mínimo de la rotación (los otros 10).
// Referencia observada en equipos de Champions: ~10 jugadores por encima de 150 y suplentes algo por debajo.
export const DEPTH_GAP = 15;
const stage = <const N extends number, const T extends string, const C extends string>(id: N, name: T, competition: C, base: number) => ({ id, name, competition, base, depth: base - DEPTH_GAP });
export const STAGES = [
  stage(0, 'Sexta división', 'National League South', 55),
  stage(1, 'Quinta división', 'National League', 65),
  stage(2, 'League Two', 'EFL League Two', 75),
  stage(3, 'League One', 'EFL League One', 90),
  stage(4, 'Championship', 'EFL Championship', 105),
  stage(5, 'Premier normal', 'Permanencia en Premier', 120),
  stage(6, 'Premier Conference', 'Objetivo Conference League', 130),
  stage(7, 'Premier Europa', 'Objetivo Europa League', 140),
  stage(8, 'Premier Champions', 'Objetivo Champions League', 150),
] as const;

export type Tier = 'core' | 'depth';

export function referenceCA(stageId: number, position: Position, tier: Tier = 'core'): number {
  const stage = STAGES[stageId];
  if (!stage) throw new Error('Etapa deportiva inválida.');
  return stage[tier === 'core' ? 'base' : 'depth'] - (position === 'LAT' ? 2 : 0);
}
export const nextStageId = (stageId: number) => Math.min(stageId + 1, STAGES.length - 1);
