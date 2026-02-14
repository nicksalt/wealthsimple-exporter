/**
 * Unit tests for GraphQL queries
 */

import { describe, it, expect } from 'vitest';
import { FETCH_ALL_ACCOUNT_FINANCIALS, FETCH_ACTIVITY_FEED_ITEMS } from '../../src/utils/queries';

describe('GraphQL Queries', () => {
  describe('FETCH_ALL_ACCOUNT_FINANCIALS', () => {
    it('should be a non-empty string', () => {
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toBeTruthy();
      expect(typeof FETCH_ALL_ACCOUNT_FINANCIALS).toBe('string');
      expect(FETCH_ALL_ACCOUNT_FINANCIALS.length).toBeGreaterThan(0);
    });

    it('should contain the operation name', () => {
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toContain('FetchAllAccountFinancials');
    });

    it('should contain key fragments', () => {
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toContain('fragment AccountCore');
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toContain('fragment Money');
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toContain('fragment AccountFinancials');
    });

    it('should contain pagination fields', () => {
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toContain('pageInfo');
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toContain('hasNextPage');
      expect(FETCH_ALL_ACCOUNT_FINANCIALS).toContain('endCursor');
    });
  });

  describe('FETCH_ACTIVITY_FEED_ITEMS', () => {
    it('should be a non-empty string', () => {
      expect(FETCH_ACTIVITY_FEED_ITEMS).toBeTruthy();
      expect(typeof FETCH_ACTIVITY_FEED_ITEMS).toBe('string');
      expect(FETCH_ACTIVITY_FEED_ITEMS.length).toBeGreaterThan(0);
    });

    it('should contain the operation name', () => {
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('FetchActivityFeedItems');
    });

    it('should contain the Activity fragment', () => {
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('fragment Activity');
    });

    it('should contain critical fields', () => {
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('amountSign');
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('amount');
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('accountId');
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('occurredAt');
    });

    it('should contain pagination fields', () => {
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('pageInfo');
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('hasNextPage');
      expect(FETCH_ACTIVITY_FEED_ITEMS).toContain('endCursor');
    });
  });
});
