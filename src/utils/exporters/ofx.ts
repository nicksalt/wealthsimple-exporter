import type { NormalizedTransaction } from '../types';
import type { OfxGenerationOptions } from './types';
import { derivePayee } from './payee';

const OFX_HEADER_LINES = [
  'OFXHEADER:100',
  'DATA:OFXSGML',
  'VERSION:102',
  'SECURITY:NONE',
  'ENCODING:USASCII',
  'CHARSET:1252',
  'COMPRESSION:NONE',
  'OLDFILEUID:NONE',
];

function formatOfxDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

function formatDateOnly(date: string): string {
  return date.replace(/-/g, '') + '120000';
}

function sanitizeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function hash32(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isInternalTransfer(transaction: NormalizedTransaction): boolean {
  return (
    transaction.category === 'Transfer' ||
    transaction.action === 'Transfer' ||
    transaction.description.toLowerCase().startsWith('transfer ')
  );
}

export function generateFitId(transaction: NormalizedTransaction): string {
  if (!isInternalTransfer(transaction)) {
    return sanitizeValue(transaction.id);
  }

  const direction = transaction.amount < 0 ? 'OUT' : 'IN';
  const discriminator = `${transaction.id}|${transaction.accountId}|${direction}`;
  return `${sanitizeValue(transaction.id)}-${hash32(discriminator)}`;
}

function mapTrnType(transaction: NormalizedTransaction): string {
  const depositCategories = new Set([
    'Deposit',
    'Dividend',
    'Interest',
    'Refund',
    'Reimbursement',
    'Bonus',
  ]);
  const withdrawalCategories = new Set(['Withdrawal', 'Fee', 'Tax', 'Purchase']);

  if (depositCategories.has(transaction.category)) return 'DEP';
  if (withdrawalCategories.has(transaction.category)) return 'WITHDRAWAL';

  return transaction.amount < 0 ? 'DEBIT' : 'CREDIT';
}

function mapAccountType(accountType?: string): string {
  const normalized = (accountType || '').toLowerCase();
  if (normalized.includes('savings')) return 'SAVINGS';
  if (normalized.includes('credit')) return 'CREDITLINE';
  return 'CHECKING';
}

function buildOfxBody(
  transactions: NormalizedTransaction[],
  options: OfxGenerationOptions,
  now: Date
): string {
  const currency = options.currency || transactions[0]?.currency || 'CAD';
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = sorted[0]?.date ?? now.toISOString().slice(0, 10);
  const endDate = sorted[sorted.length - 1]?.date ?? now.toISOString().slice(0, 10);
  const ledgerAmount = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const org = sanitizeValue(options.org || 'WEALTHSIMPLE');
  const fid = sanitizeValue(options.fid || '1001');

  const transactionsBlock = sorted
    .map((transaction) => {
      const normalizedPayee = derivePayee(transaction.description);
      const name = sanitizeValue(normalizedPayee).slice(0, 96) || transaction.id;
      const memo = sanitizeValue(`${transaction.category} | ${transaction.accountId}`).slice(0, 255);

      return [
        '<STMTTRN>',
        `<TRNTYPE>${mapTrnType(transaction)}`,
        `<DTPOSTED>${formatDateOnly(transaction.date)}`,
        `<TRNAMT>${transaction.amount.toFixed(2)}`,
        `<FITID>${generateFitId(transaction)}`,
        `<NAME>${name}`,
        `<MEMO>${memo}`,
        '</STMTTRN>',
      ].join('\n');
    })
    .join('\n');

  const fiBlock = options.includeIntuBid
    ? `<FI>\n<ORG>${org}\n<FID>${fid}\n</FI>\n<INTU.BID>${sanitizeValue(options.intuBid || fid)}`
    : `<FI>\n<ORG>${org}\n<FID>${fid}\n</FI>`;

  return [
    '<OFX>',
    '<SIGNONMSGSRSV1>',
    '<SONRS>',
    '<STATUS>',
    '<CODE>0',
    '<SEVERITY>INFO',
    '</STATUS>',
    `<DTSERVER>${formatOfxDate(now)}`,
    '<LANGUAGE>ENG',
    fiBlock,
    '</SONRS>',
    '</SIGNONMSGSRSV1>',
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    '<TRNUID>1',
    '<STATUS>',
    '<CODE>0',
    '<SEVERITY>INFO',
    '</STATUS>',
    '<STMTRS>',
    `<CURDEF>${sanitizeValue(currency)}`,
    '<BANKACCTFROM>',
    '<BANKID>000000000',
    `<ACCTID>${sanitizeValue(options.accountId)}`,
    `<ACCTTYPE>${mapAccountType(options.accountType)}`,
    '</BANKACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${formatDateOnly(startDate)}`,
    `<DTEND>${formatDateOnly(endDate)}`,
    transactionsBlock,
    '</BANKTRANLIST>',
    '<LEDGERBAL>',
    `<BALAMT>${ledgerAmount.toFixed(2)}`,
    `<DTASOF>${formatOfxDate(now)}`,
    '</LEDGERBAL>',
    '</STMTRS>',
    '</STMTTRNRS>',
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\n');
}

export function generateOFX(
  transactions: NormalizedTransaction[],
  options: OfxGenerationOptions
): string {
  const now = new Date();
  const newFileUid = `${formatOfxDate(now)}-${hash32(`${options.accountId}:${transactions.length}`)}`;

  const header = [...OFX_HEADER_LINES, `NEWFILEUID:${newFileUid}`, ''].join('\n');
  const body = buildOfxBody(transactions, options, now);

  return `${header}\n${body}`;
}
