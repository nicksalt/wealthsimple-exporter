/**
 * CSV exporter for normalized transactions
 */

import type { NormalizedTransaction } from './types';

/**
 * Escape a CSV field if it contains special characters
 * Wraps in quotes and doubles any existing quotes
 */
function escapeCSVField(field: string): string {
  // If the field contains a comma, double-quote, or newline, wrap in quotes
  // and escape any existing double-quotes by doubling them
  if (
    field.includes(',') ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r')
  ) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Generate CSV string from normalized transactions
 * automatically selecting the best format based on data content.
 */
export function generateCSV(transactions: NormalizedTransaction[]): string {

  // Check if we have trading data (symbols, quantities)
  // or if explicit actions are trading-related
  // Tightened logic: 'Interest' and 'Dividend' happen in Cash accounts too, so don't trigger trading CSV just for those.
  // Only trigger if we have a symbol (that isn't a currency) OR a specific trading action like Buy/Sell.
  const hasTradingData = transactions.some(
    (t) =>
      (!!t.symbol && t.symbol !== 'CAD' && t.symbol !== 'USD') ||
      (!!t.quantity && t.quantity > 0) ||
      (t.action && ['Buy', 'Sell'].includes(t.action))
  );

  if (hasTradingData) {
    return generateTradingCSV(transactions);
  } else {
    return generateBudgetingCSV(transactions);
  }
}

/**
 * Format: Date,Action,Symbol,Description,Quantity,Price,Amount,Currency,Exchange Rate
 */
function generateTradingCSV(transactions: NormalizedTransaction[]): string {
  const headers = [
    'Date',
    'Action',
    'Symbol',
    'Description',
    'Quantity',
    'Price',
    'Amount',
    'Currency',
    'Exchange Rate',
  ];
  const headerRow = headers.join(',');

  const rows = transactions.map((t) => {
    // For specialized actions like Deposits/Withdrawals, we might want to clear Symbol/Quantity
    // to match the "standard" feel, or keep them if they exist.
    // The requirement: "For Deposits/Withdrawals: Symbol/Quantity/Price will be empty."
    const isTransfer =
      t.action === 'Deposit' || t.action === 'Withdrawal' || t.action === 'Transfer';

    const symbol = isTransfer ? '' : t.symbol || '';
    const quantity = isTransfer ? '' : t.quantity?.toString() || '';
    const price = isTransfer ? '' : t.price?.toFixed(4) || '';

    // Amount is already signed correctly from transactionService
    const amount = t.amount.toFixed(2);

    const fields = [
      t.date,
      escapeCSVField(t.action || t.category),
      escapeCSVField(symbol),
      escapeCSVField(t.description),
      quantity,
      price,
      amount,
      t.currency,
      '', // Exchange Rate (not currently available in standard API data, placeholder)
    ];
    return fields.join(',');
  });

  return [headerRow, ...rows].join('\n');
}

/**
 * Format: Date,Payee,Memo,Outflow,Inflow
 */
function generateBudgetingCSV(transactions: NormalizedTransaction[]): string {
  const headers = ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'];
  const headerRow = headers.join(',');

  const rows = transactions.map((t) => {
    const payee = derivePayee(t.description);
    const memoParts = [];
    if (t.category) memoParts.push(t.category);
    if (t.accountId) memoParts.push(t.accountId);
    const memo = memoParts.join(' | ');

    const outflow = t.amount < 0 ? Math.abs(t.amount).toFixed(2) : '';
    const inflow = t.amount >= 0 ? t.amount.toFixed(2) : '';

    const fields = [
      t.date,
      escapeCSVField(payee),
      escapeCSVField(memo),
      outflow,
      inflow,
    ];
    return fields.join(',');
  });

  return [headerRow, ...rows].join('\n');
}

/**
 * Clean up payee names by stripping common Wealthsimple prefixes.
 */
function derivePayee(description: string): string {
  const original = description.trim();
  let payee = original;

  const primaryPrefixes: RegExp[] = [
    /^Withdrawal:\s*/i,
    /^Deposit:\s*/i,
    /^Credit card purchase:\s*/i,
    /^Credit card hold:\s*/i,
    /^Credit card refund:\s*/i,
  ];

  primaryPrefixes.forEach((prefix) => {
    payee = payee.replace(prefix, '');
  });

  const secondaryPrefixes: RegExp[] = [
    /^AFT\s+/i,
    /^e-Transfer\s+/i,
    /^EFT\s+/i,
    /^Bill pay\s+/i,
  ];

  secondaryPrefixes.forEach((prefix) => {
    payee = payee.replace(prefix, '');
  });

  payee = payee.trim();
  return payee.length > 0 ? payee : original;
}
