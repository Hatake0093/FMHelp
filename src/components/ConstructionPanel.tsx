import { useState } from 'react';
import { ArrowRight, GitCompareArrows, Layers3, ShieldAlert, UserRoundSearch } from 'lucide-react';
import type { DynastyState, Player, SquadConstructionPlan, SquadSlot } from '../domain/model';
import { normalizeSaveId } from '../domain/fm-data';
import { inFirstTeam } from '../domain/squads';
import { attributeLabel, evaluateRole, ROLE_PROFILES } from '../modules/analysis/roles';
import { analyzePair, analyzeSlot, belongsToSave, DEFAULT_CONSTRUCTION_CRITERIA, FORMATIONS, formationSlots, PAIR_PROFILES, roleById, validateSquadPlan } from '../modules/analysis/construction';
import type { ConstructionCriteria } from '../modules/analysis/construction';

const score = (value: number | null | undefined) => value == null ? 'Pendiente' : `${value.toFixed(1)} / 100`;
const dateLabel = (date: string) => date.split('-').reverse().join('/');
const dependencyNames: Record<string, string> = { unassigned: 'Falta titular', noBackup: 'Sin reserva registrada', pending: 'Datos pendientes', high: 'Dependencia alta', medium: 'Dependencia media', low: 'Brecha baja' };
const successionNames: Record<string, string> = { unassigned: 'Falta titular', review: 'Revisar cobertura', pending: 'Datos pendientes', plan: 'Planificar relevo', covered: 'Con opciones de relevo' };
const prospectNames: Record<string, string> = { none: 'Sin candidato joven', occupied: 'Ya ocupa otro puesto titular', criteria: 'Fuera de los criterios de búsqueda', pending: 'Faltan datos para valorar su encaje', close: 'Cercano al perfil actual', development: 'Necesita desarrollo' };
type SlotResult = ReturnType<typeof analyzeSlot>;

export default function ConstructionPanel({ state, onSavePlan, onDetails }: { state: DynastyState; onSavePlan: (plan: SquadConstructionPlan) => boolean; onDetails: (player: Player) => void }) {
  const [saveId, setSaveId] = useState(state.fmSaveId ?? '');
  const saves = [...new Map([...state.players.flatMap(p => p.fm ? [p.fm.saveId] : []), ...state.squadPlans.map(p => p.saveId)].map(s => [normalizeSaveId(s), s])).values()];
  const selected = saves.find(s => normalizeSaveId(s) === normalizeSaveId(saveId)) ?? saves[0] ?? '';
  const players = state.players.filter(p => inFirstTeam(p) && belongsToSave(p, selected));
  const saved = state.squadPlans.find(p => normalizeSaveId(p.saveId) === normalizeSaveId(selected));
  const latest = state.tracking.snapshots.filter(s => normalizeSaveId(s.saveId) === normalizeSaveId(selected)).sort((a, b) => b.gameDate.localeCompare(a.gameDate))[0];
  return <>
    <section className="construction-banner"><div><span className="module-tag">FASE 2 · CONSTRUCCIÓN DE PLANTILLA</span><h2>Un equipo que se sostiene.</h2><p>Combina perfiles, detecta dependencias y prepara los siguientes relevos.</p></div><Layers3 size={34} /></section>
    {saves.length ? <><label className="tracking-save">Partida para construir<select value={selected} onChange={e => setSaveId(e.target.value)}>{saves.map(s => <option key={normalizeSaveId(s)} value={s}>{s}</option>)}</select></label><ConstructionWorkspace key={normalizeSaveId(selected)} saveId={selected} players={players} saved={saved} initialDate={latest?.gameDate ?? ''} onSavePlan={onSavePlan} onDetails={onDetails} /></> : <section className="panel"><div className="empty-state"><span className="empty-icon"><Layers3 size={26} /></span><h3>Vincula tu plantilla a una partida.</h3><p>Importa tu CSV desde Centro de datos para explorar parejas y definir titulares y recambios.</p></div></section>}
  </>;
}

