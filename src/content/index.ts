// Content script - runs on Wealthsimple pages to detect current account and inject export UI

interface AccountInfo {
  accountId: string | null;
  accountName: string | null;
  isAccountPage: boolean;
}

type ExportFormat = 'csv' | 'ofx' | 'qfx';

let exportUIInjected = false;
let contentAccountId: string | null = null;
const EXPORT_FORMAT_KEY = 'preferredExportFormat';

/**
 * Detect current theme (light/dark)
 */
function getTheme(): 'light' | 'dark' {
  // Check for data-theme attribute on html
  const htmlTheme = document.documentElement.getAttribute('data-theme');
  if (htmlTheme === 'light' || htmlTheme === 'dark') return htmlTheme;

  // Check body classes
  if (document.body.classList.contains('light-theme')) return 'light';
  if (document.body.classList.contains('dark-theme')) return 'dark';

  // Check computed background color of body to be sure
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
  // If background is dark (low brightness), assume dark mode
  const rgb = bodyBg.match(/\d+/g);
  if (rgb && rgb.length >= 3) {
    const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
    if (brightness < 128) return 'dark';
  }

  // Fallback to system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light'; // Default
}

function getPanelThemeStyles(theme: 'light' | 'dark') {
  const isDark = theme === 'dark';
  return {
    // Force opaque backgrounds
    bg: isDark ? '#1E1E1E' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#000000',
    border: isDark ? '#444444' : '#CCCCCC',
    subText: isDark ? '#AAAAAA' : '#555555',
    inputBg: isDark ? '#2D2D2D' : '#F5F5F5',
    inputBorder: isDark ? '#555555' : '#DDDDDD',
    secondaryBtn: isDark ? '#2D2D2D' : '#EFEFEF',
    primary: '#5F3DC4',
    shadow: isDark ? '0 10px 25px rgba(0,0,0,0.5)' : '0 10px 25px rgba(0,0,0,0.2)',
  };
}

/**
 * Update theme variables based on current theme
 */
function updateTheme() {
  const theme = getTheme();
  const styles = getPanelThemeStyles(theme);
  const root = document.documentElement;

  // We set these on :root to be accessible by the panel
  // Using !important to ensure they stick if there are conflicting styles (unlikely for vars but good for safety)
  root.style.setProperty('--ws-export-bg', styles.bg);
  root.style.setProperty('--ws-export-text', styles.text);
  root.style.setProperty('--ws-export-border', styles.border);
  root.style.setProperty('--ws-export-subtext', styles.subText);
  root.style.setProperty('--ws-export-input-bg', styles.inputBg);
  root.style.setProperty('--ws-export-input-border', styles.inputBorder);
  root.style.setProperty('--ws-export-secondary-btn', styles.secondaryBtn);
  root.style.setProperty('--ws-export-shadow', styles.shadow);
}

/**
 * Observe theme changes with a more aggressive observer
 */
function observeThemeChanges() {
  const observer = new MutationObserver((mutations) => {
    // On any attribute change to html or body, re-check theme
    updateTheme();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
}

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
  } catch {
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
  } catch {
    // Storage write failed silently
  }
}

async function getPreferredExportFormat(): Promise<ExportFormat> {
  try {
    const result = await chrome.storage.local.get([EXPORT_FORMAT_KEY]);
    const format = result[EXPORT_FORMAT_KEY];
    if (format === 'csv' || format === 'ofx' || format === 'qfx') {
      return format;
    }
  } catch {
    // Fallback to default
  }
  return 'csv';
}

async function savePreferredExportFormat(format: ExportFormat) {
  try {
    await chrome.storage.local.set({ [EXPORT_FORMAT_KEY]: format });
  } catch {
    // Storage write failed silently
  }
}

/**
 * Inject export UI into the sidebar
 */
