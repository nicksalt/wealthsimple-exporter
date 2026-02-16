import type { ExportFormat } from '../utils/exporters';

let statusDiv: HTMLDivElement | null = null;
let exportBtn: HTMLButtonElement | null = null;
let exportSinceLastBtn: HTMLButtonElement | null = null;
let startDateInput: HTMLInputElement | null = null;
let endDateInput: HTMLInputElement | null = null;
let dateRangeSection: HTMLDivElement | null = null;
let formatSection: HTMLDivElement | null = null;
let formatSelect: HTMLSelectElement | null = null;
let lastExportInfo: HTMLDivElement | null = null;
let currentAccountId: string | null = null;

const EXPORT_FORMAT_KEY = 'preferredExportFormat';

interface LastExportInfo {
  date: string;
  count: number;
  lastTransactionId?: string;
}

function updateStatus(message: string, type: 'info' | 'error' | 'success' = 'info') {
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }
}

function getDefaultDateRange(days: number = 30): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function setDateRange(days: number) {
  const { startDate, endDate } = getDefaultDateRange(days);
  if (startDateInput) startDateInput.value = startDate;
  if (endDateInput) endDateInput.value = endDate;

  document.querySelectorAll('.quick-range button').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`range${days}d`) || document.getElementById(`range${days === 365 ? '1y' : `${days}d`}`);
  if (activeBtn) activeBtn.classList.add('active');
}

function getSelectedFormat(): ExportFormat {
  const value = formatSelect?.value;
  if (value === 'ofx' || value === 'qfx') return value;
  return 'csv';
}

async function getPreferredFormat(): Promise<ExportFormat> {
  try {
    const result = await chrome.storage.local.get([EXPORT_FORMAT_KEY]);
    const value = result[EXPORT_FORMAT_KEY];
    if (value === 'ofx' || value === 'qfx' || value === 'csv') {
      return value;
    }
  } catch {
    // Fallback to default
  }

  return 'csv';
}

async function savePreferredFormat(format: ExportFormat) {
  try {
    await chrome.storage.local.set({ [EXPORT_FORMAT_KEY]: format });
  } catch {
    // Storage write failed silently
  }
}

async function getLastExportInfo(accountId: string): Promise<LastExportInfo | null> {
  try {
    const key = `lastExport_${accountId}`;
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  } catch {
    return null;
  }
}

async function saveExportInfo(
  accountId: string,
  date: string,
  count: number,
  lastTransactionId: string | null
) {
  try {
    const key = `lastExport_${accountId}`;
    await chrome.storage.local.set({ [key]: { date, count, lastTransactionId: lastTransactionId || undefined } });
  } catch {
    // Storage write failed silently
  }
}

async function updateLastExportInfo(accountId: string) {
  const info = await getLastExportInfo(accountId);
  if (info && lastExportInfo && exportSinceLastBtn) {
    const exportDate = new Date(info.date);
    const formattedDate = exportDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    lastExportInfo.textContent = `Last export: ${formattedDate} (${info.count} transactions)`;
    lastExportInfo.style.display = 'block';
    exportSinceLastBtn.style.display = 'block';
  } else if (lastExportInfo && exportSinceLastBtn) {
    lastExportInfo.style.display = 'none';
    exportSinceLastBtn.style.display = 'none';
  }
}

async function checkAuth(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(['authToken']);
    return !!result.authToken;
  } catch {
    return false;
  }
}

async function getCurrentAccountInfo(): Promise<{ accountId: string | null; accountName: string | null; isAccountPage: boolean }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id || !tab.url?.includes('wealthsimple.com')) {
      return { accountId: null, accountName: null, isAccountPage: false };
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_ACCOUNT_INFO' });
    return response;
  } catch (error) {
    // Content script not responding, try URL fallback
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url) {
      const match = tab.url.match(/\/app\/account-details\/([a-zA-Z0-9-_]+)/);
      if (match) {
        return {
          accountId: match[1],
          accountName: match[1].split('-')[0]?.toUpperCase() || null,
          isAccountPage: true,
        };
      }
    }
    return { accountId: null, accountName: null, isAccountPage: false };
  }
}