function ConstructionWorkspace({ saveId, players, saved, initialDate, onSavePlan, onDetails }: { saveId: string; players: Player[]; saved?: SquadConstructionPlan; initialDate: string; onSavePlan: (plan: SquadConstructionPlan) => boolean; onDetails: (player: Player) => void }) {
  const [view, setView] = useState('plan');
  const [draft, setDraft] = useState<SquadConstructionPlan>(() => saved ? structuredClone(saved) : { id: crypto.randomUUID(), saveId, name: 'Plan principal', gameDate: initialDate, slots: [] });
  const [criteria, setCriteria] = useState(DEFAULT_CONSTRUCTION_CRITERIA);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const results = draft.slots.map(slot => analyzeSlot(draft, slot, players, criteria));
  function save() {
    const issue = validateSquadPlan(draft); if (issue) { setError(issue); setView('plan'); return; }
    if (onSavePlan(draft)) { setError(''); setDraft(current => ({ ...current, name: current.name.trim(), slots: current.slots.map(s => ({ ...s, name: s.name.trim() })) })); }
    else setError('No se pudo guardar. Revisa las asignaciones y el aviso de la página.');
  }
  return <>
    <div className="construction-toolbar"><div className="tabs construction-tabs" aria-label="Área de construcción">{[{ id: 'plan', label: 'Mi plan', icon: Layers3 }, { id: 'pairs', label: 'Parejas', icon: GitCompareArrows }, { id: 'dependency', label: 'Dependencia', icon: ShieldAlert }, { id: 'succession', label: 'Sucesión', icon: UserRoundSearch }].map(item => <button key={item.id} className={view === item.id ? 'selected' : ''} aria-pressed={view === item.id} onClick={() => setView(item.id)}><item.icon size={14} />{item.label}</button>)}</div><span className={`construction-save-state ${dirty ? 'draft' : ''}`}>{dirty ? 'Borrador sin guardar' : 'Plan guardado'}</span></div>
    {error && <p className="alert" role="alert">{error}</p>}
    {view === 'plan' && <PlanEditor draft={draft} players={players} onChange={next => { setDraft(next); setError(''); }} onSave={save} onRestore={() => { setDraft(saved ? structuredClone(saved) : { ...draft, name: 'Plan principal', gameDate: initialDate, slots: [] }); setError(''); }} dirty={dirty} />}
    {view === 'pairs' && <Pairs players={players} onDetails={onDetails} />}
    {(view === 'dependency' || view === 'succession') && <>
      <div className="construction-context"><b>{draft.name}</b><span>Referencia de contratos: {draft.gameDate ? dateLabel(draft.gameDate) : 'indica la fecha de la partida en Mi plan'}</span>{dirty && <span>Resultados del borrador actual.</span>}<button className="text-button" onClick={() => setView('plan')}>Editar asignaciones <ArrowRight size={14} /></button></div>
      <Criteria value={criteria} onChange={setCriteria} />
      {!results.length ? <section className="panel"><div className="empty-state"><h3>Define tus puestos y titulares.</h3><p>Asigna el once que quieres analizar; los recambios se contrastarán con ese plan.</p><div><button className="button primary" onClick={() => setView('plan')}>Crear mi plan</button></div></div></section> : view === 'dependency' ? <Dependency results={results} onDetails={onDetails} /> : <Succession results={results} criteria={criteria} onDetails={onDetails} />}
    </>}
    <p className="tracking-footnote">Modelo propio de planificación. Los puestos, titulares y recambios los defines tú. El encaje por atributos no acredita dominio posicional, química entre jugadores ni desarrollo futuro. La ficha puede combinar valores de varias importaciones; revisa su actualidad y que el registro incluya toda la plantilla.</p>
  </>;
}

