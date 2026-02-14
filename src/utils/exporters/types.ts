import type { NormalizedTransaction } from '../types';

export type ExportFormat = 'csv' | 'ofx' | 'qfx';

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
