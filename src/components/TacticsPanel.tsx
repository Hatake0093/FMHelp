import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { TACTIC_PHASES } from '../domain/model';
import type { TacticChange, TacticInstruction, TacticPeriod, TacticPhase, TacticsState } from '../domain/model';
import { emptyTactics, hasTactics, periodStats, PHASE_LABELS, removeChange, removePeriod, saveSetup, seedTactics, totalPeriods, upsertChange, upsertPeriod } from '../modules/analysis/tactics';

type Tab = 'setup' | 'results' | 'changes';
const tabs: { id: Tab; label: string }[] = [{ id: 'setup', label: 'Esquema e instrucciones' }, { id: 'results', label: 'Resultados' }, { id: 'changes', label: 'Cambios' }];
const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
const signed = (value: number | null, digits = 0) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
const dateLabel = (date: string) => date.split('-').reverse().join('/');
// Los números de los formularios son texto hasta guardar; el xG admite coma decimal y puede quedar vacío.
const whole = (value: string) => value.trim() === '' ? NaN : Number(value);
const decimal = (value: string) => value.trim() === '' ? null : Number(value.replace(',', '.'));

interface PeriodForm { id: string; gameDate: string; label: string; played: string; wins: string; draws: string; losses: string; goalsFor: string; goalsAgainst: string; setPieceFor: string; setPieceAgainst: string; xgFor: string; xgAgainst: string; notes: string }
const blankPeriod = (gameDate: string): PeriodForm => ({ id: '', gameDate, label: '', played: '', wins: '', draws: '', losses: '', goalsFor: '', goalsAgainst: '', setPieceFor: '', setPieceAgainst: '', xgFor: '', xgAgainst: '', notes: '' });
const periodToForm = (p: TacticPeriod): PeriodForm => ({ id: p.id, gameDate: p.gameDate, label: p.label, played: String(p.played), wins: String(p.wins), draws: String(p.draws), losses: String(p.losses), goalsFor: String(p.goalsFor), goalsAgainst: String(p.goalsAgainst), setPieceFor: String(p.setPieceFor), setPieceAgainst: String(p.setPieceAgainst), xgFor: p.xgFor === null ? '' : String(p.xgFor), xgAgainst: p.xgAgainst === null ? '' : String(p.xgAgainst), notes: p.notes });
const formToPeriod = (f: PeriodForm): TacticPeriod => ({ id: f.id || crypto.randomUUID(), gameDate: f.gameDate, label: f.label, played: whole(f.played), wins: whole(f.wins), draws: whole(f.draws), losses: whole(f.losses), goalsFor: whole(f.goalsFor), goalsAgainst: whole(f.goalsAgainst), setPieceFor: whole(f.setPieceFor), setPieceAgainst: whole(f.setPieceAgainst), xgFor: decimal(f.xgFor), xgAgainst: decimal(f.xgAgainst), notes: f.notes });
const periodFields: { key: keyof PeriodForm; label: string }[] = [{ key: 'played', label: 'Partidos' }, { key: 'wins', label: 'Victorias' }, { key: 'draws', label: 'Empates' }, { key: 'losses', label: 'Derrotas' }, { key: 'goalsFor', label: 'Goles a favor' }, { key: 'goalsAgainst', label: 'Goles en contra' }, { key: 'setPieceFor', label: 'A favor de balón parado' }, { key: 'setPieceAgainst', label: 'En contra de balón parado' }, { key: 'xgFor', label: 'xG a favor (opcional)' }, { key: 'xgAgainst', label: 'xG en contra (opcional)' }];

interface ChangeForm { id: string; gameDate: string; change: string; expected: string; result: string }
const blankChange = (gameDate: string): ChangeForm => ({ id: '', gameDate, change: '', expected: '', result: '' });

