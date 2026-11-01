/**
 * Unit tests for CSV exporter
 */

import { describe, it, expect } from 'vitest';
import {
  generateCSV,
  generateOFX,
  generateQFX,
  generateExportFile,
  generateSignedCSV,
  EXPORT_FORMATS,
  isExportFormat,
} from '../../src/utils/exporters';
import { readFileSync } from 'node:fs';
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

describe('generateSignedCSV', () => {
  const outflow: NormalizedTransaction = {
    id: 's-1',
    date: '2024-03-01',
    description: 'Withdrawal: Bill pay Rogers, Inc',
    amount: -95.5,
    currency: 'CAD',
    category: 'Withdrawal',
    accountId: 'cash-123',
  };
  const inflow: NormalizedTransaction = {
    ...outflow,
    id: 's-2',
    description: 'Deposit: AFT Payroll',
    amount: 2500,
    category: 'Deposit',
  };

  it('uses a single signed Amount column', () => {
    const lines = generateSignedCSV([outflow, inflow]).split('\n');
    expect(lines[0]).toBe('Date,Payee,Memo,Amount');
    expect(lines[1]).toBe('2024-03-01,"Rogers, Inc",Withdrawal | cash-123,-95.50');
    expect(lines[2]).toBe('2024-03-01,Payroll,Deposit | cash-123,2500.00');
  });

  it('formats zero as a non-negative amount', () => {
    const zero = { ...outflow, amount: 0 };
    expect(generateSignedCSV([zero]).split('\n')[1]).toMatch(/,0\.00$/);
  });

  it('falls back to the signed trading layout for investment activity', () => {
    const buy: NormalizedTransaction = {
      ...outflow,
      description: 'Buy 2 x VFV',
      action: 'Buy',
      symbol: 'VFV',
      quantity: 2,
      price: 120,
      amount: -240,
    };
    expect(generateSignedCSV([buy])).toBe(generateCSV([buy]));
  });

  it('does not change the default CSV layout', () => {
    expect(generateCSV([outflow]).split('\n')[0]).toBe('Date,Payee,Memo,Outflow,Inflow');
  });

  it('is exported as a .csv file', () => {
    const file = generateExportFile([outflow], 'csv-signed', { accountId: 'cash-123' });
    expect(file.extension).toBe('csv');
    expect(file.mimeType).toBe('text/csv;charset=utf-8');
    expect(file.content.split('\n')[0]).toBe('Date,Payee,Memo,Amount');
  });
});

describe('export format validation', () => {
  it('accepts every existing saved preference value', () => {
    for (const format of ['csv', 'ofx', 'qfx', 'csv-signed']) {
      expect(isExportFormat(format)).toBe(true);
    }
  });

  it('rejects unknown values so callers fall back to CSV', () => {
    expect(isExportFormat('xlsx')).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
    expect(isExportFormat(null)).toBe(false);
  });

  it('keeps the content script format list in sync', () => {
    const content = readFileSync('src/content/index.ts', 'utf8');
    const match = content.match(/const EXPORT_FORMATS = \[(.*?)\] as const;/);
    expect(match).not.toBeNull();
    const contentFormats = match![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(contentFormats).toEqual([...EXPORT_FORMATS]);
  });

  it('offers every format in both the popup and the injected panel', () => {
    const popup = readFileSync('src/popup/index.html', 'utf8');
    const content = readFileSync('src/content/index.ts', 'utf8');
    for (const format of EXPORT_FORMATS) {
      expect(popup).toContain(`<option value="${format}">`);
      expect(content).toContain(`<option value="${format}">`);
    }
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

  describe('credit card statements', () => {
    const purchase: NormalizedTransaction = {
      id: 'cc-1',
      date: '2024-02-01',
      description: 'Starbucks',
      amount: -6.5,
      currency: 'CAD',
      category: 'Purchase',
      accountId: 'ca-credit-card-abc',
    };
    const payment: NormalizedTransaction = {
      ...purchase,
      id: 'cc-2',
      description: 'Credit card payment',
      amount: 200,
      category: 'Credit Card Payment',
    };

    it('uses credit card aggregates for credit card accounts', () => {
      const ofx = generateOFX([purchase, payment], { accountId: 'ca-credit-card-abc', accountType: 'CREDIT_CARD' });
      expect(ofx).toContain('<CREDITCARDMSGSRSV1>');
      expect(ofx).toContain('<CCSTMTTRNRS>');
      expect(ofx).toContain('<CCSTMTRS>');
      expect(ofx).toContain('<CCACCTFROM>\n<ACCTID>ca-credit-card-abc\n</CCACCTFROM>');
      expect(ofx).toContain('</CCSTMTRS>\n</CCSTMTTRNRS>\n</CREDITCARDMSGSRSV1>');
      expect(ofx).not.toContain('BANKMSGSRSV1');
      expect(ofx).not.toContain('BANKACCTFROM');
      expect(ofx).not.toContain('<ACCTTYPE>');
    });

    it('uses spec-valid DEBIT/CREDIT transaction types for card activity', () => {
      const ofx = generateOFX([purchase, payment], { accountId: 'ca-credit-card-abc', accountType: 'CREDIT_CARD' });
      expect(ofx).toContain('<TRNTYPE>DEBIT\n<DTPOSTED>20240201120000\n<TRNAMT>-6.50');
      expect(ofx).toContain('<TRNTYPE>CREDIT\n<DTPOSTED>20240201120000\n<TRNAMT>200.00');
      expect(ofx).not.toContain('<TRNTYPE>WITHDRAWAL');
    });

    it('detects credit cards from the account ID when the type is missing', () => {
      const ofx = generateOFX([purchase], { accountId: 'ca-credit-card-abc' });
      expect(ofx).toContain('<CREDITCARDMSGSRSV1>');
    });

    it('keeps FITIDs identical to bank-style output so re-imports dedupe', () => {
      const card = generateOFX([purchase], { accountId: 'ca-credit-card-abc', accountType: 'CREDIT_CARD' });
      const bank = generateOFX([purchase], { accountId: 'cash-123', accountType: 'CASH' });
      expect(card).toContain('<FITID>cc-1');
      expect(bank).toContain('<FITID>cc-1');
    });

    it('applies the credit card structure to QFX too', () => {
      const qfx = generateQFX([purchase], { accountId: 'ca-credit-card-abc', accountType: 'CREDIT_CARD' });
      expect(qfx).toContain('<INTU.BID>');
      expect(qfx).toContain('<CCSTMTRS>');
    });

    it('does not treat a non-card credit account as a credit card', () => {
      const ofx = generateOFX([purchase], { accountId: 'loc-1', accountType: 'LINE_OF_CREDIT' });
      expect(ofx).toContain('<BANKMSGSRSV1>');
      expect(ofx).toContain('<ACCTTYPE>CREDITLINE');
    });
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
