import { useMemo, useState } from 'react';
import { Eye, Search } from 'lucide-react';
import type { Player } from '../domain/model';
import { attributeNumber, FM_ATTRIBUTES, FM_FIELDS, readFMValue } from '../domain/fm-data';

export default function AnalysisPanel({ players, onDetails }: { players: Player[]; onDetails: (player: Player) => void }) {
  const [search, setSearch] = useState('');
  const [attributeKey, setAttributeKey] = useState('acceleration');
  const [position, setPosition] = useState('all');
  const attribute = FM_ATTRIBUTES.find(a => a.key === attributeKey)!;
  const compared = useMemo(() => players.filter(p => p.fm && (position === 'all' || p.position === position) && p.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).map(player => ({ player, value: attributeNumber(readFMValue(player.fm, attribute.aliases)) })).sort((a, b) => {
    if (a.value === null) return b.value === null ? a.player.name.localeCompare(b.player.name, 'es') : 1;
    if (b.value === null) return -1;
    return (attribute.lowerIsBetter ? a.value - b.value : b.value - a.value) || a.player.name.localeCompare(b.player.name, 'es');
  }), [players, position, search, attribute]);
  const fmPlayers = players.filter(p => p.fm);
  return <section className="panel analysis-panel"><div className="section-heading"><div><span className="module-tag">DATOS IMPORTADOS</span><h2>Atributos y rendimiento</h2><p>Compara datos reales de tu exportación y consulta la ficha de cada jugador.</p></div><span className="count-badge">{fmPlayers.length} fichas FM</span></div>
    <div className="analysis-controls"><label>Atributo a comparar<select value={attributeKey} onChange={e => setAttributeKey(e.target.value)}>{FM_ATTRIBUTES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></label><label>Grupo de posición<select value={position} onChange={e => setPosition(e.target.value)}><option value="all">Todas las posiciones</option>{['POR', 'DFC', 'LAT', 'MC/MCD', 'MP/EXT', 'DC'].map(p => <option key={p}>{p}</option>)}</select></label><label className="search-field"><Search size={16} /><input aria-label="Buscar en análisis" placeholder="Buscar jugador…" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
    <p className="analysis-explanation">Orden: {attribute.lowerIsBetter ? 'menor' : 'mayor'} {attribute.label.toLocaleLowerCase('es')} primero. Es una comparación de un atributo, no una valoración global ni una recomendación automática de titularidad. Los datos ausentes quedan al final.</p>
    <div className="table-scroll"><table><thead><tr><th>JUGADOR / ID FM</th><th>POS.</th><th>CA / PA</th><th>{attribute.label.toLocaleUpperCase('es')}</th><th>DISPUTADOS</th><th>CALIFICACIÓN</th><th>FICHA</th></tr></thead><tbody>{compared.map(({ player, value }) => <tr key={player.id}><td><strong>{player.name}</strong><small className="evaluation-reason">{player.fm?.uniqueId ?? 'Sin ID'} · {player.fm?.saveId}</small></td><td>{player.position}</td><td>{player.ca} / {player.pa}</td><td><span className="attribute-value">{value ?? '—'}</span>{value !== null && <small className="muted"> / 20</small>}</td><td>{readFMValue(player.fm, FM_FIELDS.appearances) || '—'}</td><td>{readFMValue(player.fm, FM_FIELDS.rating) || '—'}</td><td><button className="button secondary compact" aria-label={`Ver ficha FM de ${player.name}`} onClick={() => onDetails(player)}><Eye size={14} /> Ver ficha</button></td></tr>)}</tbody></table></div>
    {!compared.length && <div className="empty-state"><h3>{fmPlayers.length ? 'No hay coincidencias' : 'Añade tu primera exportación'}</h3><p>{fmPlayers.length ? 'Prueba otro nombre o grupo de posición.' : 'Importa el CSV desde Centro de datos para consultar sus atributos aquí.'}</p></div>}
    <p className="analysis-explanation">La calificación y los partidos se conservan tal como aparecen en FM. Aún no se calcula rendimiento por 90 minutos ni evolución histórica.</p>
  </section>;
}
