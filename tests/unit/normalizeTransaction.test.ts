/**
 * Unit tests for normalizeTransaction function
 * Tests the critical amount sign logic and description generation
 */

import { describe, it, expect } from 'vitest';
import { normalizeTransaction } from '../../src/background/transactionService';
import {
  createMockActivity,
  mockBuyActivity,
  mockSellActivity,
  mockDepositActivity,
  mockWithdrawalActivity,
  mockCreditCardPurchase,
  mockDividendActivity,
  mockInternalTransfer,
  mockNullAmountActivity,
  mockInterestActivity,
} from '../fixtures/mockData';

describe('normalizeTransaction', () => {
  describe('Amount sign logic (CRITICAL)', () => {
    it('should make DEBIT amounts negative', () => {
      const activity = createMockActivity({
        amount: '100.50',
        amountSign: 'DEBIT',
      });
      const result = normalizeTransaction(activity);
      expect(result.amount).toBe(-100.50);
      expect(result.id).toBe(activity.canonicalId);
    });

    it('should make CREDIT amounts positive', () => {
      const activity = createMockActivity({
        amount: '500.00',
        amountSign: 'CREDIT',
      });
      const result = normalizeTransaction(activity);
      expect(result.amount).toBe(500.00);
      expect(result.id).toBe(activity.canonicalId);
    });

    it('should handle null amountSign by keeping amount as-is', () => {
      const activity = createMockActivity({
        amount: '100.00',
        amountSign: null,
      });
      const result = normalizeTransaction(activity);
      expect(result.amount).toBe(100.00);
      expect(result.id).toBe(activity.canonicalId);
    });

    it('should handle null amount as 0', () => {
      const result = normalizeTransaction(mockNullAmountActivity);
      expect(result.amount).toBe(0);
    });

    it('should handle malformed amount string as 0', () => {
      const activity = createMockActivity({
        amount: 'invalid',
        amountSign: 'CREDIT',
      });
      const result = normalizeTransaction(activity);
      expect(result.amount).toBe(0);
    });

    it('should handle zero amount correctly', () => {
      const activity = createMockActivity({
        amount: '0',
        amountSign: 'DEBIT',
      });
      const result = normalizeTransaction(activity);
      expect(result.amount).toBe(0);
    });

    it('should always use absolute value for DEBIT', () => {
      const activity = createMockActivity({
        amount: '-100.00', // API shouldn't return negative, but test robustness
        amountSign: 'DEBIT',
      });
      const result = normalizeTransaction(activity);
      expect(result.amount).toBe(-100.00);
    });

    it('should always use absolute value for CREDIT', () => {
      const activity = createMockActivity({
        amount: '-100.00',
        amountSign: 'CREDIT',
      });
      const result = normalizeTransaction(activity);
      expect(result.amount).toBe(100.00);
    });
  });

  describe('Description generation', () => {
    it('should generate description for DIY_BUY with quantity', () => {
      const result = normalizeTransaction(mockBuyActivity);
      expect(result.description).toBe('Buy 10 x AAPL');
    });

    it('should generate description for DIY_BUY without quantity', () => {
      const activity = createMockActivity({
        type: 'DIY_BUY',
        assetSymbol: 'TSLA',
        assetQuantity: null,
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Buy TSLA');
    });

    it('should generate description for DIY_SELL', () => {
      const result = normalizeTransaction(mockSellActivity);
      expect(result.description).toBe('Sell 5 x GOOGL');
    });

    it('should generate description for DEPOSIT with E_TRANSFER', () => {
      const result = normalizeTransaction(mockDepositActivity);
      expect(result.description).toBe('Deposit: e-Transfer John Doe');
    });

    it('should generate description for DEPOSIT with E_TRANSFER and no name', () => {
      const activity = createMockActivity({
        type: 'DEPOSIT',
        subType: 'E_TRANSFER',
        eTransferName: null,
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Deposit: e-Transfer');
    });

    it('should generate description for WITHDRAWAL with EFT', () => {
      const result = normalizeTransaction(mockWithdrawalActivity);
      expect(result.description).toBe('Withdrawal: EFT');
    });

    it('should generate description for DEPOSIT with AFT', () => {
      const activity = createMockActivity({
        type: 'DEPOSIT',
        subType: 'AFT',
        aftOriginatorName: 'RBC',
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Deposit: AFT RBC');
    });

    it('should generate description for WITHDRAWAL with BILL_PAY', () => {
      const activity = createMockActivity({
        type: 'WITHDRAWAL',
        subType: 'BILL_PAY',
        billPayCompanyName: 'Rogers',
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Withdrawal: Bill pay Rogers');
    });

    it('should generate description for CREDIT_CARD PURCHASE', () => {
      const result = normalizeTransaction(mockCreditCardPurchase);
      expect(result.description).toBe('Starbucks');
    });

    it('should generate description for CREDIT_CARD PAYMENT', () => {
      const activity = createMockActivity({
        type: 'CREDIT_CARD',
        subType: 'PAYMENT',
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Credit card payment');
    });

    it('should generate description for INTERNAL_TRANSFER SOURCE', () => {
      const result = normalizeTransaction(mockInternalTransfer);
      expect(result.description).toBe('Transfer to account-456');
    });

    it('should generate description for INTERNAL_TRANSFER DESTINATION', () => {
      const activity = createMockActivity({
        type: 'INTERNAL_TRANSFER',
        subType: 'DESTINATION',
        opposingAccountId: 'account-789',
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Transfer from account-789');
    });

    it('should generate description for DIVIDEND', () => {
      const result = normalizeTransaction(mockDividendActivity);
      expect(result.description).toBe('Dividend: TD');
    });

    it('should generate description for INTEREST', () => {
      const result = normalizeTransaction(mockInterestActivity);
      expect(result.description).toBe('Interest');
    });

    it('should generate description for FEE', () => {
      const activity = createMockActivity({ type: 'FEE' });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Management fee');
    });

    it('should generate description for P2P_PAYMENT SEND', () => {
      const activity = createMockActivity({
        type: 'P2P_PAYMENT',
        subType: 'SEND',
        p2pHandle: '@john',
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('Cash sent to @john');
    });

    it('should generate fallback description for unknown type', () => {
      const activity = createMockActivity({
        type: 'UNKNOWN_TYPE',
        subType: 'UNKNOWN_SUBTYPE',
      });
      const result = normalizeTransaction(activity);
      expect(result.description).toBe('UNKNOWN_TYPE: UNKNOWN_SUBTYPE');
    });
  });

  describe('Category derivation', () => {
    it('should categorize DIY_BUY as Investment Buy', () => {
      const result = normalizeTransaction(mockBuyActivity);
      expect(result.category).toBe('Investment Buy');
    });

    it('should categorize DIY_SELL as Investment Sell', () => {
      const result = normalizeTransaction(mockSellActivity);
      expect(result.category).toBe('Investment Sell');
    });

    it('should categorize DEPOSIT as Deposit', () => {
      const result = normalizeTransaction(mockDepositActivity);
      expect(result.category).toBe('Deposit');
    });

    it('should categorize WITHDRAWAL as Withdrawal', () => {
      const result = normalizeTransaction(mockWithdrawalActivity);
      expect(result.category).toBe('Withdrawal');
    });

    it('should categorize DIVIDEND as Dividend', () => {
      const result = normalizeTransaction(mockDividendActivity);
      expect(result.category).toBe('Dividend');
    });

    it('should categorize INTEREST as Interest', () => {
      const result = normalizeTransaction(mockInterestActivity);
      expect(result.category).toBe('Interest');
    });

    it('should categorize INTERNAL_TRANSFER as Transfer', () => {
      const result = normalizeTransaction(mockInternalTransfer);
      expect(result.category).toBe('Transfer');
    });

    it('should categorize CREDIT_CARD PURCHASE as Purchase', () => {
      const result = normalizeTransaction(mockCreditCardPurchase);
      expect(result.category).toBe('Purchase');
    });

    it('should categorize CREDIT_CARD PAYMENT as Credit Card Payment', () => {
      const activity = createMockActivity({
        type: 'CREDIT_CARD',
        subType: 'PAYMENT',
      });
      const result = normalizeTransaction(activity);
      expect(result.category).toBe('Credit Card Payment');
    });

    it('should categorize FEE as Fee', () => {
      const activity = createMockActivity({ type: 'FEE' });
      const result = normalizeTransaction(activity);
      expect(result.category).toBe('Fee');
    });

    it('should categorize unknown types as Other', () => {
      const activity = createMockActivity({ type: 'UNKNOWN' });
      const result = normalizeTransaction(activity);
      expect(result.category).toBe('Other');
    });
  });

  describe('Date parsing', () => {
    it('should extract YYYY-MM-DD from ISO timestamp', () => {
      const activity = createMockActivity({
        occurredAt: '2024-01-15T10:30:00Z',
      });
      const result = normalizeTransaction(activity);
      expect(result.date).toBe('2024-01-15');
    });

    it('should handle different ISO formats', () => {
      const activity = createMockActivity({
        occurredAt: '2023-12-25T23:59:59.999Z',
      });
      const result = normalizeTransaction(activity);
      expect(result.date).toBe('2023-12-25');
    });
  });

  describe('Currency handling', () => {
    it('should use activity currency when present', () => {
      const activity = createMockActivity({
        currency: 'USD',
      });
      const result = normalizeTransaction(activity);
      expect(result.currency).toBe('USD');
    });

    it('should default to CAD when currency is null', () => {
      const activity = createMockActivity({
        currency: null,
      });
      const result = normalizeTransaction(activity);
      expect(result.currency).toBe('CAD');
    });
  });

  describe('Account ID', () => {
    it('should preserve accountId', () => {
      const activity = createMockActivity({
        accountId: 'test-account-123',
      });
      const result = normalizeTransaction(activity);
      expect(result.accountId).toBe('test-account-123');
    });
  });
});
