import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BarChart3, Check, ChevronRight, CircleHelp, ClipboardList, Database, Eye, Flag, HardDrive, Landmark, Leaf, Pencil, Plus, Search, Shield, Trash2, Upload, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import PlayerForm from './components/PlayerForm';
import FMImportPanel from './components/FMImportPanel';
import PlayerDetails from './components/PlayerDetails';
import AnalysisPanel from './components/AnalysisWorkspace';
import TrackingPanel from './components/TrackingPanel';
import { SortHeader } from './components/SortHeader';
import { compareBy, nextSort } from './domain/sorting';
import type { SortDir, SortState } from './domain/sorting';
import { POSITIONS } from './domain/model';
import type { DynastyState, Evaluation, Group, MinutePlan, Player, PlayerDraft, SnapshotContext, SquadConstructionPlan } from './domain/model';
import { evaluateSquad, GROUP_LABELS } from './domain/players';
import { nextStageId, referenceCA, STAGES } from './domain/stages';
import { normalizeSaveId } from './domain/fm-data';
import { emptyState, loadState, parseState, saveState } from './services/storage';
import { useFileSync } from './services/useFileSync';
import type { SyncStatus } from './services/useFileSync';
import { summarizeSquad } from './modules/analysis';
import { exportBackup, exportCSV } from './modules/import-export';
import { deleteSnapshot, importWithTracking, updateSnapshotContext, upsertMinutePlan } from './modules/analysis/tracking';
import type { ImportRow } from './modules/import-export/fm-csv';
import { upsertSquadPlan } from './modules/analysis/construction';

type Page = 'squad' | 'stages' | 'analysis' | 'tracking' | 'economy' | 'data';
const navigation: { id: Page; label: string; icon: LucideIcon; soon?: boolean }[] = [
  { id: 'squad', label: 'Mi plantilla', icon: Users },
  { id: 'stages', label: 'Plan maestro', icon: Flag },
  { id: 'analysis', label: 'Análisis deportivo', icon: BarChart3 },
  { id: 'tracking', label: 'Seguimiento', icon: ClipboardList },
  { id: 'economy', label: 'Economía', icon: Landmark, soon: true },
  { id: 'data', label: 'Centro de datos', icon: Database },
];
const pageTitles: Record<Page, string> = { squad: 'Una plantilla. Una dinastía.', stages: 'El camino hacia la élite.', analysis: 'Más allá de la calidad actual.', tracking: 'El desarrollo necesita seguimiento.', economy: 'Crecer con una base sólida.', data: 'Tu partida, bajo tu control.' };

type SquadSortKey = 'name' | 'age' | 'position' | 'ca' | 'pa' | 'level' | 'group';
// Sentido del primer clic: edad de menor a mayor (los jóvenes primero) y estadísticas de mayor a menor.
const SQUAD_FIRST_DIR: Record<SquadSortKey, SortDir> = { name: 'asc', age: 'asc', position: 'asc', ca: 'desc', pa: 'desc', level: 'desc', group: 'asc' };
const GROUP_ORDER: Record<Group, number> = { competitive: 0, development: 1, review: 2 };
const squadValue = (e: Evaluation, key: string): number | string => {
  switch (key) {
    case 'age': return e.player.age;
    case 'position': return e.player.position;
    case 'ca': return e.player.ca;
    case 'pa': return e.player.pa;
    case 'level': return e.player.ca / e.targetCA;
    case 'group': return GROUP_ORDER[e.group];
    default: return e.player.name;
  }
};
const syncLabels:Record<SyncStatus, string> = { unsupported: 'Solo este navegador', unlinked: 'Sin archivo vinculado', 'needs-access': 'Reconecta tu archivo', synced: 'Guardado en archivo', saving: 'Guardando…', conflict: 'Conflicto con el archivo', error: 'Error con el archivo' };
const STORAGE_FAILED = 'No se pudo guardar en este navegador. Tus cambios están en memoria; descarga una copia JSON antes de cerrar.';

