/**
 * Backward-compatibility guard for export formats.
 * Snapshots were recorded against v0.1.2 output; existing formats for these
 * account types must stay byte-identical so users' importers keep working.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { generateExportFile } from '../../src/utils/exporters';
import type { NormalizedTransaction } from '../../src/utils/types';

const chequingTransactions: NormalizedTransaction[] = [
  { id: 'c-1', date: '2026-01-02', description: 'Deposit: AFT Payroll Inc', amount: 2500, currency: 'CAD', category: 'Deposit', accountId: 'ca-cash-1' },
  { id: 'c-2', date: '2026-01-03', description: 'Withdrawal: Bill pay Rogers', amount: -95.5, currency: 'CAD', category: 'Withdrawal', accountId: 'ca-cash-1' },
  { id: 'c-3', date: '2026-01-04', description: 'Transfer to TFSA', amount: -500, currency: 'CAD', category: 'Transfer', action: 'Transfer', accountId: 'ca-cash-1' },
  { id: 'c-4', date: '2026-01-05', description: 'Tim Hortons, "Downtown"', amount: -4.25, currency: 'CAD', category: 'Other', accountId: 'ca-cash-1' },
  { id: 'c-5', date: '2026-01-06', description: 'Interest', amount: 3.1, currency: 'CAD', category: 'Interest', accountId: 'ca-cash-1' },
  { id: 'c-6', date: '2026-01-07', description: 'Management fee', amount: -1, currency: 'CAD', category: 'Fee', accountId: 'ca-cash-1' },
];

const tradingTransactions: NormalizedTransaction[] = [
  { id: 't-1', date: '2026-01-02', description: 'Buy 10 x VFV', amount: -1200, currency: 'CAD', category: 'Investment Buy', action: 'Buy', symbol: 'VFV', quantity: 10, price: 120, accountId: 'tfsa-1' },
  { id: 't-2', date: '2026-01-03', description: 'Dividend: VFV', amount: 12.34, currency: 'CAD', category: 'Dividend', action: 'Dividend', symbol: 'VFV', accountId: 'tfsa-1' },
];

describe('export backward compatibility', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const cashOptions = { accountId: 'ca-cash-1', accountType: 'CASH', currency: 'CAD', org: 'WEALTHSIMPLE', fid: '1001' };
  const lineOfCreditOptions = { ...cashOptions, accountId: 'loc-1', accountType: 'LINE_OF_CREDIT' };
  const tradingOptions = { accountId: 'tfsa-1', accountType: 'TFSA', currency: 'CAD', org: 'WEALTHSIMPLE', fid: '1001' };

  it('keeps budgeting CSV unchanged', () => {
    expect(generateExportFile(chequingTransactions, 'csv', cashOptions).content).toMatchSnapshot();
  });

  it('keeps trading CSV unchanged', () => {
    expect(generateExportFile(tradingTransactions, 'csv', tradingOptions).content).toMatchSnapshot();
  });

  it('keeps chequing OFX unchanged', () => {
    expect(generateExportFile(chequingTransactions, 'ofx', cashOptions).content).toMatchSnapshot();
  });

  it('keeps chequing QFX unchanged', () => {
    expect(generateExportFile(chequingTransactions, 'qfx', cashOptions).content).toMatchSnapshot();
  });

  it('keeps non-card credit account OFX unchanged', () => {
    expect(generateExportFile(chequingTransactions, 'ofx', lineOfCreditOptions).content).toMatchSnapshot();
  });
});
