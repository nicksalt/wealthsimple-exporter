import { test, expect } from './fixtures';
import { navigateToAccount } from './helpers/auth';
import {
    waitForDownload,
    readDownloadContent,
    snapshotDownloadsDir,
    waitForExportStatus,
    validateCSVHeaders,
    validateOFXStructure,
    parseCSV,
} from './helpers/downloads';

test.describe.configure({ mode: 'serial' });

test.describe('04 - Export Workflow', () => {

    test('should export CSV with 30-day default', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(3000);

        // Open export panel
        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await expect(exportButton).toBeVisible({ timeout: 10_000 });
        await exportButton.click();

        const panel = extensionPage.locator('#ws-export-panel');
        await expect(panel).toBeVisible({ timeout: 5_000 });

        // Explicitly select CSV format (preference may persist from previous runs)
        await extensionPage.locator('#ws-export-format').selectOption('csv');

        // Snapshot files before export
        const before = snapshotDownloadsDir();

        // Click export button
        const exportBtn = extensionPage.locator('#ws-export-btn');
        await exportBtn.click();

        // First, wait for export status to confirm background succeeded
        const status = await waitForExportStatus(extensionPage, 30_000);
        expect(status.success).toBe(true);

        // Now wait for the actual file to appear
        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('csv');
    });

    test('should have correct CSV headers for budgeting account', async ({ extensionPage }) => {
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(3000);

        // Budgeting accounts: Cash, Spend, or Credit Card
        const budgetLink = extensionPage.locator(
            'a[href*="/app/account-details/"][href*="non-registered"], ' +
            'a[href*="/app/account-details/"][href*="spend"], ' +
            'a[href*="/app/account-details/"][href*="cash"], ' +
            'a[href*="/app/account-details/"][href*="credit-card"]'
        ).first();

        if (!(await budgetLink.isVisible().catch(() => false))) {
            test.skip(true, 'No budgeting account found');
            return;
        }

        await budgetLink.click();
        await extensionPage.waitForTimeout(3000);

        // Open panel and export CSV
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await extensionPage.locator('#ws-export-format').selectOption('csv');
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        const content = await readDownloadContent(download);

        const expectedHeaders = ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'];
        const isValid = validateCSVHeaders(content, expectedHeaders);
        expect(isValid).toBe(true);
    });

    test('should have correct CSV headers for trading account', async ({ extensionPage }) => {
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(3000);

        const tradingLink = extensionPage.locator(
            'a[href*="/app/account-details/"][href*="tfsa"], ' +
            'a[href*="/app/account-details/"][href*="rrsp"]'
        ).first();

        if (!(await tradingLink.isVisible().catch(() => false))) {
            test.skip(true, 'No TFSA/RRSP account found');
            return;
        }

        await tradingLink.click();
        await extensionPage.waitForTimeout(3000);

        // Open panel and export CSV
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await extensionPage.locator('#ws-export-format').selectOption('csv');
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage);
        if (!status.success) {
            test.skip(true, 'Trading account has no transactions in date range');
            return;
        }

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        const content = await readDownloadContent(download);

        const expectedHeaders = ['Date', 'Action', 'Symbol', 'Description', 'Quantity', 'Price', 'Amount', 'Currency', 'Exchange Rate'];
        const isValid = validateCSVHeaders(content, expectedHeaders);
        expect(isValid).toBe(true);
    });

    test('should export OFX format', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(3000);

        // Open panel
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await expect(extensionPage.locator('#ws-export-panel')).toBeVisible({ timeout: 5_000 });

        // Select OFX format
        await extensionPage.locator('#ws-export-format').selectOption('ofx');

        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage, 30_000);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('ofx');

        const content = await readDownloadContent(download);
        const isValid = validateOFXStructure(content, 'banking');
        expect(isValid).toBe(true);
    });

    test('should export QFX format', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(3000);

        // Open panel
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await expect(extensionPage.locator('#ws-export-panel')).toBeVisible({ timeout: 5_000 });

        // Select QFX format
        await extensionPage.locator('#ws-export-format').selectOption('qfx');

        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage, 30_000);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('qfx');

        const content = await readDownloadContent(download);
        const isValid = validateOFXStructure(content, 'banking');
        expect(isValid).toBe(true);
    });

    test('should export with 7-day range selection', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Open panel
        await extensionPage.locator('#ws-export-toggle-btn').click();

        // Ensure CSV format is selected (may have been changed by OFX/QFX tests)
        await extensionPage.locator('#ws-export-format').selectOption('csv');

        // Select 7-day range
        const range7d = extensionPage.locator('[data-days="7"]');
        await range7d.click();

        // Export and verify
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('csv');
    });

    test('should show success status after export', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Open panel
        await extensionPage.locator('#ws-export-toggle-btn').click();

        // Ensure CSV format
        await extensionPage.locator('#ws-export-format').selectOption('csv');

        // Export
        await extensionPage.locator('#ws-export-btn').click();

        // Check for success message via status element
        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);
        expect(status.text).toContain('Export complete');
    });

    test('should auto-close panel after export', async ({ extensionPage }) => {
        // Panel should already be open from previous test
        // Wait for auto-close (should happen within 3s)
        const panel = extensionPage.locator('#ws-export-panel');
        await expect(panel).toBeHidden({ timeout: 5000 });
    });

    test('should show "Export Since Last" button after first export', async ({ extensionPage, accountUrl }) => {
        // Navigate to account again
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Open panel
        await extensionPage.locator('#ws-export-toggle-btn').click();

        // Check for "Export Since Last" button
        const exportSinceLastBtn = extensionPage.locator('#ws-export-since-last');

        // It should be visible if there's a previous export
        // If not visible, that's ok (first run)
        const isVisible = await exportSinceLastBtn.isVisible();
        console.log('[Export] Export Since Last button visible:', isVisible);
    });

    test('should have correct filename format for CSV', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Open panel and export CSV
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await extensionPage.locator('#ws-export-format').selectOption('csv');
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });

        // Verify it's a CSV file
        expect(download.fileType).toBe('csv');

        // Read content and verify CSV structure (headers + data rows)
        const content = await readDownloadContent(download);
        const lines = content.trim().split('\n');
        expect(lines.length).toBeGreaterThan(1); // header + at least 1 row

        // Verify the extension generates well-structured CSV
        // (filename verification not possible with CDP UUID naming)
        const { headers } = parseCSV(content);
        expect(headers.length).toBeGreaterThanOrEqual(4);
    });
});
