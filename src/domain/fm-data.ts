import type { FMPlayerData } from './model.ts';

export const normalizeHeader = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const normalizeSaveId = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
export const fmIdentity = (saveId: string, uniqueId: string) => JSON.stringify([normalizeSaveId(saveId), uniqueId]);
export const validFMId = (value: string) => /^\d{1,30}$/.test(value) && !/^0+$/.test(value);
export type AttributeGroup = 'Físicos' | 'Técnicos' | 'Mentales' | 'Portería' | 'Personalidad y ocultos';
interface AttributeDefinition { key: string; label: string; group: AttributeGroup; aliases: string[]; lowerIsBetter?: boolean }
const def = (key: string, label: string, group: AttributeGroup, aliases: string[] = [], lowerIsBetter = false): AttributeDefinition => ({ key, label, group, aliases: [label, ...aliases], lowerIsBetter });
export const FM_ATTRIBUTES: AttributeDefinition[] = [
  def('acceleration', 'Aceleración', 'Físicos', ['Acceleration']),
  def('pace', 'Velocidad', 'Físicos', ['Pace']),
  def('agility', 'Agilidad', 'Físicos', ['Agility']),
  def('balance', 'Equilibrio', 'Físicos', ['Balance']),
  def('strength', 'Fuerza', 'Físicos', ['Strength']),
  def('stamina', 'Resistencia', 'Físicos', ['Stamina']),
  def('jumping', 'Alcance de salto', 'Físicos', ['Jumping Reach']),
  def('fitness', 'Recuperación física', 'Físicos', ['Natural Fitness']),
  def('tackling', 'Entradas', 'Técnicos', ['Tackling']),
  def('marking', 'Marcaje', 'Técnicos', ['Marking']),
  def('finishing', 'Remate', 'Técnicos', ['Finishing']),
  def('technique', 'Técnica', 'Técnicos', ['Technique']),
  def('passing', 'Pases', 'Técnicos', ['Passing']),
  def('heading', 'Cabeceo', 'Técnicos', ['Heading']),
  def('dribbling', 'Regate', 'Técnicos', ['Dribbling']),
  def('firstTouch', 'Primer toque', 'Técnicos', ['First Touch', 'Control']),
  def('crossing', 'Centros', 'Técnicos', ['Crossing']),
  def('longShots', 'Tiros lejanos', 'Técnicos', ['Long Shots']),
  def('corners', 'Córners', 'Técnicos', ['Corners', 'Saques de esquina']),
  def('freeKicks', 'Lanzamiento de faltas', 'Técnicos', ['Free Kick Taking', 'Free Kicks', 'Faltas']),
  def('penalties', 'Penaltis', 'Técnicos', ['Penalty Taking', 'Penalties']),
  def('longThrows', 'Saques largos', 'Técnicos', ['Long Throws']),
  def('anticipation', 'Anticipación', 'Mentales', ['Anticipation']),
  def('decisions', 'Decisiones', 'Mentales', ['Decisions']),
  def('positioning', 'Colocación', 'Mentales', ['Positioning']),
  def('offTheBall', 'Desmarques', 'Mentales', ['Off the Ball']),
  def('composure', 'Serenidad', 'Mentales', ['Composure']),
  def('vision', 'Visión', 'Mentales', ['Vision']),
  def('workRate', 'Sacrificio', 'Mentales', ['Work Rate']),
  def('flair', 'Talento', 'Mentales', ['Flair']),
  def('leadership', 'Liderazgo', 'Mentales', ['Leadership']),
  def('teamwork', 'Trabajo de equipo', 'Mentales', ['Teamwork', 'Team Work']),
  def('concentration', 'Concentración', 'Mentales', ['Concentration']),
  def('determination', 'Determinación', 'Mentales', ['Determination']),
  def('aggression', 'Agresividad', 'Mentales', ['Aggression']),
  def('bravery', 'Valentía', 'Mentales', ['Bravery']),
  def('reflexes', 'Reflejos', 'Portería', ['Reflexes']),
  def('handling', 'Blocaje', 'Portería', ['Handling']),
  def('oneOnOnes', 'Uno contra uno', 'Portería', ['One on Ones', 'One on One']),
  def('aerialReach', 'Alcance aéreo', 'Portería', ['Aerial Reach', 'Aerial Ability']),
  def('command', 'Mando en el área', 'Portería', ['Command of Area']),
  def('communication', 'Comunicación', 'Portería', ['Communication']),
  def('kicking', 'Saques de puerta', 'Portería', ['Kicking']),
  def('throwing', 'Saques con la mano', 'Portería', ['Throwing']),
  def('rushingOut', 'Salidas', 'Portería', ['Rushing Out', 'Rushing Out (Tendency)', 'Tendencia a salir']),
  def('punching', 'Puños', 'Portería', ['Punching', 'Punching (Tendency)', 'Tendencia a despejar de puños']),
  def('eccentricity', 'Excentricidad', 'Portería', ['Eccentricity']),
  def('professionalism', 'Profesionalidad', 'Personalidad y ocultos', ['Professionalism']),
  def('ambition', 'Ambición', 'Personalidad y ocultos', ['Ambition']),
  def('consistency', 'Consistencia', 'Personalidad y ocultos', ['Consistency']),
  def('importantMatches', 'Partidos importantes', 'Personalidad y ocultos', ['Important Matches']),
  def('versatility', 'Polivalencia', 'Personalidad y ocultos', ['Versatility']),
  def('pressure', 'Presión', 'Personalidad y ocultos', ['Pressure']),
  def('injuryProneness', 'Propensión a lesiones', 'Personalidad y ocultos', ['Injury Proneness'], true),
];
export const FM_FIELDS = {
  uniqueId: ['Unique ID', 'UID', 'ID único', 'UUID'],
  name: ['Jugador', 'Nombre', 'Player', 'Name'], age: ['Edad', 'Age'],
  ca: ['CA', 'Current Ability', 'Calidad actual'], pa: ['PA', 'CP', 'Potential Ability', 'Calidad potencial'],
  nationality: ['País', 'Nacionalidad', 'Nation', 'Nationality'],
  bestPosition: ['Mejor pos.', 'Best Position'], trainingPosition: ['Posición/rol', 'Position/Role'],
  positions: ['Posición', 'Position'], appearances: ['Disputados', 'Appearances', 'Apps'],
  rating: ['Calificación', 'Average Rating', 'Av Rat'], foot: ['Pierna buena', 'Preferred Foot'],
  wage: ['Sueldo', 'Wage'], contract: ['Final', 'Contract Expiry'], value: ['Valor de traspaso', 'Transfer Value'],
  minutes: ['Minutos', 'Minutos jugados', 'Minutes', 'Minutes Played'],
} as const;

