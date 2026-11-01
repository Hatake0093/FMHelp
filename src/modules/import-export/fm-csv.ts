import type { Player, PlayerDraft, Position } from '../../domain/model.ts';
import { POSITIONS } from '../../domain/model.ts';
import { validatePlayer } from '../../domain/players.ts';
import { attributeWarnings, findColumn, FM_FIELDS, fmIdentity, mergeFMValues, normalizeHeader, normalizeSaveId, validFMData, validFMId } from '../../domain/fm-data.ts';

export const IMPORT_FIELDS = ['name', 'age', 'position', 'ca', 'pa'] as const;
export type ImportField = typeof IMPORT_FIELDS[number];
export type ColumnMapping = Record<ImportField, number> & { fmId?: number };
export interface ImportContext { saveId?: string; sourceFile?: string; importedAt?: string; linkByName?: boolean }
export interface CSVTable {
  headers: string[];
  rows: string[][];
  delimiter: string;
}
export interface ImportRow {
  number: number;
  draft: PlayerDraft;
  originalPosition: string;
  error: string | null;
  duplicate: boolean;
  action: 'add' | 'update' | 'link' | 'skip';
  targetId?: string;
  warnings: string[];
}

export const playerNameKey = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

// CSV con comillas, delimitadores dentro de campos y saltos de línea citados.
function parseDelimited(source: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closedQuote = false;
  const endCell = () => { row.push(cell.trim()); cell = ''; closedQuote = false; };
  const endRow = () => { endCell(); if (row.some(value => value !== '')) records.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closedQuote = true; }
      else cell += c;
    } else if (c === delimiter) endCell();
    else if (c === '\n' || c === '\r') {
      endRow();
      if (c === '\r' && source[i + 1] === '\n') i++;
    } else if (c === '"') {
      if (cell.trim() || closedQuote) throw new Error('Hay comillas fuera de lugar en el CSV.');
      cell = ''; quoted = true;
    } else {
      if (closedQuote && c.trim()) throw new Error('Hay texto inesperado después de unas comillas de cierre.');
      if (!closedQuote) cell += c;
    }
  }
  if (quoted) throw new Error('El CSV tiene un campo con comillas sin cerrar.');
  endRow();
  return records;
}

