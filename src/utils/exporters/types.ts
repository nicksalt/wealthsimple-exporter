import type { NormalizedTransaction } from '../types';

export const EXPORT_FORMATS = ['csv', 'csv-signed', 'ofx', 'qfx'] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export interface ExportFile {
  content: string;
  extension: 'csv' | 'ofx' | 'qfx';
  mimeType: string;
}

export interface OfxGenerationOptions {
  accountId: string;
  accountType?: string;
  currency?: string;
  org?: string;
  fid?: string;
  includeIntuBid?: boolean;
  intuBid?: string;
}

export type ExportGenerator = (transactions: NormalizedTransaction[]) => string;
