import { attributeNumber, FM_ATTRIBUTES, normalizeSaveId, readFMValue } from '../../domain/fm-data.ts';
import type { Player, Position } from '../../domain/model.ts';

export interface RoleProfile {
  id: string;
  name: string;
  position: Position;
  purpose: string;
  weights: Record<string, number>;
  essential: string[];
}
// Modelo propio de planificación. Los pesos no son fórmulas oficiales de Football Manager.
export const ROLE_PROFILES: RoleProfile[] = [
  { id: 'keeper', name: 'Portero de área', position: 'POR', purpose: 'Proteger la portería y dominar el área.', weights: { reflexes: 3, handling: 3, oneOnOnes: 3, aerialReach: 2, command: 2, positioning: 2, concentration: 2, communication: 1, agility: 1 }, essential: ['reflexes', 'handling', 'oneOnOnes'] },
  { id: 'sweeperKeeper', name: 'Portero con salida', position: 'POR', purpose: 'Cubrir la espalda de la defensa e iniciar el juego.', weights: { reflexes: 3, oneOnOnes: 3, rushingOut: 2, anticipation: 2, decisions: 3, passing: 2, firstTouch: 1, acceleration: 1, kicking: 2, handling: 2 }, essential: ['reflexes', 'decisions', 'rushingOut'] },
  { id: 'centreBack', name: 'Central defensivo', position: 'DFC', purpose: 'Defender el área, anticipar y ganar duelos.', weights: { marking: 3, tackling: 3, positioning: 3, jumping: 3, heading: 2, strength: 2, anticipation: 2, concentration: 2, pace: 1, bravery: 1 }, essential: ['marking', 'positioning', 'jumping'] },
  { id: 'ballPlaying', name: 'Central con salida', position: 'DFC', purpose: 'Defender y superar líneas con el pase.', weights: { marking: 2, tackling: 2, positioning: 3, passing: 3, composure: 3, decisions: 2, technique: 2, anticipation: 2, jumping: 2, pace: 1 }, essential: ['positioning', 'passing', 'composure'] },
  { id: 'fullBack', name: 'Lateral defensivo', position: 'LAT', purpose: 'Cerrar la banda y ofrecer apoyos seguros.', weights: { tackling: 3, marking: 3, positioning: 3, acceleration: 2, pace: 2, stamina: 2, concentration: 2, teamwork: 1, passing: 1, decisions: 1 }, essential: ['tackling', 'positioning', 'pace'] },
  { id: 'wingBack', name: 'Carrilero de recorrido', position: 'LAT', purpose: 'Dar amplitud y recorrer la banda en ambas fases.', weights: { acceleration: 3, pace: 3, stamina: 3, crossing: 3, workRate: 2, dribbling: 2, offTheBall: 2, tackling: 2, positioning: 1, teamwork: 1 }, essential: ['stamina', 'crossing', 'pace'] },
  { id: 'invertedBack', name: 'Lateral por dentro', position: 'LAT', purpose: 'Apoyar la circulación desde zonas interiores.', weights: { passing: 3, decisions: 3, firstTouch: 3, positioning: 2, tackling: 2, vision: 2, teamwork: 2, composure: 2, stamina: 1, acceleration: 1 }, essential: ['passing', 'decisions', 'firstTouch'] },
  { id: 'anchor', name: 'Pivote defensivo', position: 'MC/MCD', purpose: 'Proteger a los centrales y sostener la estructura.', weights: { positioning: 3, tackling: 3, anticipation: 3, decisions: 2, teamwork: 2, concentration: 2, marking: 2, strength: 2, passing: 1, stamina: 1 }, essential: ['positioning', 'tackling', 'anticipation'] },
  { id: 'deepPlaymaker', name: 'Organizador retrasado', position: 'MC/MCD', purpose: 'Iniciar y orientar la posesión desde la base.', weights: { passing: 3, vision: 3, decisions: 3, firstTouch: 2, composure: 2, technique: 2, positioning: 2, teamwork: 1, anticipation: 1 }, essential: ['passing', 'vision', 'decisions'] },
  { id: 'boxToBox', name: 'Interior de recorrido', position: 'MC/MCD', purpose: 'Conectar áreas y participar en ambas fases.', weights: { stamina: 3, workRate: 3, teamwork: 2, offTheBall: 2, passing: 2, tackling: 2, decisions: 2, acceleration: 1, firstTouch: 1, anticipation: 1 }, essential: ['stamina', 'workRate', 'offTheBall'] },
  { id: 'attackingPlaymaker', name: 'Mediapunta creador', position: 'MP/EXT', purpose: 'Encontrar el último pase y crear entre líneas.', weights: { vision: 3, passing: 3, decisions: 3, firstTouch: 2, technique: 2, flair: 2, offTheBall: 2, composure: 2, dribbling: 1 }, essential: ['vision', 'passing', 'decisions'] },
  { id: 'winger', name: 'Extremo abierto', position: 'MP/EXT', purpose: 'Desbordar por fuera y servir centros.', weights: { dribbling: 3, acceleration: 3, pace: 3, crossing: 3, technique: 2, offTheBall: 2, agility: 2, decisions: 1, firstTouch: 1 }, essential: ['dribbling', 'crossing', 'acceleration'] },
  { id: 'insideForward', name: 'Atacante desde banda', position: 'MP/EXT', purpose: 'Atacar por dentro y llegar a posiciones de remate.', weights: { finishing: 3, offTheBall: 3, acceleration: 3, dribbling: 2, composure: 2, technique: 2, firstTouch: 2, decisions: 2, pace: 2 }, essential: ['finishing', 'offTheBall', 'acceleration'] },
  { id: 'advancedForward', name: 'Delantero al espacio', position: 'DC', purpose: 'Amenazar la espalda de la defensa y finalizar.', weights: { finishing: 3, offTheBall: 3, acceleration: 3, pace: 3, composure: 2, anticipation: 2, firstTouch: 2, decisions: 1, dribbling: 1 }, essential: ['finishing', 'offTheBall', 'pace'] },
  { id: 'targetForward', name: 'Delantero de referencia', position: 'DC', purpose: 'Fijar centrales, ganar balones aéreos y descargar.', weights: { strength: 3, jumping: 3, heading: 3, balance: 2, firstTouch: 2, finishing: 2, teamwork: 2, offTheBall: 1, bravery: 1, passing: 1 }, essential: ['strength', 'jumping', 'heading'] },
  { id: 'linkForward', name: 'Delantero de apoyo', position: 'DC', purpose: 'Recibir entre líneas y asociarse con los compañeros.', weights: { firstTouch: 3, passing: 3, decisions: 3, technique: 2, vision: 2, composure: 2, offTheBall: 2, teamwork: 2, finishing: 2, balance: 1 }, essential: ['firstTouch', 'passing', 'decisions'] },
];

