/**
 * Unit tests for CSV exporter
 */

import { describe, it, expect } from 'vitest';
import {
  generateCSV,
  generateOFX,
  generateQFX,
  generateExportFile,
} from '../../src/utils/exporters';
import { generateFitId } from '../../src/utils/exporters/ofx';
import type { NormalizedTransaction } from '../../src/utils/types';

describe('generateCSV', () => {
  const mockTransaction: NormalizedTransaction = {
    id: 'txn-123',
    date: '2024-01-15',
    description: 'Test transaction',
    amount: 100.50,
    currency: 'CAD',
    category: 'Deposit',
    accountId: 'account-123',
  };

  describe('Headers', () => {
    it('should include correct headers', () => {
      const csv = generateCSV([]);
      expect(csv).toBe('Date,Payee,Memo,Outflow,Inflow');
    });

    it('should have headers as first line when transactions exist', () => {
      const csv = generateCSV([mockTransaction]);
      const lines = csv.split('\n');
      expect(lines[0]).toBe('Date,Payee,Memo,Outflow,Inflow');
    });
  });

  describe('Empty array', () => {
    it('should return only headers for empty array', () => {
      const csv = generateCSV([]);
      expect(csv).toBe('Date,Payee,Memo,Outflow,Inflow');
      expect(csv.split('\n')).toHaveLength(1);
    });
  });

  describe('Single transaction', () => {
    it('should generate header + 1 data row', () => {
      const csv = generateCSV([mockTransaction]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('Date,Payee,Memo,Outflow,Inflow');
      expect(lines[1]).toBe('2024-01-15,Test transaction,Deposit | account-123,,100.50');
    });
  });

  describe('Multiple transactions', () => {
    it('should generate correct number of rows', () => {
      const transactions: NormalizedTransaction[] = [
        { ...mockTransaction, date: '2024-01-15', amount: 100 },
        { ...mockTransaction, date: '2024-01-16', amount: 200 },
        { ...mockTransaction, date: '2024-01-17', amount: 300 },
      ];
      const csv = generateCSV(transactions);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(4); // 1 header + 3 rows
    });
  });

  describe('Amount formatting', () => {
    it('should format positive amounts to 2 decimal places', () => {
      const transaction = { ...mockTransaction, amount: 100.5 };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('100.50');
    });

    it('should format negative amounts to 2 decimal places', () => {
      const transaction = { ...mockTransaction, amount: -100.5 };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('100.50,');
    });

    it('should format zero correctly', () => {
      const transaction = { ...mockTransaction, amount: 0 };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('0.00');
    });

    it('should round to 2 decimal places', () => {
      const transaction = { ...mockTransaction, amount: 1234.999 };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('1235.00');
    });
  });

  describe('CSV escaping', () => {
    it('should escape description with commas', () => {
      const transaction = {
        ...mockTransaction,
        description: 'Buy 10 x AAPL, Holdings Inc',
      };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('"Buy 10 x AAPL, Holdings Inc"');
    });

    it('should escape description with double quotes', () => {
      const transaction = {
        ...mockTransaction,
        description: 'Merchant "Best Store"',
      };
      const csv = generateCSV([transaction]);
      // Double quotes should be escaped by doubling them
      expect(csv).toContain('"Merchant ""Best Store"""');
    });

    it('should escape description with newlines', () => {
      const transaction = {
        ...mockTransaction,
        description: 'Line 1\nLine 2',
      };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('"Line 1\nLine 2"');
    });

    it('should escape category with commas', () => {
      const transaction = {
        ...mockTransaction,
        category: 'Investment Buy, Long-term',
      };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('"Investment Buy, Long-term | account-123"');
    });

    it('should not escape plain text fields', () => {
      const transaction = {
        ...mockTransaction,
        description: 'Simple description',
      };
      const csv = generateCSV([transaction]);
      const lines = csv.split('\n');
      // Should not have quotes around "Simple description"
      expect(lines[1]).toBe('2024-01-15,Simple description,Deposit | account-123,,100.50');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle credit card purchase with merchant name containing comma', () => {
      const transaction: NormalizedTransaction = {
        id: 'txn-456',
        date: '2024-01-15',
        description: 'Credit card purchase: Starbucks, Downtown',
        amount: -45.99,
        currency: 'CAD',
        category: 'Purchase',
        accountId: 'account-123',
      };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('"Starbucks, Downtown"');
      expect(csv).toContain('45.99,');
    });

    it('should handle buy transaction', () => {
      const transaction: NormalizedTransaction = {
        id: 'txn-789',
        date: '2024-01-15',
        description: 'Buy 10 x AAPL',
        amount: -1000.00,
        currency: 'USD',
        category: 'Investment Buy',
        accountId: 'tfsa-123',
      };
      const csv = generateCSV([transaction]);
      const lines = csv.split('\n');
      expect(lines[1]).toBe('2024-01-15,Buy 10 x AAPL,Investment Buy | tfsa-123,1000.00,');
    });

    it('should handle dividend transaction', () => {
      const transaction: NormalizedTransaction = {
        id: 'txn-101',
        date: '2024-01-15',
        description: 'Dividend: TD',
        amount: 12.50,
        currency: 'CAD',
        category: 'Dividend',
        accountId: 'rrsp-456',
      };
      const csv = generateCSV([transaction]);
      const lines = csv.split('\n');
      expect(lines[1]).toBe('2024-01-15,Dividend: TD,Dividend | rrsp-456,,12.50');
    });
  });

  describe('Edge cases', () => {
    it('should handle very large amounts', () => {
      const transaction = { ...mockTransaction, amount: 1000000.99 };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('1000000.99');
    });

    it('should handle very small negative amounts', () => {
      const transaction = { ...mockTransaction, amount: -0.01 };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('0.01,');
    });

    it('should handle description with multiple special characters', () => {
      const transaction = {
        ...mockTransaction,
        description: 'Transfer: "Special, Account"\nWith newline',
      };
      const csv = generateCSV([transaction]);
      expect(csv).toContain('"Transfer: ""Special, Account""\nWith newline"');
    });
  });
});

describe('OFX/QFX exporters', () => {
  const transaction: NormalizedTransaction = {
    id: 'txn-100',
    date: '2024-01-15',
    description: 'Deposit: Payroll',
    amount: 1500,
    currency: 'CAD',
    category: 'Deposit',
    accountId: 'cash-123',
  };

  it('should generate OFX with required SGML headers', () => {
    const ofx = generateOFX([transaction], { accountId: 'cash-123' });
    expect(ofx).toContain('DATA:OFXSGML');
    expect(ofx).toContain('VERSION:102');
    expect(ofx).toContain('<OFX>');
    expect(ofx).toContain('<FITID>txn-100');
  });

  it('should map transaction categories to TRNTYPE', () => {
    const withdrawal = { ...transaction, id: 'txn-101', amount: -20, category: 'Withdrawal' };
    const transferOut = { ...transaction, id: 'txn-102', amount: -100, category: 'Transfer' };
    const transferIn = { ...transaction, id: 'txn-103', amount: 100, category: 'Transfer' };

    const ofx = generateOFX([transaction, withdrawal, transferOut, transferIn], { accountId: 'cash-123' });
    expect(ofx).toContain('<TRNTYPE>DEP');
    expect(ofx).toContain('<TRNTYPE>WITHDRAWAL');
    expect(ofx).toContain('<TRNTYPE>DEBIT');
    expect(ofx).toContain('<TRNTYPE>CREDIT');
  });

  it('should generate deterministic and account-safe FITID for internal transfers', () => {
    const sourceTransfer = {
      ...transaction,
      id: 'transfer-1',
      category: 'Transfer',
      description: 'Transfer to savings',
      amount: -500,
      accountId: 'account-source',
    };
    const destinationTransfer = {
      ...sourceTransfer,
      amount: 500,
      accountId: 'account-destination',
      description: 'Transfer from chequing',
    };

    const sourceFitIdA = generateFitId(sourceTransfer);
    const sourceFitIdB = generateFitId(sourceTransfer);
    const destinationFitId = generateFitId(destinationTransfer);

    expect(sourceFitIdA).toBe(sourceFitIdB);
    expect(sourceFitIdA).not.toBe(destinationFitId);
    expect(sourceFitIdA).toMatch(/^transfer-1-/);
  });

  it('should generate QFX with Quicken-compatible FI block', () => {
    const qfx = generateQFX([transaction], { accountId: 'cash-123', fid: '2000' });
    expect(qfx).toContain('<INTU.BID>2000');
    expect(qfx).toContain('<FID>2000');
  });

  it('should normalize OFX name field using CSV payee rules', () => {
    const normalized: NormalizedTransaction = {
      ...transaction,
      description: 'Deposit: AFT Payroll Inc',
    };

    const ofx = generateOFX([normalized], { accountId: 'cash-123' });
    expect(ofx).toContain('<NAME>Payroll Inc');
    expect(ofx).not.toContain('<NAME>Deposit: AFT Payroll Inc');
  });

  it('should normalize QFX name field using CSV payee rules', () => {
    const normalized: NormalizedTransaction = {
      ...transaction,
      description: 'Withdrawal: EFT Utility Co',
      amount: -80,
      category: 'Withdrawal',
    };

    const qfx = generateQFX([normalized], { accountId: 'cash-123' });
    expect(qfx).toContain('<NAME>Utility Co');
    expect(qfx).not.toContain('<NAME>Withdrawal: EFT Utility Co');
  });

  it('should dispatch export content and extension by format', () => {
    const csv = generateExportFile([transaction], 'csv', { accountId: 'cash-123' });
    const ofx = generateExportFile([transaction], 'ofx', { accountId: 'cash-123' });
    const qfx = generateExportFile([transaction], 'qfx', { accountId: 'cash-123' });

    expect(csv.extension).toBe('csv');
    expect(ofx.extension).toBe('ofx');
    expect(qfx.extension).toBe('qfx');
    expect(ofx.content).toContain('<OFX>');
    expect(qfx.content).toContain('<INTU.BID>');
  });
});
