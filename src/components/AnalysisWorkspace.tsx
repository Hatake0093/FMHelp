import { useState } from 'react';
import type { DynastyState, Player, SquadConstructionPlan } from '../domain/model';
import AttributeRanking from './AnalysisPanel';
import PlayerAnalysis from './PlayerAnalysis';
import ConstructionPanel from './ConstructionPanel';
import PerformancePanel from './PerformancePanel';

export default function AnalysisWorkspace({ state, onDetails, onSavePlan }: { state: DynastyState; onDetails: (player: Player) => void; onSavePlan: (plan: SquadConstructionPlan) => boolean }) {
  const players = state.players;
  const [view, setView] = useState('individual');
  const [playerId, setPlayerId] = useState('');
  const player = players.find(p => p.id === playerId) ?? players[0];
  return <>
    <div className="analysis-navigation tabs" aria-label="Vista de análisis">
      <button className={view === 'individual' ? 'selected' : ''} aria-pressed={view === 'individual'} onClick={() => setView('individual')}>Por jugador</button>
      <button className={view === 'attributes' ? 'selected' : ''} aria-pressed={view === 'attributes'} onClick={() => setView('attributes')}>Ranking de atributos</button>
      <button className={view === 'construction' ? 'selected' : ''} aria-pressed={view === 'construction'} onClick={() => setView('construction')}>Construcción de plantilla</button>
      <button className={view === 'performance' ? 'selected' : ''} aria-pressed={view === 'performance'} onClick={() => setView('performance')}>Rendimiento vs perfil</button>
    </div>
    {view === 'construction' ? <ConstructionPanel state={state} onSavePlan={onSavePlan} onDetails={onDetails} /> : view === 'performance' ? <PerformancePanel state={state} onDetails={onDetails} /> : view === 'attributes' ? <AttributeRanking players={players} onDetails={onDetails} /> : <section className="panel individual-panel">
      <div className="section-heading"><div><span className="module-tag">LABORATORIO DE JUGADORES</span><h2>Encuentra su lugar en el equipo.</h2><p>Encaje por rol, alternativas de posición y comparación con tus compañeros.</p></div></div>
      {player ? <>
        <div className="individual-picker"><label>Jugador a analizar<select value={player.id} onChange={e => setPlayerId(e.target.value)}>{[...players].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => <option key={p.id} value={p.id}>{p.name} · {p.position}{p.fm ? ` · ${p.fm.saveId}` : ''}</option>)}</select></label><button className="button secondary" onClick={() => onDetails(player)}>Ver ficha completa</button></div>
        <PlayerAnalysis key={player.id} player={player} players={players} />
      </> : <div className="empty-state"><h3>Tu próximo análisis empieza con un jugador</h3><p>Añade futbolistas o importa tu CSV desde Centro de datos. Puedes añadir atributos en futuras exportaciones.</p></div>}
    </section>}
  </>;
}
