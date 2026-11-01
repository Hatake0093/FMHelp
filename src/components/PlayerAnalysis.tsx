import { useState } from 'react';
import { ArrowRight, GitCompareArrows, Route, Target } from 'lucide-react';
import type { Player } from '../domain/model';
import { FM_ATTRIBUTES, FM_FIELDS, isMissingFMValue, readFMValue } from '../domain/fm-data';
import { attributeLabel, compareRole, evaluateRole, playerAttribute, rolesForPlayer, sameSave } from '../modules/analysis/roles';

const percent = (coverage: number) => Math.floor(coverage * 100);
const scoreText = (score: number | null) => score === null ? 'Pendiente' : `${score.toFixed(1)} / 100`;
type RoleResult = ReturnType<typeof evaluateRole>;

function Coverage({ result }: { result: Pick<RoleResult, 'coverage' | 'known' | 'missing' | 'missingEssential'> }) {
  return <div className="coverage"><div><span>Cobertura ponderada</span><b>{percent(result.coverage)}% · {result.known.length}/{result.known.length + result.missing.length} atributos</b></div><progress max="100" value={result.coverage * 100} aria-label="Cobertura ponderada de atributos" />{result.missingEssential.length > 0 && <p>Claves pendientes: {result.missingEssential.map(attributeLabel).join(', ')}.</p>}</div>;
}

function RoleCard({ result, active, onSelect }: { result: RoleResult; active: boolean; onSelect: () => void }) {
  return <article className={`role-card ${active ? 'active' : ''}`}>
    <div className="role-card-heading"><span className="position-chip">{result.role.position}</span><span className={`analysis-status ${result.ready ? 'ready' : ''}`}>{result.ready ? 'Evaluable' : 'Faltan datos'}</span></div>
    <h3>{result.role.name}</h3><p>{result.role.purpose}</p>
    <strong className="role-score">{scoreText(result.score)}</strong><Coverage result={result} />
    <button className="text-button" aria-pressed={active} onClick={onSelect}>{active ? 'Rol seleccionado' : 'Analizar este rol'} <ArrowRight size={14} /></button>
  </article>;
}

