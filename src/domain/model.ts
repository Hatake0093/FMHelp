export const POSITIONS = ['POR', 'DFC', 'LAT', 'MC/MCD', 'MP/EXT', 'DC'] as const;
export type Position = typeof POSITIONS[number];
export interface FMPlayerData {
  uniqueId?: string;
  saveId: string;
  sourceFile: string;
  importedAt: string;
  values: Record<string, string>;
}
export interface Player {
  id: string;
  name: string;
  age: number;
  position: Position;
  ca: number;
  pa: number;
  notes: string;
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
