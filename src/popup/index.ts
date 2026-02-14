// Popup UI logic for Wealthsimple Exporter

let statusDiv: HTMLDivElement | null = null;
let exportBtn: HTMLButtonElement | null = null;
let exportSinceLastBtn: HTMLButtonElement | null = null;
let startDateInput: HTMLInputElement | null = null;
let endDateInput: HTMLInputElement | null = null;
let dateRangeSection: HTMLDivElement | null = null;
let lastExportInfo: HTMLDivElement | null = null;
let currentAccountId: string | null = null;

/**
 * Update status message with styling
 */
function updateStatus(message: string, type: 'info' | 'error' | 'success' = 'info') {
  console.log(`[Popup] Status: ${message} (${type})`);
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }
}

/**
 * Get date range (defaults to last 30 days)
 */
function getDefaultDateRange(days: number = 30): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

/**
 * Set date range in inputs
 */
function setDateRange(days: number) {
  const { startDate, endDate } = getDefaultDateRange(days);
  if (startDateInput) startDateInput.value = startDate;
  if (endDateInput) endDateInput.value = endDate;
  
  // Update active button
  document.querySelectorAll('.quick-range button').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`range${days}d`) || document.getElementById(`range${days === 365 ? '1y' : days + 'd'}`);
  if (activeBtn) activeBtn.classList.add('active');
}

/**
 * Get last export info for account
 */
async function getLastExportInfo(accountId: string): Promise<{ date: string; count: number } | null> {
  try {
    const key = `lastExport_${accountId}`;
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  } catch (error) {
    console.error('[Popup] Failed to get last export info:', error);
    return null;
  }
}

/**
 * Save export info for account
 */
async function saveExportInfo(accountId: string, date: string, count: number) {
  try {
    const key = `lastExport_${accountId}`;
    await chrome.storage.local.set({ [key]: { date, count } });
  } catch (error) {
    console.error('[Popup] Failed to save export info:', error);
  }
}

/**
 * Update last export info display
 */
async function updateLastExportInfo(accountId: string) {
  const info = await getLastExportInfo(accountId);
  if (info && lastExportInfo && exportSinceLastBtn) {
    const exportDate = new Date(info.date);
    const formattedDate = exportDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    lastExportInfo.textContent = `Last export: ${formattedDate} (${info.count} transactions)`;
    lastExportInfo.style.display = 'block';
    exportSinceLastBtn.style.display = 'block';
  } else if (lastExportInfo && exportSinceLastBtn) {
    lastExportInfo.style.display = 'none';
    exportSinceLastBtn.style.display = 'none';
  }
}

/**
 * Check if user is authenticated
 */
async function checkAuth(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(['authToken']);
    console.log('[Popup] Auth check result:', !!result.authToken);
    return !!result.authToken;
  } catch (error) {
    console.error('[Popup] Failed to check auth:', error);
    return false;
  }
}

/**
 * Get current account info from the active tab
 */
async function getCurrentAccountInfo(): Promise<{ accountId: string | null; accountName: string | null; isAccountPage: boolean }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[Popup] Current tab:', { id: tab.id, url: tab.url });
    
    if (!tab.id || !tab.url?.includes('wealthsimple.com')) {
      console.log('[Popup] Not on Wealthsimple page');
      return { accountId: null, accountName: null, isAccountPage: false };
    }
    
    console.log('[Popup] Sending GET_ACCOUNT_INFO message to tab:', tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_ACCOUNT_INFO' });
    console.log('[Popup] Account info from content script:', response);
    return response;
  } catch (error) {
    console.error('[Popup] Failed to get account info (content script may not be loaded):', error);
    // Fallback: try to parse the URL ourselves
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url) {
      const match = tab.url.match(/\/app\/account-details\/([a-zA-Z0-9-_]+)/);
      if (match) {
        console.log('[Popup] Fallback: Detected account ID from URL:', match[1]);
        return { 
          accountId: match[1], 
          accountName: match[1].split('-')[0]?.toUpperCase() || null, 
          isAccountPage: true 
        };
      }
    }
    return { accountId: null, accountName: null, isAccountPage: false };
  }
}

/**
 * Handle export button click
 */