export default function PlayerAnalysis({ player, players }: { player: Player; players: Player[] }) {
  const results = rolesForPlayer(player);
  const ownRoles = results.filter(r => r.role.position === player.position);
  const alternatives = results.filter(r => r.role.position !== player.position);
  const [roleId, setRoleId] = useState(ownRoles[0]?.role.id ?? results[0]?.role.id ?? '');
  const [compareId, setCompareId] = useState('');
  const [allPositions, setAllPositions] = useState(false);
  const role = results.find(r => r.role.id === roleId)?.role ?? ownRoles[0]?.role ?? results[0].role;
  const selected = evaluateRole(player, role);
  const peers = players.filter(p => p.id !== player.id && sameSave(player, p) && (p.position === 'POR') === (player.position === 'POR') && (allPositions || p.position === player.position)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const peer = peers.find(p => p.id === compareId) ?? peers[0];
  const comparison = peer ? compareRole(player, peer, role) : null;
  const knownAttributes = FM_ATTRIBUTES.filter(a => playerAttribute(player, a.key) !== null).length;
  const available = (key: string) => playerAttribute(player, key);
  const foot = readFMValue(player.fm, FM_FIELDS.foot);
  const training = readFMValue(player.fm, FM_FIELDS.trainingPosition);
  const missingPriorities = [...new Set([...selected.missingEssential, ...selected.missing])];
  const contextFields: { label: string; aliases: readonly string[] }[] = [
    { label: 'Partidos', aliases: FM_FIELDS.appearances }, { label: 'Calificación', aliases: FM_FIELDS.rating },
    { label: 'Minutos', aliases: FM_FIELDS.minutes }, { label: 'Sueldo', aliases: FM_FIELDS.wage }, { label: 'Contrato', aliases: FM_FIELDS.contract },
  ];
  return <div className="player-analysis">
    <div className="analysis-player-summary"><div><span className="eyebrow">PERFIL INDIVIDUAL</span><h3>{player.name}</h3><p>{player.position} · {player.age} años{foot && foot !== '-' ? ` · Pierna: ${foot}` : ''}</p></div><div className="analysis-metrics"><span>CA / PA<b>{player.ca} / {player.pa}</b></span><span>ATRIBUTOS<b>{knownAttributes} / {FM_ATTRIBUTES.length}</b></span></div></div>

    <section className="analysis-block"><div className="analysis-block-title"><Target size={18} /><div><h3>Encaje en su posición</h3><p>Perfiles de juego dentro de {player.position}. Selecciona uno para profundizar.</p></div></div>
      <div className="role-grid">{ownRoles.map(result => <RoleCard key={result.role.id} result={result} active={role.id === result.role.id} onSelect={() => setRoleId(result.role.id)} />)}</div>
    </section>

    <section className="analysis-block"><div className="analysis-block-title"><Route size={18} /><div><h3>Explorar una reconversión</h3><p>Afinidad de atributos con otros grupos de posición; el dominio posicional se consulta aparte.</p></div></div>
      {alternatives.length ? <><div className="role-grid">{alternatives.slice(0, 3).map(result => <RoleCard key={result.role.id} result={result} active={role.id === result.role.id} onSelect={() => setRoleId(result.role.id)} />)}</div>
        {alternatives.length > 3 && <details className="analysis-disclosure"><summary>Ver las {alternatives.length - 3} alternativas restantes</summary><div className="role-grid">{alternatives.slice(3).map(result => <RoleCard key={result.role.id} result={result} active={role.id === result.role.id} onSelect={() => setRoleId(result.role.id)} />)}</div></details>}
        <p className="analysis-note">Antes de reconvertir, revisa lado, pierna, familiaridad posicional y necesidades de tu táctica. La polivalencia y la edad aportan contexto; no permiten calcular un plazo de adaptación.</p></> : <p className="analysis-note">Para porteros se comparan perfiles de portería. Este modelo no propone reconversiones a jugador de campo.</p>}
      <div className="analysis-context"><span>Posición/rol en entrenamiento: <b>{isMissingFMValue(training) ? 'Sin datos' : training}</b></span><span>Posiciones exportadas: <b>{readFMValue(player.fm, FM_FIELDS.positions) || 'Sin datos'}</b></span><span>Polivalencia: <b>{available('versatility') ?? '—'}</b></span><span>Profesionalidad: <b>{available('professionalism') ?? '—'}</b></span><span>Determinación: <b>{available('determination') ?? '—'}</b></span><span>Ambición: <b>{available('ambition') ?? '—'}</b></span></div>
    </section>

    <section className="analysis-block selected-role"><div className="analysis-block-title"><Target size={18} /><div><h3>En detalle: {role.name}</h3><p>{role.purpose}</p></div></div>
      <label className="analysis-select">Cambiar rol de análisis<select value={role.id} onChange={e => setRoleId(e.target.value)}>{results.map(r => <option key={r.role.id} value={r.role.id}>{r.role.position} · {r.role.name}</option>)}</select></label>
      <div className="role-detail-grid"><div><h4>Fortalezas observadas</h4>{selected.strengths.length ? <ul>{selected.strengths.map(a => <li key={a.key}><span>{attributeLabel(a.key)}</span><b>{a.value}/20</b></li>)}</ul> : <p>Importa atributos de este perfil para identificar fortalezas.</p>}</div><div><h4>Prioridades de revisión</h4>{selected.priorities.length ? <ul>{selected.priorities.map(a => <li key={a.key}><span>{attributeLabel(a.key)}</span><b>{a.value}/20</b></li>)}</ul> : <p>{selected.known.length > 1 ? 'Los valores disponibles están empatados; no destaca una prioridad por nivel de atributo.' : 'Añade más atributos para contrastar prioridades.'}</p>}</div></div>
      <p className="analysis-note">Se muestran los valores más altos y más bajos del rol entre los atributos disponibles. Las prioridades sirven para revisar el entrenamiento, sin prometer mejoras. {selected.ready ? 'Consulta los pesos para interpretar el índice.' : 'Lectura parcial: todavía no hay datos suficientes para puntuar este perfil.'}</p>
      <details className="analysis-disclosure"><summary>Atributos y pesos de este rol · {selected.missing.length} pendientes</summary><div className="table-scroll"><table><thead><tr><th>ATRIBUTO</th><th>PESO</th><th>VALOR</th><th>REQUISITO</th></tr></thead><tbody>{Object.entries(role.weights).map(([key, weight]) => <tr key={key}><td>{attributeLabel(key)}</td><td>{weight}</td><td>{available(key) ?? '—'}</td><td>{role.essential.includes(key) ? 'Clave obligatorio' : 'Complementario'}</td></tr>)}</tbody></table></div></details>
    </section>

    <section className="analysis-block"><div className="analysis-block-title"><GitCompareArrows size={18} /><div><h3>Comparar para el mismo rol</h3><p>Ambos jugadores se evalúan como {role.name.toLocaleLowerCase('es')}, usando los mismos atributos.</p></div></div>
      <div className="comparison-controls"><label className="analysis-select">Comparar con<select value={peer?.id ?? ''} onChange={e => setCompareId(e.target.value)} disabled={!peers.length}>{!peers.length && <option value="">Sin compañeros disponibles</option>}{peers.map(p => <option key={p.id} value={p.id}>{p.name} · {p.position}</option>)}</select></label>{player.position !== 'POR' && <label className="analysis-checkbox"><input type="checkbox" checked={allPositions} onChange={e => setAllPositions(e.target.checked)} />Incluir otros puestos de la misma partida</label>}</div>
      {peer && comparison ? <>
        <div className="comparison-scoreboard"><div><span>{player.name}</span><strong>{scoreText(comparison.scoreA)}</strong><small>CA {player.ca} · PA {player.pa} · {player.age} años</small></div><span className="comparison-vs">VS</span><div><span>{peer.name}</span><strong>{scoreText(comparison.scoreB)}</strong><small>CA {peer.ca} · PA {peer.pa} · {peer.age} años</small></div></div>
        <Coverage result={comparison} />
        <p className="analysis-note">{comparison.ready ? `Diferencia del índice sobre datos comunes: ${Math.abs(comparison.scoreA! - comparison.scoreB!).toFixed(1)} puntos${Math.abs(comparison.scoreA! - comparison.scoreB!) < 0.05 ? ' · empate en el modelo' : ` a favor de ${comparison.scoreA! > comparison.scoreB! ? player.name : peer.name}`}. El índice orienta el encaje; revisa también las diferencias atributo por atributo.` : 'Comparativa parcial: se requieren al menos el 80% del peso y todos los atributos clave en ambos jugadores para calcular los índices.'}</p>
        <div className="table-scroll comparison-table"><table><thead><tr><th>ATRIBUTO / PESO</th><th>{player.name}</th><th>{peer.name}</th><th>DIF. A − B</th></tr></thead><tbody>{comparison.rows.map(row => <tr key={row.key}><td>{attributeLabel(row.key)}<small className="evaluation-reason">Peso {row.weight}{row.essential ? ' · clave' : ''}</small></td><td className={row.difference !== null && row.difference > 0 ? 'comparison-leading' : ''}>{row.valueA ?? '—'}</td><td className={row.difference !== null && row.difference < 0 ? 'comparison-leading' : ''}>{row.valueB ?? '—'}</td><td>{row.difference === null ? '—' : `${row.difference > 0 ? '+' : ''}${row.difference}`}</td></tr>)}</tbody></table></div>
        <details className="analysis-disclosure"><summary>Contexto de rendimiento y contrato</summary><div className="table-scroll"><table><thead><tr><th>DATO EXPORTADO</th><th>{player.name}</th><th>{peer.name}</th></tr></thead><tbody>{contextFields.map(({ label, aliases }) => <tr key={label}><td>{label}</td><td>{readFMValue(player.fm, aliases) || '—'}</td><td>{readFMValue(peer.fm, aliases) || '—'}</td></tr>)}</tbody></table></div><p className="analysis-note">Texto original de cada exportación. Comprueba que las estadísticas corresponden al mismo periodo y competición.</p></details>
      </> : <p className="analysis-note">{!player.fm ? 'Vincula esta ficha a una partida mediante la importación CSV para compararla con compañeros.' : player.position === 'POR' ? 'Importa otro portero de la misma partida para comparar sus perfiles.' : 'No hay otro jugador de este puesto en la misma partida. Puedes incluir otros puestos o importar más compañeros.'}</p>}
    </section>

    <section className="analysis-block attribute-roadmap"><h3>Tu próxima exportación</h3><p>Añade las columnas gradualmente. Los atributos se reconocerán al actualizar la ficha por ID FM dentro de la misma partida; las columnas omitidas conservarán sus valores anteriores.</p>
      {missingPriorities.length > 0 && <div className="next-attributes"><b>Para completar {role.name.toLocaleLowerCase('es')}:</b><p>{missingPriorities.map(attributeLabel).join(' · ')}</p></div>}
      <details className="analysis-disclosure"><summary>Inventario completo · {knownAttributes}/{FM_ATTRIBUTES.length} atributos disponibles</summary><p className="analysis-note">Catálogo ampliado para análisis actuales y futuros. Solo los atributos de cada perfil afectan a su índice. Agresividad, excentricidad y tendencias no se valoran automáticamente como mejores por ser más altas.</p>{[...new Set(FM_ATTRIBUTES.map(a => a.group))].map(group => <div className="attribute-check-group" key={group}><h4>{group}</h4><div className="attribute-checks">{FM_ATTRIBUTES.filter(a => a.group === group).map(attribute => { const value = available(attribute.key); return <span className={value !== null ? 'present' : ''} key={attribute.key}>{attribute.label}<b>{value ?? 'Pendiente'}</b></span>; })}</div></div>)}</details>
    </section>

    <details className="analysis-disclosure methodology"><summary>Cómo se calcula · modelo propio v1</summary><p>Índice = media ponderada de los atributos disponibles del rol × 5 (escala 5–100). Los pesos van de 1 a 3. La cobertura mide la proporción del peso disponible, no una probabilidad de acierto.</p><p>Solo se publica una puntuación con cobertura ≥80% y todos los atributos clave. Un dato ausente o inválido no equivale a cero. Las comparativas utilizan la intersección de atributos válidos; por eso su índice puede diferir del individual.</p><p>Los perfiles son referencias propias de planificación, no fórmulas oficiales de FM ni equivalencias garantizadas con los roles del juego. Las posiciones se agrupan de forma amplia; no se infieren lado, familiaridad, adaptación ni instrucciones tácticas. CA/PA, edad y personalidad se muestran como contexto y no se suman al índice.</p><p>Los roles pendientes se ordenan por cobertura, sin indicar preferencia deportiva. Entre roles evaluables, las diferencias de pesos y cobertura requieren revisar los atributos antes de elegir una reconversión.</p></details>
  </div>;
}
