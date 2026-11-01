import { useMemo, useRef, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { POSITIONS } from '../domain/model';
import type { Player, Position, SnapshotContext } from '../domain/model';
import { evaluateSquad } from '../domain/players';
import { findColumn, FM_ATTRIBUTES, FM_FIELDS, readFMValue } from '../domain/fm-data';
import { summarizeSquad } from '../modules/analysis';
import { applyFMImport, IMPORT_FIELDS, importableRows, mapFMPosition, previewImport, readCSV, suggestMapping } from '../modules/import-export/fm-csv';
import type { ColumnMapping, CSVTable, ImportField, ImportRow } from '../modules/import-export/fm-csv';
import { STAGES } from '../domain/stages';
import { parseMinutes, validateSnapshotContext } from '../modules/analysis/tracking';

const labels: Record<ImportField | 'fmId', string> = { name: 'Nombre', age: 'Edad', position: 'Posición', ca: 'CA · Calidad actual', pa: 'PA · Calidad potencial', fmId: 'ID único de FM · opcional' };
const fields = [...IMPORT_FIELDS, 'fmId'] as const;
const actionLabels = { add: 'Añadir', update: 'Actualizar', link: 'Vincular y actualizar', skip: 'Omitir' };

export default function FMImportPanel({ players, stageId, initialSaveId, initialContext, onImport }: {
  players: Player[]; stageId: number; initialSaveId?: string; initialContext?: SnapshotContext; onImport: (rows: ImportRow[], saveId: string, context?: SnapshotContext) => boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const loadSequence = useRef(0);
  const [table, setTable] = useState<CSVTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [filename, setFilename] = useState('');
  const [importedAt, setImportedAt] = useState('');
  const [saveId, setSaveId] = useState(initialSaveId ?? players.find(p => p.fm)?.fm?.saveId ?? 'Chippenham');
  const [linkByName, setLinkByName] = useState(false);
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState<Record<number, Position>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [recordHistory, setRecordHistory] = useState(true);
  const [context, setContext] = useState<SnapshotContext>({ gameDate: '', season: initialContext?.season ?? '', competition: initialContext?.competition ?? 'Todas las competiciones', statsFrom: initialContext?.statsFrom ?? '', statsTo: '' });
  const contextError = recordHistory ? validateSnapshotContext(context) : null;
  function changeContext(field: keyof SnapshotContext, value: string) {
    setContext(current => ({ ...current, [field]: value, ...(field === 'gameDate' && (!current.statsTo || current.statsTo === current.gameDate) ? { statsTo: value } : {}) }));
    setConfirmed(false);
  }
  const rows = useMemo(() => table && mapping ? previewImport(table, mapping, players, overrides, { saveId, sourceFile: filename, importedAt, linkByName }) : [], [table, mapping, players, overrides, saveId, filename, importedAt, linkByName]);
  const accepted = importableRows(rows);
  const measuredMinutes = accepted.filter(row => parseMinutes(readFMValue(row.draft.fm, FM_FIELDS.minutes)) !== null).length;
  const invalid = rows.filter(r => r.error).length;
  const duplicates = rows.filter(r => !r.error && r.duplicate).length;
  const newCount = accepted.filter(r => r.action === 'add').length;
  const updateCount = accepted.filter(r => r.action === 'update').length;
  const linkCount = accepted.filter(r => r.action === 'link').length;
  const warningCount = rows.reduce((count, row) => count + row.warnings.length, 0);
  const hasId = mapping && (mapping.fmId ?? -1) >= 0;
  const selected = mapping ? [...IMPORT_FIELDS.map(field => mapping[field]), ...(hasId ? [mapping.fmId!] : [])] : [];
  const mapped = table && mapping && IMPORT_FIELDS.every(field => mapping[field] >= 0) && new Set(selected).size === selected.length && saveId.trim().length > 0 && saveId.length <= 80;
  const detectedAttributes = table ? FM_ATTRIBUTES.filter(attribute => findColumn(table.headers, attribute.aliases) >= 0) : [];
  const projectedPlayers = useMemo(() => { let index = 0; return applyFMImport(players, rows, () => `preview-new-${index++}`).players; }, [players, rows]);
  const summary = summarizeSquad(evaluateSquad(projectedPlayers, stageId));

  function reset() { setTable(null); setMapping(null); setConfirmed(false); setOverrides({}); setFilename(''); setLinkByName(false); }
  async function loadFile(file?: File) {
    if (!file) return;
    const sequence = ++loadSequence.current;
    setError(''); reset();
    try {
      if (file.size > 5_000_000) throw new Error('El CSV supera el límite de 5 MB.');
      const bytes = await file.arrayBuffer();
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('Guarda el archivo como CSV UTF-8 antes de importarlo para conservar correctamente los nombres.'); }
      const parsed = readCSV(text);
      if (sequence !== loadSequence.current) return;
      setTable(parsed); setMapping(suggestMapping(parsed.headers)); setFilename(file.name.slice(0, 255)); setImportedAt(new Date().toISOString());
    } catch (issue) { if (sequence === loadSequence.current) setError(issue instanceof Error ? issue.message : 'No se pudo leer el CSV.'); }
  }
  function apply() {
    if (!accepted.length || !confirmed || !mapped || contextError) return;
    if (onImport(rows, saveId.trim(), recordHistory ? context : undefined)) { reset(); setContext(current => ({ ...current, gameDate: '', statsTo: '' })); }
  }

  return <section className="panel import-panel" aria-labelledby="fm-import-title">
    <div className="section-heading"><div><span className="module-tag">FM26 · CSV + ID</span><h2 id="fm-import-title">Importación desde Football Manager</h2><p>Actualiza tu plantilla y conserva los atributos de cada exportación.</p></div><Upload size={24} /></div>
    <div className="import-body">
      <p className="import-description">Importa CSV UTF-8 con punto y coma, coma o tabulador. CA/PA usan 1–200; los atributos, 1–20. Las estrellas no se convierten en CA/PA.</p>
      <button className="button primary" onClick={() => input.current?.click()}><Upload size={16} />{table ? 'Elegir otro CSV' : 'Elegir CSV de FM26'}</button>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV de Football Manager" onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} />
      {error && <p className="alert" role="alert">{error}</p>}
      {table && mapping && <>
        <div className="import-file"><strong>{filename}</strong><span>{table.rows.length} filas · {table.headers.length} columnas · {detectedAttributes.length} atributos reconocidos</span></div>
        <label className="save-id-field">Partida de origen<input maxLength={80} value={saveId} onChange={event => { setSaveId(event.target.value); setConfirmed(false); }} /><small>Usa siempre el mismo nombre para esta partida. El jugador se identifica por partida + ID de FM.</small></label>
        <div className="history-import-settings"><label className="import-consent"><input type="checkbox" checked={recordHistory} onChange={event => { setRecordHistory(event.target.checked); setConfirmed(false); }} /><span>Registrar un corte en el histórico con los datos de este CSV.</span></label>
          {recordHistory && <><div className="tracking-form-grid"><label>Fecha de la partida<input type="date" value={context.gameDate} onChange={e => changeContext('gameDate', e.target.value)} /></label><label>Temporada<input maxLength={80} placeholder="Ej. 2026/27" value={context.season} onChange={e => changeContext('season', e.target.value)} /></label><label>Competición / alcance del CSV<input maxLength={80} value={context.competition} onChange={e => changeContext('competition', e.target.value)} /></label><label>Estadísticas acumuladas desde<input type="date" value={context.statsFrom} onChange={e => changeContext('statsFrom', e.target.value)} /></label><label>Estadísticas acumuladas hasta<input type="date" value={context.statsTo} onChange={e => changeContext('statsTo', e.target.value)} /></label></div>
          <p className="import-description">Usa fechas de tu partida. El alcance y periodo deben corresponder exactamente a los minutos y estadísticas del CSV. Se guardan solo las filas aceptadas y los atributos presentes en este archivo; las columnas antiguas siguen en la ficha, pero no se reutilizan como una medición nueva.</p><p className="import-description"><b>{measuredMinutes}/{accepted.length}</b> filas aceptadas tienen minutos válidos. {measuredMinutes < accepted.length && 'Añade la columna «Minutos» para medir los objetivos y completar las alertas; «Disputados» no se convierte en minutos.'}</p>{contextError && <p className="tracking-validation" role="status">{contextError}</p>}</>}
          {!recordHistory && <p className="import-description">Se actualizarán las fichas sin crear observaciones de evolución ni mediciones del plan de minutos.</p>}
        </div>
        <div className="column-mapping">{fields.map(field => <label key={field}>{labels[field]}<select value={mapping[field] ?? -1} onChange={event => { setMapping({ ...mapping, [field]: Number(event.target.value) }); setOverrides({}); setConfirmed(false); }}><option value={-1}>{field === 'fmId' ? 'Sin ID · añadir sin actualizar' : 'Elegir columna…'}</option>{table.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>)}</div>
        {!mapped && <p className="alert" role="alert">Selecciona columnas distintas para los cinco datos obligatorios y escribe la partida de origen.</p>}
        {hasId && <label className="import-consent"><input type="checkbox" checked={linkByName} onChange={event => { setLinkByName(event.target.checked); setConfirmed(false); }} /><span>Vincular fichas antiguas sin ID cuando el nombre coincida de forma única. Revisa las filas «Vincular y actualizar» antes de aplicar.</span></label>}
        {mapped && <>
          <div className="import-summary" role="status"><span><b>{newCount}</b> nuevos</span><span><b>{updateCount}</b> actualizaciones</span><span><b>{linkCount}</b> vinculaciones</span><span><b>{duplicates}</b> omitidos</span><span><b>{invalid}</b> por corregir</span></div>
          <p className="import-description">Con ID se actualiza la ficha del mismo jugador aunque cambie su nombre; dos jugadores con distinto ID pueden llamarse igual. Sin ID, los nombres ya registrados se omiten. No se eliminan jugadores ausentes del CSV.</p>
          <details className="import-columns"><summary>Datos adicionales que se conservarán</summary><p>Todas las columnas originales se guardan en la ficha FM y en la copia JSON: atributos, posiciones, partidos, calificación, pierna buena, salario, contrato y valor. Puedes añadir columnas en futuras exportaciones.</p><p>{detectedAttributes.map(a => a.label).join(' · ') || 'No se reconocen atributos numéricos en este archivo.'}</p></details>
          {warningCount > 0 && <p className="alert" role="status">{warningCount} valores de atributos requieren revisión. Se guardará el texto original; los valores inválidos no se utilizarán en la comparación.</p>}
          <div className="table-scroll import-preview"><table><thead><tr><th>JUGADOR / ID FM</th><th>EDAD</th><th>POSICIÓN FM → GRUPO</th><th>CA / PA</th><th>ACCIÓN PROPUESTA</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.number}><td><strong>{row.draft.name || '(Sin nombre)'}</strong><small className="evaluation-reason">{row.draft.fm?.uniqueId ? `ID ${row.draft.fm.uniqueId}` : `Fila ${row.number} · sin ID`}</small></td><td>{Number.isNaN(row.draft.age) ? '—' : row.draft.age}</td><td><label className="position-mapping"><span>{row.originalPosition || '(Sin posición)'}</span><select aria-label={`Grupo de posición de fila ${row.number}`} value={overrides[index] ?? mapFMPosition(row.originalPosition) ?? ''} onChange={event => { setOverrides({ ...overrides, [index]: event.target.value as Position }); setConfirmed(false); }}><option value="" disabled>Elegir grupo…</option>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></label></td><td>{Number.isNaN(row.draft.ca) ? '—' : row.draft.ca} / {Number.isNaN(row.draft.pa) ? '—' : row.draft.pa}</td><td><span className={`group-badge ${row.error ? 'review' : row.action === 'add' ? 'competitive' : 'development'}`}>{row.error ? 'Corregir' : actionLabels[row.action]}</span><small className="evaluation-reason">{row.error ?? (row.action === 'update' ? 'Se conserva el ID local y tus notas.' : row.action === 'link' ? 'Se añadirá el ID de FM a la ficha existente.' : row.duplicate ? 'Nombre ya registrado; se conserva su ficha.' : 'Datos válidos.')}</small>{row.warnings.length > 0 && <details className="row-warnings"><summary>{row.warnings.length} avisos</summary>{row.warnings.map(w => <p key={w}>{w}</p>)}</details>}</td></tr>)}</tbody></table></div>
          <p className="import-description import-projection">Resultado en <strong>{STAGES[stageId].name}</strong>: {projectedPlayers.length} registrados · {summary.competitive}/20 competitivos · {summary.development}/10 desarrollo · {summary.review} en revisión.</p>
          <label className="import-consent"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>He revisado la partida, las posiciones y las acciones propuestas. Confirmo que «{table.headers[mapping.ca]}» y «{table.headers[mapping.pa]}» contienen CA y PA numéricos.</span></label>
          <p className="import-description">Se actualizarán nombre, edad, grupo de posición, CA/PA y columnas incluidas. Se conservan tus notas, la etapa y las columnas anteriores que no aparezcan en este CSV. Un campo exportado vacío se guarda como dato no disponible.</p>
          <div className="import-actions"><button className="button secondary" onClick={reset}>Descartar vista previa</button><button className="button primary" disabled={!accepted.length || !confirmed || Boolean(contextError)} onClick={apply}><Check size={16} />Aplicar importación ({accepted.length})</button></div>
        </>}
      </>}
    </div>
  </section>;
}
