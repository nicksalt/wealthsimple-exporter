/**
 * Integration tests for transaction service
 * Tests with mocked fetch() to verify API interaction
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchAccounts, fetchTransactions } from '../../src/background/transactionService';
import {
  createMockAccount,
  createMockActivity,
  wrapInAccountsResponse,
  wrapInActivitiesResponse,
  mockTokenInfoResponse,
  mockBuyActivity,
  mockSellActivity,
  mockDepositActivity,
  mockRejectedActivity,
  mockLegacyTransfer,
} from '../fixtures/mockData';
import { generateCSV } from '../../src/utils/exporters';

describe('Transaction Service Integration Tests', () => {
  const mockToken = 'test-token-123';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchAccounts', () => {
    it('should fetch accounts with single page', async () => {
      const mockAccounts = [
        createMockAccount({ id: 'account-1', status: 'open' }),
        createMockAccount({ id: 'account-2', status: 'open' }),
      ];

      // Mock token info response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse(),
      });

      // Mock accounts response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInAccountsResponse(mockAccounts, false),
      });

      const result = await fetchAccounts(mockToken);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('account-1');
      expect(result[1].id).toBe('account-2');
      expect(fetchMock).toHaveBeenCalledTimes(2); // token info + accounts
    });

    it('should filter out closed accounts', async () => {
      const mockAccounts = [
        createMockAccount({ id: 'account-1', status: 'open' }),
        createMockAccount({ id: 'account-2', status: 'closed' }),
        createMockAccount({ id: 'account-3', status: 'open' }),
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse(),
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInAccountsResponse(mockAccounts, false),
      });

      const result = await fetchAccounts(mockToken);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('open');
      expect(result[1].status).toBe('open');
      expect(result.find((a) => a.id === 'account-2')).toBeUndefined();
    });

    it('should handle multi-page pagination', async () => {
      const page1Accounts = [
        createMockAccount({ id: 'account-1' }),
        createMockAccount({ id: 'account-2' }),
      ];
      const page2Accounts = [
        createMockAccount({ id: 'account-3' }),
        createMockAccount({ id: 'account-4' }),
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse(),
      });

      // First page with hasNextPage = true
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInAccountsResponse(page1Accounts, true, 'cursor-1'),
      });

      // Second page with hasNextPage = false
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInAccountsResponse(page2Accounts, false),
      });

      const result = await fetchAccounts(mockToken);

      expect(result).toHaveLength(4);
      expect(result.map((a) => a.id)).toEqual(['account-1', 'account-2', 'account-3', 'account-4']);
      expect(fetchMock).toHaveBeenCalledTimes(3); // token info + 2 pages
    });

    it('should throw error on GraphQL error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse(),
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Unauthorized' }],
        }),
      });

      await expect(fetchAccounts(mockToken)).rejects.toThrow('GraphQL error: Unauthorized');
    });

    it('should throw error on HTTP error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(fetchAccounts(mockToken)).rejects.toThrow('Failed to fetch identity ID: Unauthorized');
    });

    it('should pass correct headers to GraphQL endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse('identity-456'),
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInAccountsResponse([createMockAccount()], false),
      });

      await fetchAccounts(mockToken);

      const graphqlCall = fetchMock.mock.calls[1];
      expect(graphqlCall[0]).toBe('https://my.wealthsimple.com/graphql');
      expect(graphqlCall[1].method).toBe('POST');
      expect(graphqlCall[1].headers['Authorization']).toBe(`Bearer ${mockToken}`);
      expect(graphqlCall[1].headers['x-ws-profile']).toBe('trade');
      expect(graphqlCall[1].headers['x-ws-api-version']).toBe('12');
    });

    it('should use identityId from token info in GraphQL query', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse('custom-identity-id'),
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInAccountsResponse([createMockAccount()], false),
      });

      await fetchAccounts(mockToken);

      const graphqlCall = fetchMock.mock.calls[1];
      const body = JSON.parse(graphqlCall[1].body);
      expect(body.variables.identityId).toBe('custom-identity-id');
    });
  });

  describe('fetchTransactions', () => {
    it('should fetch and normalize transactions', async () => {
      const mockActivities = [mockBuyActivity, mockSellActivity, mockDepositActivity];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse(mockActivities, false),
      });

      const result = await fetchTransactions('account-123', mockToken);

      expect(result).toHaveLength(3);
      // Verify normalization happened (amount is now a number with correct sign)
      expect(result[0].amount).toBe(-1000.00); // Buy is DEBIT
      expect(result[1].amount).toBe(1500.00); // Sell is CREDIT
      expect(result[2].amount).toBe(500.00); // Deposit is CREDIT
    });

    it('should filter out rejected activities', async () => {
      const mockActivities = [mockBuyActivity, mockRejectedActivity, mockDepositActivity];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse(mockActivities, false),
      });

      const result = await fetchTransactions('account-123', mockToken);

      expect(result).toHaveLength(2);
      expect(result.find((t) => t.description.includes('rejected'))).toBeUndefined();
    });

    it('should filter out LEGACY_TRANSFER activities', async () => {
      const mockActivities = [mockBuyActivity, mockLegacyTransfer, mockDepositActivity];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse(mockActivities, false),
      });

      const result = await fetchTransactions('account-123', mockToken);

      expect(result).toHaveLength(2);
      expect(result[0].description).toContain('Buy');
      expect(result[1].description).toContain('Deposit');
    });

    it('should handle multi-page pagination', async () => {
      const page1 = [mockBuyActivity];
      const page2 = [mockSellActivity];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse(page1, true, 'cursor-1'),
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse(page2, false),
      });

      const result = await fetchTransactions('account-123', mockToken);

      expect(result).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should return empty array for no results', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse([], false),
      });

      const result = await fetchTransactions('account-123', mockToken);

      expect(result).toEqual([]);
    });

    it('should pass correct variables to GraphQL', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse([], false),
      });

      await fetchTransactions('account-123', mockToken, '2024-01-01', '2024-12-31');

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.operationName).toBe('FetchActivityFeedItems');
      expect(body.variables.first).toBe(50);
      expect(body.variables.orderBy).toBe('OCCURRED_AT_DESC');
      expect(body.variables.condition.accountIds).toEqual(['account-123']);
      expect(body.variables.condition.startDate).toBe('2024-01-01');
      expect(body.variables.condition.endDate).toBe('2024-12-31');
    });

    it('should use current date as endDate when not provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse([], false),
      });

      await fetchTransactions('account-123', mockToken, '2024-01-01');

      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);

      // Should have an endDate that's an ISO string
      expect(body.variables.condition.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should throw error on GraphQL error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Invalid account ID' }],
        }),
      });

      await expect(fetchTransactions('invalid-account', mockToken)).rejects.toThrow(
        'GraphQL error: Invalid account ID'
      );
    });
  });

  describe('End-to-end data flow', () => {
    it('should fetch accounts, then transactions, then generate CSV', async () => {
      // Mock accounts
      const mockAccounts = [createMockAccount({ id: 'tfsa-123', unifiedAccountType: 'TFSA' })];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenInfoResponse(),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInAccountsResponse(mockAccounts, false),
      });

      const accounts = await fetchAccounts(mockToken);
      expect(accounts).toHaveLength(1);

      // Mock transactions for the account
      const mockActivities = [
        createMockActivity({
          type: 'DIY_BUY',
          amountSign: 'DEBIT',
          amount: '1000.00',
          assetSymbol: 'AAPL',
          assetQuantity: '10',
          accountId: 'tfsa-123',
          occurredAt: '2024-01-15T10:00:00Z',
        }),
        createMockActivity({
          type: 'DIVIDEND',
          amountSign: 'CREDIT',
          amount: '25.50',
          assetSymbol: 'AAPL',
          accountId: 'tfsa-123',
          occurredAt: '2024-01-20T10:00:00Z',
        }),
      ];

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => wrapInActivitiesResponse(mockActivities, false),
      });

      const transactions = await fetchTransactions(accounts[0].id, mockToken);
      expect(transactions).toHaveLength(2);

      // Generate CSV
      const csv = generateCSV(transactions);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(3); // header + 2 rows
      expect(lines[0]).toBe('Date,Description,Amount,Currency,Category,Account');
      expect(lines[1]).toContain('2024-01-15');
      expect(lines[1]).toContain('Buy 10 x AAPL');
      expect(lines[1]).toContain('-1000.00');
      expect(lines[1]).toContain('Investment Buy');
      expect(lines[2]).toContain('2024-01-20');
      expect(lines[2]).toContain('Dividend: AAPL');
      expect(lines[2]).toContain('25.50');
      expect(lines[2]).toContain('Dividend');
    });
  });
});