export function readCSV(source: string): CSVTable {
  const text = source.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('El archivo está vacío.');
  const header = text.split(/\r?\n/).find(line => line.trim()) ?? '';
  const candidates = [';', ',', '\t'].map(delimiter => {
    let quoted = false, width = 1;
    for (let i = 0; i < header.length; i++) {
      if (header[i] === '"') {
        if (quoted && header[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && header[i] === delimiter) width++;
    }
    return { delimiter, width };
  });
  const delimiter = candidates.sort((a, b) => b.width - a.width)[0].delimiter;
  const [headers, ...rows] = parseDelimited(text, delimiter);
  if (!headers || headers.length < 2) throw new Error('No se reconoce una tabla CSV separada por punto y coma, coma o tabulador.');
  if (headers.some(h => !h) || new Set(headers.map(normalizeHeader)).size !== headers.length) throw new Error('Los encabezados deben tener nombres distintos y no estar vacíos.');
  if (headers.length > 300 || headers.some(h => h.length > 150)) throw new Error('El CSV admite hasta 300 columnas con encabezados de hasta 150 caracteres.');
  if (!rows.length) throw new Error('El CSV contiene encabezados, pero no tiene jugadores.');
  if (rows.length > 10_000) throw new Error('Importa como máximo 10.000 jugadores por archivo.');
  return { headers, rows, delimiter };
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const find = (aliases: string[]) => {
    for (const alias of aliases) {
      const index = headers.findIndex(h => normalizeHeader(h) === normalizeHeader(alias));
      if (index !== -1) return index;
    }
    return -1;
  };
  return {
    name: find(['Jugador', 'Nombre', 'Player', 'Name']),
    age: find(['Edad', 'Age']),
    position: find(['Mejor pos.', 'Best Position', 'Posición', 'Position']),
    ca: find(['CA', 'Current Ability', 'Calidad actual']),
    pa: find(['PA', 'CP', 'Potential Ability', 'Calidad potencial']),
    fmId: findColumn(headers, FM_FIELDS.uniqueId),
  };
}

export function mapFMPosition(raw: string): Position | null {
  const pos = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (POSITIONS.includes(pos as Position)) return pos as Position;
  if (/^(POR|GK)$/.test(pos)) return 'POR';
  if (/^(DF|D) \(C\)$/.test(pos)) return 'DFC';
  if (/^(DF|D) \((D|I|R|L|DI|RL|LR)\)$/.test(pos) || /^(CR|WB) \([DIRL]+\)$/.test(pos)) return 'LAT';
  if (/^(MC|MCD|DM|CD)$/.test(pos) || /^(ME|MC|M|DM) \(C\)$/.test(pos)) return 'MC/MCD';
  if (/^(MP|AM) \([CDIRL]+\)$/.test(pos) || /^(ME|M) \((D|I|R|L|DI|RL|LR)\)$/.test(pos)) return 'MP/EXT';
  if (/^(DL|ST|FC)( \(C\))?$/.test(pos)) return 'DC';
  // Las posiciones múltiples o no reconocidas requieren elección explícita.
  return null;
}

export function previewImport(table: CSVTable, mapping: ColumnMapping, existing: Player[], overrides: Record<number, Position> = {}, context: ImportContext = {}): ImportRow[] {
  if (IMPORT_FIELDS.some(field => !Number.isInteger(mapping[field]) || mapping[field] < 0 || mapping[field] >= table.headers.length)) return [];
  const hasId = mapping.fmId !== undefined && mapping.fmId >= 0;
  const selectedColumns = [...IMPORT_FIELDS.map(field => mapping[field]), ...(hasId ? [mapping.fmId!] : [])];
  if (hasId && (!Number.isInteger(mapping.fmId) || mapping.fmId! >= table.headers.length)) return [];
  if (new Set(selectedColumns).size !== selectedColumns.length) return [];
  const saveId = context.saveId?.trim() ?? 'Chippenham';
  if (!saveId || saveId.length > 80) return [];
  const names = new Map<string, number>();
  const ids = new Map<string, number>();
  table.rows.forEach(row => {
    const key = playerNameKey(row[mapping.name] ?? '');
    names.set(key, (names.get(key) ?? 0) + 1);
    if (hasId) { const id = row[mapping.fmId!] ?? ''; ids.set(id, (ids.get(id) ?? 0) + 1); }
  });
  const existingNames = new Set(existing.map(p => playerNameKey(p.name)));
  const nationality = table.headers.findIndex(h => ['pais', 'nation', 'nacionalidad', 'nationality'].includes(normalizeHeader(h)));
  const integer = (value: string) => /^\d+$/.test(value) ? Number(value) : NaN;
  return table.rows.map((row, index) => {
    const read = (field: ImportField) => row[mapping[field]] ?? '';
    const originalPosition = read('position');
    const position = overrides[index] ?? mapFMPosition(originalPosition);
    const draft: PlayerDraft = {
      name: read('name'), age: integer(read('age')), ca: integer(read('ca')), pa: integer(read('pa')),
      position: position ?? 'POR', // El error impide guardar hasta elegir una posición.
      notes: `FM26 · Posición original: ${originalPosition}${nationality >= 0 && row[nationality] ? ` · País: ${row[nationality]}` : ''}`.slice(0, 1000),
    };
    const values = Object.fromEntries(table.headers.map((header, i) => [header, row[i] ?? '']));
    const uniqueId = hasId ? row[mapping.fmId!] ?? '' : undefined;
    draft.fm = { ...(uniqueId ? { uniqueId } : {}), saveId, sourceFile: context.sourceFile ?? 'CSV de FM26', importedAt: context.importedAt ?? new Date().toISOString(), values };
    const duplicate = !hasId && existingNames.has(playerNameKey(draft.name));
    let action: ImportRow['action'] = duplicate ? 'skip' : 'add';
    let targetId: string | undefined;
    let error: string | null = row.length !== table.headers.length ? 'El número de celdas no coincide con los encabezados.' : null;
    if (!error && Object.values(values).some(value => value.length > 4000)) error = 'Una celda supera el límite de 4.000 caracteres.';
    if (!error && !position) error = 'Elige el grupo de posición para este jugador.';
    if (!error) error = validatePlayer(draft);
    if (!error && hasId && !validFMId(uniqueId ?? '')) error = 'El ID de FM debe ser un entero positivo escrito sin decimales ni notación científica.';
    if (!error && hasId && (ids.get(uniqueId!) ?? 0) > 1) error = 'ID de FM repetido en el CSV; se omiten todas sus filas.';
    if (!error && !hasId && (names.get(playerNameKey(draft.name)) ?? 0) > 1) error = 'Nombre repetido en el CSV; resuelve la coincidencia antes de importarlo.';
    if (!error && hasId) {
      const matches = existing.filter(p => p.fm?.uniqueId && fmIdentity(p.fm.saveId, p.fm.uniqueId) === fmIdentity(saveId, uniqueId!));
      if (matches.length > 1) error = 'El guardado contiene más de una ficha con este ID de FM.';
      else if (matches.length === 1) { action = 'update'; targetId = matches[0].id; }
      else {
        const legacy = existing.filter(p => !p.fm?.uniqueId && (!p.fm || normalizeSaveId(p.fm.saveId) === normalizeSaveId(saveId)) && playerNameKey(p.name) === playerNameKey(draft.name));
        if (legacy.length) {
          if (legacy.length !== 1 || (names.get(playerNameKey(draft.name)) ?? 0) !== 1) error = 'Coincidencia de nombre ambigua con fichas sin ID; vincula o corrige esas fichas antes de importar.';
          else if (!context.linkByName) error = 'Coincide con una ficha sin ID. Activa la vinculación por nombre si es el mismo jugador.';
          else { action = 'link'; targetId = legacy[0].id; }
        }
      }
    }
    return { number: index + 2, draft, originalPosition, error, duplicate, action, targetId, warnings: attributeWarnings(values) };
  });
}

export function importableRows(rows: ImportRow[]): ImportRow[] {
  return rows.filter(row => !row.error && !row.duplicate);
}

// Una sola operación preserva fichas ausentes, IDs locales y notas del usuario.
export function applyFMImport(existing: Player[], rows: ImportRow[], makeId: () => string = () => crypto.randomUUID()) {
  const accepted = importableRows(rows);
  const players = [...existing];
  let added = 0, updated = 0, linked = 0;
  const targets = new Set<string>();
  for (const row of accepted) {
    if (validatePlayer(row.draft) || !validFMData(row.draft.fm)) throw new Error('La importación contiene datos inválidos. Vuelve a cargar el archivo.');
    if (row.action === 'update' || row.action === 'link') {
      const index = players.findIndex(p => p.id === row.targetId);
      if (index < 0 || targets.has(row.targetId!)) throw new Error('Una ficha cambió durante la revisión. Vuelve a cargar el CSV.');
      targets.add(row.targetId!);
      const current = players[index];
      const incoming = row.draft.fm!;
      if (current.fm?.uniqueId && (!incoming.uniqueId || fmIdentity(current.fm.saveId, current.fm.uniqueId) !== fmIdentity(incoming.saveId, incoming.uniqueId))) throw new Error('Los IDs de FM no coinciden con la ficha a actualizar.');
      players[index] = { ...row.draft, id: current.id, notes: current.notes, fm: { ...incoming, values: mergeFMValues(current.fm?.values ?? {}, incoming.values) } };
      if (row.action === 'link') linked++; else updated++;
    } else if (row.action === 'add') {
      players.push({ ...row.draft, id: makeId() }); added++;
    }
  }
  const identities = players.filter(p => p.fm?.uniqueId).map(p => fmIdentity(p.fm!.saveId, p.fm!.uniqueId!));
  if (new Set(identities).size !== identities.length || new Set(players.map(p => p.id)).size !== players.length) throw new Error('La importación produciría identificadores repetidos.');
  return { players, added, updated, linked };
}