function PlanEditor({ draft, players, onChange, onSave, onRestore, dirty }: { draft: SquadConstructionPlan; players: Player[]; onChange: (plan: SquadConstructionPlan) => void; onSave: () => void; onRestore: () => void; dirty: boolean }) {
  const [formation, setFormation] = useState<typeof FORMATIONS[number]>('4-4-2');
  const [otherPositions, setOtherPositions] = useState(false);
  function update(slot: SquadSlot, patch: Partial<SquadSlot>) { onChange({ ...draft, slots: draft.slots.map(s => s.id === slot.id ? { ...s, ...patch } : s) }); }
  function roleChange(slot: SquadSlot, roleId: string) {
    const role = roleById(roleId)!;
    const retain = (id: string) => players.some(p => p.id === id && (p.position === 'POR') === (role.position === 'POR')) ? id : '';
    update(slot, { roleId, starterId: retain(slot.starterId), backupId: retain(slot.backupId), prospectId: retain(slot.prospectId) });
  }
  return <section className="panel construction-plan"><div className="section-heading"><div><h2>Tu once y sus alternativas</h2><p>Define el papel de cada puesto, su titular, su recambio y un posible relevo joven.</p></div><Layers3 size={22} /></div><div className="tracking-body">
    <div className="tracking-form-grid"><label>Nombre del plan<input maxLength={80} value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })} /></label><label>Fecha de partida del plan<input type="date" value={draft.gameDate} onChange={e => onChange({ ...draft, gameDate: e.target.value })} /></label></div>
    {!draft.slots.length && <div className="formation-picker"><label>Esquema inicial<select value={formation} onChange={e => setFormation(e.target.value as typeof formation)}>{FORMATIONS.map(f => <option key={f}>{f}</option>)}</select></label><button className="button primary" onClick={() => onChange({ ...draft, slots: formationSlots(formation) })}>Crear los 11 puestos</button><p>Se crean puestos vacíos para que asignes tus jugadores.</p></div>}
    <label className="analysis-checkbox"><input type="checkbox" checked={otherPositions} onChange={e => setOtherPositions(e.target.checked)} />Incluir otros puestos de campo al asignar jugadores</label>
    <p className="tracking-help">Las listas muestran primero mayor CA para facilitar la búsqueda. Las asignaciones fijan la prioridad. Los lados, la pierna y la familiaridad deben revisarse en la partida; una asignación fuera del grupo actual requiere comprobar su reconversión.</p>
    <div className="construction-slot-list">{draft.slots.map((slot, index) => {
      const role = roleById(slot.roleId)!;
      const selection = (field: 'starterId' | 'backupId' | 'prospectId', label: string) => {
        const candidates = players.filter(p => (p.position === 'POR') === (role.position === 'POR') && (p.position === role.position || otherPositions || p.id === slot[field]) && (field === 'starterId' || p.id !== slot.starterId)).sort((a, b) => b.ca - a.ca || a.name.localeCompare(b.name, 'es'));
        return <label>{label}<select aria-label={`${label} · puesto ${index + 1}`} value={slot[field]} onChange={e => { const id = e.target.value; update(slot, { [field]: id, ...(field === 'starterId' ? { backupId: slot.backupId === id ? '' : slot.backupId, prospectId: slot.prospectId === id ? '' : slot.prospectId } : {}) }); }}><option value="">Sin asignar</option>{slot[field] && !candidates.some(p => p.id === slot[field]) && <option value={slot[field]}>Asignación no disponible · revisar</option>}{candidates.map(p => { const occupied = draft.slots.some(s => s.id !== slot.id && s.starterId === p.id); return <option key={p.id} value={p.id} disabled={field === 'starterId' && occupied}>{p.name} · CA {p.ca} / PA {p.pa}{p.position !== role.position ? ` · ${p.position}: verificar reconversión` : ''}{occupied ? ' · titular en otro puesto' : ''}</option>; })}</select></label>;
      };
      return <article className="construction-slot" key={slot.id}><div className="construction-slot-header"><span className="slot-number">{String(index + 1).padStart(2, '0')}</span><label>Nombre del puesto<input aria-label={`Nombre del puesto ${index + 1}`} value={slot.name} maxLength={80} onChange={e => update(slot, { name: e.target.value })} /></label><label>Perfil requerido<select aria-label={`Perfil requerido · puesto ${index + 1}`} value={slot.roleId} onChange={e => roleChange(slot, e.target.value)}>{ROLE_PROFILES.map(r => <option key={r.id} value={r.id}>{r.position} · {r.name}</option>)}</select></label><button className="text-button" aria-label={`Quitar puesto ${index + 1}`} onClick={() => onChange({ ...draft, slots: draft.slots.filter(s => s.id !== slot.id) })}>Quitar</button></div><div className="tracking-form-grid slot-assignments">{selection('starterId', 'Titular')}{selection('backupId', 'Recambio previsto')}{selection('prospectId', 'Relevo joven previsto')}</div><label className="slot-notes">Notas del puesto<input aria-label={`Notas del puesto ${index + 1}`} maxLength={1000} value={slot.notes} onChange={e => update(slot, { notes: e.target.value })} placeholder="Ej. Revisar pierna, disponibilidad o familiaridad." /></label></article>;
    })}</div>
    <div className="construction-plan-actions"><button className="button secondary" disabled={draft.slots.length >= 20} onClick={() => onChange({ ...draft, slots: [...draft.slots, { id: crypto.randomUUID(), name: `Puesto ${draft.slots.length + 1}`, roleId: 'centreBack', starterId: '', backupId: '', prospectId: '', notes: '' }] })}>Añadir un puesto</button><div><button className="button secondary" disabled={!dirty} onClick={onRestore}>Descartar cambios</button><button className="button primary" onClick={onSave}>Guardar plan de plantilla</button></div></div>
  </div></section>;
}

