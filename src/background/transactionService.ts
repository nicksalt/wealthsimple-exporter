/**
 * Transaction Service for fetching and normalizing Wealthsimple data
 * Ported from python-reference/ws_api/wealthsimple_api.py
 */

import { FETCH_ALL_ACCOUNT_FINANCIALS, FETCH_ACTIVITY_FEED_ITEMS } from '../utils/queries';
import type {
  Account,
  Activity,
  NormalizedTransaction,
  GraphQLResponse,
  AccountsQueryResponse,
  ActivitiesQueryResponse,
} from '../utils/types';

const GRAPHQL_URL = 'https://my.wealthsimple.com/graphql';
const TOKEN_INFO_URL = 'https://api.production.wealthsimple.com/v1/oauth/v2/token/info';

const EXCLUDED_STATUSES = new Set(['rejected', 'cancelled', 'expired']);
const EXCLUDED_TYPES = new Set(['LEGACY_TRANSFER']);

/**
 * Generate headers for GraphQL requests
 */
function graphqlHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-ws-profile': 'trade',
    'x-ws-api-version': '12',
    'x-ws-client-library': 'gql-sdk',
    'x-ws-locale': 'en-CA',
    'x-platform-os': 'web',
  };
}

/**
 * Fetch identity ID from token info endpoint
 */
