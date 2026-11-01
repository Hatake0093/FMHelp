import { useState } from 'react';
import { ArrowRight, Clock3, History, Sprout, Target, Users } from 'lucide-react';
import { MINUTE_ROLES } from '../domain/model';
import type { DynastyState, MinutePlan, Player, SnapshotContext, SquadSnapshot } from '../domain/model';
import { normalizeSaveId } from '../domain/fm-data';
import { SQUAD_LABELS } from '../domain/squads';
import { blockedTalent, compareObservations, DEFAULT_BLOCKED_CRITERIA, minuteProgress, validateMinutePlan, validateSnapshotContext } from '../modules/analysis/tracking';

const dateLabel = (date: string) => date.split('-').reverse().join('/');
const cutLabel = (cut: SquadSnapshot) => `${dateLabel(cut.gameDate)} · ${cut.season} · ${cut.competition}${cut.squad ? ` · ${SQUAD_LABELS[cut.squad]}` : ''}`;
const delta = (value: number) => `${value > 0 ? '+' : ''}${value}`;
const planStatus: Record<string, string> = { pending: 'Sin medición', achieved: 'Objetivo alcanzado', missed: 'Cerrado por debajo', starting: 'Inicio del plan', behind: 'Por debajo del ritmo', onTrack: 'En ritmo' };
const talentStatus: Record<string, string> = { blocked: 'Posible bloqueo', watch: 'Revisar minutos', pending: 'Datos pendientes', ok: 'Sin señal de bloqueo' };

interface Props { state: DynastyState; onSavePlan: (plan: MinutePlan) => boolean; onEditSnapshot: (id: string, context: SnapshotContext) => boolean; onDeleteSnapshot: (id: string) => boolean; onImport: () => void; onDetails: (player: Player) => void }
export default function TrackingPanel({ state, onSavePlan, onEditSnapshot, onDeleteSnapshot, onImport, onDetails }: Props) {
  const [view, setView] = useState('evolution');
  const [planPlayerId, setPlanPlayerId] = useState('');
  const [saveId, setSaveId] = useState(state.fmSaveId ?? '');
  const saves = [...new Map([...state.players.flatMap(p => p.fm ? [p.fm.saveId] : []), ...state.tracking.snapshots.map(s => s.saveId), ...state.tracking.minutePlans.map(p => p.saveId)].map(s => [normalizeSaveId(s), s])).values()];
  const selectedSave = saves.find(s => normalizeSaveId(s) === normalizeSaveId(saveId)) ?? saves[0] ?? '';
  const snapshots = state.tracking.snapshots.filter(s => normalizeSaveId(s.saveId) === normalizeSaveId(selectedSave)).sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.recordedAt.localeCompare(b.recordedAt));
  const players = state.players.filter(p => p.fm && normalizeSaveId(p.fm.saveId) === normalizeSaveId(selectedSave));
  const plans = state.tracking.minutePlans.filter(p => normalizeSaveId(p.saveId) === normalizeSaveId(selectedSave));
  return <>
    <section className="tracking-banner"><div><span className="module-tag">FASE 1 · SEGUIMIENTO Y DESARROLLO</span><h2>De los datos a las oportunidades.</h2><p>Observa la evolución, acuerda minutos y revisa a los jóvenes que esperan su oportunidad.</p></div><button className="button primary" onClick={onImport}>Registrar un corte <ArrowRight size={15} /></button></section>
    <div className="tracking-stats"><div><History size={18} /><span>Cortes de la partida<b>{snapshots.length}</b></span></div><div><Target size={18} /><span>Planes de minutos<b>{plans.length}</b></span></div><div><Users size={18} /><span>Jugadores vinculados<b>{players.length}</b></span></div></div>
    {saves.length > 0 && <label className="tracking-save">Partida de seguimiento<select value={selectedSave} onChange={e => setSaveId(e.target.value)}>{saves.map(s => <option key={normalizeSaveId(s)} value={s}>{s}</option>)}</select></label>}
    <div className="tracking-tabs tabs" aria-label="Área de seguimiento">{[{ id: 'evolution', label: 'Evolución', icon: History }, { id: 'minutes', label: 'Plan de minutos', icon: Clock3 }, { id: 'talent', label: 'Talento bloqueado', icon: Sprout }].map(item => <button key={item.id} className={view === item.id ? 'selected' : ''} aria-pressed={view === item.id} onClick={() => { setPlanPlayerId(''); setView(item.id); }}><item.icon size={14} />{item.label}</button>)}</div>
    <section className="panel tracking-panel" key={`${selectedSave}-${view}`}>
      {view === 'evolution' && <Evolution snapshots={snapshots} players={players} onImport={onImport} onDetails={onDetails} />}
      {view === 'minutes' && <Minutes players={players} snapshots={snapshots} plans={plans} onSavePlan={onSavePlan} initialPlayerId={planPlayerId} />}
      {view === 'talent' && <Talent snapshots={snapshots.filter(s => !s.squad)} players={players} plans={plans} onDetails={onDetails} onPlans={playerId => { setPlanPlayerId(playerId); setView('minutes'); }} onImport={onImport} />}
    </section>
    {snapshots.length > 0 && <ManageCuts snapshots={snapshots} onEdit={onEditSnapshot} onDelete={onDeleteSnapshot} />}
    <p className="tracking-footnote">Fechas de la partida, no del ordenador. Los cortes conservan únicamente los datos observados en cada CSV y permanecen en tu copia JSON. Las alertas son referencias de planificación; el PA no garantiza desarrollo.</p>
  </>;
}

