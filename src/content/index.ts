// Content script - runs on Wealthsimple pages to detect current account and inject export UI

interface AccountInfo {
  accountId: string | null;
  accountName: string | null;
  isAccountPage: boolean;
}

let exportUIInjected = false;
let contentAccountId: string | null = null;

/**
 * Extract account information from the current page
 */
function extractAccountInfo(): AccountInfo {
  const url = window.location.href;
  
  let accountId: string | null = null;
  let accountName: string | null = null;
  let isAccountPage = false;
  
  // Wealthsimple account detail pages: /app/account-details/{account-id}
  const accountDetailsMatch = url.match(/\/app\/account-details\/([a-zA-Z0-9-_]+)/);
  if (accountDetailsMatch) {
    accountId = accountDetailsMatch[1];
    isAccountPage = true;
    console.log('[Content] Detected account details page:', accountId);
  }
  
  // Try to extract account name from page title or heading
  if (isAccountPage) {
    // Look for account name in h1 or page header
    const h1 = document.querySelector('h1');
    if (h1) {
      accountName = h1.textContent?.trim() || null;
    }
    
    // Try other common selectors
    if (!accountName) {
      const title = document.querySelector('[data-testid="account-title"]');
      if (title) {
        accountName = title.textContent?.trim() || null;
      }
    }
    
    // Fallback: extract from account ID (e.g., "tfsa-xxx" -> "TFSA")
    if (!accountName && accountId) {
      const typeMatch = accountId.match(/^([a-z]+)-/);
      if (typeMatch) {
        accountName = typeMatch[1].toUpperCase();
      }
    }
  }
  
  console.log('[Content] Account detection:', { accountId, accountName, isAccountPage, url });
  
  return { accountId, accountName, isAccountPage };
}

/**
 * Get default date range for content script (last 30 days)
 */
function getContentDateRange(days: number = 30): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

/**
 * Get last export info from storage (content script version)
 */
async function getContentLastExportInfo(
  accountId: string
): Promise<{ date: string; count: number; lastTransactionId?: string } | null> {
  try {
    const key = `lastExport_${accountId}`;
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  } catch (error) {
    console.error('[Content] Failed to get last export info:', error);
    return null;
  }
}

/**
 * Save export info to storage (content script version)
 */
async function saveContentExportInfo(
  accountId: string,
  date: string,
  count: number,
  lastTransactionId?: string
) {
  try {
    const key = `lastExport_${accountId}`;
    await chrome.storage.local.set({ [key]: { date, count, lastTransactionId } });
  } catch (error) {
    console.error('[Content] Failed to save export info:', error);
  }
}

/**
 * Inject export UI into the sidebar
 */
