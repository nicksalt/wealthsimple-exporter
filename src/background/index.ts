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
    const cookie = await chrome.cookies.get({
      url: 'https://my.wealthsimple.com',
      name: '_oauth2_access_v2',
    });

    if (!cookie || !cookie.value) {
      return null;
    }

    // Cookie value is URL-encoded JSON
    const decodedValue = decodeURIComponent(cookie.value);
    const authData = JSON.parse(decodedValue);

    if (!authData.access_token || !authData.identity_canonical_id) {
      return null;
    }

    // Store in chrome.storage.local for popup access
    await chrome.storage.local.set({
      authToken: authData.access_token,
      identityId: authData.identity_canonical_id,
    });

    return {
      authToken: authData.access_token,
      identityId: authData.identity_canonical_id,
    };
  } catch {
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
    // Step 1: Extract auth from cookie
    const auth = await extractAuthFromCookie();

    if (!auth) {
      sendResponse({ success: false, error: 'Not authenticated. Please log into my.wealthsimple.com' });
      return;
    }

    // Step 2: Fetch accounts
    const accounts = await fetchAccounts(auth.authToken);

    if (!accounts || accounts.length === 0) {
      sendResponse({ success: false, error: 'No accounts found.' });
      return;
    }

    // Step 3: Find the specific account
    let targetAccount;
    if (accountId) {
      // Try to find account by ID
      targetAccount = accounts.find(acc => acc.id === accountId);

      if (!targetAccount) {
        // Sometimes the accountId might be a custodian account ID
        targetAccount = accounts.find(acc =>
          acc.custodianAccounts?.some(ca => ca.id === accountId)
        );
      }

      if (!targetAccount) {
        sendResponse({
          success: false,
          error: `Account not found. Please make sure you're on a valid account page.`
        });
        return;
      }
    } else {
      // Fallback to first account if no ID provided
      targetAccount = accounts[0];
    }

    let dateRange = (startDate && endDate) ? { startDate, endDate } : getLast30Days();
    const useLastTransactionId = !!lastTransactionId;

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
      } else {
        // lastTransactionId not found - user may have exported before we added ID tracking
        // Return all transactions (user will get some duplicates, but this is safer than losing data)
      }

      dateRange = {
        startDate: exportTransactions[exportTransactions.length - 1]?.date ?? new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      };
    }

    if (!exportTransactions || exportTransactions.length === 0) {
      sendResponse({
        success: false,
        error: useLastTransactionId
          ? `No new transactions found for ${targetAccount.nickname || 'this account'} since your last export.`
          : `No transactions found for ${targetAccount.nickname || 'this account'} in the specified date range.`
      });
      return;
    }

    const exportFile = generateExportFile(exportTransactions, format, {
      accountId: targetAccount.id,
      accountType: targetAccount.unifiedAccountType || targetAccount.type,
      currency: targetAccount.currency,
      org: 'WEALTHSIMPLE',
      fid: '1001',
    });

    // Step 6: Download file
    const accountName = targetAccount.nickname || targetAccount.id;
    const safeAccountName = accountName.replace(/[^a-zA-Z0-9-_]/g, '-');
    const filename = `wealthsimple-${safeAccountName}-${dateRange.endDate}.${exportFile.extension}`;

    try {
      // Use data URL (works in service workers, unlike blob URLs)
      const dataUrl = `data:${exportFile.mimeType},` + encodeURIComponent(exportFile.content);

      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false, // Auto-download to Downloads folder
        conflictAction: 'uniquify',
      });

      // Monitor download completion
      const checkDownload = (delta: chrome.downloads.DownloadDelta) => {
        if (delta.id === downloadId) {
          if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
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
      sendResponse({
        success: false,
        error: `Download failed: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`
      });
    }
  } catch (error) {
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
  if (message.type === 'EXPORT_TRANSACTIONS') {
    const accountId = message.accountId || null;
    const startDate = message.startDate || null;
    const endDate = message.endDate || null;
    const lastTransactionId = message.lastTransactionId || null;
    const format: ExportFormat = ['csv', 'ofx', 'qfx'].includes(message.format)
      ? message.format
      : 'csv';
    handleExportTransactions(accountId, startDate, endDate, lastTransactionId, format, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_AUTH') {
    extractAuthFromCookie()
      .then(auth => {
        sendResponse({ authenticated: !!auth });
      })
      .catch(() => {
        sendResponse({ authenticated: false });
      });
    return true;
  }

  return false;
});

// Initialize: Extract auth from cookie on extension load
chrome.runtime.onInstalled.addListener(() => {
  extractAuthFromCookie();
});

// Extract auth when user navigates to Wealthsimple
chrome.webNavigation?.onCompleted?.addListener(
  (details) => {
    if (details.frameId === 0) {
      extractAuthFromCookie();
    }
  },
  { url: [{ hostSuffix: 'wealthsimple.com' }] }
);