async function fetchIdentityId(token: string): Promise<string> {
  const response = await fetch(TOKEN_INFO_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch identity ID: ${response.statusText}`);
  }

  const data = await response.json();
  return data.identity_canonical_id;
}

/**
 * Fetch all accounts for the authenticated user
 * Filters to only open accounts by default
 */
export async function fetchAccounts(token: string): Promise<Account[]> {
  const identityId = await fetchIdentityId(token);
  const allAccounts: Account[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(token),
      body: JSON.stringify({
        operationName: 'FetchAllAccountFinancials',
        query: FETCH_ALL_ACCOUNT_FINANCIALS,
        variables: { identityId, pageSize: 25, cursor },
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const json: GraphQLResponse<AccountsQueryResponse> = await response.json();

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
    }

    const connection = json.data.identity.accounts;
    const accounts = connection.edges.map((edge) => edge.node);
    allAccounts.push(...accounts);

    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  // Filter to only open accounts
  return allAccounts.filter((a) => a.status === 'open');
}

/**
 * Fetch and normalize transactions for a specific account
 * Returns normalized transactions ready for export
 */
export async function fetchTransactions(
  accountId: string,
  token: string,
  startDate?: string,
  endDate?: string
): Promise<NormalizedTransaction[]> {
  const allActivities: Activity[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  const effectiveEndDate = endDate ?? new Date().toISOString();

  while (hasNextPage) {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(token),
      body: JSON.stringify({
        operationName: 'FetchActivityFeedItems',
        query: FETCH_ACTIVITY_FEED_ITEMS,
        variables: {
          first: 50,
          cursor,
          condition: {
            accountIds: [accountId],
            startDate: startDate ?? null,
            endDate: effectiveEndDate,
          },
          orderBy: 'OCCURRED_AT_DESC',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const json: GraphQLResponse<ActivitiesQueryResponse> = await response.json();

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
    }

    const connection = json.data.activityFeedItems;
    const activities = connection.edges.map((edge) => edge.node);

    // Filter out rejected/cancelled/expired and legacy transfers
    const filtered = activities.filter((a) => {
      const status = (a.status ?? '').toLowerCase();
      const type = (a.type ?? '').toUpperCase();
      return !EXCLUDED_TYPES.has(type) && !EXCLUDED_STATUSES.has(status);
    });

    allActivities.push(...filtered);
    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  // Normalize all activities to transactions
  return allActivities.map(normalizeTransaction);
}

/**
 * Resolve the signed amount from an activity
 * CRITICAL: Handles DEBIT (negative) vs CREDIT (positive) sign logic
 */
function resolveAmount(activity: Activity): number {
  const rawAmount = activity.amount != null ? parseFloat(activity.amount) : 0;

  // Handle NaN from malformed strings
  if (isNaN(rawAmount)) {
    return 0;
  }

  if (activity.amountSign === 'DEBIT') {
    const debit = -Math.abs(rawAmount);
    // Normalize -0 to 0
    return debit === 0 ? 0 : debit;
  }
  if (activity.amountSign === 'CREDIT') {
    return Math.abs(rawAmount);
  }

  // null amountSign: keep as-is
  // Debug: log when amountSign is missing
  console.log('[resolveAmount] WARNING: null amountSign for activity:', {
    type: activity.type,
    subType: activity.subType,
    rawAmount,
  });
  return rawAmount;
}

/**
 * Generate a human-readable description from an activity
 * Ported from python-reference/ws_api/formatters.py
 */
function generateDescription(a: Activity): string {
  const type = a.type;
  const subType = a.subType;

  // Buy/Sell transactions
  if (['DIY_BUY', 'DIY_SELL', 'MANAGED_BUY', 'MANAGED_SELL', 'CRYPTO_BUY', 'CRYPTO_SELL'].includes(type)) {
    const action = type.includes('BUY') ? 'Buy' : 'Sell';
    const symbol = a.assetSymbol ?? 'Unknown';
    const qty = a.assetQuantity != null ? parseFloat(a.assetQuantity) : null;

    if (qty != null && !isNaN(qty) && qty > 0) {
      return `${action} ${qty} x ${symbol}`;
    }
    return `${action} ${symbol}`;
  }

  // Deposits and withdrawals
  if (type === 'DEPOSIT' || type === 'WITHDRAWAL') {
    const dir = type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal';

    if (subType === 'E_TRANSFER' || subType === 'E_TRANSFER_FUNDING') {
      const name = a.eTransferName ? ` ${a.eTransferName}` : '';
      return `${dir}: e-Transfer${name}`;
    }
    if (subType === 'EFT') return `${dir}: EFT`;
    if (subType === 'AFT') {
      const originator = a.aftOriginatorName ? ` ${a.aftOriginatorName}` : '';
      return `${dir}: AFT${originator}`;
    }
    if (subType === 'BILL_PAY') {
      const company = a.billPayCompanyName ? ` ${a.billPayCompanyName}` : '';
      return `${dir}: Bill pay${company}`;
    }
    if (subType === 'PAYMENT_CARD_TRANSACTION') return `${dir}: Debit card funding`;

    return dir;
  }

  // Credit card
  if (type === 'CREDIT_CARD') {
    if (subType === 'PURCHASE') {
      return `Credit card purchase: ${a.spendMerchant ?? 'Unknown'}`;
    }
    if (subType === 'HOLD') {
      return `Credit card hold: ${a.spendMerchant ?? 'Unknown'}`;
    }
    if (subType === 'REFUND') {
      return `Credit card refund: ${a.spendMerchant ?? 'Unknown'}`;
    }
    if (subType === 'PAYMENT') return 'Credit card payment';
  }

  if (type === 'CREDIT_CARD_PAYMENT') return 'Credit card payment';

  // Internal transfers
  if (type === 'INTERNAL_TRANSFER' || type === 'ASSET_MOVEMENT') {
    const dir = subType === 'SOURCE' ? 'Transfer out' : 'Transfer in';
    const accountRef = a.opposingAccountId ?? 'unknown';
    return `${dir} (${accountRef})`;
  }

  // Dividend
  if (type === 'DIVIDEND') {
    return `Dividend: ${a.assetSymbol ?? 'Unknown'}`;
  }

  // Interest
  if (type === 'INTEREST') {
    return subType === 'FPL_INTEREST' ? 'Stock Lending Earnings' : 'Interest';
  }

  // Refund
  if (type === 'REFUND') {
    return subType === 'TRANSFER_FEE_REFUND' ? 'Reimbursement: transfer fee' : 'Refund';
  }

  // P2P
  if (type === 'P2P_PAYMENT') {
    const dir = subType === 'SEND' ? 'sent to' : 'received from';
    const handle = a.p2pHandle ? ` ${a.p2pHandle}` : '';
    return `Cash ${dir}${handle}`;
  }

  // Fee
  if (type === 'FEE') return 'Management fee';

  // Non-resident tax
  if (type === 'NON_RESIDENT_TAX') return 'Non-resident tax';

  // Funds conversion
  if (type === 'FUNDS_CONVERSION') return `Funds converted: ${a.currency ?? 'N/A'}`;

  // Reimbursement
  if (type === 'REIMBURSEMENT') return 'Reimbursement';

  // Promotion/Referral
  if (type === 'PROMOTION' || type === 'REFERRAL') return 'Bonus';

  // Fallback
  return `${type}: ${subType ?? 'N/A'}`;
}

/**
 * Derive a category from an activity
 */
function deriveCategory(a: Activity): string {
  const type = a.type;
  const subType = a.subType;

  if (['DIY_BUY', 'MANAGED_BUY', 'CRYPTO_BUY'].includes(type)) return 'Investment Buy';
  if (['DIY_SELL', 'MANAGED_SELL', 'CRYPTO_SELL'].includes(type)) return 'Investment Sell';
  if (type === 'DEPOSIT') return 'Deposit';
  if (type === 'WITHDRAWAL') return 'Withdrawal';
  if (type === 'DIVIDEND') return 'Dividend';
  if (type === 'INTEREST') return 'Interest';
  if (type === 'INTERNAL_TRANSFER' || type === 'ASSET_MOVEMENT') return 'Transfer';
  if (type === 'CREDIT_CARD' && subType === 'PURCHASE') return 'Purchase';
  if (type === 'CREDIT_CARD' && subType === 'PAYMENT') return 'Credit Card Payment';
  if (type === 'CREDIT_CARD' && (subType === 'REFUND' || subType === 'HOLD')) return 'Refund';
  if (type === 'CREDIT_CARD_PAYMENT') return 'Credit Card Payment';
  if (type === 'REFUND') return 'Refund';
  if (type === 'FEE') return 'Fee';
  if (type === 'NON_RESIDENT_TAX') return 'Tax';
  if (type === 'FUNDS_CONVERSION') return 'Currency Conversion';
  if (type === 'P2P_PAYMENT') return 'P2P Payment';
  if (type === 'REIMBURSEMENT') return 'Reimbursement';
  if (type === 'PROMOTION' || type === 'REFERRAL') return 'Bonus';

  return 'Other';
}

/**
 * Normalize a raw activity to a transaction ready for export
 * This is a pure function exported for testing
 */
export function normalizeTransaction(activity: Activity): NormalizedTransaction {
  return {
    id: activity.canonicalId,
    date: activity.occurredAt.split('T')[0], // Extract YYYY-MM-DD
    description: generateDescription(activity),
    amount: resolveAmount(activity),
    currency: activity.currency ?? 'CAD',
    category: deriveCategory(activity),
    accountId: activity.accountId,
  };
}
