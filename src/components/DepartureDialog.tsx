import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { DEPARTURE_REASONS } from '../domain/model';
import type { DepartureReason, Player } from '../domain/model';
import { DEPARTURE_LABELS } from '../modules/archive';

export default function DepartureDialog({ player, defaultDate, onConfirm, onClose }: {
  player: Player; defaultDate: string; onConfirm: (reason: DepartureReason, date: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<DepartureReason>('sold');
  const [date, setDate] = useState(defaultDate);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function submit(event: FormEvent) { event.preventDefault(); onConfirm(reason, date); }
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="departure-title">
    <form onSubmit={submit}>
      <div className="section-heading"><div><p className="eyebrow">SALIDA DE LA PLANTILLA</p><h2 id="departure-title">{player.name}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={20} /></button></div>
      <p className="muted">Saldrá de tu plantilla y dejará de contar en las evaluaciones. Conservas su ficha y su historial, y puedes restaurarlo cuando quieras.</p>
      <fieldset className="form-grid">
        <legend className="sr-only">Motivo de la salida</legend>
        {DEPARTURE_REASONS.map(r => <label key={r}><input type="radio" name="departure" checked={reason === r} onChange={() => setReason(r)} /> {DEPARTURE_LABELS[r]}</label>)}
        <label className="full">Fecha de la partida (opcional)<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      </fieldset>
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Archivar jugador</button></div>
    </form>
  </dialog>;
}
