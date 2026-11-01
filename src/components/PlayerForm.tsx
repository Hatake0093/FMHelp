import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { POSITIONS, SQUADS } from '../domain/model';
import type { Player, PlayerDraft, SquadId } from '../domain/model';
import { SQUAD_LABELS } from '../domain/squads';
import { validatePlayer } from '../domain/players';

export default function PlayerForm({ player, defaultSquad, onSave, onClose }: {
  player: Player | null; defaultSquad?: SquadId; onSave: (draft: PlayerDraft) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<PlayerDraft>(player ?? { name: '', age: 18, position: 'MC/MCD', ca: 60, pa: 80, notes: '', ...(defaultSquad && defaultSquad !== 'first' ? { squad: defaultSquad } : {}) });
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    const issue = validatePlayer(draft);
    if (issue) { setError(issue); return; }
    onSave({ ...draft, name: draft.name.trim() });
  }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="player-title">
    <form onSubmit={submit}>
      <div className="section-heading"><div><p className="eyebrow">SECRETARÍA TÉCNICA</p><h2 id="player-title">{player ? 'Editar futbolista' : 'Nuevo futbolista'}</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" onClick={onClose}><X size={20} /></button></div>
      <p className="muted">Su grupo se calculará con la etapa deportiva seleccionada.</p>
      <div className="form-grid">
        <label className="full">Nombre<input autoFocus required maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Nombre y apellido" /></label>
        <label>Edad<input required type="number" min="14" max="60" step="1" value={Number.isNaN(draft.age) ? '' : draft.age} onChange={e => setDraft({ ...draft, age: e.target.valueAsNumber })} /></label>
        <label>Posición<select value={draft.position} onChange={e => setDraft({ ...draft, position: e.target.value as PlayerDraft['position'] })}>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></label>
        <label>CA · Calidad actual<input required type="number" min="1" max="200" step="1" value={Number.isNaN(draft.ca) ? '' : draft.ca} onChange={e => setDraft({ ...draft, ca: e.target.valueAsNumber })} /></label>
        <label>PA · Calidad potencial<input required type="number" min={draft.ca || 1} max="200" step="1" value={Number.isNaN(draft.pa) ? '' : draft.pa} onChange={e => setDraft({ ...draft, pa: e.target.valueAsNumber })} /></label>
        <label className="full">Plantilla<select value={draft.squad ?? 'first'} onChange={e => setDraft({ ...draft, squad: e.target.value === 'first' ? undefined : e.target.value as PlayerDraft['squad'] })}>{SQUADS.map(id => <option key={id} value={id}>{SQUAD_LABELS[id]}</option>)}</select></label>
        <label className="full">Notas de seguimiento<textarea maxLength={1000} rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Rol, evolución o decisiones pendientes…" /></label>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">{player ? 'Guardar cambios' : 'Añadir a la plantilla'}</button></div>
    </form>
  </dialog>;
}
