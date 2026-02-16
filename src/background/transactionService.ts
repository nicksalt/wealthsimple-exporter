/**
 * Transaction Service for fetching and normalizing Wealthsimple data
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
  accountMap: Map<string, string>,
  startDate?: string,
  endDate?: string,
  accountType?: string
): Promise<NormalizedTransaction[]> {
  const allActivities: Activity[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  // Check both explicit type and accountId string primarily because sometimes type isn't passed correctly
  const isCreditCard =
    accountType === 'credit_card' ||
    accountType === 'credit-card' ||
    accountId.includes('credit-card');

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
  return allActivities.map((a) => normalizeTransaction(a, accountMap, isCreditCard));
}

/**
 * Resolve the signed amount from an activity
 * CRITICAL: Handles DEBIT (negative) vs CREDIT (positive) sign logic
 */
function resolveAmount(activity: Activity, isCreditCard: boolean = false): number {
  const rawAmount = activity.amount != null ? parseFloat(activity.amount) : 0;

  // Handle NaN from malformed strings
  if (isNaN(rawAmount)) {
    return 0;
  }

  if (activity.amountSign === 'DEBIT') {
    const debit = -Math.abs(rawAmount);
    return debit === 0 ? 0 : debit;
  }
  if (activity.amountSign === 'CREDIT') {
    return Math.abs(rawAmount);
  }

  // Fallback: use type-based logic if limits/sign missing
  const type = (activity.type || '').toUpperCase();
  const subType = (activity.subType || '').toUpperCase();

  // Outflows
  if (
    ['DIY_BUY', 'MANAGED_BUY', 'CRYPTO_BUY', 'WITHDRAWAL', 'FEE', 'NON_RESIDENT_TAX', 'TAX'].includes(type) ||
    (type === 'CREDIT_CARD' && subType === 'PURCHASE')
  ) {
    return -Math.abs(rawAmount);
  }

  // Inflows
  if (
    ['DIY_SELL', 'MANAGED_SELL', 'CRYPTO_SELL', 'DEPOSIT', 'DIVIDEND', 'INTEREST', 'REIMBURSEMENT', 'REFUND', 'PROMOTION', 'REFERRAL'].includes(type)
  ) {
    return Math.abs(rawAmount);
  }

  // Credit Card Payments
  // If we are in a Credit Card account, a payment is an INFLOW (reduces debt) -> Positive
  // If we are in a Cash/Spending account, a payment is an OUTFLOW (spending money) -> Negative
  if (type === 'CREDIT_CARD_PAYMENT' || (type === 'CREDIT_CARD' && (subType === 'PAYMENT' || subType === 'REFUND'))) {
    if (isCreditCard) {
      return Math.abs(rawAmount);
    } else {
      return -Math.abs(rawAmount);
    }
  }

  // Internal Transfers & Asset Movements
  if (type === 'INTERNAL_TRANSFER' || type === 'ASSET_MOVEMENT') {
    if (subType === 'SOURCE') {
      return -Math.abs(rawAmount);
    }
    // Destination or other side of transfer
    return Math.abs(rawAmount);
  }

  // P2P Payments
  if (type === 'P2P_PAYMENT') {
    if (subType === 'SEND') {
      return -Math.abs(rawAmount);
    }
    return Math.abs(rawAmount);
  }

  // Ambiguous type — return raw amount as-is
  return rawAmount;
}

/**
 * Derive a simplified action for trading CSVs
 */
function deriveAction(a: Activity): string {
  const type = a.type;

  if (type.includes('BUY')) return 'Buy';
  if (type.includes('SELL')) return 'Sell';
  if (type === 'DIVIDEND') return 'Dividend';
  if (type === 'DEPOSIT') return 'Deposit';
  if (type === 'WITHDRAWAL') return 'Withdrawal';
  if (type === 'FEE') return 'Fee';
  if (type === 'INTEREST') return 'Interest';
  if (type === 'INTERNAL_TRANSFER') return 'Transfer';
  if (type === 'FUNDS_CONVERSION') return 'Conversion';

  return deriveCategory(a);
}

/**
 * Generate a human-readable description from an activity
 * Generate a human-readable description from activity data
 */
function generateDescription(a: Activity, accountMap?: Map<string, string>): string {
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

    // Clean up if merchant is available (e.g. for simple deposits/withdrawals that have a merchant)
    if (a.spendMerchant) return a.spendMerchant;

    return dir;
  }

  // Credit card
  if (type === 'CREDIT_CARD') {
    if (subType === 'PURCHASE') {
      return a.spendMerchant ?? 'Credit card purchase';
    }
    if (subType === 'HOLD') {
      return a.spendMerchant ? `${a.spendMerchant} (Hold)` : 'Credit card hold';
    }
    if (subType === 'REFUND') {
      return a.spendMerchant ? `${a.spendMerchant} (Refund)` : 'Refund';
    }
    if (subType === 'PAYMENT') return 'Credit card payment';
  }

  if (type === 'CREDIT_CARD_PAYMENT') return 'Credit card payment';

  // Internal transfers
  if (type === 'INTERNAL_TRANSFER' || type === 'ASSET_MOVEMENT') {
    const dir = subType === 'SOURCE' ? 'Transfer out' : 'Transfer in';
    // Use mapped nickname if available
    const accountRef = (a.opposingAccountId && accountMap?.get(a.opposingAccountId))
      ? accountMap.get(a.opposingAccountId)
      : (a.opposingAccountId ?? 'unknown');

    // If it's a transfer, we can just say "Transfer to X" or "Transfer from X"
    const preposition = subType === 'SOURCE' ? 'to' : 'from';
    return `Transfer ${preposition} ${accountRef}`;
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
export function normalizeTransaction(
  activity: Activity,
  accountMap?: Map<string, string>,
  isCreditCard: boolean = false
): NormalizedTransaction {
  const amount = resolveAmount(activity, isCreditCard);
  const quantity = activity.assetQuantity ? parseFloat(activity.assetQuantity) : undefined;

  // Derive price if quantity exists and is valid
  let price: number | undefined;
  if (quantity && quantity !== 0 && activity.amount) {
    price = Math.abs(parseFloat(activity.amount)) / quantity;
  }

  return {
    id: activity.canonicalId,
    date: activity.occurredAt.split('T')[0], // Extract YYYY-MM-DD
    description: generateDescription(activity, accountMap),
    amount: amount,
    currency: activity.currency ?? 'CAD',
    category: deriveCategory(activity),
    accountId: activity.accountId,
    // Trading fields
    symbol: activity.assetSymbol ?? undefined,
    action: deriveAction(activity),
    quantity: quantity,
    price: price,
  };
}