function Pairs({ players, onDetails }: { players: Player[]; onDetails: (player: Player) => void }) {
  const [profileId, setProfileId] = useState(() => PAIR_PROFILES.find(p => players.filter(player => player.position === p.position).length >= 2)?.id ?? PAIR_PROFILES[0].id);
  const profile = PAIR_PROFILES.find(p => p.id === profileId)!;
  return <section className="panel"><div className="section-heading"><div><h2>Parejas y complementariedad</h2><p>Observa qué recursos aporta cada jugador y dónde comparten una carencia.</p></div><GitCompareArrows size={22} /></div><div className="tracking-body"><label className="analysis-select">Unidad a analizar<select value={profileId} onChange={e => setProfileId(e.target.value)}>{PAIR_PROFILES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><PairWorkbench key={profileId} profile={profile} players={players.filter(p => p.position === profile.position)} onDetails={onDetails} /></div></section>;
}

function PairWorkbench({ profile, players, onDetails }: { profile: typeof PAIR_PROFILES[number]; players: Player[]; onDetails: (player: Player) => void }) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const [aId, setAId] = useState(sorted[0]?.id ?? ''), [bId, setBId] = useState(sorted[1]?.id ?? '');
  const [threshold, setThreshold] = useState(12);
  const [roleA, setRoleA] = useState(profile.roles[0]), [roleB, setRoleB] = useState(profile.roles[1]);
  const a = players.find(p => p.id === aId), b = players.find(p => p.id === bId && p.id !== aId);
  const result = a && b ? analyzePair(a, b, profile.id, threshold) : null;
  const roles = ROLE_PROFILES.filter(r => r.position === profile.position);
  if (players.length < 2) return <div className="empty-state"><h3>Falta otro jugador del puesto.</h3><p>Necesitas al menos dos jugadores registrados como {profile.position} de la misma partida.</p></div>;
  return <><div className="pair-player-controls">{([{ label: 'Jugador A', player: a, id: aId, role: roleA, setRole: setRoleA, setPlayer: (id: string) => { setAId(id); if (id === bId) setBId(sorted.find(p => p.id !== id)?.id ?? ''); } }, { label: 'Jugador B', player: b, id: bId, role: roleB, setRole: setRoleB, setPlayer: setBId }]).map((side, index) => <div className="pair-player-control" key={side.label}><label>{side.label}<select value={side.id} onChange={e => side.setPlayer(e.target.value)}>{sorted.filter(p => index === 0 || p.id !== aId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Rol de {side.label.toLowerCase()}<select value={side.role} onChange={e => side.setRole(e.target.value)}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{side.player && <div className="pair-role-result"><span>Encaje individual: <b>{score(evaluateRole(side.player, roleById(side.role)!).score)}</b></span><button className="text-button" onClick={() => onDetails(side.player!)}>Ver ficha</button></div>}</div>)}</div>
    <label className="pair-threshold">Referencia por dimensión · 1–20<input type="number" min={1} max={20} value={threshold} onChange={e => setThreshold(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label><p className="tracking-help">Cada dimensión usa la media de sus atributos comunes. La referencia es ajustable; no es un umbral oficial del juego ni una medida de química. Que un compañero aporte un recurso no elimina la debilidad individual del otro. Los roles elegidos arriba cambian el encaje individual; las dimensiones pertenecen a la unidad seleccionada.</p>
    {result && a && b && <><div className="pair-summary"><span><b>{result.resources}</b> dimensiones con recurso disponible</span><span><b>{result.sharedWeaknesses}</b> debilidades compartidas</span><span><b>{result.pending}</b> pendientes de datos</span></div><div className="pair-dimensions">{result.dimensions.map(d => <article className={`pair-dimension ${d.status}`} key={d.id}><div><h3>{d.name}</h3><span className="tracking-status">{d.status === 'pending' ? 'Datos pendientes' : d.status === 'sharedWeakness' ? 'Debilidad compartida' : d.status === 'both' ? 'Ambos alcanzan la referencia' : `Recurso principalmente de ${d.status === 'resourceA' ? 'A' : 'B'}`}</span></div><div className="pair-dimension-values"><span>{a.name}<b>{d.valueA === null ? '—' : d.valueA.toFixed(1)}<small> / 20</small></b></span><span>{b.name}<b>{d.valueB === null ? '—' : d.valueB.toFixed(1)}<small> / 20</small></b></span></div><p>Cobertura común: {Math.floor(d.coverage * 100)}% · {d.attributes.map(attributeLabel).join(', ')}.</p>{d.missing.length > 0 && <p>Pendientes: {d.missing.map(attributeLabel).join(', ')}.</p>}</article>)}</div><details className="analysis-disclosure"><summary>Contrastar los atributos de la pareja</summary><div className="table-scroll"><table><thead><tr><th>ATRIBUTO</th><th>{a.name}</th><th>{b.name}</th></tr></thead><tbody>{result.attributes.map(row => <tr key={row.key}><td>{row.label}</td><td>{row.valueA ?? '—'}</td><td>{row.valueB ?? '—'}</td></tr>)}</tbody></table></div></details></>}
  </>;
}

function Criteria({ value, onChange }: { value: ConstructionCriteria; onChange: (value: ConstructionCriteria) => void }) {
  const fields = [{ key: 'highGap', label: 'Brecha alta · puntos del índice', min: value.mediumGap + 1, max: 100 }, { key: 'mediumGap', label: 'Brecha media · puntos del índice', min: 1, max: value.highGap - 1 }, { key: 'resourceFloor', label: 'Recurso relevante desde · 1–20', min: 1, max: 20 }, { key: 'resourceGap', label: 'Caída de atributo a revisar', min: 1, max: 19 }, { key: 'prospectAge', label: 'Edad máxima del relevo joven', min: 14, max: 30 }, { key: 'ageReview', label: 'Revisar horizonte desde esta edad', min: 20, max: 60 }, { key: 'contractMonths', label: 'Horizonte de contrato · meses', min: 1, max: 36 }] as const;
  return <details className="analysis-disclosure construction-criteria"><summary>Criterios de esta consulta · ajustables</summary><div className="tracking-form-grid">{fields.map(field => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={1} value={value[field.key]} onChange={e => onChange({ ...value, [field.key]: Math.max(field.min, Math.min(field.max, Math.round(Number(e.target.value)) || field.min)) })} /></label>)}</div><p className="tracking-help">Los índices de dependencia y relevo usan una misma base de atributos entre el titular, las reservas evaluables y los recambios asignados. Se exige cobertura ≥80% y todas las claves. Las reservas sin datos suficientes quedan pendientes. Un joven se considera cercano si su brecha de encaje no supera la referencia media y su CA queda como máximo 10 puntos por debajo del titular. Los criterios se aplican a esta consulta; el plan guarda tus asignaciones.</p></details>;
}

function PlayerReference({ label, player, scoreValue, onDetails }: { label: string; player?: Player; scoreValue?: number | null; onDetails: (player: Player) => void }) {
  return <div className="construction-player-reference"><span>{label}</span>{player ? <><button className="text-button" onClick={() => onDetails(player)}>{player.name}</button><small>{player.position} · {player.age} años · CA {player.ca} / PA {player.pa}</small>{scoreValue !== undefined && <b>{score(scoreValue)}</b>}</> : <b>Sin identificar</b>}</div>;
}
function AssignmentWarnings({ result }: { result: SlotResult }) {
  return <>{result.unavailableAssignments.length > 0 && <p className="construction-warning">Hay asignaciones a jugadores que ya no están disponibles. Revisa Mi plan.</p>}{result.backupOtherSlot.length > 0 && <p className="construction-warning">El recambio previsto ya es titular en: {result.backupOtherSlot.join(', ')}. Moverlo deja otro puesto por cubrir.</p>}{result.sharedBackupSlots.length > 0 && <p className="construction-warning">Este recambio también está previsto para: {result.sharedBackupSlots.join(', ')}. No cubre esas bajas simultáneamente.</p>}{[result.starter, result.assignedBackup, result.assignedProspect].some(p => p && p.position !== result.role.position) && <p className="construction-warning">Hay una asignación fuera del grupo {result.role.position}; verifica familiaridad y reconversión.</p>}</>;
}
function BasisDetails({ result }: { result: SlotResult }) {
  return <details className="analysis-disclosure"><summary>Base del análisis · {Math.floor(result.basis.coverage * 100)}% de cobertura común</summary><p className="tracking-help">{result.basis.known.length} de {Object.keys(result.role.weights).length} atributos del rol en común. {result.reserves.length - result.rankedReserves.filter(p => p.score !== null).length} reservas sin índice comparable.</p>{result.basis.missing.length > 0 && <p className="tracking-help">Pendientes en el grupo de comparación: {result.basis.missing.map(attributeLabel).join(', ')}.</p>}<div className="table-scroll"><table><thead><tr><th>RESERVA REGISTRADA</th><th>CA / PA</th><th>ÍNDICE COMÚN</th></tr></thead><tbody>{result.rankedReserves.map(row => <tr key={row.player.id}><td>{row.player.name}</td><td>{row.player.ca} / {row.player.pa}</td><td>{score(row.score)}</td></tr>)}</tbody></table></div></details>;
}

function Dependency({ results, onDetails }: { results: SlotResult[]; onDetails: (player: Player) => void }) {
  return <><div className="construction-summary"><span><b>{results.filter(r => ['noBackup', 'high'].includes(r.status)).length}</b> puestos con cobertura a revisar</span><span><b>{results.filter(r => r.status === 'pending').length}</b> pendientes de datos</span><span><b>{results.filter(r => r.status === 'unassigned').length}</b> sin titular asignado</span></div><div className="construction-result-list">{results.map(result => <section className="panel construction-result" key={result.slot.id}><div className="section-heading"><div><h2>{result.slot.name}</h2><p>{result.role.name}</p></div><span className={`tracking-status ${result.status}`}>{dependencyNames[result.status]}</span></div><div className="tracking-body">
      <div className="construction-reference-grid"><PlayerReference label="Titular asignado" player={result.starter} scoreValue={result.starterScore} onDetails={onDetails} /><PlayerReference label="Mejor reserva evaluable" player={result.bestReserve?.player} scoreValue={result.bestReserve?.score ?? null} onDetails={onDetails} /><div className="construction-gap"><span>Brecha de encaje</span><strong>{result.gap === null ? '—' : `${result.gap > 0 ? '+' : ''}${result.gap.toFixed(1)}`}</strong><small>Puntos del titular sobre la reserva</small></div></div>
      <p className="tracking-help">{result.status === 'unassigned' ? 'Asigna un titular para medir la dependencia.' : result.status === 'noBackup' ? 'No hay otro jugador registrado disponible en este rol sin mover a un titular de otro puesto.' : result.status === 'pending' ? 'Todavía no hay una base común suficiente para medir la brecha.' : 'La reserva propuesta es una opción a revisar; no cambia tu recambio previsto ni decide la titularidad.'}</p>
      {result.assignedBackup && <p className="tracking-help">Recambio previsto por ti: <b>{result.assignedBackup.name}</b> · {score(result.basis.score(result.assignedBackup))}.</p>}
      <AssignmentWarnings result={result} />
      {result.losses.length > 0 && <div className="construction-resources"><h3>Recursos que caerían con la ausencia</h3>{result.losses.map(loss => <span key={loss.key}><b>{loss.label}</b> {loss.starter} → mejor reserva {loss.reserve} <small>(−{loss.gap})</small></span>)}<p>Se comparan todas las reservas registradas del rol y se omiten atributos con datos pendientes. Cada atributo puede tener una reserva distinta.</p></div>}
      {result.slot.notes && <p className="minute-plan-notes">{result.slot.notes}</p>}<BasisDetails result={result} />
    </div></section>)}</div></>;
}

function Succession({ results, criteria, onDetails }: { results: SlotResult[]; criteria: ConstructionCriteria; onDetails: (player: Player) => void }) {
  return <><p className="tracking-callout">Un relevo joven debe tener como máximo {criteria.prospectAge} años, ser menor que el titular y tener PA al menos igual al CA actual del titular. Su preparación se evalúa con atributos actuales y distancia de CA. El PA no se convierte en una previsión de atributos ni en un plazo de desarrollo.</p><div className="construction-result-list">{results.map(result => {
    const immediate = result.assignedBackup ?? result.bestReserve?.player;
    const prospect = result.assignedProspect ?? result.candidate?.player;
    return <section className="panel construction-result" key={result.slot.id}><div className="section-heading"><div><h2>{result.slot.name}</h2><p>{result.role.name}</p></div><span className={`tracking-status ${result.priority}`}>{successionNames[result.priority]}</span></div><div className="tracking-body"><div className="construction-reference-grid"><PlayerReference label="Titular actual" player={result.starter} scoreValue={result.starterScore} onDetails={onDetails} /><PlayerReference label={result.assignedBackup ? 'Recambio previsto por ti' : 'Reserva inmediata a revisar'} player={immediate} scoreValue={immediate ? result.basis.score(immediate) : null} onDetails={onDetails} /><PlayerReference label={result.assignedProspect ? 'Relevo previsto por ti' : 'Candidato joven a revisar'} player={prospect} scoreValue={result.candidate?.score ?? null} onDetails={onDetails} /></div>
      <div className="succession-facts"><span>Contrato del titular<b>{result.contract?.endDate ? dateLabel(result.contract.endDate) : 'Sin fecha interpretable'}</b><small>{result.contract?.status === 'soon' ? `Dentro de ${criteria.contractMonths} meses de la fecha de partida` : result.contract?.status === 'past' ? 'Fecha anterior a la referencia: revisar' : result.contract?.status === 'later' ? 'Fuera del horizonte de revisión' : 'Necesita fecha de partida y contrato válido'}</small></span><span>Preparación del candidato joven<b>{prospectNames[result.prospectStatus]}</b><small>{result.prospectGap === null ? 'Sin brecha de encaje comparable' : `Brecha actual frente al titular: ${result.prospectGap.toFixed(1)} puntos`}</small></span></div>
      <AssignmentWarnings result={result} />
      {result.reasons.length > 0 && <ul className="succession-reasons">{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      {result.starter && result.prospects.length > 0 && <details className="analysis-disclosure"><summary>Otros candidatos jóvenes registrados · {result.prospects.length}</summary><div className="table-scroll"><table><thead><tr><th>JUGADOR</th><th>EDAD</th><th>CA / PA</th><th>ENCAJE ACTUAL</th></tr></thead><tbody>{result.prospects.map(row => <tr key={row.player.id}><td>{row.player.name}</td><td>{row.player.age}</td><td>{row.player.ca} / {row.player.pa}</td><td>{score(row.score)}</td></tr>)}</tbody></table></div></details>}
      {!result.starter && <p className="tracking-help">Asigna el titular del puesto para construir su sucesión.</p>}<BasisDetails result={result} />
    </div></section>;
  })}</div></>;
}