function ManageCuts({ snapshots, onEdit, onDelete }: { snapshots: SquadSnapshot[]; onEdit: (id: string, context: SnapshotContext) => boolean; onDelete: (id: string) => boolean }) {
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<SnapshotContext>({ gameDate: '', season: '', competition: '', statsFrom: '', statsTo: '' });
  const error = editingId ? validateSnapshotContext(draft) : null;
  const start = (s: SquadSnapshot) => { setEditingId(s.id); setDraft({ gameDate: s.gameDate, season: s.season, competition: s.competition, statsFrom: s.statsFrom, statsTo: s.statsTo }); };
  const field = (key: 'gameDate' | 'statsFrom' | 'statsTo', label: string) => <label>{label}<input type="date" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>;
  return <details className="analysis-disclosure"><summary>Gestionar cortes · {snapshots.length}</summary>
    <p className="tracking-help">Corrige las fechas de un corte mal registrado (por ejemplo, día y mes invertidos) o elimínalo. Los jugadores importados no se borran.</p>
    <div className="table-scroll"><table><thead><tr><th>FECHA / TEMPORADA</th><th>ALCANCE Y PERIODO</th><th>JUGADORES</th><th /></tr></thead><tbody>{snapshots.map(s => editingId === s.id
      ? <tr key={s.id}><td colSpan={4}><div className="tracking-form-grid">{field('gameDate', 'Fecha de la partida')}{field('statsFrom', 'Periodo desde')}{field('statsTo', 'Periodo hasta')}</div>
        {error && <p className="tracking-help" role="alert">{error}</p>}
        <button className="button primary compact" disabled={Boolean(error)} onClick={() => { if (onEdit(s.id, draft)) setEditingId(''); }}>Guardar fechas</button> <button className="button secondary compact" onClick={() => setEditingId('')}>Cancelar</button></td></tr>
      : <tr key={s.id}><td>{dateLabel(s.gameDate)}<small className="evaluation-reason">{s.season}</small></td><td>{s.competition}{s.squad ? ` · ${SQUAD_LABELS[s.squad]}` : ''}<small className="evaluation-reason">{dateLabel(s.statsFrom)} → {dateLabel(s.statsTo)} · {s.sourceFile}</small></td><td>{s.players.length}</td>
        <td><button className="button secondary compact" onClick={() => start(s)}>Corregir fechas</button> <button className="button secondary compact" onClick={() => { if (window.confirm(`¿Eliminar el corte del ${dateLabel(s.gameDate)}? No se puede deshacer.`)) onDelete(s.id); }}>Eliminar</button></td></tr>)}</tbody></table></div>
  </details>;
}
function EmptyHistory({ onImport }: { onImport: () => void }) {
  return <div className="empty-state"><span className="empty-icon"><History size={26} /></span><h3>Empieza a construir su historia.</h3><p>Importa un CSV con fecha de la partida, temporada y periodo estadístico. El primer corte será tu punto de partida; con el segundo podrás comparar.</p><div><button className="button primary" onClick={onImport}>Ir a importar CSV <ArrowRight size={15} /></button></div></div>;
}
function Evolution({ snapshots, players, onImport, onDetails }: { snapshots: SquadSnapshot[]; players: Player[]; onImport: () => void; onDetails: (player: Player) => void }) {
  const [playerId, setPlayerId] = useState('');
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const names = new Map<string, string>();
  snapshots.forEach(s => s.players.forEach(p => names.set(p.playerId, p.name)));
  const entries = [...names].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const selectedId = names.has(playerId) ? playerId : entries[0]?.[0];
  const cuts = snapshots.filter(s => s.players.some(p => p.playerId === selectedId));
  const after = cuts.find(s => s.id === afterId) ?? cuts.at(-1);
  const earlier = cuts.filter(s => after && s.gameDate < after.gameDate);
  const before = earlier.find(s => s.id === beforeId) ?? earlier[0];
  const beforePlayer = before?.players.find(p => p.playerId === selectedId);
  const afterPlayer = after?.players.find(p => p.playerId === selectedId);
  const comparison = beforePlayer && afterPlayer ? compareObservations(beforePlayer, afterPlayer) : null;
  const current = players.find(p => p.id === selectedId);
  const comparableMinutes = Boolean(before && after && before.season === after.season && before.competition === after.competition && before.statsFrom === after.statsFrom && before.statsTo < after.statsTo && beforePlayer?.minutes !== null && afterPlayer?.minutes !== null);
  const addedMinutes = comparableMinutes ? afterPlayer!.minutes! - beforePlayer!.minutes! : null;
  return <>
    <div className="section-heading"><div><h2>Evolución del jugador</h2><p>Compara mediciones reales entre dos fechas de la misma partida.</p></div><History size={21} /></div>
    {!snapshots.length ? <EmptyHistory onImport={onImport} /> : <div className="tracking-body">
      <div className="tracking-player-picker"><label>Jugador del histórico<select value={selectedId ?? ''} onChange={e => { setPlayerId(e.target.value); setBeforeId(''); setAfterId(''); }}>{entries.map(([id, name]) => <option key={id} value={id}>{name}{players.some(p => p.id === id) ? '' : ' · archivado'}</option>)}</select></label>{current && <button className="button secondary compact" onClick={() => onDetails(current)}>Ver ficha</button>}</div>
      {afterPlayer && <div className="tracking-profile"><div><span className="eyebrow">ÚLTIMA OBSERVACIÓN SELECCIONADA</span><h3>{afterPlayer.name}</h3><p>{afterPlayer.position} · {afterPlayer.age} años · {after && dateLabel(after.gameDate)}</p></div><strong>{afterPlayer.ca}<small> CA / {afterPlayer.pa} PA</small></strong></div>}
      {cuts.length > 1 && <CAChart cuts={cuts} playerId={selectedId!} />}
      <div className="tracking-form-grid comparison-dates"><label>Desde<select value={before?.id ?? ''} onChange={e => setBeforeId(e.target.value)} disabled={!earlier.length}>{!earlier.length && <option value="">Necesitas una fecha anterior</option>}{earlier.map(s => <option key={s.id} value={s.id}>{cutLabel(s)}</option>)}</select></label><label>Hasta<select value={after?.id ?? ''} onChange={e => { setAfterId(e.target.value); setBeforeId(''); }}>{cuts.map(s => <option key={s.id} value={s.id}>{cutLabel(s)}</option>)}</select></label></div>
      {comparison && before && after ? <>
        <div className="evolution-metrics"><div><span>Cambio de CA</span><strong>{delta(comparison.ca)}</strong></div><div><span>Cambio de PA</span><strong>{delta(comparison.pa)}</strong></div><div><span>Minutos adicionales</span><strong>{addedMinutes !== null && addedMinutes >= 0 ? `+${addedMinutes}` : '—'}</strong></div></div>
        <p className="tracking-help">Atributos y CA se comparan por fecha. Los minutos adicionales requieren misma temporada, alcance e inicio del acumulado. {addedMinutes !== null && addedMinutes < 0 ? 'El acumulado ha disminuido: revisa un posible reinicio o cambio del alcance.' : !comparableMinutes ? 'Estos cortes no permiten calcular minutos adicionales comparables.' : 'Se resta el acumulado anterior; no se suman los cortes.'}</p>
        <div className="table-scroll tracking-table"><table><thead><tr><th>ATRIBUTO</th><th>{dateLabel(before.gameDate)}</th><th>{dateLabel(after.gameDate)}</th><th>CAMBIO</th></tr></thead><tbody>{comparison.attributes.map(a => <tr key={a.key}><td>{a.label}{a.lowerIsBetter && <small className="evaluation-reason">Menor es mejor</small>}</td><td>{a.before ?? '—'}</td><td>{a.after ?? '—'}</td><td className={a.delta !== null && a.delta !== 0 ? 'tracking-change' : ''}>{a.delta === null ? 'Sin par comparable' : delta(a.delta)}</td></tr>)}</tbody></table>{!comparison.attributes.length && <p className="tracking-help">Estos cortes no contienen atributos reconocidos.</p>}</div>
      </> : <p className="tracking-callout">Este corte ya sirve como referencia. Registra otro CSV de una fecha posterior para ver cambios; varias exportaciones del mismo día no demuestran evolución temporal.</p>}
      <details className="analysis-disclosure"><summary>Todos los cortes de este jugador · {cuts.length}</summary><div className="table-scroll"><table><thead><tr><th>FECHA / TEMPORADA</th><th>CA / PA</th><th>ATRIBUTOS</th><th>MINUTOS</th><th>ALCANCE Y PERIODO</th></tr></thead><tbody>{cuts.map(s => { const p = s.players.find(p => p.playerId === selectedId)!; return <tr key={s.id}><td>{dateLabel(s.gameDate)}<small className="evaluation-reason">{s.season}</small></td><td>{p.ca} / {p.pa}</td><td>{Object.keys(p.attributes).length}</td><td>{p.minutes ?? '—'}</td><td>{s.competition}<small className="evaluation-reason">{dateLabel(s.statsFrom)} → {dateLabel(s.statsTo)} · {s.sourceFile}</small></td></tr>; })}</tbody></table></div></details>
    </div>}
  </>;
}

