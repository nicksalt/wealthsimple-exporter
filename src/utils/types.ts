/**
 * TypeScript type definitions for Wealthsimple API
 * Ported from Python reference GraphQL responses
 */

// --- GraphQL primitive types ---

export interface Money {
  amount: number;
  cents: number;
  currency: string;
}

// --- Pagination types ---

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Edge<T> {
  node: T;
  cursor?: string;
}

export interface Connection<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
}

// --- Account types ---

export interface CustodianAccount {
  id: string;
  branch: string;
  custodian?: string;
  status: string;
  updatedAt?: string;
  financials?: {
    current?: {
      deposits?: Money;
      earnings?: Money;
      netDeposits?: Money;
      netLiquidationValue?: Money;
      withdrawals?: Money;
    };
  };
}

export interface AccountFinancials {
  currentCombined?: {
    id: string;
    netLiquidationValue?: Money;
    netDeposits?: Money;
    totalDeposits?: Money;
    totalWithdrawals?: Money;
  };
}

export interface Account {
  id: string;
  branch?: string;
  currency: string;
  unifiedAccountType: string;
  nickname: string | null;
  status: string;
  type: string;
  accountOwnerConfiguration?: string;
  accountFeatures?: Array<{ name: string; enabled: boolean }>;
  custodianAccounts: CustodianAccount[];
  financials?: AccountFinancials;
  // Added by formatting logic (not from API directly)
  description?: string;
  number?: string;
}

// --- Activity types ---

export type AmountSign = 'DEBIT' | 'CREDIT' | null;

export interface Activity {
  accountId: string;
  aftOriginatorName: string | null;
  aftTransactionCategory: string | null;
  aftTransactionType: string | null;
  amount: string | null; // API returns as string
  amountSign: AmountSign;
  assetQuantity: string | null; // API returns as string
  assetSymbol: string | null;
  canonicalId: string;
  currency: string | null;
  eTransferEmail: string | null;
  eTransferName: string | null;
  externalCanonicalId: string | null;
  identityId: string;
  institutionName: string | null;
  occurredAt: string; // ISO 8601 date string
  p2pHandle: string | null;
  p2pMessage: string | null;
  spendMerchant: string | null;
  securityId: string | null;
  billPayCompanyName: string | null;
  billPayPayeeNickname: string | null;
  redactedExternalAccountNumber: string | null;
  opposingAccountId: string | null;
  status: string;
  subType: string | null;
  type: string;
  strikePrice: string | null;
  contractType: string | null;
  expiryDate: string | null;
  chequeNumber: string | null;
  provisionalCreditAmount: string | null;
  primaryBlocker: string | null;
  interestRate: string | null;
  frequency: string | null;
  counterAssetSymbol: string | null;
  rewardProgram: string | null;
  counterPartyCurrency: string | null;
  counterPartyCurrencyAmount: string | null;
  counterPartyName: string | null;
  fxRate: string | null;
  fees: string | null;
  reference: string | null;
}

// --- Normalized output type ---

export interface NormalizedTransaction {
  id: string;
  date: string; // YYYY-MM-DD format
  description: string;
  amount: number; // Signed: negative for DEBIT, positive for CREDIT
  currency: string;
  category: string;
  accountId: string;
  // Optional trading fields
  symbol?: string;
  action?: string;
  quantity?: number;
  price?: number;
}

// --- GraphQL response wrappers ---

export interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

export interface AccountsQueryResponse {
  identity: {
    id: string;
    accounts: Connection<Account>;
  };
}

export interface ActivitiesQueryResponse {
  activityFeedItems: Connection<Activity>;
}