function injectExportUI(accountId: string): boolean {
  if (exportUIInjected) {
    console.log('[Content] Export UI already injected');
    return true;
  }
  
  console.log('[Content] Attempting to inject export UI...');
  
  // Find the sidebar container with the action buttons
  const buttonContainers = document.querySelectorAll('.sc-11fh42v-0.sc-pllw75-0');
  console.log('[Content] Found', buttonContainers.length, 'potential containers');
  
  let targetContainer: Element | null = null;
  
  const containerKeywords = [
    'Interac e-Transfer',
    'Pay a bill',
    'International transfer',
    'Order a bank draft',
    'Make a payment',
    'View card settings',
    'View statements',
  ];

  for (const container of buttonContainers) {
    const text = container.textContent || '';
    console.log('[Content] Container text preview:', text.substring(0, 100));
    if (containerKeywords.some((keyword) => text.includes(keyword))) {
      targetContainer = container;
      console.log('[Content] Found target container!');
      break;
    }
  }
  
  if (!targetContainer) {
    console.log('[Content] Could not find sidebar action buttons container');
    return false;
  }
  
  console.log('[Content] Found target container, injecting export panel...');
  
  // Get default dates
  const { startDate, endDate } = getContentDateRange(30);
  
  // Create the export button wrapper
  const buttonWrapper = document.createElement('div');
  buttonWrapper.className = 'sc-11fh42v-0 sc-on1vxn-0 dwHOys haLzPS';
  buttonWrapper.id = 'ws-exporter-button';

  const referenceButton = targetContainer.querySelector('button');
  
  // Create the button only; the panel/overlay live at document.body to avoid stacking contexts.
  buttonWrapper.innerHTML = `
    <button type="button" role="button" width="100%" class="sc-6gl6fi-0 gfuRMt sc-ss742j-0 kBsKnu" id="ws-export-toggle-btn" style="color: inherit;">
      <div class="sc-11fh42v-0 sc-lgsj5-0 fIYxOg iHJZiL" style="color: currentColor;">
        <svg width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
          <path d="M8 .5a.9.9 0 0 1 .9.9v8.07l2.437-2.437a.9.9 0 1 1 1.273 1.273l-4 4a.9.9 0 0 1-1.273 0l-4-4a.9.9 0 1 1 1.273-1.273L7.1 9.47V1.4A.9.9 0 0 1 8 .5Z" fill="currentColor"/>
          <path d="M1.4 10.5a.9.9 0 0 1 .9.9v1.7c0 .364 0 .584.014.748.012.149.03.174.024.162a.35.35 0 0 0 .153.152c.014-.006-.01.012.162.025.163.013.383.013.747.013h9.2c.365 0 .585 0 .748-.013.149-.013.174-.031.162-.025a.35.35 0 0 0 .153-.152c-.007.012.012-.013.024-.162.014-.164.014-.384.014-.748v-1.7a.9.9 0 1 1 1.8 0v1.7c0 .336 0 .642-.02.895-.022.264-.071.55-.215.83a2.151 2.151 0 0 1-.94.94c-.28.144-.566.193-.83.215-.253.02-.559.02-.894.02H3.4c-.336 0-.642 0-.895-.02a2.184 2.184 0 0 1-.832-.215 2.151 2.151 0 0 1-.94-.94 2.18 2.18 0 0 1-.213-.83c-.02-.253-.02-.559-.02-.895v-1.7a.9.9 0 0 1 .9-.9Z" fill="currentColor"/>
        </svg>
      </div>
      <p class="sc-7l25en-0 deKTom">Export transactions</p>
    </button>
  `;
  
  targetContainer.appendChild(buttonWrapper);

  if (referenceButton) {
    const injectedButton = buttonWrapper.querySelector('button');
    const injectedIcon = buttonWrapper.querySelector('button > div');
    const injectedText = buttonWrapper.querySelector('button > p');
    const referenceIcon = referenceButton.querySelector('div');
    const referenceText = referenceButton.querySelector('p');

    if (injectedButton) injectedButton.className = referenceButton.className;
    if (injectedIcon && referenceIcon) injectedIcon.className = referenceIcon.className;
    if (injectedText && referenceText) injectedText.className = referenceText.className;
  }

  const panel = document.createElement('div');
  panel.id = 'ws-export-panel';
  panel.setAttribute(
    'style',
    'display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 24px; z-index: 2147483647; min-width: 320px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.4);'
  );
  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; color: #F5F4F4; font-size: 18px; font-weight: 600;">Export Transactions</h3>
      <button id="ws-close-panel" style="background: none; border: none; color: #999; cursor: pointer; font-size: 24px; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">&times;</button>
    </div>
    
    <div style="margin-bottom: 16px;">
      <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
        <button class="ws-range-btn" data-days="7" style="flex: 1; min-width: 60px; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #F5F4F4; cursor: pointer; font-size: 13px;">7d</button>
        <button class="ws-range-btn active" data-days="30" style="flex: 1; min-width: 60px; padding: 8px 12px; background: #5F3DC4; border: 1px solid #5F3DC4; border-radius: 6px; color: #F5F4F4; cursor: pointer; font-size: 13px;">30d</button>
        <button class="ws-range-btn" data-days="90" style="flex: 1; min-width: 60px; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #F5F4F4; cursor: pointer; font-size: 13px;">90d</button>
        <button class="ws-range-btn" data-days="365" style="flex: 1; min-width: 60px; padding: 8px 12px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #F5F4F4; cursor: pointer; font-size: 13px;">1y</button>
      </div>
      
      <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-direction: column;">
        <div>
          <label style="display: block; color: #999; font-size: 12px; margin-bottom: 4px;">Start Date</label>
          <input type="date" id="ws-start-date" value="${startDate}" style="width: 100%; padding: 8px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #F5F4F4; font-size: 14px;">
        </div>
        <div>
          <label style="display: block; color: #999; font-size: 12px; margin-bottom: 4px;">End Date</label>
          <input type="date" id="ws-end-date" value="${endDate}" style="width: 100%; padding: 8px; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; color: #F5F4F4; font-size: 14px;">
        </div>
      </div>
      
      <div id="ws-last-export-info" style="display: none; color: #999; font-size: 12px; margin-bottom: 12px; padding: 8px; background: #252525; border-radius: 6px;"></div>
      
      <div style="display: flex; gap: 8px; flex-direction: column;">
        <button id="ws-export-btn" style="width: 100%; padding: 12px; background: #5F3DC4; border: none; border-radius: 6px; color: #F5F4F4; cursor: pointer; font-size: 14px; font-weight: 600;">Export Transactions</button>
        <button id="ws-export-since-last" style="display: none; width: 100%; padding: 10px; background: #2a2a2a; border: 1px solid #5F3DC4; border-radius: 6px; color: #5F3DC4; cursor: pointer; font-size: 13px;">Export Since Last</button>
      </div>
      
      <div id="ws-export-status" style="margin-top: 12px; color: #F5F4F4; font-size: 13px; text-align: center; min-height: 20px;"></div>
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'ws-panel-overlay';
  overlay.setAttribute(
    'style',
    'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2147483646;'
  );

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  
  // Setup event handlers
  setupExportPanel(accountId);
  
  exportUIInjected = true;
  contentAccountId = accountId;
  console.log('[Content] Export UI injected successfully');
  return true;
}

