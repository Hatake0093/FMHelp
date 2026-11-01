import { useMemo, useState } from 'react';
import { Eye, LogOut } from 'lucide-react';
import type { DynastyState, Player } from '../domain/model';
import { FM_FIELDS, readFMValue } from '../domain/fm-data';
import { reviewDepartures, SALE_LABELS } from '../modules/analysis/departure';
import type { SaleLevel } from '../modules/analysis/departure';

const filters = [{ id: 'attention', label: 'Requieren decisión' }, { id: 'sell', label: SALE_LABELS.sell }, { id: 'consider', label: SALE_LABELS.consider }, { id: 'keep', label: SALE_LABELS.keep }] as const;

export default function DeparturePanel({ state, onDetails, onDepart }: { state: DynastyState; onDetails: (player: Player) => void; onDepart: (player: Player) => void }) {
  const [filter, setFilter] = useState<typeof filters[number]['id']>('attention');
  const reviews = useMemo(() => reviewDepartures(state.players, state.stageId, state.squadPlans), [state]);
  const count = (level: SaleLevel) => reviews.filter(r => r.level === level).length;
  const rows = reviews.filter(r => filter === 'attention' ? r.level !== 'keep' : r.level === filter);
  return <section className="panel">
    <div className="section-heading"><div><h2>Quién debería salir</h2><p>Cruza el cupo 20 + 10, el techo de PA y tu plan de plantilla. Es una guía: la decisión es tuya.</p></div></div>
    <div className="sale-summary"><span><b>{count('sell')}</b> recomendadas</span><span><b>{count('consider')}</b> por valorar</span><span><b>{count('keep')}</b> a mantener</span></div>
    <div className="table-toolbar"><div className="tabs" aria-label="Filtrar recomendaciones">{filters.map(f => <button key={f.id} className={filter === f.id ? 'selected' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div></div>
    {rows.length ? <div className="table-scroll"><table className="sale-table"><thead><tr><th>JUGADOR</th><th>EDAD</th><th>POSICIÓN</th><th>CA / PA</th><th>VALOR FM</th><th>RECOMENDACIÓN</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map(r => <tr key={r.player.id}>
      <td><strong>{r.player.name}</strong></td><td>{r.player.age}</td><td><span className="position-chip">{r.player.position}</span></td><td><b>{r.player.ca}</b> / {r.player.pa}</td><td>{readFMValue(r.player.fm, FM_FIELDS.value) || '—'}</td>
      <td className="sale-detail"><span className={`sale-badge ${r.level}`}>{SALE_LABELS[r.level]}</span>
        <ul>{r.reasons.map(text => <li key={text}>{text}</li>)}</ul>
        {r.pending.length > 0 && <p><b>Falta información:</b> {r.pending.join(' ')}</p>}
        {r.changes.length > 0 && <p><b>Cambiaría si:</b> {r.changes.join(' ')}</p>}</td>
      <td><div className="row-actions"><button className="icon-button" aria-label={`Ver ficha FM de ${r.player.name}`} onClick={() => onDetails(r.player)}><Eye size={15} /></button><button className="icon-button" aria-label={`Archivar a ${r.player.name} como vendido o libre`} title="Vendido / libre" onClick={() => onDepart(r.player)}><LogOut size={15} /></button></div></td></tr>)}</tbody></table></div>
      : <div className="empty-state"><h3>{state.players.length ? 'Nada que decidir con este filtro' : 'Aún no hay jugadores'}</h3><p>{state.players.length ? 'Ningún jugador cumple las condiciones de esta categoría.' : 'Importa tu CSV o añade jugadores para revisar posibles salidas.'}</p></div>}
    <p className="footnote">Solo los jugadores en revisión pueden aparecer como recomendados, y nunca si ocupan un puesto de tu plan. No se usa la edad como motivo único. El rendimiento, el valor de mercado y el contrato todavía no puntúan: el valor se muestra como texto de FM para que lo contrastes.</p>
  </section>;
}
