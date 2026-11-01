import type { NormalizedTransaction } from '../types';
import { generateCSV, generateSignedCSV } from './csv';
import { generateOFX } from './ofx';
import { generateQFX } from './qfx';
import type { ExportFile, ExportFormat, OfxGenerationOptions } from './types';

export type { ExportFile, ExportFormat, OfxGenerationOptions } from './types';
export { EXPORT_FORMATS, isExportFormat } from './types';
export { generateCSV, generateSignedCSV, generateOFX, generateQFX };

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  'csv-signed': 'text/csv;charset=utf-8',
  ofx: 'application/x-ofx',
  qfx: 'application/x-ofx',
};

export function generateExportFile(
  transactions: NormalizedTransaction[],
  format: ExportFormat,
  options: OfxGenerationOptions
): ExportFile {
  if (format === 'csv') {
    return {
      content: generateCSV(transactions),
      extension: 'csv',
      mimeType: MIME_TYPES.csv,
    };
  }

  if (format === 'csv-signed') {
    return {
      content: generateSignedCSV(transactions),
      extension: 'csv',
      mimeType: MIME_TYPES['csv-signed'],
    };
  }

  if (format === 'ofx') {
    return {
      content: generateOFX(transactions, options),
      extension: 'ofx',
      mimeType: MIME_TYPES.ofx,
    };
  }

  return {
    content: generateQFX(transactions, options),
    extension: 'qfx',
    mimeType: MIME_TYPES.qfx,
  };
}
