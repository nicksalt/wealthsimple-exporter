/**
 * Wealthsimple Exporter
 * (c) 2026 Nick Salt
 * Released under the MIT License.
 */

import { fetchAccounts, fetchTransactions } from './transactionService';
import { generateExportFile } from '../utils/exporters';
import type { ExportFormat } from '../utils/exporters';

interface AuthData {
  authToken: string;
  identityId: string;
}

/**
 * Extract authentication data from Wealthsimple cookie
 */
async function extractAuthFromCookie(): Promise<AuthData | null> {
  try {
    console.log('[Background] Attempting to extract auth cookie...');

    const cookie = await chrome.cookies.get({
      url: 'https://my.wealthsimple.com',
      name: '_oauth2_access_v2',
    });

    if (!cookie || !cookie.value) {
      console.log('[Background] No auth cookie found');
      return null;
    }

    console.log('[Background] Cookie found, decoding...');

    // Cookie value is URL-encoded JSON
    const decodedValue = decodeURIComponent(cookie.value);
    const authData = JSON.parse(decodedValue);

    if (!authData.access_token || !authData.identity_canonical_id) {
      console.error('[Background] Cookie missing required fields:', Object.keys(authData));
      return null;
    }

    console.log('[Background] Successfully extracted auth data');

    // Store in chrome.storage.local for popup access
    await chrome.storage.local.set({
      authToken: authData.access_token,
      identityId: authData.identity_canonical_id,
    });

    return {
      authToken: authData.access_token,
      identityId: authData.identity_canonical_id,
    };
  } catch (error) {
    console.error('[Background] Failed to extract auth from cookie:', error);
    return null;
  }
}

/**
 * Calculate date range for last 30 days
 */
function getLast30Days(): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Handle export transactions request from popup
 */
