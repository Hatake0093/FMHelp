import { useMemo, useState } from 'react';
import { ArrowUp, Eye, LogOut, Pencil, Search, Shield, Trash2, Upload } from 'lucide-react';
import { POSITIONS } from '../domain/model';
import type { Player, SquadId } from '../domain/model';
import { evaluateYouth, PROMOTES_TO, SQUAD_LABELS, YOUTH_RULES, YOUTH_STATUS_LABELS } from '../domain/squads';
import type { YouthEvaluation, YouthSquad, YouthStatus } from '../domain/squads';
import { nextStageId, referenceCA, STAGES } from '../domain/stages';
import { compareBy, nextSort } from '../domain/sorting';
import type { SortDir, SortState } from '../domain/sorting';
import { SortHeader } from './SortHeader';

type SortKey = 'name' | 'age' | 'position' | 'ca' | 'pa' | 'status';
const FIRST_DIR: Record<SortKey, SortDir> = { name: 'asc', age: 'asc', position: 'asc', ca: 'desc', pa: 'desc', status: 'asc' };
const STATUS_ORDER: Record<YouthStatus, number> = { promote: 0, project: 1, review: 2 };
const BADGE: Record<YouthStatus, string> = { promote: 'competitive', project: 'development', review: 'review' };
const value = (e: YouthEvaluation, key: string): number | string => {
  switch (key) {
    case 'age': return e.player.age;
    case 'position': return e.player.position;
    case 'ca': return e.player.ca;
    case 'pa': return e.player.pa;
    case 'status': return STATUS_ORDER[e.status];
    default: return e.player.name;
  }
};

interface Props {
  players: Player[]; squad: YouthSquad; stageId: number;
  onDetails: (player: Player) => void; onEdit: (player: Player) => void; onMove: (player: Player, to: SquadId) => void;
  onDepart: (player: Player) => void; onDelete: (player: Player) => void; onImport: () => void; onAdd: () => void;
}