/**
 * Setup export panel event handlers
 */
function setupExportPanel(accountId: string) {
  const toggleBtn = document.getElementById('ws-export-toggle-btn');
  const panel = document.getElementById('ws-export-panel');
  const overlay = document.getElementById('ws-panel-overlay');
  const closeBtn = document.getElementById('ws-close-panel');
  const exportBtn = document.getElementById('ws-export-btn');
  const exportSinceLastBtn = document.getElementById('ws-export-since-last');
  const startDateInput = document.getElementById('ws-start-date') as HTMLInputElement;
  const endDateInput = document.getElementById('ws-end-date') as HTMLInputElement;
  const lastExportInfo = document.getElementById('ws-last-export-info');
  const exportStatus = document.getElementById('ws-export-status');
  let exportSinceLastRequested = false;
  
  // Load last export info
  getContentLastExportInfo(accountId).then(info => {
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
    }
  });
  
  // Toggle panel
  const showPanel = () => {
    if (panel && overlay) {
      panel.style.display = 'block';
      overlay.style.display = 'block';
    }
  };
  
  const hidePanel = () => {
    if (panel && overlay) {
      panel.style.display = 'none';
      overlay.style.display = 'none';
    }
  };
  
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPanel();
  });
  
  closeBtn?.addEventListener('click', hidePanel);
  overlay?.addEventListener('click', hidePanel);
  
  // Range buttons
  document.querySelectorAll('.ws-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt((btn as HTMLElement).dataset.days || '30');
      const range = getContentDateRange(days);
      if (startDateInput) startDateInput.value = range.startDate;
      if (endDateInput) endDateInput.value = range.endDate;
      
      // Update active state
      document.querySelectorAll('.ws-range-btn').forEach(b => {
        (b as HTMLElement).style.background = '#2a2a2a';
        (b as HTMLElement).style.borderColor = '#444';
      });
      (btn as HTMLElement).style.background = '#5F3DC4';
      (btn as HTMLElement).style.borderColor = '#5F3DC4';
    });
  });
  
  // Export button
  exportBtn?.addEventListener('click', async () => {
    if (!startDateInput || !endDateInput || !exportStatus) return;
    
    exportBtn.textContent = 'Exporting...';
    exportBtn.setAttribute('disabled', 'true');
    exportStatus.textContent = '';
    
    try {
      const lastExport = await getContentLastExportInfo(accountId);
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_TRANSACTIONS',
        accountId: accountId,
        startDate: startDateInput.value,
        endDate: endDateInput.value,
        lastTransactionId: exportSinceLastRequested ? lastExport?.lastTransactionId || null : null,
      });
      exportSinceLastRequested = false;
      
      if (response && response.success) {
        exportStatus.textContent = '✓ Export complete!';
        exportStatus.style.color = '#4ade80';
        
        // Save export info
        await saveContentExportInfo(
          accountId,
          endDateInput.value,
          response.transactionCount || 0,
          response.lastTransactionId
        );
        
        // Update last export display
        const info = await getContentLastExportInfo(accountId);
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
        }
        
        setTimeout(() => {
          hidePanel();
          exportBtn.textContent = 'Export Transactions';
          exportBtn.removeAttribute('disabled');
          if (exportStatus) exportStatus.textContent = '';
        }, 2000);
      } else {
        exportStatus.textContent = response?.error || 'Export failed';
        exportStatus.style.color = '#f87171';
        exportBtn.textContent = 'Export Transactions';
        exportBtn.removeAttribute('disabled');
      }
    } catch (error) {
      exportSinceLastRequested = false;
      exportStatus.textContent = 'Export failed';
      exportStatus.style.color = '#f87171';
      exportBtn.textContent = 'Export Transactions';
      exportBtn.removeAttribute('disabled');
    }
  });
  
  // Export since last
  exportSinceLastBtn?.addEventListener('click', async () => {
    if (!startDateInput || !endDateInput) return;

    const lastExport = await getContentLastExportInfo(accountId);
    const today = new Date();

    if (!lastExport) {
      const range = getContentDateRange(365);
      startDateInput.value = range.startDate;
      endDateInput.value = range.endDate;
    } else if (lastExport.lastTransactionId) {
      exportSinceLastRequested = true;
      exportBtn?.click();
      return;
    } else {
      const lastDate = new Date(lastExport.date);
      lastDate.setDate(lastDate.getDate() + 1);
      startDateInput.value = lastDate.toISOString().split('T')[0];
      endDateInput.value = today.toISOString().split('T')[0];
    }

    document.querySelectorAll('.ws-range-btn').forEach((btn) => {
      (btn as HTMLElement).style.background = '#2a2a2a';
      (btn as HTMLElement).style.borderColor = '#444';
    });

    exportBtn?.click();
  });
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ACCOUNT_INFO') {
    const accountInfo = extractAccountInfo();
    sendResponse(accountInfo);
    return true;
  }
  
  return false;
});