async function handleExport(sinceLast: boolean = false) {
  if (!exportBtn || !currentAccountId) return;

  const startDate = startDateInput?.value || '';
  const endDate = endDateInput?.value || '';
  const format = getSelectedFormat();
  const lastExport = sinceLast ? await getLastExportInfo(currentAccountId) : null;

  exportBtn.disabled = true;
  if (exportSinceLastBtn) exportSinceLastBtn.disabled = true;
  updateStatus(`Exporting ${format.toUpperCase()}...`, 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_TRANSACTIONS',
      accountId: currentAccountId,
      startDate,
      endDate,
      format,
      lastTransactionId: sinceLast ? lastExport?.lastTransactionId || null : null,
    });

    if (response && response.success) {
      updateStatus(response.message || 'Export complete!', 'success');

      await saveExportInfo(currentAccountId, endDate, response.transactionCount || 0, response.lastTransactionId || null);
      await updateLastExportInfo(currentAccountId);

      setTimeout(() => {
        if (exportBtn) exportBtn.disabled = false;
        if (exportSinceLastBtn) exportSinceLastBtn.disabled = false;
        updateStatus('Ready to export transactions', 'success');
      }, 2000);
    } else {
      updateStatus(response?.error || 'Export failed', 'error');
      setTimeout(() => {
        if (exportBtn) exportBtn.disabled = false;
        if (exportSinceLastBtn) exportSinceLastBtn.disabled = false;
      }, 1200);
    }
  } catch (error) {
    // Export failed
    updateStatus(error instanceof Error ? error.message : 'Failed to export transactions', 'error');
    setTimeout(() => {
      if (exportBtn) exportBtn.disabled = false;
      if (exportSinceLastBtn) exportSinceLastBtn.disabled = false;
    }, 1200);
  }
}

async function handleExportSinceLast() {
  if (!currentAccountId) return;

  const lastExport = await getLastExportInfo(currentAccountId);
  if (!lastExport) return;

  if (!lastExport.lastTransactionId) {
    const lastDate = new Date(lastExport.date);
    lastDate.setDate(lastDate.getDate() + 1);

    if (startDateInput) startDateInput.value = lastDate.toISOString().split('T')[0];
    if (endDateInput) endDateInput.value = new Date().toISOString().split('T')[0];

    document.querySelectorAll('.quick-range button').forEach((btn) => btn.classList.remove('active'));
  }

  await handleExport(true);
}

async function init() {
  try {
    const preferredFormat = await getPreferredFormat();
    if (formatSelect) {
      formatSelect.value = preferredFormat;
    }

    const isAuthenticated = await checkAuth();

    if (!isAuthenticated) {
      updateStatus('Extracting authentication from cookie...', 'info');
      if (exportBtn) exportBtn.disabled = true;

      try {
        const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
        if (!response || !response.authenticated) {
          updateStatus('Please log into my.wealthsimple.com to authenticate', 'error');
          if (exportBtn) exportBtn.disabled = true;
          return;
        }
      } catch {
        // Auth check failed
        updateStatus('Please log into my.wealthsimple.com to authenticate', 'error');
        if (exportBtn) exportBtn.disabled = true;
        return;
      }
    }

    const accountInfo = await getCurrentAccountInfo();

    if (!accountInfo.isAccountPage) {
      updateStatus('Please navigate to a specific account page to export transactions', 'info');
      if (exportBtn) exportBtn.disabled = true;
      return;
    }

    currentAccountId = accountInfo.accountId;

    if (dateRangeSection) dateRangeSection.style.display = 'block';
    if (formatSection) formatSection.style.display = 'block';

    setDateRange(30);

    if (currentAccountId) {
      await updateLastExportInfo(currentAccountId);
    }

    const accountDisplay = accountInfo.accountName || accountInfo.accountId || 'this account';
    updateStatus(`Ready to export ${accountDisplay}`, 'success');
    if (exportBtn) exportBtn.disabled = false;
  } catch {
    updateStatus('Initialization error', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  statusDiv = document.getElementById('status') as HTMLDivElement;
  exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
  exportSinceLastBtn = document.getElementById('exportSinceLastBtn') as HTMLButtonElement;
  startDateInput = document.getElementById('startDate') as HTMLInputElement;
  endDateInput = document.getElementById('endDate') as HTMLInputElement;
  dateRangeSection = document.getElementById('dateRangeSection') as HTMLDivElement;
  formatSection = document.getElementById('formatSection') as HTMLDivElement;
  formatSelect = document.getElementById('formatSelect') as HTMLSelectElement;
  lastExportInfo = document.getElementById('lastExportInfo') as HTMLDivElement;

  if (!statusDiv || !exportBtn || !formatSelect) {
    return;
  }

  exportBtn.addEventListener('click', () => handleExport(false));
  if (exportSinceLastBtn) {
    exportSinceLastBtn.addEventListener('click', handleExportSinceLast);
  }

  formatSelect.addEventListener('change', () => {
    savePreferredFormat(getSelectedFormat());
  });

  document.getElementById('range7d')?.addEventListener('click', () => setDateRange(7));
  document.getElementById('range30d')?.addEventListener('click', () => setDateRange(30));
  document.getElementById('range90d')?.addEventListener('click', () => setDateRange(90));
  document.getElementById('range1y')?.addEventListener('click', () => setDateRange(365));

  init();
});
