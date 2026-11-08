import test from 'node:test';
import assert from 'node:assert/strict';
import { FM_ATTRIBUTES, normalizeHeader } from '../src/domain/fm-data.ts';

// Cabeceras del exportador para porteros y balón parado: si dejan de reconocerse, los perfiles de portero vuelven a quedar pendientes.
test('el exportador de FM26 se reconoce en porteros y balón parado', () => {
  const expected: Record<string, string> = { 'Uno contra uno': 'oneOnOnes', 'Salidas (tendencia)': 'rushingOut', 'Saques de puerta': 'kicking', 'Saque con la mano': 'throwing', 'Tiros libres': 'freeKicks' };
  for (const [header, key] of Object.entries(expected)) {
    const match = FM_ATTRIBUTES.find(a => a.aliases.some(alias => normalizeHeader(alias) === normalizeHeader(header)));
    assert.equal(match?.key, key, header);
  }
});