function CAChart({ cuts, playerId }: { cuts: SquadSnapshot[]; playerId: string }) {
  const values = cuts.map(s => ({ date: s.gameDate, ca: s.players.find(p => p.playerId === playerId)!.ca }));
  const low = Math.min(...values.map(v => v.ca)) - 1, high = Math.max(...values.map(v => v.ca)) + 1;
  const first = Date.parse(values[0].date), duration = Math.max(1, Date.parse(values.at(-1)!.date) - first);
  const x = (date: string) => 35 + (Date.parse(date) - first) / duration * 530;
  const y = (ca: number) => 105 - (ca - low) / (high - low) * 75;
  return <figure className="tracking-chart"><figcaption>CA observado a lo largo del tiempo <small>Escala vertical ajustada a los valores registrados</small></figcaption><svg viewBox="0 0 600 140" role="img" aria-label={`Evolución de CA: ${values.map(v => `${dateLabel(v.date)}: ${v.ca}`).join('; ')}`}><line x1="35" y1="105" x2="565" y2="105" stroke="#dfe7d6" /><polyline fill="none" stroke="#6c8c4b" strokeWidth="2.5" points={values.map(v => `${x(v.date)},${y(v.ca)}`).join(' ')} />{values.map((v, i) => <g key={i}><circle cx={x(v.date)} cy={y(v.ca)} r="3.5" fill="#54763b"><title>{dateLabel(v.date)} · CA {v.ca}</title></circle>{(i === 0 || i === values.length - 1) && <text x={x(v.date)} y={y(v.ca) - 10} textAnchor="middle" fill="#42602f" fontSize="11">{v.ca}</text>}</g>)}<text x="35" y="130" fontSize="10" fill="#748568">{dateLabel(values[0].date)}</text><text x="565" y="130" textAnchor="end" fontSize="10" fill="#748568">{dateLabel(values.at(-1)!.date)}</text></svg></figure>;
}