export const MIN_ROLE_COVERAGE = 0.8;
export function attributeLabel(key: string) { return FM_ATTRIBUTES.find(a => a.key === key)?.label ?? key; }
export function playerAttribute(player: Player, key: string): number | null {
  const definition = FM_ATTRIBUTES.find(a => a.key === key);
  return definition ? attributeNumber(readFMValue(player.fm, definition.aliases)) : null;
}
function assess(role: RoleProfile, available: (key: string) => boolean) {
  const keys = Object.keys(role.weights);
  const totalWeight = keys.reduce((sum, key) => sum + role.weights[key], 0);
  const known = keys.filter(available);
  const knownWeight = known.reduce((sum, key) => sum + role.weights[key], 0);
  const coverage = totalWeight ? knownWeight / totalWeight : 0;
  const missing = keys.filter(key => !available(key));
  const missingEssential = role.essential.filter(key => !available(key));
  return { known, coverage, missing, missingEssential, ready: coverage >= MIN_ROLE_COVERAGE && missingEssential.length === 0 };
}
export function evaluateRole(player: Player, role: RoleProfile) {
  const coverage = assess(role, key => playerAttribute(player, key) !== null);
  const knownWeight = coverage.known.reduce((sum, key) => sum + role.weights[key], 0);
  const score = coverage.ready ? coverage.known.reduce((sum, key) => sum + playerAttribute(player, key)! * role.weights[key], 0) / knownWeight * 5 : null;
  const attributes = coverage.known.map(key => ({ key, value: playerAttribute(player, key)!, weight: role.weights[key] }));
  return { role, ...coverage, score,
    strengths: [...attributes].sort((a, b) => b.value - a.value || b.weight - a.weight).slice(0, 3),
    priorities: attributes.filter(a => a.value < Math.max(...attributes.map(item => item.value))).sort((a, b) => a.value - b.value || b.weight - a.weight).slice(0, 3),
  };
}
export function rolesForPlayer(player: Player) {
  return ROLE_PROFILES.filter(role => (role.position === 'POR') === (player.position === 'POR'))
    .map(role => evaluateRole(player, role))
    .sort((a, b) => Number(b.ready) - Number(a.ready) || (b.score ?? 0) - (a.score ?? 0) || b.coverage - a.coverage || a.role.id.localeCompare(b.role.id));
}
export function sameSave(a: Player, b: Player) {
  return Boolean(a.fm && b.fm && normalizeSaveId(a.fm.saveId) === normalizeSaveId(b.fm.saveId));
}
export function compareRole(a: Player, b: Player, role: RoleProfile) {
  const coverage = assess(role, key => playerAttribute(a, key) !== null && playerAttribute(b, key) !== null);
  const compatible = a.id !== b.id && sameSave(a, b) && (a.position === 'POR') === (role.position === 'POR') && (b.position === 'POR') === (role.position === 'POR');
  const score = (player: Player) => !compatible || !coverage.ready ? null : coverage.known.reduce((sum, key) => sum + playerAttribute(player, key)! * role.weights[key], 0) / coverage.known.reduce((sum, key) => sum + role.weights[key], 0) * 5;
  return { ...coverage, ready: compatible && coverage.ready, compatible, scoreA: score(a), scoreB: score(b),
    rows: Object.keys(role.weights).map(key => { const valueA = playerAttribute(a, key), valueB = playerAttribute(b, key); return { key, weight: role.weights[key], essential: role.essential.includes(key), valueA, valueB, difference: valueA !== null && valueB !== null ? valueA - valueB : null }; }),
  };
}
