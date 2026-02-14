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
 * Headers: Date,Payee,Memo,Outflow,Inflow (YNAB outflow/inflow format)
 */
export function generateCSV(transactions: NormalizedTransaction[]): string {
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

    // Debug logging for amount split
    if (outflow === '' && inflow === '') {
      console.log('[generateCSV] WARNING: Both outflow and inflow empty!', {
        amount: t.amount,
        description: t.description,
        amountLessThanZero: t.amount < 0,
      });
    }

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
