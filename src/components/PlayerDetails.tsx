import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Player } from '../domain/model';
import { attributeNumber, FM_ATTRIBUTES, FM_FIELDS, findColumn, readFMValue } from '../domain/fm-data';
import PlayerAnalysis from './PlayerAnalysis';

export default function PlayerDetails({ player, players, onClose }: { player: Player; players: Player[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState('analysis');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const fm = player.fm;
  const groups = [...new Set(FM_ATTRIBUTES.map(a => a.group))];
  const headers = fm ? Object.keys(fm.values) : [];
  const fields = [
    ['País', readFMValue(fm, FM_FIELDS.nationality)], ['Pierna buena', readFMValue(fm, FM_FIELDS.foot)],
    ['Mejor posición', readFMValue(fm, FM_FIELDS.bestPosition)], ['Posición/rol en entrenamiento', readFMValue(fm, FM_FIELDS.trainingPosition)],
    ['Posiciones', readFMValue(fm, FM_FIELDS.positions)], ['Disputados', readFMValue(fm, FM_FIELDS.appearances)],
    ['Calificación', readFMValue(fm, FM_FIELDS.rating)], ['Minutos', readFMValue(fm, FM_FIELDS.minutes)],
    ['Sueldo · texto original', readFMValue(fm, FM_FIELDS.wage)], ['Fin de contrato', readFMValue(fm, FM_FIELDS.contract)],
    ['Valor de traspaso · texto original', readFMValue(fm, FM_FIELDS.value)],
  ];
  return <dialog ref={dialog} onCancel={onClose} className="player-details" aria-labelledby="detail-title">
    <div className="section-heading"><div><p className="eyebrow">FICHA FM26</p><h2 id="detail-title">{player.name}</h2><p>{player.position} · {player.age} años · CA {player.ca} / PA {player.pa}</p></div><button className="icon-button" aria-label="Cerrar ficha FM" onClick={onClose}><X size={20} /></button></div>
    <div className="tabs detail-tabs" aria-label="Vista de ficha"><button className={view === 'analysis' ? 'selected' : ''} aria-pressed={view === 'analysis'} onClick={() => setView('analysis')}>Análisis individual</button><button className={view === 'data' ? 'selected' : ''} aria-pressed={view === 'data'} onClick={() => setView('data')}>Datos FM</button></div>
    {view === 'analysis' ? <PlayerAnalysis key={player.id} player={player} players={players} /> : fm ? <>
      <div className="fm-identity"><span>Partida <b>{fm.saveId}</b></span><span>ID FM <b>{fm.uniqueId ?? 'Sin vincular'}</b></span><small>Última importación: {new Date(fm.importedAt).toLocaleString('es-GT')} · {fm.sourceFile}</small></div>
      <dl className="fm-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value && value !== '-' ? value : '—'}</dd></div>)}</dl>
      <p className="import-description">Atributos en escala 1–20. «—» indica dato no disponible o inválido; no equivale a cero. «Posición/rol» indica el entrenamiento actual exportado; no acredita dominio de esa posición.</p>
      <div className="attribute-groups">{groups.map(group => {
        const attributes = FM_ATTRIBUTES.filter(a => a.group === group && findColumn(headers, a.aliases) >= 0);
        return attributes.length ? <section key={group}><h3>{group}</h3><dl>{attributes.map(attribute => { const raw = readFMValue(fm, attribute.aliases); const value = attributeNumber(raw); return <div key={attribute.key}><dt>{attribute.label}{attribute.lowerIsBetter && <small> · menor es mejor</small>}</dt><dd title={value === null && raw ? `Texto importado: ${raw}` : undefined}>{value ?? '—'}</dd></div>; })}</dl></section> : null;
      })}</div>
      <details className="raw-fields"><summary>Todas las columnas originales ({headers.length})</summary><dl>{Object.entries(fm.values).map(([header, value]) => <div key={header}><dt>{header}</dt><dd>{value || '—'}</dd></div>)}</dl></details>
    </> : <p className="import-description">Esta ficha todavía no tiene datos de FM. Importa un CSV para añadir atributos y vincular su ID.</p>}
    {player.notes && <div className="detail-notes"><h3>Notas de seguimiento</h3><p>{player.notes}</p></div>}
    <div className="dialog-actions"><button className="button primary" onClick={onClose}>Cerrar ficha</button></div>
  </dialog>;
}
