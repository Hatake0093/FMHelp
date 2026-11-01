import type { DynastyState, PlayerDraft } from '../../domain/model.ts';
import { evaluateSquad, GROUP_LABELS } from '../../domain/players.ts';
import { evaluateYouth, SQUAD_LABELS, YOUTH_STATUS_LABELS } from '../../domain/squads.ts';

// Punto de extensión para futuros adaptadores CSV/HTML/Excel de Football Manager.
export interface PlayerImportAdapter {
  format: string;
  parse: (source: string) => { players: PlayerDraft[]; warnings: string[] };
}

function download(content: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBackup(state: DynastyState) {
  download(JSON.stringify(state, null, 2), 'application/json', 'chippenham-partida.json');
}

export function csvCell(value: string | number): string {
  const text = String(value);
  // Neutraliza fórmulas al abrir nombres/notas en una hoja de cálculo.
  const safe = /^[=+@\-\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCSVRows(state: DynastyState): (string | number)[][] {
  const extraHeaders = [...new Set(state.players.flatMap(p => Object.keys(p.fm?.values ?? {})))];
  return [
    ['Nombre', 'Edad', 'Posición', 'CA', 'PA', 'Grupo', 'Motivo', 'Notas', 'Unique ID', 'Partida FM', 'Plantilla', ...extraHeaders.map(h => `FM · ${h}`)],
    ...evaluateSquad(state.players, state.stageId).map(e => [e.player.name, e.player.age, e.player.position, e.player.ca, e.player.pa, GROUP_LABELS[e.group], e.reason, e.player.notes, e.player.fm?.uniqueId ?? '', e.player.fm?.saveId ?? '', SQUAD_LABELS.first, ...extraHeaders.map(h => e.player.fm?.values[h] ?? '')]),
    // Los juveniles se evalúan por camino de ascenso, no con los cupos del primer equipo.
    ...(['u21', 'u18'] as const).flatMap(squad => evaluateYouth(state.players, squad, state.stageId).map(e => [e.player.name, e.player.age, e.player.position, e.player.ca, e.player.pa, YOUTH_STATUS_LABELS[e.status], e.reason, e.player.notes, e.player.fm?.uniqueId ?? '', e.player.fm?.saveId ?? '', SQUAD_LABELS[squad], ...extraHeaders.map(h => e.player.fm?.values[h] ?? '')])),
  ];
}

export function exportCSV(state: DynastyState) {
  const rows = buildCSVRows(state);
  download('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8', 'chippenham-plantilla.csv');
}
