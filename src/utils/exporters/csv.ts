import type { NormalizedTransaction } from '../types';
import { derivePayee } from './payee';

function escapeCSVField(field: string): string {
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

  const rows = transactions.map((t) => {
    const isTransfer =
      t.action === 'Deposit' || t.action === 'Withdrawal' || t.action === 'Transfer';

    const symbol = isTransfer ? '' : t.symbol || '';
    const quantity = isTransfer ? '' : t.quantity?.toString() || '';
    const price = isTransfer ? '' : t.price?.toFixed(4) || '';

    const fields = [
      t.date,
      escapeCSVField(t.action || t.category),
      escapeCSVField(symbol),
      escapeCSVField(t.description),
      quantity,
      price,
      t.amount.toFixed(2),
      t.currency,
      '',
    ];
    return fields.join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function generateBudgetingCSV(transactions: NormalizedTransaction[]): string {
  const headers = ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'];

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

  return [headers.join(','), ...rows].join('\n');
}

export function generateCSV(transactions: NormalizedTransaction[]): string {
  const hasTradingData = transactions.some(
    (t) =>
      (!!t.symbol && t.symbol !== 'CAD' && t.symbol !== 'USD') ||
      (!!t.quantity && t.quantity > 0) ||
      (t.action && ['Buy', 'Sell'].includes(t.action))
  );

  if (hasTradingData) {
    return generateTradingCSV(transactions);
  }

  return generateBudgetingCSV(transactions);
}