export default function App() {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<DynastyState>(emptyState);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let cancelled = false;
    void loadState().then(loaded => {
      if (cancelled) return;
      setState(loaded.state); setStorageBlocked(Boolean(loaded.error)); setStorageError(loaded.error); setReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  const fileSync = useFileSync({ state, ready, onLoad: loaded => { setState(loaded); saveState(loaded).catch(() => setStorageError(STORAGE_FAILED)); } });
  const [page, setPage] = useState<Page>('squad');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<'all' | Group>('all');
  const [position, setPosition] = useState('all');
  const [form, setForm] = useState<{ player: Player | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [squadSort, setSquadSort] = useState<SortState<SquadSortKey> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Player | null>(null);
  const [pendingImport, setPendingImport] = useState<DynastyState | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stage = STAGES[state.stageId];
  const next = STAGES[nextStageId(state.stageId)];
  const evaluations = useMemo(() => evaluateSquad(state.players, state.stageId), [state]);
  const summary = summarizeSquad(evaluations);
  const lastContext = state.tracking.snapshots.filter(s => normalizeSaveId(s.saveId) === normalizeSaveId(state.fmSaveId ?? '')).at(-1);
  const filtered = evaluations.filter(e => (group === 'all' || e.group === group) && (position === 'all' || e.player.position === position) && e.player.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const rows = squadSort ? [...filtered].sort(compareBy(squadSort, squadValue, e => e.player.name)) : filtered;

  function commit(updated: DynastyState, message: string, allowReset = false) {
    if (storageBlocked && !allowReset) { setNotice('Resuelve el aviso del guardado antes de modificar la partida.'); return false; }
    setState(updated);
    saveState(updated).then(() => { setStorageError(null); setStorageBlocked(false); }).catch(() => setStorageError(STORAGE_FAILED));
    setNotice(message);
    return true;
  }
  function savePlayer(draft: PlayerDraft) {
    const existing = form?.player;
    const player = { ...existing, ...draft, id: existing?.id ?? crypto.randomUUID() };
    if (commit({ ...state, players: existing ? state.players.map(p => p.id === existing.id ? player : p) : [...state.players, player] }, existing ? 'Futbolista actualizado.' : 'Futbolista añadido.')) setForm(null);
  }
  function importPlayers(rows: ImportRow[], saveId: string, context?: SnapshotContext) {
    try {
      const result = importWithTracking(state, rows, saveId, context);
      return commit(result.state, `Importación FM26: ${result.added} nuevos, ${result.updated} actualizados y ${result.linked} vinculados.${context ? ` Corte histórico registrado: ${context.gameDate}.` : ''}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo aplicar la importación.');
      return false;
    }
  }
  function saveMinutePlan(plan: MinutePlan) {
    try {
      const player = state.players.find(p => p.id === plan.playerId);
      if (!player?.fm || normalizeSaveId(player.fm.saveId) !== normalizeSaveId(plan.saveId)) throw new Error('El jugador o su partida ya no están disponibles.');
      return commit({ ...state, tracking: upsertMinutePlan(state.tracking, plan) }, 'Objetivo de minutos guardado.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar el plan.'); return false; }
  }
  function editSnapshot(id: string, context: SnapshotContext) {
    try { return commit({ ...state, tracking: updateSnapshotContext(state.tracking, id, context) }, 'Corte corregido.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo corregir el corte.'); return false; }
  }
  function removeSnapshot(id: string) {
    try { return commit({ ...state, tracking: deleteSnapshot(state.tracking, id) }, 'Corte eliminado. Los jugadores importados se conservan.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo eliminar el corte.'); return false; }
  }
  function saveSquadPlan(plan: SquadConstructionPlan) {
    try { return commit({ ...state, squadPlans: upsertSquadPlan(state.squadPlans, plan, state.players) }, 'Plan de plantilla guardado.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo guardar el plan de plantilla.'); return false; }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    if (file.size > 50_000_000) { setNotice('La copia supera el límite de 50 MB.'); return; }
    try { setPendingImport(parseState(await file.text())); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo leer la copia.'); }
  }
  function loadDemo() {
    const demo: Player[] = [
      { id: crypto.randomUUID(), name: 'Oliver Bennett', age: 27, position: 'POR', ca: 70, pa: 78, notes: 'Jugador ficticio de ejemplo.' },
      { id: crypto.randomUUID(), name: 'James Carter', age: 23, position: 'DFC', ca: 60, pa: 90, notes: 'Jugador ficticio de ejemplo.' },
      { id: crypto.randomUUID(), name: 'Theo Williams', age: 19, position: 'LAT', ca: 63, pa: 100, notes: 'Jugador ficticio de ejemplo.' },
      { id: crypto.randomUUID(), name: 'Harry Clarke', age: 18, position: 'MC/MCD', ca: 58, pa: 110, notes: 'Jugador ficticio de ejemplo.' },
      { id: crypto.randomUUID(), name: 'Alfie Morgan', age: 24, position: 'MP/EXT', ca: 61, pa: 95, notes: 'Jugador ficticio de ejemplo.' },
      { id: crypto.randomUUID(), name: 'George Taylor', age: 31, position: 'DC', ca: 72, pa: 76, notes: 'Jugador ficticio de ejemplo.' },
    ];
    commit({ ...state, players: demo }, 'Seis jugadores ficticios cargados. Puedes editarlos o eliminarlos.');
  }

  if (!ready) return <div className="app-shell" role="status" aria-live="polite"><main><p className="muted">Cargando tu partida…</p></main></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" aria-label="Chippenham Dynasty Manager · Mi plantilla" href="#" onClick={e => { e.preventDefault(); setPage('squad'); }}><span className="crest"><Shield size={31} /><b>C</b></span><span>CHIPPENHAM<small>DYNASTY MANAGER</small></span></a>
      <div className="sidebar-caption">DIRECCIÓN DEPORTIVA</div>
      <nav aria-label="Navegación principal">{navigation.map(item => <button key={item.id} aria-label={item.label} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)} aria-current={page === item.id ? 'page' : undefined}><item.icon size={19} /><span>{item.label}</span>{item.soon && <span className="soon-dot" title="Módulo en preparación" />}{page === item.id && <ChevronRight size={15} />}</button>)}</nav>
      <div className="dynasty-card"><span className="eyebrow">EL PROYECTO</span><h3>De sexta a Europa.</h3><p>Construye el equipo que crece con el club.</p><div className="journey-dots">{STAGES.map(s => <span key={s.id} className={s.id <= stage.id ? 'reached' : ''} />)}</div><small>ETAPA {stage.id + 1} DE 9</small></div>
      <div className="sidebar-footer"><span className="avatar">CT</span><div>Chippenham Town<small>Plan maestro · FM26</small></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div>Mi club <ChevronRight size={14} /><strong>{navigation.find(n => n.id === page)?.label}</strong></div><span className="local-indicator" title={fileSync.fileName || undefined}><span /> {syncLabels[fileSync.status]}</span></header>
      <main>
        <div className="page-heading"><div><p className="eyebrow">CHIPPENHAM TOWN · PLAN MAESTRO</p><h1>{pageTitles[page]}</h1><p className="muted">{page === 'squad' ? 'Compite hoy. Desarrolla el equipo de mañana.' : 'Cada decisión cuenta en el proyecto a largo plazo.'}</p></div>{page === 'squad' && <button className="button primary" onClick={() => setForm({ player: null })}><Plus size={18} /> Nuevo jugador</button>}</div>
        {storageError && <div className="alert" role="alert">{storageError}{storageBlocked && <button className="button secondary" onClick={() => commit(emptyState(), 'Nueva partida iniciada.', true)}>Empezar de nuevo</button>}</div>}
        {fileSync.status === 'needs-access' && <div className="alert" role="alert">Tu archivo <b>{fileSync.fileName}</b> necesita tu permiso para seguir guardando. {fileSync.message}<button className="button secondary" onClick={() => void fileSync.reconnect()}>Reconectar archivo</button></div>}
        {fileSync.status === 'conflict' && <div className="alert" role="alert">{fileSync.message}<button className="button secondary" onClick={() => void fileSync.resolve('file')}>Usar el archivo</button><button className="button secondary" onClick={() => void fileSync.resolve('local')}>Mantener este navegador</button></div>}
        {fileSync.status === 'error' && <div className="alert" role="alert">{fileSync.message}</div>}
        <div className="notification" role="status" aria-live="polite">{notice && <><Check size={16} />{notice}<button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={16} /></button></>}</div>
        {(page === 'squad' || page === 'stages') && <section className="stage-banner" aria-label="Etapa deportiva actual"><div className="stage-number">{String(stage.id + 1).padStart(2, '0')}</div><div className="stage-description"><span className="eyebrow">ETAPA DEPORTIVA ACTUAL</span><h2>{stage.name}</h2><p>{stage.competition}</p></div><div className="stage-target"><span>PRÓXIMO OBJETIVO</span><strong>{stage.id === 8 ? 'Consolidar la dinastía' : next.name} <ArrowRight size={16} /></strong></div><label className="stage-select">Cambiar etapa<select aria-label="Etapa deportiva" value={state.stageId} onChange={e => commit({ ...state, stageId: Number(e.target.value) }, 'Etapa actualizada. Plantilla reevaluada.')}>{STAGES.map(s => <option key={s.id} value={s.id}>{s.id + 1}. {s.name}</option>)}</select></label></section>}
        {page === 'squad' && <>
          <div className="stats-grid">
            <StatCard title="Núcleo competitivo" count={summary.competitive} total={20} icon={Shield} detail="CA de la etapa actual · sin límite de edad" />
            <StatCard title="Grupo de desarrollo" count={summary.development} total={10} icon={Leaf} detail="Hasta 23 años · PA de la siguiente etapa" green />
            <StatCard title="Por evaluar" count={summary.review} icon={ClipboardList} detail={`${state.players.length} registrados · ${summary.competitive + summary.development} en el primer equipo`} />
          </div>
          <section className="panel reference-panel"><div className="section-heading"><div><h2>El nivel que buscamos</h2><p>Referencias por posición para esta etapa</p></div><button className="text-button" onClick={() => setPage('stages')}>Ver las 9 etapas <ArrowRight size={15} /></button></div><div className="reference-grid">{POSITIONS.map(p => <div key={p}><span>{p}</span><strong>{referenceCA(stage.id, p)}<small>CA</small></strong><p>Rotación <b>{referenceCA(stage.id, p, 'depth')}</b> · PA objetivo <b>{referenceCA(next.id, p)}</b></p></div>)}</div></section>
          <section className="panel squad-panel"><div className="section-heading"><div><h2>Plantilla y desarrollo <span className="count-badge">{state.players.length}</span></h2><p>La base de tu próxima gran temporada.</p></div><button className="button secondary compact" onClick={() => exportCSV(state)}><ArrowDownToLine size={15} /> Exportar CSV</button></div>
            <div className="table-toolbar"><div className="tabs" aria-label="Filtrar por grupo">{(['all', 'competitive', 'development', 'review'] as const).map(g => <button key={g} className={group === g ? 'selected' : ''} onClick={() => setGroup(g)} aria-pressed={group === g}>{g === 'all' ? 'Todos' : GROUP_LABELS[g]}</button>)}</div><div className="filters"><label className="search-field"><Search size={16} /><input aria-label="Buscar jugador" placeholder="Buscar jugador…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filtrar por posición" value={position} onChange={e => setPosition(e.target.value)}><option value="all">Todas las posiciones</option>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></div></div>
            <div className="table-scroll"><table><thead><tr>{([['name', 'JUGADOR'], ['age', 'EDAD'], ['position', 'POSICIÓN'], ['ca', 'CA'], ['pa', 'PA'], ['level', 'NIVEL ACTUAL'], ['group', 'GRUPO PROPUESTO']] as const).map(([key, label]) => <SortHeader key={key} label={label} sortKey={key} sort={squadSort} onSort={k => setSquadSort(nextSort(squadSort, k, SQUAD_FIRST_DIR[k]))} />)}<th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map(e => <tr key={e.player.id}><td><div className="player-name"><span className="player-avatar">{e.player.name.split(/\s+/).slice(0, 2).map(s => s[0]).join('')}</span><div><strong>{e.player.name}</strong>{e.player.notes && <small title={e.player.notes}>{e.player.notes}</small>}</div></div></td><td>{e.player.age}</td><td><span className="position-chip">{e.player.position}</span></td><td><b>{e.player.ca}</b></td><td>{e.player.pa}</td><td><div className="level"><span>{Math.round(e.player.ca / e.targetCA * 100)}%</span><div><i style={{ width: `${Math.min(100, e.player.ca / e.targetCA * 100)}%` }} /></div></div></td><td><span className={`group-badge ${e.group}`}>{GROUP_LABELS[e.group]}</span><small className="evaluation-reason">{e.reason}</small></td><td><div className="row-actions"><button className="icon-button" aria-label={`Ver ficha FM de ${e.player.name}`} onClick={() => setDetailId(e.player.id)}><Eye size={15} /></button><button className="icon-button" aria-label={`Editar a ${e.player.name}`} onClick={() => setForm({ player: e.player })}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`Eliminar a ${e.player.name}`} onClick={() => setPendingDelete(e.player)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
            {!filtered.length && <div className="empty-state"><span className="empty-icon"><Users size={28} /></span><h3>{state.players.length ? 'No hay coincidencias' : 'Aquí empieza tu dinastía'}</h3><p>{state.players.length ? 'Prueba con otro nombre, grupo o posición.' : 'Añade tu primer futbolista y descubre su lugar en el proyecto.'}</p><div>{state.players.length ? <button className="button secondary" onClick={() => { setSearch(''); setGroup('all'); setPosition('all'); }}>Limpiar filtros</button> : <><button className="button primary" onClick={() => setForm({ player: null })}><Plus size={16} /> Añadir primer jugador</button><button className="text-button" onClick={loadDemo}>Probar con datos ficticios <ArrowRight size={15} /></button></>}</div></div>}
            <div className="table-footer"><span>{filtered.length} de {state.players.length} futbolistas</span><span>Primer equipo: {summary.competitive + summary.development} / 30 plazas</span></div>
          </section>
          <div className="model-note"><CircleHelp size={17} /><p>Una guía para decidir. La propuesta usa CA, PA y edad; el rendimiento y los atributos por rol siguen en tus manos. Cumplir 24 años no implica una salida automática.</p></div>
        </>}
        {page === 'stages' && <section className="panel"><div className="section-heading"><div><h2>Nueve etapas, una visión</h2><p>CA mínimo orientativo en escala de 1 a 200. Selecciona una etapa para aplicarla.</p></div><Flag size={22} /></div><div className="table-scroll"><table className="stages-table"><thead><tr><th>ETAPA DEPORTIVA</th>{POSITIONS.map(p => <th key={p}>{p}</th>)}<th>PLANIFICACIÓN</th></tr></thead><tbody>{STAGES.map(s => <tr key={s.id} className={s.id === stage.id ? 'current-stage' : ''}><td><b className="stage-index">{String(s.id + 1).padStart(2, '0')}</b><strong>{s.name}</strong></td>{POSITIONS.map(p => <td key={p}>{referenceCA(s.id, p)}</td>)}<td><button className="text-button" disabled={s.id === stage.id} onClick={() => commit({ ...state, stageId: s.id }, 'Etapa aplicada a la plantilla.')}>{s.id === stage.id ? <><Check size={15} /> Actual</> : <>Usar etapa <ArrowRight size={15} /></>}</button></td></tr>)}</tbody></table></div><div className="rules-grid"><div><h3>20 para competir</h3><p>CA igual o superior a la referencia de su posición. Sin límite de edad. Se prioriza el margen de CA sobre el umbral y después el PA.</p></div><div><h3>10 para crecer</h3><p>CA inferior al umbral, edad de hasta 23 años inclusive y PA de la siguiente etapa. Se prioriza el margen de PA, CA y menor edad.</p></div><div><h3>Revisar con criterio</h3><p>Quien no cumpla el perfil o no tenga plaza queda en revisión. En Champions se conserva el PA objetivo de la etapa 9; no existe una décima etapa.</p></div></div><p className="footnote">Referencias propias del plan maestro, no datos oficiales de FM26. LAT tiene un ajuste de −2. Los empates finales se resuelven por identificador estable. Las plazas excedentes no pasan automáticamente a otro grupo.</p></section>}
        {page === 'analysis' && <AnalysisPanel state={state} onDetails={player => setDetailId(player.id)} onSavePlan={saveSquadPlan} />}
        {page === 'tracking' && <TrackingPanel state={state} onSavePlan={saveMinutePlan} onEditSnapshot={editSnapshot} onDeleteSnapshot={removeSnapshot} onImport={() => setPage('data')} onDetails={player => setDetailId(player.id)} />}
        {page === 'economy' && <section className="panel roadmap-panel"><span className="module-tag">SIGUIENTE CAPÍTULO</span><Landmark size={48} /><h2>La sostenibilidad de la dinastía</h2><p>Los sueldos, contratos y valores importados ya se conservan en cada ficha FM. El módulo de presupuestos e infraestructura está pendiente; los importes todavía se muestran como texto original.</p><div className="roadmap-grid">{['Contratos y salarios', 'Balance de temporada', 'Cantera e instalaciones'].map((label, i) => <div key={label}><span>0{i + 1}</span><h3>{label}</h3><small>Planificado</small></div>)}</div><button className="button secondary" onClick={() => setPage('squad')}>Volver a la plantilla <ArrowRight size={16} /></button></section>}
        {page === 'data' && <><section className="panel"><div className="section-heading"><div><h2>Archivo vinculado</h2><p>Tu partida se guarda en un archivo JSON que puedes abrir desde otro navegador.</p></div><HardDrive size={24} /></div>
          <div className="data-grid">{!fileSync.supported
            ? <div><HardDrive size={25} /><h3>No disponible en este navegador</h3><p>Guardar en un archivo automáticamente requiere Chrome, Edge u Opera. Mientras tanto, usa las copias JSON de abajo.</p></div>
            : fileSync.fileName
              ? <><div><HardDrive size={25} /><h3>{fileSync.fileName}</h3><p>{syncLabels[fileSync.status]}. Cada cambio se guarda aquí tras una breve pausa. Si lo pones en una carpeta sincronizada (OneDrive, Google Drive), lo tendrás en todos tus equipos.</p><button className="button secondary" onClick={() => void fileSync.create()}>Guardar en otro archivo</button></div>
                <div><Upload size={25} /><h3>Abrir otra partida</h3><p>Sustituye los datos de este navegador por los de otro archivo.</p><button className="button secondary" onClick={() => { if (!state.players.length || window.confirm('Los datos actuales de este navegador se sustituirán por los del archivo. ¿Continuar?')) void fileSync.open(); }}>Abrir archivo</button><button className="text-button" onClick={() => void fileSync.unlink()}>Desvincular</button></div></>
              : <><div><HardDrive size={25} /><h3>Crear un archivo nuevo</h3><p>Elige dónde guardar tu partida. Lo ideal es una carpeta sincronizada (OneDrive, Google Drive) para abrirla desde cualquier navegador.</p><button className="button primary" onClick={() => void fileSync.create()}>Crear archivo</button></div>
                <div><Upload size={25} /><h3>Abrir un archivo existente</h3><p>Ya tienes una partida guardada en otro navegador o equipo. Sustituirá los datos de este navegador.</p><button className="button secondary" onClick={() => { if (!state.players.length || window.confirm('Los datos actuales de este navegador se sustituirán por los del archivo. ¿Continuar?')) void fileSync.open(); }}>Abrir archivo</button></div></>}</div></section>
        <section className="panel"><div className="section-heading"><div><h2>Copias de seguridad</h2><p>Guardado automático en este navegador (IndexedDB) y, si lo vinculas, también en tu archivo.</p></div><Database size={24} /></div><div className="data-grid"><div><ArrowDownToLine size={25} /><h3>Copia de seguridad</h3><p>Descarga jugadores, notas, etapa, histórico y planes de minutos en JSON. Puedes restaurarlos en otro navegador.</p><button className="button primary" onClick={() => exportBackup(state)}>Descargar copia JSON</button></div><div><Upload size={25} /><h3>Restaurar partida</h3><p>Importa una copia JSON de esta aplicación. Verás un resumen antes de sustituir los datos actuales.</p><button className="button secondary" onClick={() => fileInput.current?.click()}>Elegir copia JSON</button><input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" aria-label="Copia JSON" onChange={e => { void readBackup(e.target.files?.[0]); e.target.value = ''; }} /></div><div><ClipboardList size={25} /><h3>Trabajar con tu plantilla</h3><p>Exporta la evaluación actual a CSV para consultarla en una hoja de cálculo.</p><button className="button secondary" onClick={() => exportCSV(state)}>Exportar CSV</button></div></div></section><FMImportPanel players={state.players} stageId={state.stageId} initialSaveId={state.fmSaveId} initialContext={lastContext} onImport={importPlayers} /></>}
        <footer className="main-footer"><span>CHIPPENHAM DYNASTY MANAGER <b>v0.1</b></span><span>{storageError ? 'Guardado local requiere atención' : fileSync.status === 'synced' ? 'Guardado en tu archivo vinculado' : 'Tus datos permanecen en este navegador'}</span></footer>
      </main>
    </div>
    {detailId && state.players.find(p => p.id === detailId) && <PlayerDetails player={state.players.find(p => p.id === detailId)!} players={state.players} onClose={() => setDetailId(null)} />}
    {form && <PlayerForm player={form.player} onSave={savePlayer} onClose={() => setForm(null)} />}
    {pendingDelete && <Confirm title="Eliminar futbolista" description={`Se eliminará a ${pendingDelete.name} de tu registro. Esta acción no afecta a Football Manager.`} action="Eliminar jugador" danger onClose={() => setPendingDelete(null)} onConfirm={() => { if (commit({ ...state, players: state.players.filter(p => p.id !== pendingDelete.id) }, 'Futbolista eliminado.')) setPendingDelete(null); }} />}
    {pendingImport && <Confirm title="Restaurar esta copia" description={`La copia contiene ${pendingImport.players.length} futbolistas, ${pendingImport.tracking.snapshots.length} cortes y ${pendingImport.tracking.minutePlans.length} planes de minutos; etapa ${STAGES[pendingImport.stageId].name}. Sustituirá la partida actual de ${state.players.length} futbolistas. Descarga antes una copia si quieres conservarla.`} action="Restaurar partida" onClose={() => setPendingImport(null)} onConfirm={() => { commit(pendingImport, 'Copia restaurada correctamente.', true); setPendingImport(null); }} />}
  </div>;
}

function StatCard({ title, count, total, icon: Icon, detail, green }: { title: string; count: number; total?: number; icon: LucideIcon; detail: string; green?: boolean }) {
  return <section className={`stat-card ${green ? 'green-card' : ''}`}><div><span>{title}</span><Icon size={19} /></div><strong>{String(count).padStart(2, '0')}{total && <small> / {total}</small>}</strong>{total && <div className="stat-track"><i style={{ width: `${count / total * 100}%` }} /></div>}<p>{detail}</p></section>;
}

function Confirm({ title, description, action, onClose, onConfirm, danger }: { title: string; description: string; action: string; onClose: () => void; onConfirm: () => void; danger?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Callback ref opens the modal only after insertion, including under StrictMode.
  return <dialog ref={element => { ref.current = element; if (element && !element.open) element.showModal(); }} onCancel={onClose} aria-labelledby="confirm-title"><h2 id="confirm-title">{title}</h2><p className="confirm-description">{description}</p><div className="dialog-actions"><button className="button secondary" autoFocus onClick={onClose}>Cancelar</button><button className={`button ${danger ? 'destructive' : 'primary'}`} onClick={onConfirm}>{action}</button></div></dialog>;
}
