/**
 * Mock data factories for testing
 */

import type {
  Activity,
  Account,
  Connection,
  AccountsQueryResponse,
  ActivitiesQueryResponse,
  GraphQLResponse,
  AmountSign,
} from '../../src/utils/types';

/**
 * Create a mock Activity with defaults that can be overridden
 */
export function createMockActivity(overrides?: Partial<Activity>): Activity {
  return {
    accountId: 'account-123',
    aftOriginatorName: null,
    aftTransactionCategory: null,
    aftTransactionType: null,
    amount: '100.00',
    amountSign: 'CREDIT',
    assetQuantity: null,
    assetSymbol: null,
    canonicalId: 'activity-123',
    currency: 'CAD',
    eTransferEmail: null,
    eTransferName: null,
    externalCanonicalId: null,
    identityId: 'identity-123',
    institutionName: null,
    occurredAt: '2024-01-15T10:30:00Z',
    p2pHandle: null,
    p2pMessage: null,
    spendMerchant: null,
    securityId: null,
    billPayCompanyName: null,
    billPayPayeeNickname: null,
    redactedExternalAccountNumber: null,
    opposingAccountId: null,
    status: 'settled',
    subType: null,
    type: 'DEPOSIT',
    strikePrice: null,
    contractType: null,
    expiryDate: null,
    chequeNumber: null,
    provisionalCreditAmount: null,
    primaryBlocker: null,
    interestRate: null,
    frequency: null,
    counterAssetSymbol: null,
    rewardProgram: null,
    counterPartyCurrency: null,
    counterPartyCurrencyAmount: null,
    counterPartyName: null,
    fxRate: null,
    fees: null,
    reference: null,
    ...overrides,
  };
}

/**
 * Create a mock Account with defaults that can be overridden
 */
export function createMockAccount(overrides?: Partial<Account>): Account {
  return {
    id: 'account-123',
    branch: 'WS',
    currency: 'CAD',
    unifiedAccountType: 'TFSA',
    nickname: null,
    status: 'open',
    type: 'ca_tfsa',
    custodianAccounts: [],
    ...overrides,
  };
}

// --- Pre-built activity scenarios ---

export const mockBuyActivity: Activity = createMockActivity({
  type: 'DIY_BUY',
  amountSign: 'DEBIT',
  amount: '1000.00',
  assetSymbol: 'AAPL',
  assetQuantity: '10',
});

export const mockSellActivity: Activity = createMockActivity({
  type: 'DIY_SELL',
  amountSign: 'CREDIT',
  amount: '1500.00',
  assetSymbol: 'GOOGL',
  assetQuantity: '5',
});

export const mockDepositActivity: Activity = createMockActivity({
  type: 'DEPOSIT',
  subType: 'E_TRANSFER',
  amountSign: 'CREDIT',
  amount: '500.00',
  eTransferName: 'John Doe',
});

export const mockWithdrawalActivity: Activity = createMockActivity({
  type: 'WITHDRAWAL',
  subType: 'EFT',
  amountSign: 'DEBIT',
  amount: '250.00',
});

export const mockCreditCardPurchase: Activity = createMockActivity({
  type: 'CREDIT_CARD',
  subType: 'PURCHASE',
  amountSign: 'DEBIT',
  amount: '45.99',
  spendMerchant: 'Starbucks',
});

export const mockDividendActivity: Activity = createMockActivity({
  type: 'DIVIDEND',
  amountSign: 'CREDIT',
  amount: '12.50',
  assetSymbol: 'TD',
});

export const mockRejectedActivity: Activity = createMockActivity({
  type: 'DEPOSIT',
  status: 'rejected',
  amount: '100.00',
});

export const mockLegacyTransfer: Activity = createMockActivity({
  type: 'LEGACY_TRANSFER',
  amount: '100.00',
});

export const mockInternalTransfer: Activity = createMockActivity({
  type: 'INTERNAL_TRANSFER',
  subType: 'SOURCE',
  amountSign: 'DEBIT',
  amount: '1000.00',
  opposingAccountId: 'account-456',
});

export const mockNullAmountActivity: Activity = createMockActivity({
  type: 'DIVIDEND',
  amount: null,
  amountSign: null,
});

export const mockInterestActivity: Activity = createMockActivity({
  type: 'INTEREST',
  subType: null,
  amountSign: 'CREDIT',
  amount: '5.25',
});

// --- Response wrapper helpers ---

/**
 * Wrap accounts in a GraphQL connection structure
 */
export function wrapInAccountsResponse(
  accounts: Account[],
  hasNextPage = false,
  endCursor: string | null = null
): GraphQLResponse<AccountsQueryResponse> {
  return {
    data: {
      identity: {
        id: 'identity-123',
        accounts: {
          edges: accounts.map((account, i) => ({
            node: account,
            cursor: `cursor-${i}`,
          })),
          pageInfo: {
            hasNextPage,
            endCursor,
          },
        },
      },
    },
  };
}

/**
 * Wrap activities in a GraphQL connection structure
 */
export function wrapInActivitiesResponse(
  activities: Activity[],
  hasNextPage = false,
  endCursor: string | null = null
): GraphQLResponse<ActivitiesQueryResponse> {
  return {
    data: {
      activityFeedItems: {
        edges: activities.map((activity, i) => ({
          node: activity,
          cursor: `cursor-${i}`,
        })),
        pageInfo: {
          hasNextPage,
          endCursor,
        },
      },
    },
  };
}

/**
 * Mock token info response
 */
export function mockTokenInfoResponse(identityId = 'identity-123') {
  return {
    identity_canonical_id: identityId,
    access_token: 'mock-token',
    token_type: 'Bearer',
  };
}