function injectExportUI(accountId: string): boolean {
  if (exportUIInjected) {
    return true;
  }

  // Find the sidebar container with the action buttons
  // Strategy 1: Look for standard cash/spend account action buttons
  const buttonContainers = document.querySelectorAll('.sc-11fh42v-0.sc-pllw75-0');

  // Strategy 2: Look for Trading account "Add money" / "Transfer" row
  // Based on user snippet: <div class="sc-11fh42v-0 sc-on1vxn-0 ivtWPS haLzPS">
  // We want to find the parent container or inject next to these buttons
  const tradingButtonRows = document.querySelectorAll('.sc-11fh42v-0.sc-on1vxn-0.ivtWPS.haLzPS');

  let targetContainer: Element | null = null;
  let referenceButton: HTMLButtonElement | null = null;
  let injectionMode: 'append' | 'sibling' = 'append';

  // Check Strategy 1 (Standard Accounts)
  const containerKeywords = [
    'Interac e-Transfer',
    'Pay a bill',
    'International transfer',
    'Order a bank draft',
    'Make a payment',
    'View card settings',
    'View statements',
    'Add money',
    'Transfer money',
    'Total cash available',
    'Manage',
    'More actions'
  ];

  for (const container of buttonContainers) {
    const text = container.textContent || '';
    if (containerKeywords.some((keyword) => text.includes(keyword))) {
      targetContainer = container;
      referenceButton = container.querySelector('button');
      injectionMode = 'append';
      break;
    }
  }

  // Check Strategy 2 (Trading Accounts) if standard not found
  if (!targetContainer) {
    for (const row of tradingButtonRows) {
      if (row.textContent?.includes('Add money') || row.textContent?.includes('Transfer')) {
        // We found the row with buttons. We want to inject our button as a sibling to this row,
        // likely in the parent container, so it stacks nicely.
        // OR, we can try to append to this row if it's a flex container for buttons.
        // Let's try to find a sibling container that holds "Total cash available" to confirm location.

        // Use this row as the reference for styling
        referenceButton = row.querySelector('button');

        // Ideally we want to be in the parent of this row
        if (row.parentElement) {
          targetContainer = row.parentElement;
          injectionMode = 'append';
        } else {
          targetContainer = row;
          injectionMode = 'append';
        }
        break;
      }
    }
  }

  // Strategy 3: Specific fallback for "Total cash available" text
  if (!targetContainer) {
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
      if (div.textContent === 'Total cash available' && div.className.includes('fgVTwF')) {
        // This is the header text. We want to find a place nearby.
        // Go up to the common container
        const parent = div.closest('.sc-11fh42v-0.dwHOys');
        if (parent) {
          targetContainer = parent;
          // Find a button inside this container to use as reference
          referenceButton = parent.querySelector('button');
          injectionMode = 'append';
          break;
        }
      }
    }
  }

  if (!targetContainer) {
    return false;
  }

  // Get default dates
  const { startDate, endDate } = getContentDateRange(30);

  // Create the export button wrapper
  const buttonWrapper = document.createElement('div');
  // Use a generic class that likely fits, or copy from reference if available
  buttonWrapper.className = 'sc-11fh42v-0 sc-on1vxn-0 dwHOys haLzPS';
  buttonWrapper.id = 'ws-exporter-button';

  buttonWrapper.innerHTML = `
    <button type="button" role="button" width="100%" class="sc-6gl6fi-0 gfuRMt sc-ss742j-0 kBsKnu" id="ws-export-toggle-btn">
      <div class="sc-11fh42v-0 sc-lgsj5-0 fIYxOg iHJZiL" style="color: currentColor;">
        <svg width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
          <path d="M8 .5a.9.9 0 0 1 .9.9v8.07l2.437-2.437a.9.9 0 1 1 1.273 1.273l-4 4a.9.9 0 0 1-1.273 0l-4-4a.9.9 0 1 1 1.273-1.273L7.1 9.47V1.4A.9.9 0 0 1 8 .5Z" fill="currentColor"/>
          <path d="M1.4 10.5a.9.9 0 0 1 .9.9v1.7c0 .364 0 .584.014.748.012.149.03.174.024.162a.35.35 0 0 0 .153.152c.014-.006-.01.012.162.025.163.013.383.013.747.013h9.2c.365 0 .585 0 .748-.013.149-.013.174-.031.162-.025a.35.35 0 0 0 .153-.152c-.007.012.012-.013.024-.162.014-.164.014-.384.014-.748v-1.7a.9.9 0 1 1 1.8 0v1.7c0 .336 0 .642-.02.895-.022.264-.071.55-.215.83a2.151 2.151 0 0 1-.94.94c-.28.144-.566.193-.83.215-.253.02-.559.02-.894.02H3.4c-.336 0-.642 0-.895-.02a2.184 2.184 0 0 1-.832-.215 2.151 2.151 0 0 1-.94-.94 2.18 2.18 0 0 1-.213-.83c-.02-.253-.02-.559-.02-.895v-1.7a.9.9 0 0 1 .9-.9Z" fill="currentColor"/>
        </svg>
      </div>
      <p class="sc-7l25en-0 deKTom">Export transactions</p>
    </button>
  `;

  if (targetContainer) {
    if (injectionMode === 'append') {
      targetContainer.appendChild(buttonWrapper);
    } else {
      // Sibling
      targetContainer.parentElement?.insertBefore(buttonWrapper, targetContainer.nextSibling);
    }
  }

  const applyStyles = () => {
    if (!referenceButton) return;

    // If styling a trading account button, the classes might be different. 
    // We try to match the class list of the reference button to our button
    const injectedButton = buttonWrapper.querySelector('button');
    const injectedIcon = buttonWrapper.querySelector('button > div') as HTMLElement;
    const injectedText = buttonWrapper.querySelector('button > p') as HTMLElement;

    // Copy Classes
    if (injectedButton) injectedButton.className = referenceButton.className;

    const referenceIcon = referenceButton.querySelector('div');
    if (injectedIcon && referenceIcon) injectedIcon.className = referenceIcon.className;

    const referenceText = referenceButton.querySelector('p');
    if (injectedText && referenceText) injectedText.className = referenceText.className;

    // Copy Computed Styles (for colors that aren't handling by classes correctly on theme switch)
    const computed = window.getComputedStyle(referenceButton);
    const computedText = referenceText ? window.getComputedStyle(referenceText) : null;
    const computedIcon = referenceIcon ? window.getComputedStyle(referenceIcon) : null;

    if (injectedButton) {
      // Copy critical layout and color styles
      injectedButton.style.backgroundColor = computed.backgroundColor;
      injectedButton.style.border = computed.border;
      injectedButton.style.borderRadius = computed.borderRadius;
      injectedButton.style.padding = computed.padding;
      injectedButton.style.width = '100%'; // Ensure full width

      // If the reference button has specific text color, use it. But often text color is on the <p>
      injectedButton.style.color = computed.color;
    }

    if (injectedText && computedText) {
      injectedText.style.color = computedText.color;
      injectedText.style.fontSize = computedText.fontSize;
      injectedText.style.fontWeight = computedText.fontWeight;
    }

    if (injectedIcon && computedIcon) {
      injectedIcon.style.color = computedIcon.color;
      // SVG inside might need fill
      const svg = injectedIcon.querySelector('svg');
      const refSvg = referenceIcon?.querySelector('svg');
      if (svg && refSvg) {
        const computedSvg = window.getComputedStyle(refSvg);
        svg.style.fill = computedSvg.fill;
        svg.style.color = computedSvg.color;
      }
    }
  };

  applyStyles();

  if (referenceButton) {
    const styleObserver = new MutationObserver(() => {
      applyStyles();
    });
    styleObserver.observe(referenceButton, { attributes: true, attributeFilter: ['class', 'style'] });

    const themeObserver = new MutationObserver(() => {
      setTimeout(applyStyles, 50);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  // Check if panel already exists (from a previous injection)
  let panel = document.getElementById('ws-export-panel');
  if (panel) panel.remove();

  let overlay = document.getElementById('ws-panel-overlay');
  if (overlay) overlay.remove();

  panel = document.createElement('div');
  panel.id = 'ws-export-panel';
  panel.setAttribute(
    'style',
    `display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--ws-export-bg); border: 1px solid var(--ws-export-border); border-radius: 12px; padding: 24px; z-index: 2147483647; min-width: 320px; max-width: 90vw; box-shadow: var(--ws-export-shadow); color: var(--ws-export-text); transition: background 0.3s, color 0.3s;`
  );
  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; color: var(--ws-export-text); font-size: 18px; font-weight: 600;">Export Transactions</h3>
      <button id="ws-close-panel" style="background: none; border: none; color: var(--ws-export-subtext); cursor: pointer; font-size: 24px; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">&times;</button>
    </div>
    
    <div style="margin-bottom: 16px;">
      <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
        <button class="ws-range-btn" data-days="7" style="flex: 1; min-width: 60px; padding: 8px 12px; background: var(--ws-export-secondary-btn); border: 1px solid var(--ws-export-input-border); border-radius: 6px; color: var(--ws-export-text); cursor: pointer; font-size: 13px;">7d</button>
        <button class="ws-range-btn active" data-days="30" style="flex: 1; min-width: 60px; padding: 8px 12px; background: #5F3DC4; border: 1px solid #5F3DC4; border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px;">30d</button>
        <button class="ws-range-btn" data-days="90" style="flex: 1; min-width: 60px; padding: 8px 12px; background: var(--ws-export-secondary-btn); border: 1px solid var(--ws-export-input-border); border-radius: 6px; color: var(--ws-export-text); cursor: pointer; font-size: 13px;">90d</button>
        <button class="ws-range-btn" data-days="365" style="flex: 1; min-width: 60px; padding: 8px 12px; background: var(--ws-export-secondary-btn); border: 1px solid var(--ws-export-input-border); border-radius: 6px; color: var(--ws-export-text); cursor: pointer; font-size: 13px;">1y</button>
      </div>
      
      <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-direction: column;">
        <div>
          <label style="display: block; color: var(--ws-export-subtext); font-size: 12px; margin-bottom: 4px;">Start Date</label>
          <input type="date" id="ws-start-date" value="${startDate}" style="width: 100%; padding: 8px; background: var(--ws-export-input-bg); border: 1px solid var(--ws-export-input-border); border-radius: 6px; color: var(--ws-export-text); font-size: 14px;">
        </div>
        <div>
          <label style="display: block; color: var(--ws-export-subtext); font-size: 12px; margin-bottom: 4px;">End Date</label>
          <input type="date" id="ws-end-date" value="${endDate}" style="width: 100%; padding: 8px; background: var(--ws-export-input-bg); border: 1px solid var(--ws-export-input-border); border-radius: 6px; color: var(--ws-export-text); font-size: 14px;">
        </div>
      </div>
      
      <div id="ws-last-export-info" style="display: none; color: var(--ws-export-subtext); font-size: 12px; margin-bottom: 12px; padding: 8px; background: var(--ws-export-input-bg); border-radius: 6px;"></div>
      
      <div style="display: flex; gap: 8px; flex-direction: column;">
        <div>
          <label style="display: block; color: var(--ws-export-subtext); font-size: 12px; margin-bottom: 4px;">Format</label>
          <select id="ws-export-format" style="width: 100%; padding: 8px; background: var(--ws-export-input-bg); border: 1px solid var(--ws-export-input-border); border-radius: 6px; color: var(--ws-export-text); font-size: 14px;">
            <option value="csv">CSV</option>
            <option value="ofx">OFX</option>
            <option value="qfx">QFX (Quicken)</option>
          </select>
        </div>
        <button id="ws-export-btn" style="width: 100%; padding: 12px; background: #5F3DC4; border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600;">Export Transactions</button>
        <button id="ws-export-since-last" style="display: none; width: 100%; padding: 10px; background: var(--ws-export-input-bg); border: 1px solid #5F3DC4; border-radius: 6px; color: #5F3DC4; cursor: pointer; font-size: 13px;">Export Since Last</button>
      </div>
      
      <div id="ws-export-status" style="margin-top: 12px; color: var(--ws-export-text); font-size: 13px; text-align: center; min-height: 20px;"></div>
    </div>
  `;

  overlay = document.createElement('div');
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
  const formatSelect = document.getElementById('ws-export-format') as HTMLSelectElement;
  let exportSinceLastRequested = false;

  const selectedFormat = (): ExportFormat => {
    const value = formatSelect?.value;
    if (value === 'ofx' || value === 'qfx') return value;
    return 'csv';
  };

  getPreferredExportFormat().then((format) => {
    if (formatSelect) {
      formatSelect.value = format;
    }
  });

  formatSelect?.addEventListener('change', () => {
    void savePreferredExportFormat(selectedFormat());
  });

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
        (b as HTMLElement).style.background = 'var(--ws-export-secondary-btn)';
        (b as HTMLElement).style.borderColor = 'var(--ws-export-input-border)';
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
        format: selectedFormat(),
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
    } catch {
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
      (btn as HTMLElement).style.background = 'var(--ws-export-secondary-btn)';
      (btn as HTMLElement).style.borderColor = 'var(--ws-export-input-border)';
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

      // Poll for the container
      const maxRetries = 50;
      const pollInterval = 100;
      let retries = 0;

      const attemptInject = () => {
        const success = injectExportUI(accountInfo.accountId!);
        if (success) return;

        if (retries < maxRetries) {
          retries++;
          setTimeout(attemptInject, pollInterval);
        }
      };

      attemptInject();
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
  } else {
    // Even if URL hasn't changed, DOM might have loaded the sidebar later
    // Check if we need to inject
    tryInjectUI();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initialize theme
updateTheme();
observeThemeChanges();