async function handleExportTransactions(
  accountId: string | null,
  startDate: string | null,
  endDate: string | null,
  lastTransactionId: string | null,
  format: ExportFormat,
  sendResponse: (response: {
    success: boolean;
    error?: string;
    message?: string;
    transactionCount?: number;
    lastTransactionId?: string | null;
  }) => void
) {
  try {
    console.log('[Background] Starting export for account:', accountId);

    // Step 1: Extract auth from cookie
    const auth = await extractAuthFromCookie();

    if (!auth) {
      console.error('[Background] No auth found');
      sendResponse({ success: false, error: 'Not authenticated. Please log into my.wealthsimple.com' });
      return;
    }

    console.log('[Background] Auth found, fetching accounts...');

    // Step 2: Fetch accounts
    const accounts = await fetchAccounts(auth.authToken);

    if (!accounts || accounts.length === 0) {
      console.error('[Background] No accounts found');
      sendResponse({ success: false, error: 'No accounts found.' });
      return;
    }

    // Step 3: Find the specific account
    let targetAccount;
    if (accountId) {
      // Try to find account by ID
      targetAccount = accounts.find(acc => acc.id === accountId);

      if (!targetAccount) {
        console.log(`[Background] Account ${accountId} not found, checking custodian accounts...`);
        // Sometimes the accountId might be a custodian account ID
        targetAccount = accounts.find(acc =>
          acc.custodianAccounts?.some(ca => ca.id === accountId)
        );
      }

      if (!targetAccount) {
        console.error('[Background] Specified account not found:', accountId);
        sendResponse({
          success: false,
          error: `Account not found. Please make sure you're on a valid account page.`
        });
        return;
      }
    } else {
      // Fallback to first account if no ID provided
      targetAccount = accounts[0];
      console.log('[Background] No account ID provided, using first account');
    }

    console.log(`[Background] Exporting transactions for account: ${targetAccount.nickname || targetAccount.id}`);

    let dateRange = (startDate && endDate) ? { startDate, endDate } : getLast30Days();
    const useLastTransactionId = !!lastTransactionId;

    if (useLastTransactionId) {
      console.log('[Background] Fetching transactions since last transaction ID...');
    } else {
      console.log(`[Background] Fetching transactions from ${dateRange.startDate} to ${dateRange.endDate}...`);
    }

    // Create account map for clean descriptions
    const accountMap = new Map<string, string>();
    accounts.forEach(acc => {
      // Use nickname if available, otherwise format type
      let name = acc.nickname;
      if (!name) {
        // Format "tfsa" -> "TFSA"
        const type = (acc.unifiedAccountType || acc.type || '').toUpperCase().replace(/_/g, ' ');
        name = type;
      }
      accountMap.set(acc.id, name);

      // Also map custodian accounts
      acc.custodianAccounts.forEach(ca => {
        accountMap.set(ca.id, name!);
      });
    });

    const transactions = await fetchTransactions(
      targetAccount.id,
      auth.authToken,
      accountMap,
      useLastTransactionId ? undefined : dateRange.startDate,
      useLastTransactionId ? undefined : dateRange.endDate,
      targetAccount.unifiedAccountType || targetAccount.type
    );

    let exportTransactions = transactions;
    if (useLastTransactionId) {
      const lastIndex = transactions.findIndex((t) => t.id === lastTransactionId);

      if (lastIndex >= 0) {
        // Transactions are DESC ordered (newest first)
        // If we found it at index 5, indices 0-4 are newer, 6+ are older
        // We want to exclude it and everything older, so take only indices 0 to lastIndex-1
        exportTransactions = transactions.slice(0, lastIndex);
        console.log(`[Background] Filtered since last: found lastTransactionId at index ${lastIndex}, keeping ${exportTransactions.length} newer transactions`);
      } else {
        // lastTransactionId not found - user may have exported before we added ID tracking
        // Return all transactions (user will get some duplicates, but this is safer than losing data)
        console.log(`[Background] WARNING: lastTransactionId not found in current batch. Returning all transactions. User may see some duplicates.`);
      }

      dateRange = {
        startDate: exportTransactions[exportTransactions.length - 1]?.date ?? new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      };
    }

    if (!exportTransactions || exportTransactions.length === 0) {
      console.log('[Background] No transactions found');
      sendResponse({
        success: false,
        error: useLastTransactionId
          ? `No new transactions found for ${targetAccount.nickname || 'this account'} since your last export.`
          : `No transactions found for ${targetAccount.nickname || 'this account'} in the specified date range.`
      });
      return;
    }

    console.log(`[Background] Found ${exportTransactions.length} transactions, generating ${format.toUpperCase()}...`);

    const exportFile = generateExportFile(exportTransactions, format, {
      accountId: targetAccount.id,
      accountType: targetAccount.unifiedAccountType || targetAccount.type,
      currency: targetAccount.currency,
      org: 'WEALTHSIMPLE',
      fid: '1001',
    });
    console.log(`[Background] ${format.toUpperCase()} generated, length: ${exportFile.content.length} characters`);

    // Step 6: Download file
    const accountName = targetAccount.nickname || targetAccount.id;
    const safeAccountName = accountName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const filename = `wealthsimple-${safeAccountName}-${dateRange.endDate}.${exportFile.extension}`;

    console.log(`[Background] Attempting download of ${filename}...`);

    try {
      // Use data URL (works in service workers, unlike blob URLs)
      const dataUrl = `data:${exportFile.mimeType},` + encodeURIComponent(exportFile.content);

      console.log(`[Background] Data URL created, export length: ${exportFile.content.length} characters`);

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false, // Auto-download to Downloads folder
        conflictAction: 'uniquify',
      });

      console.log(`[Background] Download initiated with ID: ${downloadId}`);

      // Monitor download completion
      const checkDownload = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id === downloadId) {
          if (delta.state?.current === 'complete') {
            console.log(`[Background] Download completed successfully!`);
            chrome.downloads.onChanged.removeListener(checkDownload);
          } else if (delta.state?.current === 'interrupted') {
            console.error(`[Background] Download interrupted:`, delta);
            chrome.downloads.onChanged.removeListener(checkDownload);
          }
        }
      };

      chrome.downloads.onChanged.addListener(checkDownload);

      const lastExportedTransactionId =
        exportTransactions[exportTransactions.length - 1]?.id ?? null;

      sendResponse({
        success: true,
        message: `Successfully exported ${exportTransactions.length} transactions from ${accountName}! Check your Downloads folder.`,
        transactionCount: exportTransactions.length,
        lastTransactionId: lastExportedTransactionId,
      });
    } catch (downloadError) {
      console.error('[Background] Download failed:', downloadError);
      sendResponse({
        success: false,
        error: `Download failed: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`
      });
    }
  } catch (error) {
    console.error('[Background] Export failed:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);

  if (message.type === 'EXPORT_TRANSACTIONS') {
    const accountId = message.accountId || null;
    const startDate = message.startDate || null;
    const endDate = message.endDate || null;
    const lastTransactionId = message.lastTransactionId || null;
    const format: ExportFormat = ['csv', 'ofx', 'qfx'].includes(message.format)
      ? message.format
      : 'csv';
    console.log('[Background] Export requested for account:', accountId, 'Date range:', startDate, 'to', endDate);
    handleExportTransactions(accountId, startDate, endDate, lastTransactionId, format, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_AUTH') {
    extractAuthFromCookie()
      .then(auth => {
        console.log('[Background] CHECK_AUTH result:', !!auth);
        sendResponse({ authenticated: !!auth });
      })
      .catch((error) => {
        console.error('[Background] CHECK_AUTH error:', error);
        sendResponse({ authenticated: false });
      });
    return true;
  }

  return false;
});

// Initialize: Extract auth from cookie on extension load
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Wealthsimple Exporter installed');
  extractAuthFromCookie();
});

// Extract auth when user navigates to Wealthsimple
chrome.webNavigation?.onCompleted?.addListener(
  (details) => {
    if (details.frameId === 0) {
      console.log('[Background] User navigated to Wealthsimple, checking auth...');
      extractAuthFromCookie();
    }
  },
  { url: [{ hostSuffix: 'wealthsimple.com' }] }
);