function Minutes({ players, snapshots, plans, onSavePlan, initialPlayerId }: { players: Player[]; snapshots: SquadSnapshot[]; plans: MinutePlan[]; onSavePlan: (plan: MinutePlan) => boolean; initialPlayerId: string }) {
  const [editing, setEditing] = useState<{ plan?: MinutePlan } | null>(() => initialPlayerId && players.some(p => p.id === initialPlayerId) ? { plan: [...plans].sort((a, b) => b.endDate.localeCompare(a.endDate)).find(p => p.playerId === initialPlayerId) } : null);
  return <>
    <div className="section-heading"><div><h2>Plan de minutos</h2><p>Un objetivo por jugador, periodo y competición. Se mide con los cortes comparables.</p></div><button className="button primary compact" disabled={!players.length} onClick={() => setEditing({})}>Nuevo objetivo</button></div>
    <div className="tracking-body"><p className="tracking-callout">Los minutos del CSV deben estar acumulados desde la fecha inicial del plan. La referencia de ritmo distribuye el objetivo de forma lineal entre sus fechas; puedes interpretarla según tu calendario de partidos.</p>
      {editing && <MinutePlanForm key={editing.plan?.id ?? 'new'} plan={editing.plan} players={players} initialPlayerId={initialPlayerId} latest={snapshots.at(-1)} onCancel={() => setEditing(null)} onSave={plan => { if (onSavePlan(plan)) setEditing(null); }} />}
      {!plans.length ? <div className="empty-state"><span className="empty-icon"><Clock3 size={25} /></span><h3>Define una oportunidad concreta.</h3><p>{players.length ? 'Crea un objetivo de minutos para un titular, un jugador de rotación o un joven en desarrollo.' : 'Importa jugadores con una partida de origen para crear sus objetivos.'}</p>{players.length > 0 && !editing && <div><button className="button secondary" onClick={() => setEditing({})}>Crear primer objetivo</button></div>}</div> : <div className="minute-plan-list">{[...plans].sort((a, b) => b.endDate.localeCompare(a.endDate)).map(plan => { const player = players.find(p => p.id === plan.playerId), progress = minuteProgress(plan, snapshots); return <article className="minute-plan-card" key={plan.id}>
        <div className="minute-card-heading"><div><h3>{player?.name ?? progress.snapshot?.players.find(p => p.playerId === plan.playerId)?.name ?? 'Jugador archivado'}</h3><p>{plan.role} · {plan.season} · {plan.competition}</p></div><span className={`tracking-status ${progress.status}`}>{planStatus[progress.status]}</span></div>
        <div className="minute-amount"><strong>{progress.actual ?? '—'}</strong><span> / {plan.targetMinutes} minutos</span><b>{progress.percentage === null ? 'Sin medición' : `${Math.round(progress.percentage)}% del objetivo`}</b></div>
        <progress max={100} value={Math.min(100, progress.percentage ?? 0)} aria-label={`Cumplimiento de minutos de ${player?.name ?? 'jugador archivado'}`} />
        <div className="minute-plan-meta"><span>{dateLabel(plan.startDate)} → {dateLabel(plan.endDate)}</span><span>{progress.snapshot ? `Medición al ${dateLabel(progress.snapshot.statsTo)} · ritmo orientativo: ${progress.expected} min` : 'Necesita un corte con el mismo inicio y alcance estadístico.'}</span></div>
        {progress.actual === null && progress.snapshot && <p className="tracking-help">El último corte comparable no contiene minutos válidos. No se reutiliza una medición antigua.</p>}
        {plan.notes && <p className="minute-plan-notes">{plan.notes}</p>}
        {player && <button className="text-button" onClick={() => setEditing({ plan })}>Editar objetivo <ArrowRight size={14} /></button>}
      </article>; })}</div>}
    </div>
  </>;
}