export function findColumn(headers: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const index = headers.findIndex(header => normalizeHeader(header) === normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}
export function readFMValue(data: FMPlayerData | undefined, aliases: readonly string[]): string {
  if (!data) return '';
  const headers = Object.keys(data.values);
  const index = findColumn(headers, aliases);
  return index >= 0 ? data.values[headers[index]] : '';
}
export function attributeNumber(raw: string): number | null {
  return /^\d+$/.test(raw.trim()) && Number(raw) >= 1 && Number(raw) <= 20 ? Number(raw) : null;
}
export const isMissingFMValue = (raw: string) => ['', '-', '—', 'n/a'].includes(raw.trim().toLowerCase());
export function attributeWarnings(values: Record<string, string>): string[] {
  const headers = Object.keys(values);
  return FM_ATTRIBUTES.flatMap(attribute => {
    const index = findColumn(headers, attribute.aliases);
    if (index < 0) return [];
    const raw = values[headers[index]];
    return !isMissingFMValue(raw) && attributeNumber(raw) === null ? [`${attribute.label}: «${raw}» no es un entero de 1 a 20; se conserva como texto y queda sin valor analítico.`] : [];
  });
}

function canonicalColumn(header: string): string {
  const normalized = normalizeHeader(header);
  const attribute = FM_ATTRIBUTES.find(a => a.aliases.some(alias => normalizeHeader(alias) === normalized));
  if (attribute) return `attribute:${attribute.key}`;
  const field = Object.entries(FM_FIELDS).find(([, aliases]) => aliases.some(alias => normalizeHeader(alias) === normalized));
  return field ? `field:${field[0]}` : `raw:${normalized}`;
}
export function mergeFMValues(previous: Record<string, string>, incoming: Record<string, string>): Record<string, string> {
  const replaced = new Set(Object.keys(incoming).map(canonicalColumn));
  return Object.fromEntries([...Object.entries(previous).filter(([header]) => !replaced.has(canonicalColumn(header))), ...Object.entries(incoming)]);
}

export function validFMData(value: unknown): value is FMPlayerData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fm = value as FMPlayerData;
  if (typeof fm.saveId !== 'string' || !fm.saveId.trim() || fm.saveId.length > 80 || typeof fm.sourceFile !== 'string' || fm.sourceFile.length > 255 || typeof fm.importedAt !== 'string' || !Number.isFinite(Date.parse(fm.importedAt))) return false;
  if (fm.uniqueId !== undefined && (typeof fm.uniqueId !== 'string' || !validFMId(fm.uniqueId))) return false;
  if (!fm.values || typeof fm.values !== 'object' || Array.isArray(fm.values)) return false;
  const entries = Object.entries(fm.values);
  return entries.length <= 300 && entries.every(([key, text]) => key.length > 0 && key.length <= 150 && typeof text === 'string' && text.length <= 4000);
}
