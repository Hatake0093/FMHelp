// Contratos e importes se incorporarán sin acoplarlos al modelo deportivo.
export interface PlayerContract {
  playerId: string;
  weeklyWage: number;
  estimatedValue: number;
  currency: 'GBP' | 'EUR';
  expiresOn: string;
}