function MinutePlanForm({ plan, players, latest, onSave, onCancel, initialPlayerId }: { plan?: MinutePlan; players: Player[]; latest?: SquadSnapshot; onSave: (plan: MinutePlan) => void; onCancel: () => void; initialPlayerId: string }) {
  const initialPlayer = players.find(p => p.id === initialPlayerId) ?? players[0];
  const [draft, setDraft] = useState<MinutePlan>(() => plan ? { ...plan } : { id: crypto.randomUUID(), playerId: initialPlayer?.id ?? '', saveId: initialPlayer?.fm?.saveId ?? '', season: latest?.season ?? '', competition: latest?.competition ?? 'Todas las competiciones', startDate: latest?.statsFrom ?? '', endDate: '', targetMinutes: 1800, role: 'Desarrollo', notes: '' });
  const [error, setError] = useState('');
  const change = <K extends keyof MinutePlan>(key: K, value: MinutePlan[K]) => { setDraft(current => ({ ...current, [key]: value })); setError(''); };
  return <form className="minute-plan-form" onSubmit={event => { event.preventDefault(); const error = validateMinutePlan(draft); if (error) { setError(error); return; } onSave(draft); }}><h3>{plan ? 'Editar objetivo de minutos' : 'Nuevo objetivo de minutos'}</h3><div className="tracking-form-grid">
    <label>Jugador del plan<select value={draft.playerId} disabled={Boolean(plan)} onChange={e => { const player = players.find(p => p.id === e.target.value)!; setDraft({ ...draft, playerId: player.id, saveId: player.fm!.saveId }); }}>{players.map(p => <option key={p.id} value={p.id}>{p.name} · {p.position}</option>)}</select></label>
    <label>Papel previsto<select value={draft.role} onChange={e => change('role', e.target.value as MinutePlan['role'])}>{MINUTE_ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
    <label>Temporada del plan<input required maxLength={80} placeholder="Ej. 2026/27" value={draft.season} onChange={e => change('season', e.target.value)} /></label>
    <label>Competición / alcance del plan<input required maxLength={80} value={draft.competition} onChange={e => change('competition', e.target.value)} /></label>
    <label>Inicio del plan<input required type="date" value={draft.startDate} onChange={e => change('startDate', e.target.value)} /></label>
    <label>Fin del plan<input required type="date" value={draft.endDate} onChange={e => change('endDate', e.target.value)} /></label>
    <label>Objetivo de minutos<input required type="number" min={1} max={100000} step={1} value={draft.targetMinutes} onChange={e => change('targetMinutes', Number(e.target.value))} /></label>
    <label className="tracking-full">Notas del plan<textarea maxLength={1000} rows={2} placeholder="Ej. Priorizar titularidades en copa y entradas desde el banquillo." value={draft.notes} onChange={e => change('notes', e.target.value)} /></label>
  </div>{error && <p className="alert" role="alert">{error}</p>}<div className="tracking-form-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button className="button primary" type="submit">Guardar objetivo</button></div></form>;
}

function Talent({ snapshots, players, plans, onDetails, onPlans, onImport }: { snapshots: SquadSnapshot[]; players: Player[]; plans: MinutePlan[]; onDetails: (player: Player) => void; onPlans: (playerId: string) => void; onImport: () => void }) {
  const [snapshotId, setSnapshotId] = useState('');
  const [criteria, setCriteria] = useState(DEFAULT_BLOCKED_CRITERIA);
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const selected = snapshots.find(s => s.id === snapshotId) ?? snapshots.at(-1);
  const results = selected ? blockedTalent(selected, players, plans, criteria) : [];
  const rows = onlyAlerts ? results.filter(r => r.status === 'blocked' || r.status === 'watch') : results;
  const fields = [{ key: 'maxAge', label: 'Edad máxima', min: 14, max: 60 }, { key: 'minHeadroom', label: 'Margen mínimo PA − CA', min: 0, max: 199 }, { key: 'lowMinutes', label: 'Minutos bajos sin plan', min: 1, max: 100000 }, { key: 'minimumDays', label: 'Días mínimos observados', min: 1, max: 1000 }, { key: 'minimumCompetitors', label: 'Compañeros por delante', min: 1, max: 30 }] as const;
  return <><div className="section-heading"><div><h2>Talento bloqueado</h2><p>Señales de poca participación, margen de desarrollo y competencia por el puesto.</p></div><Sprout size={22} /></div>
    {!selected ? <EmptyHistory onImport={onImport} /> : <div className="tracking-body">
      <label className="analysis-select">Corte a revisar<select value={selected.id} onChange={e => setSnapshotId(e.target.value)}>{[...snapshots].reverse().map(s => <option key={s.id} value={s.id}>{cutLabel(s)}</option>)}</select></label>
      <p className="tracking-help">Periodo observado: {dateLabel(selected.statsFrom)} → {dateLabel(selected.statsTo)}. Se compara únicamente a jugadores actuales presentes en este mismo corte. Un CSV parcial puede omitir competidores.</p>
      <details className="analysis-disclosure"><summary>Criterios de detección · ajustables</summary><div className="tracking-form-grid">{fields.map(field => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={1} value={criteria[field.key]} onChange={e => setCriteria(current => ({ ...current, [field.key]: Math.max(field.min, Math.min(field.max, Math.round(Number(e.target.value)) || field.min)) }))} /></label>)}</div><p className="tracking-help">Criterios propios de planificación. Con un plan aplicable, la participación baja se mide por su ritmo; sin plan, se usa el límite absoluto de minutos elegido. La competencia se aproxima por CA superior dentro del mismo grupo de posición, sin inferir un orden táctico.</p></details>
      <div className="talent-summary"><span><b>{results.filter(r => r.status === 'blocked').length}</b> posibles bloqueos</span><span><b>{results.filter(r => r.status === 'watch').length}</b> por revisar</span><span><b>{results.filter(r => r.status === 'pending').length}</b> pendientes de datos</span></div>
      <label className="analysis-checkbox"><input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} />Mostrar solo señales de participación baja</label>
      <div className="talent-list">{rows.map(row => { const current = players.find(p => p.id === row.player.playerId); return <article className={`talent-card ${row.status}`} key={row.player.playerId}><div className="minute-card-heading"><div><h3>{row.player.name}</h3><p>{row.player.position} · {row.player.age} años · CA {row.player.ca} / PA {row.player.pa}</p></div><span className={`tracking-status ${row.status}`}>{talentStatus[row.status]}</span></div><p className="talent-reason">{row.reason}</p><div className="talent-evidence"><span>Margen PA − CA<b>{row.player.pa - row.player.ca}</b></span><span>Minutos del corte<b>{row.player.minutes ?? 'Pendientes'}</b></span><span>CA superior en el puesto<b>{row.competitors.length} compañeros</b></span></div>
        {row.competitors.length > 0 && <p className="tracking-help">Competencia observada: {row.competitors.slice(0, 3).map(p => `${p.name} (CA ${p.ca})`).join(' · ')}{row.competitors.length > 3 ? ` y ${row.competitors.length - 3} más` : ''}.</p>}
        <p className="tracking-help">{row.plan ? `Plan: ${row.plan.targetMinutes} min · ${row.progress ? planStatus[row.progress.status] : 'Sin medición comparable'}.` : `Sin plan: se considera baja una participación inferior a ${criteria.lowMinutes} min tras ${criteria.minimumDays} días observados.`}</p>
        {(row.status === 'blocked' || row.status === 'watch') && <p className="talent-next">Revisa oportunidades de rotación, un objetivo de minutos o una cesión. El análisis de rol puede ayudar a explorar otro encaje.</p>}
        <div className="talent-actions"><button className="text-button" onClick={() => onPlans(row.player.playerId)}>{row.plan ? 'Revisar su plan de minutos' : 'Definir un plan de minutos'} <ArrowRight size={14} /></button>{current && <button className="button secondary compact" onClick={() => onDetails(current)}>Ver análisis por rol</button>}</div>
      </article>; })}</div>
      {!rows.length && <div className="empty-state"><h3>{onlyAlerts ? 'No hay señales con estos criterios.' : 'No hay candidatos con estos criterios.'}</h3><p>Revisa el corte seleccionado o ajusta edad y margen de desarrollo. La ausencia de una alerta no garantiza minutos suficientes.</p></div>}
    </div>}
  </>;
}
