import { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { POSITIONS } from '../domain/model';
import type { DynastyState, Player } from '../domain/model';
import { SQUAD_LABELS } from '../domain/squads';
import { DEFAULT_PERFORMANCE_CRITERIA, performanceVsProfile } from '../modules/analysis/performance';
import type { PerformanceStatus } from '../modules/analysis/performance';

const dateLabel = (date: string) => date.split('-').reverse().join('/');
const STATUS_LABELS: Record<PerformanceStatus, string> = { unused: 'Buen perfil, sin jugar', under: 'Por debajo del perfil', over: 'Por encima del perfil', aligned: 'Acorde', pending: 'Pendiente' };
const pct = (value: number | null) => value === null ? '—' : String(Math.round(value));

export default function PerformancePanel({ state, onDetails }: { state: DynastyState; onDetails: (player: Player) => void }) {
  const snapshots = state.tracking.snapshots;
  const [snapshotId, setSnapshotId] = useState('');
  const [position, setPosition] = useState('all');
  const [onlySignals, setOnlySignals] = useState(true);
  const selected = snapshots.find(s => s.id === snapshotId) ?? snapshots.at(-1);
  const results = useMemo(() => selected ? performanceVsProfile(selected) : [], [selected]);
  const current = new Map(state.players.map(p => [p.id, p]));
  const visible = results.filter(r => current.has(r.observation.playerId) && (position === 'all' || r.observation.position === position));
  const rows = onlySignals ? visible.filter(r => r.status !== 'aligned' && r.status !== 'pending') : visible;
  const count = (status: PerformanceStatus) => visible.filter(r => r.status === status).length;
  return <section className="panel">
    <div className="section-heading"><div><h2>Rendimiento frente a perfil</h2><p>Compara el nivel de cada jugador en su mejor rol con su calificación real, dentro de su grupo de posición.</p></div></div>
    {!selected ? <div className="empty-state"><h3>Aún no hay cortes</h3><p>Importa un CSV con Calificación y Minutos desde el Centro de datos, dejando activado «Registrar un corte en el histórico».</p></div> : <div className="perf-body">
      <div className="perf-controls">
        <label className="analysis-select">Corte<select value={selected.id} onChange={e => setSnapshotId(e.target.value)}>{[...snapshots].reverse().map(s => <option key={s.id} value={s.id}>{dateLabel(s.gameDate)} · {s.season} · {s.competition}{s.squad ? ` · ${SQUAD_LABELS[s.squad]}` : ''}</option>)}</select></label>
        <label className="analysis-select">Posición<select value={position} onChange={e => setPosition(e.target.value)}><option value="all">Todas</option>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></label>
      </div>
      <p className="tracking-help">Periodo observado: {dateLabel(selected.statsFrom)} → {dateLabel(selected.statsTo)}. El perfil usa los atributos de este mismo corte. Solo cuentan para la calificación quienes suman al menos {DEFAULT_PERFORMANCE_CRITERIA.minMinutes} min, y se exigen {DEFAULT_PERFORMANCE_CRITERIA.minGroup} jugadores por posición para comparar.</p>
      <div className="perf-summary"><span><b>{count('under')}</b> por debajo</span><span><b>{count('over')}</b> por encima</span><span><b>{count('unused')}</b> sin jugar</span><span><b>{count('aligned')}</b> acordes</span><span><b>{count('pending')}</b> pendientes</span></div>
      <label className="analysis-checkbox"><input type="checkbox" checked={onlySignals} onChange={e => setOnlySignals(e.target.checked)} />Mostrar solo señales (ocultar acordes y pendientes)</label>
      {rows.length ? <div className="table-scroll"><table className="perf-table"><thead><tr><th>JUGADOR</th><th>POSICIÓN</th><th>MEJOR ROL</th><th>PERFIL (PERC.)</th><th>CALIFICACIÓN (PERC.)</th><th>MINUTOS</th><th>LECTURA</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map(r => <tr key={r.observation.playerId}>
        <td><strong>{r.observation.name}</strong></td><td><span className="position-chip">{r.observation.position}</span></td><td>{r.role?.name ?? '—'}{r.score !== null && <small className="evaluation-reason">Índice {r.score.toFixed(0)}</small>}</td>
        <td><b>{pct(r.profilePct)}</b></td><td>{r.observation.rating !== null ? r.observation.rating.toFixed(2) : '—'} <small>({pct(r.ratingPct)})</small></td><td>{r.observation.minutes ?? '—'}</td>
        <td className="perf-detail"><span className={`perf-badge ${r.status}`}>{STATUS_LABELS[r.status]}</span><small>{r.reason}</small></td>
        <td><div className="row-actions"><button className="icon-button" aria-label={`Ver ficha FM de ${r.observation.name}`} onClick={() => onDetails(current.get(r.observation.playerId)!)}><Eye size={15} /></button></div></td></tr>)}</tbody></table></div>
        : <div className="empty-state"><h3>{onlySignals ? 'No hay señales en este corte' : 'No hay jugadores que mostrar'}</h3><p>Prueba otra posición u otro corte, o desactiva el filtro de señales para ver el resto.</p></div>}
      <p className="footnote">Percentil 0 = el peor de su posición en este corte, 100 = el mejor. La diferencia entre calificación y perfil se marca a partir de {DEFAULT_PERFORMANCE_CRITERIA.gap} puntos. La calificación depende del rol, el rival y el contexto del equipo, y el perfil es un modelo propio, no una fórmula de FM: úsalo como pista para revisar, no como veredicto. Los porteros quedan pendientes hasta que el CSV incluya sus atributos específicos.</p>
    </div>}
  </section>;
}
