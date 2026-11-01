export const POSITIONS = ['POR', 'DFC', 'LAT', 'MC/MCD', 'MP/EXT', 'DC'] as const;
export type Position = typeof POSITIONS[number];
export interface FMPlayerData {
  uniqueId?: string;
  saveId: string;
  sourceFile: string;
  importedAt: string;
  values: Record<string, string>;
}
// Plantilla del club. Un jugador sin `squad` pertenece al primer equipo (así se leen las copias anteriores).
export const SQUADS = ['first', 'u21', 'u18'] as const;
export type SquadId = typeof SQUADS[number];
export interface Player {
  id: string;
  name: string;
  age: number;
  position: Position;
  ca: number;
  pa: number;
  notes: string;
  squad?: Exclude<SquadId, 'first'>;
  fm?: FMPlayerData;
}
export type PlayerDraft = Omit<Player, 'id'>;
export const DEPARTURE_REASONS = ['sold', 'free'] as const;
export type DepartureReason = typeof DEPARTURE_REASONS[number];
// Jugador que ya no está en la plantilla (vendido o libre). Conserva su ficha completa y se puede restaurar.
export interface ArchivedPlayer {
  player: Player;
  reason: DepartureReason;
  date: string; // fecha de la partida (AAAA-MM-DD) o vacío si no se indicó
  archivedAt: string;
}
export interface DynastyState {
  version: 4;
  stageId: number;
  players: Player[];
  archive: ArchivedPlayer[];
  fmSaveId?: string;
  tracking: TrackingState;
  squadPlans: SquadConstructionPlan[];
  // Opcional para leer copias anteriores: sin él, la página Táctica arranca vacía.
  tactics?: TacticsState;
}
export const TACTIC_PHASES = ['possession', 'noPossession'] as const;
export type TacticPhase = typeof TACTIC_PHASES[number];
export interface TacticInstruction {
  id: string;
  phase: TacticPhase;
  name: string;
  value: string;
}
// Resultados de los partidos jugados desde el registro anterior (no acumulados), para medir la táctica por tramos.
export interface TacticPeriod {
  id: string;
  gameDate: string;
  label: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  setPieceFor: number;
  setPieceAgainst: number;
  xgFor: number | null;
  xgAgainst: number | null;
  notes: string;
}
export interface TacticChange {
  id: string;
  gameDate: string;
  change: string;
  expected: string;
  result: string;
}
export interface TacticsState {
  formation: string;
  style: string;
  mentality: string;
  notes: string;
  instructions: TacticInstruction[];
  periods: TacticPeriod[];
  changes: TacticChange[];
}
export interface SquadSlot {
  id: string;
  name: string;
  roleId: string;
  starterId: string;
  backupId: string;
  prospectId: string;
  notes: string;
}
export interface SquadConstructionPlan {
  id: string;
  saveId: string;
  name: string;
  gameDate: string;
  slots: SquadSlot[];
}
export interface SnapshotContext {
  // Plantilla a la que corresponde el CSV; ausente = primer equipo. Permite varios cortes de la misma fecha, uno por plantilla.
  squad?: Exclude<SquadId, 'first'>;
  gameDate: string;
  season: string;
  competition: string;
  statsFrom: string;
  statsTo: string;
}
export interface PlayerObservation {
  playerId: string;
  name: string;
  age: number;
  position: Position;
  ca: number;
  pa: number;
  attributes: Record<string, number>;
  minutes: number | null;
  rating: number | null;
}
export interface SquadSnapshot extends SnapshotContext {
  id: string;
  saveId: string;
  recordedAt: string;
  sourceFile: string;
  players: PlayerObservation[];
}
export const MINUTE_ROLES = ['Titular', 'Rotación', 'Desarrollo'] as const;
export interface MinutePlan {
  id: string;
  playerId: string;
  saveId: string;
  season: string;
  competition: string;
  startDate: string;
  endDate: string;
  targetMinutes: number;
  role: typeof MINUTE_ROLES[number];
  notes: string;
}
export interface TrackingState {
  snapshots: SquadSnapshot[];
  minutePlans: MinutePlan[];
}
export type Group = 'competitive' | 'development' | 'review';
export interface Evaluation {
  player: Player;
  group: Group;
  eligible: Group;
  reason: string;
  targetCA: number;
  targetPA: number;
  // Solo en competitivos: núcleo (10 mejores) o rotación (resto hasta 20).
  tier?: 'core' | 'depth';
}