async function handleExport(sinceLast: boolean = false) {
  if (!exportBtn || !currentAccountId) return;
  
  const startDate = startDateInput?.value || '';
  const endDate = endDateInput?.value || '';
  
  console.log('[Popup] Export button clicked for account:', currentAccountId, 'Range:', startDate, 'to', endDate);
  
  // Disable buttons during export
  exportBtn.disabled = true;
  if (exportSinceLastBtn) exportSinceLastBtn.disabled = true;
  updateStatus('Exporting transactions...', 'info');

  try {
    console.log('[Popup] Sending EXPORT_TRANSACTIONS message...');
    const response = await chrome.runtime.sendMessage({ 
      type: 'EXPORT_TRANSACTIONS',
      accountId: currentAccountId,
      startDate,
      endDate
    });
    console.log('[Popup] Response received:', response);

    if (response && response.success) {
      updateStatus(response.message || 'Export complete!', 'success');
      
      // Save export info
      await saveExportInfo(currentAccountId, endDate, response.transactionCount || 0);
      await updateLastExportInfo(currentAccountId);
      
      // Re-enable buttons after 3 seconds
      setTimeout(() => {
        if (exportBtn) exportBtn.disabled = false;
        if (exportSinceLastBtn) exportSinceLastBtn.disabled = false;
        updateStatus('Ready to export transactions', 'success');
      }, 3000);
    } else {
      updateStatus(response?.error || 'Export failed', 'error');
      // Re-enable buttons after 2 seconds
      setTimeout(() => {
        if (exportBtn) exportBtn.disabled = false;
        if (exportSinceLastBtn) exportSinceLastBtn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error('[Popup] Export error:', error);
    updateStatus(
      error instanceof Error ? error.message : 'Failed to export transactions',
      'error'
    );
    // Re-enable buttons after 2 seconds
    setTimeout(() => {
      if (exportBtn) exportBtn.disabled = false;
      if (exportSinceLastBtn) exportSinceLastBtn.disabled = false;
    }, 2000);
  }
}

/**
 * Handle export since last
 */
async function handleExportSinceLast() {
  if (!currentAccountId) return;
  
  const lastExport = await getLastExportInfo(currentAccountId);
  if (!lastExport) return;
  
  // Set date range from day after last export to today
  const lastDate = new Date(lastExport.date);
  lastDate.setDate(lastDate.getDate() + 1); // Start from day after last export
  
  if (startDateInput) startDateInput.value = lastDate.toISOString().split('T')[0];
  if (endDateInput) endDateInput.value = new Date().toISOString().split('T')[0];
  
  // Clear active quick range button
  document.querySelectorAll('.quick-range button').forEach(btn => btn.classList.remove('active'));
  
  await handleExport(true);
}

/**
 * Initialize popup UI
 */
async function init() {
  console.log('[Popup] Initializing...');
  
  try {
    // Step 1: Check authentication
    const isAuthenticated = await checkAuth();
    
    if (!isAuthenticated) {
      updateStatus('Extracting authentication from cookie...', 'info');
      if (exportBtn) exportBtn.disabled = true;

      try {
        const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
        console.log('[Popup] CHECK_AUTH response:', response);
        
        if (!response || !response.authenticated) {
          updateStatus('Please log into my.wealthsimple.com to authenticate', 'error');
          if (exportBtn) exportBtn.disabled = true;
          return;
        }
      } catch (error) {
        console.error('[Popup] CHECK_AUTH error:', error);
        updateStatus('Please log into my.wealthsimple.com to authenticate', 'error');
        if (exportBtn) exportBtn.disabled = true;
        return;
      }
    }
    
    // Step 2: Check if we're on an account page
    const accountInfo = await getCurrentAccountInfo();
    
    if (!accountInfo.isAccountPage) {
      updateStatus('Please navigate to a specific account page to export transactions', 'info');
      if (exportBtn) exportBtn.disabled = true;
      return;
    }
    
    // Step 3: We have auth and we're on an account page
    currentAccountId = accountInfo.accountId;
    
    // Show date range controls
    if (dateRangeSection) dateRangeSection.style.display = 'block';
    
    // Set default date range
    setDateRange(30);
    
    // Update last export info
    if (currentAccountId) {
      await updateLastExportInfo(currentAccountId);
    }
    
    const accountDisplay = accountInfo.accountName || accountInfo.accountId || 'this account';
    updateStatus(`Ready to export ${accountDisplay}`, 'success');
    if (exportBtn) exportBtn.disabled = false;
    
  } catch (error) {
    console.error('[Popup] Init error:', error);
    updateStatus('Initialization error', 'error');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] DOM loaded');
  
  statusDiv = document.getElementById('status') as HTMLDivElement;
  exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
  exportSinceLastBtn = document.getElementById('exportSinceLastBtn') as HTMLButtonElement;
  startDateInput = document.getElementById('startDate') as HTMLInputElement;
  endDateInput = document.getElementById('endDate') as HTMLInputElement;
  dateRangeSection = document.getElementById('dateRangeSection') as HTMLDivElement;
  lastExportInfo = document.getElementById('lastExportInfo') as HTMLDivElement;

  if (!statusDiv || !exportBtn) {
    console.error('[Popup] Failed to find DOM elements');
    return;
  }

  // Event listeners
  exportBtn.addEventListener('click', () => handleExport(false));
  if (exportSinceLastBtn) {
    exportSinceLastBtn.addEventListener('click', handleExportSinceLast);
  }
  
  // Quick range buttons
  document.getElementById('range7d')?.addEventListener('click', () => setDateRange(7));
  document.getElementById('range30d')?.addEventListener('click', () => setDateRange(30));
  document.getElementById('range90d')?.addEventListener('click', () => setDateRange(90));
  document.getElementById('range1y')?.addEventListener('click', () => setDateRange(365));

  // Initialize
  init();
});
