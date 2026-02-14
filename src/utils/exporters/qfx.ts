import type { NormalizedTransaction } from '../types';
import { generateOFX } from './ofx';
import type { OfxGenerationOptions } from './types';

export function generateQFX(
  transactions: NormalizedTransaction[],
  options: OfxGenerationOptions
): string {
  return generateOFX(transactions, {
    ...options,
    includeIntuBid: true,
    intuBid: options.intuBid || options.fid || '1001',
  });
}