export default function YouthPanel({ players, squad, stageId, onDetails, onEdit, onMove, onDepart, onDelete, onImport, onAdd }: Props) {
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('all');
  const [sort, setSort] = useState<SortState<SortKey> | null>({ key: 'status', dir: 'asc' });
  const rules = YOUTH_RULES[squad];
  const next = SQUAD_LABELS[PROMOTES_TO[squad]];
  const all = useMemo(() => evaluateYouth(players, squad, stageId), [players, squad, stageId]);
  const rows = useMemo(() => {
    const filtered = all.filter(e => (position === 'all' || e.player.position === position) && e.player.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
    return sort ? [...filtered].sort(compareBy(sort, value, e => e.player.name)) : filtered;
  }, [all, search, position, sort]);
  const count = (status: YouthStatus) => all.filter(e => e.status === status).length;
  const header = (key: SortKey, label: string) => <SortHeader key={key} label={label} sortKey={key} sort={sort} onSort={k => setSort(nextSort(sort, k, FIRST_DIR[k]))} />;
  const over = all.length > rules.capacity;
  const stage = STAGES[stageId];

  return <>
    <div className="stats-grid">
      <section className="stat-card"><div><span>{SQUAD_LABELS[squad]}</span><Shield size={19} /></div><strong>{String(all.length).padStart(2, '0')}<small> / {rules.capacity}</small></strong><div className="stat-track"><i style={{ width: `${Math.min(100, all.length / rules.capacity * 100)}%` }} /></div><p>{over ? `Superas el cupo orientativo en ${all.length - rules.capacity}.` : 'Cupo orientativo de la plantilla.'}</p></section>
      <section className="stat-card green-card"><div><span>Listos para subir a {next}</span><ArrowUp size={19} /></div><strong>{String(count('promote')).padStart(2, '0')}</strong><p>{squad === 'u21' ? 'CA de rotación del primer equipo' : `${rules.promoteAge} años o más con PA de proyecto`}</p></section>
      <section className="stat-card"><div><span>Proyecto · Revisar</span><Eye size={19} /></div><strong>{String(count('project')).padStart(2, '0')}<small> · {String(count('review')).padStart(2, '0')}</small></strong><p>Dentro del límite de {rules.maxAge} años</p></section>
    </div>
    <section className="panel reference-panel"><div className="section-heading"><div><h2>Qué buscamos en {SQUAD_LABELS[squad]}</h2><p>Referencias propias para {stage.name}; hasta {rules.maxAge} años. Quien los supera debe subir o salir.</p></div></div>
      <div className="reference-grid">{POSITIONS.map(p => <div key={p}><span>{p}</span><strong>{squad === 'u21' ? referenceCA(stageId, p, 'depth') : referenceCA(nextStageId(stageId), p)}<small>{squad === 'u21' ? 'CA para subir' : 'PA proyecto'}</small></strong><p>{squad === 'u21' ? 'PA proyecto' : 'Para subir a Sub-21'} <b>{referenceCA(nextStageId(stageId), p)}</b></p></div>)}</div></section>
    <section className="panel squad-panel"><div className="section-heading"><div><h2>{SQUAD_LABELS[squad]} <span className="count-badge">{all.length}</span></h2><p>Desarrollo y camino de ascenso.</p></div><button className="button secondary compact" onClick={onImport}><Upload size={15} /> Importar CSV de {SQUAD_LABELS[squad]}</button></div>
      <div className="table-toolbar"><div className="filters"><label className="search-field"><Search size={16} /><input aria-label={`Buscar en ${SQUAD_LABELS[squad]}`} placeholder="Buscar jugador…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filtrar por posición" value={position} onChange={e => setPosition(e.target.value)}><option value="all">Todas las posiciones</option>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></div></div>
      <div className="table-scroll"><table><thead><tr>{header('name', 'JUGADOR')}{header('age', 'EDAD')}{header('position', 'POSICIÓN')}{header('ca', 'CA')}{header('pa', 'PA')}{header('status', 'ESTADO')}<th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{rows.map(e => <tr key={e.player.id}><td><div className="player-name"><span className="player-avatar">{e.player.name.split(/\s+/).slice(0, 2).map(s => s[0]).join('')}</span><div><strong>{e.player.name}</strong>{e.player.notes && <small title={e.player.notes}>{e.player.notes}</small>}</div></div></td><td>{e.player.age}</td><td><span className="position-chip">{e.player.position}</span></td><td><b>{e.player.ca}</b></td><td>{e.player.pa}</td>
          <td><span className={`group-badge ${BADGE[e.status]}`}>{YOUTH_STATUS_LABELS[e.status]}</span><small className="evaluation-reason">{e.reason}</small></td>
          <td><div className="row-actions"><button className="icon-button" aria-label={`Ver ficha FM de ${e.player.name}`} onClick={() => onDetails(e.player)}><Eye size={15} /></button><button className="icon-button" aria-label={`Subir a ${e.player.name} a ${next}`} title={`Subir a ${next}`} onClick={() => onMove(e.player, PROMOTES_TO[squad])}><ArrowUp size={15} /></button><button className="icon-button" aria-label={`Editar a ${e.player.name}`} onClick={() => onEdit(e.player)}><Pencil size={15} /></button><button className="icon-button" aria-label={`Archivar a ${e.player.name} como vendido o libre`} title="Vendido / libre" onClick={() => onDepart(e.player)}><LogOut size={15} /></button><button className="icon-button danger" aria-label={`Eliminar a ${e.player.name}`} onClick={() => onDelete(e.player)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
      {!rows.length && <div className="empty-state"><h3>{all.length ? 'No hay coincidencias' : `Aún no hay jugadores en ${SQUAD_LABELS[squad]}`}</h3><p>{all.length ? 'Prueba con otro nombre o posición.' : `Exporta tu ${SQUAD_LABELS[squad]} desde FM e impórtalo eligiendo esa plantilla, o añade un jugador a mano.`}</p><div><button className="button primary" onClick={onImport}><Upload size={16} /> Importar CSV</button><button className="text-button" onClick={onAdd}>Añadir a mano</button></div></div>}
      <div className="table-footer"><span>{rows.length} de {all.length} jugadores</span><span>Referencias propias, no reglas de FM</span></div>
    </section>
  </>;
}