export default function TacticsPanel({ tactics, defaultDate, onSave }: { tactics: TacticsState | undefined; defaultDate: string; onSave: (tactics: TacticsState, message: string) => boolean }) {
  const current = tactics ?? emptyTactics();
  const [tab, setTab] = useState<Tab>('setup');
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(() => current);
  const [periodForm, setPeriodForm] = useState<PeriodForm | null>(null);
  const [changeForm, setChangeForm] = useState<ChangeForm | null>(null);
  // Una carga desde archivo o una copia restaurada sustituyen el borrador del esquema.
  useEffect(() => { setSetup(tactics ?? emptyTactics()); }, [tactics]);
  const total = useMemo(() => totalPeriods(current.periods), [current.periods]);
  const totalStats = periodStats(total);

  // Cualquier operación puede lanzar con un mensaje de validación: se muestra en la página, no se pierde.
  function run(change: () => TacticsState, message: string): boolean {
    try { const next = change(); setError(''); return onSave(next, message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); return false; }
  }
  const switchTab = (next: Tab) => { setTab(next); setError(''); };
  const dirty = JSON.stringify(setup) !== JSON.stringify(current);
  const editInstruction = (id: string, patch: Partial<TacticInstruction>) => setSetup({ ...setup, instructions: setup.instructions.map(i => i.id === id ? { ...i, ...patch } : i) });
  const addInstruction = (phase: TacticPhase) => setSetup({ ...setup, instructions: [...setup.instructions, { id: crypto.randomUUID(), phase, name: '', value: '' }] });

  return <section className="panel tracking-panel">
    <div className="section-heading"><div><h2>Táctica y resultados</h2><p>Registra cómo juegas y qué resultados da, para contrastar la táctica con datos en vez de sensaciones.</p></div></div>
    <div className="tracking-body">
      <div className="tabs tracking-tabs" aria-label="Secciones de táctica">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'selected' : ''} aria-pressed={tab === t.id} onClick={() => switchTab(t.id)}>{t.label}{t.id === 'results' && <span className="count-badge">{current.periods.length}</span>}{t.id === 'changes' && <span className="count-badge">{current.changes.length}</span>}</button>)}</div>
      {error && <p className="tracking-validation" role="alert">{error}</p>}

      {tab === 'setup' && <>
        {!hasTactics(current) && !dirty && <div className="tracking-callout"><b>Aún no has registrado tu táctica.</b> Puedes escribirla desde cero o cargar la que anotamos el 2026-11-01 (5-0-5 Onslaught, con las instrucciones de equipo con posesión) y corregirla a tu gusto.<div className="tracking-form-actions"><button className="button secondary compact" onClick={() => setSetup(seedTactics())}>Cargar mi táctica del 2026-11-01</button></div></div>}
        <div className="tracking-form-grid">
          <label>Esquema<input value={setup.formation} maxLength={80} placeholder="5-0-5 Onslaught" onChange={e => setSetup({ ...setup, formation: e.target.value })} /></label>
          <label>Estilo<input value={setup.style} maxLength={80} placeholder="Contrapresión" onChange={e => setSetup({ ...setup, style: e.target.value })} /></label>
          <label>Mentalidad<input value={setup.mentality} maxLength={80} placeholder="Positiva" onChange={e => setSetup({ ...setup, mentality: e.target.value })} /></label>
          <label className="tracking-full">Notas e hipótesis<textarea rows={5} value={setup.notes} maxLength={5000} placeholder="Qué intenta hacer la táctica y qué dudas tienes." onChange={e => setSetup({ ...setup, notes: e.target.value })} /></label>
        </div>
        {TACTIC_PHASES.map(phase => {
          const rows = setup.instructions.filter(i => i.phase === phase);
          return <div key={phase}>
            <h3>{PHASE_LABELS[phase]} <span className="count-badge">{rows.length}</span></h3>
            {rows.length > 0 && <div className="table-scroll"><table className="tracking-table"><thead><tr><th>INSTRUCCIÓN</th><th>VALOR</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map(i => <tr key={i.id}>
              <td><input aria-label="Nombre de la instrucción" value={i.name} maxLength={80} onChange={e => editInstruction(i.id, { name: e.target.value })} /></td>
              <td><input aria-label={`Valor de ${i.name || 'la instrucción'}`} value={i.value} maxLength={120} onChange={e => editInstruction(i.id, { value: e.target.value })} /></td>
              <td><div className="row-actions"><button className="icon-button danger" aria-label={`Quitar ${i.name || 'instrucción'}`} onClick={() => setSetup({ ...setup, instructions: setup.instructions.filter(x => x.id !== i.id) })}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
            {!rows.length && phase === 'noPossession' && <p className="tracking-help">Pendiente de registrar: las instrucciones sin posesión (contrapresión, línea defensiva, presión).</p>}
            <button className="text-button" onClick={() => addInstruction(phase)}><Plus size={15} /> Añadir instrucción</button>
          </div>;
        })}
        <div className="tracking-form-actions">
          {dirty && <button className="button secondary" onClick={() => { setSetup(current); setError(''); }}>Descartar cambios</button>}
          <button className="button primary" disabled={!dirty} onClick={() => run(() => saveSetup(current, setup), 'Táctica guardada.')}>Guardar táctica</button>
        </div>
      </>}

      {tab === 'results' && <>
        <p className="tracking-help">Cada fila resume los partidos jugados <b>desde el registro anterior</b>, no el acumulado de la temporada, para que los totales no cuenten dos veces. Los goles de balón parado y el xG salen de las estadísticas de equipo del juego.</p>
        {current.periods.length > 0 && <>
          <div className="tracking-stats">
            <div><span>Puntos por partido<b>{totalStats.perGame === null ? '—' : totalStats.perGame.toFixed(2)}</b></span></div>
            <div><span>Diferencia de goles<b>{signed(totalStats.goalDiff)}</b></span></div>
            <div><span>Goles a favor de balón parado<b>{percent(totalStats.setPieceShareFor)}</b></span></div>
          </div>
          <p className="tracking-help">{total.goalsFor ? `De ${total.goalsFor} goles a favor, ${total.setPieceFor} (${percent(totalStats.setPieceShareFor)}) vienen de balón parado` : 'Aún no has marcado'}{total.goalsAgainst ? `; de ${total.goalsAgainst} en contra, ${total.setPieceAgainst} (${percent(totalStats.setPieceShareAgainst)}).` : '.'} {total.played < 10 ? 'Con menos de 10 partidos la muestra es muy pequeña para decidir.' : 'Si el porcentaje a favor es bajo, ignorar el balón parado («Mantener el balón en juego») te cuesta poco.'}</p>
          <div className="table-scroll"><table className="tracking-table"><thead><tr><th>FECHA</th><th>PERIODO</th><th>PJ</th><th>G-E-P</th><th>PTS/PJ</th><th>GOLES</th><th>B. PARADO A FAVOR</th><th>B. PARADO EN CONTRA</th><th>xG DIF.</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{current.periods.map(p => { const s = periodStats(p); return <tr key={p.id}>
            <td>{dateLabel(p.gameDate)}</td><td><strong>{p.label}</strong>{p.notes && <small className="evaluation-reason">{p.notes}</small>}</td><td>{p.played}</td><td>{p.wins}-{p.draws}-{p.losses}</td><td>{s.perGame === null ? '—' : s.perGame.toFixed(2)}</td>
            <td>{p.goalsFor}-{p.goalsAgainst} <small className="evaluation-reason">{signed(s.goalDiff)}</small></td><td>{p.setPieceFor} de {p.goalsFor} <small className="evaluation-reason">{percent(s.setPieceShareFor)}</small></td><td>{p.setPieceAgainst} de {p.goalsAgainst} <small className="evaluation-reason">{percent(s.setPieceShareAgainst)}</small></td><td>{signed(s.xgDiff, 1)}</td>
            <td><div className="row-actions"><button className="icon-button" aria-label={`Editar ${p.label}`} onClick={() => { setError(''); setPeriodForm(periodToForm(p)); }}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`Eliminar ${p.label}`} onClick={() => { if (window.confirm(`Se eliminará el periodo «${p.label}».`)) run(() => removePeriod(current, p.id), 'Periodo eliminado.'); }}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>
        </>}
        {!current.periods.length && !periodForm && <div className="empty-state"><h3>Sin resultados todavía</h3><p>Añade tu primer periodo con los partidos jugados desde que empezaste con esta táctica.</p></div>}
        {periodForm
          ? <form className="minute-plan-form" onSubmit={e => { e.preventDefault(); if (run(() => upsertPeriod(current, formToPeriod(periodForm)), periodForm.id ? 'Periodo actualizado.' : 'Periodo guardado.')) setPeriodForm(null); }}>
            <h3>{periodForm.id ? 'Editar periodo' : 'Nuevo periodo'}</h3>
            <div className="tracking-form-grid">
              <label>Fecha de la partida<input type="date" value={periodForm.gameDate} onChange={e => setPeriodForm({ ...periodForm, gameDate: e.target.value })} /></label>
              <label className="tracking-full">Nombre del periodo<input value={periodForm.label} maxLength={80} placeholder="Agosto a octubre 2026" onChange={e => setPeriodForm({ ...periodForm, label: e.target.value })} /></label>
              {periodFields.map(f => <label key={f.key}>{f.label}<input inputMode="decimal" value={periodForm[f.key]} onChange={e => setPeriodForm({ ...periodForm, [f.key]: e.target.value })} /></label>)}
              <label className="tracking-full">Notas<textarea rows={2} value={periodForm.notes} maxLength={1000} onChange={e => setPeriodForm({ ...periodForm, notes: e.target.value })} /></label>
            </div>
            <div className="tracking-form-actions"><button type="button" className="button secondary" onClick={() => { setPeriodForm(null); setError(''); }}>Cancelar</button><button type="submit" className="button primary">Guardar periodo</button></div>
          </form>
          : <button className="button secondary compact" onClick={() => { setError(''); setPeriodForm(blankPeriod(defaultDate)); }}><Plus size={15} /> Añadir periodo</button>}
      </>}

      {tab === 'changes' && <>
        <p className="tracking-help">Antes de tocar una instrucción, anota qué esperas. Cuando haya pasado un tiempo, apunta el resultado: así sabes qué cambios funcionaron.</p>
        {current.changes.length > 0 && <div className="table-scroll"><table className="tracking-table"><thead><tr><th>FECHA</th><th>CAMBIO</th><th>ESPERADO</th><th>RESULTADO</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>{[...current.changes].reverse().map(c => <tr key={c.id}>
          <td>{dateLabel(c.gameDate)}</td><td><strong>{c.change}</strong></td><td>{c.expected || '—'}</td><td>{c.result || <small className="evaluation-reason">Pendiente</small>}</td>
          <td><div className="row-actions"><button className="icon-button" aria-label={`Editar el cambio «${c.change}»`} onClick={() => { setError(''); setChangeForm({ ...c }); }}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`Eliminar el cambio «${c.change}»`} onClick={() => { if (window.confirm('Se eliminará este cambio del registro.')) run(() => removeChange(current, c.id), 'Cambio eliminado.'); }}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
        {!current.changes.length && !changeForm && <div className="empty-state"><h3>Sin cambios registrados</h3><p>Anota el primer ajuste de táctica con lo que esperas conseguir.</p></div>}
        {changeForm
          ? <form className="minute-plan-form" onSubmit={e => { e.preventDefault(); const change: TacticChange = { ...changeForm, id: changeForm.id || crypto.randomUUID() }; if (run(() => upsertChange(current, change), changeForm.id ? 'Cambio actualizado.' : 'Cambio registrado.')) setChangeForm(null); }}>
            <h3>{changeForm.id ? 'Editar cambio' : 'Nuevo cambio'}</h3>
            <div className="tracking-form-grid">
              <label>Fecha de la partida<input type="date" value={changeForm.gameDate} onChange={e => setChangeForm({ ...changeForm, gameDate: e.target.value })} /></label>
              <label className="tracking-full">Qué cambias<input value={changeForm.change} maxLength={300} placeholder="Saques de puerta: de «En corto» a «Rápido»" onChange={e => setChangeForm({ ...changeForm, change: e.target.value })} /></label>
              <label className="tracking-full">Qué esperas<textarea rows={2} value={changeForm.expected} maxLength={500} onChange={e => setChangeForm({ ...changeForm, expected: e.target.value })} /></label>
              <label className="tracking-full">Qué pasó (puedes dejarlo para más adelante)<textarea rows={2} value={changeForm.result} maxLength={500} onChange={e => setChangeForm({ ...changeForm, result: e.target.value })} /></label>
            </div>
            <div className="tracking-form-actions"><button type="button" className="button secondary" onClick={() => { setChangeForm(null); setError(''); }}>Cancelar</button><button type="submit" className="button primary">Guardar cambio</button></div>
          </form>
          : <button className="button secondary compact" onClick={() => { setError(''); setChangeForm(blankChange(defaultDate)); }}><Plus size={15} /> Registrar cambio</button>}
      </>}
    </div>
    <p className="footnote">Registro personal para contrastar decisiones: ni los porcentajes ni las lecturas son datos oficiales de FM. Con pocos partidos, un solo resultado cambia mucho las cifras.</p>
  </section>;
}