// Inject export UI when on account page
function tryInjectUI() {
  const accountInfo = extractAccountInfo();
  if (accountInfo.isAccountPage && accountInfo.accountId) {
    if (!exportUIInjected || contentAccountId !== accountInfo.accountId) {
      // Remove old UI if switching accounts
      const oldButton = document.getElementById('ws-exporter-button');
      if (oldButton) {
        oldButton.remove();
      }
      exportUIInjected = false;
      const oldPanel = document.getElementById('ws-export-panel');
      const oldOverlay = document.getElementById('ws-panel-overlay');
      oldPanel?.remove();
      oldOverlay?.remove();
      
      // Wait longer for the page to fully load and retry if needed
      const attemptInject = (retries = 0) => {
        const success = injectExportUI(accountInfo.accountId!);
        if (!success && retries < 5) {
          console.log('[Content] Injection failed, retrying in 1s...', retries + 1);
          setTimeout(() => attemptInject(retries + 1), 1000);
        }
      };
      
      setTimeout(() => attemptInject(), 2000);
    }
  }
}

// Try to inject UI on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryInjectUI);
} else {
  tryInjectUI();
}

// Send account info when page changes (for SPAs)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('[Content] URL changed, updating account info');
    const accountInfo = extractAccountInfo();
    
    // Try to inject UI on new page
    tryInjectUI();
    
    // Notify background/popup of account change
    chrome.runtime.sendMessage({
      type: 'ACCOUNT_PAGE_CHANGED',
      accountInfo
    }).catch(() => {
      // Popup might not be open, that's okay
    });
  }
});

observer.observe(document.body, { childList: true, subtree: true });

console.log('[Content] Wealthsimple Exporter content script loaded');
