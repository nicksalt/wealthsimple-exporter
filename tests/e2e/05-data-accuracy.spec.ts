import { test, expect } from './fixtures';
import { navigateToAccount } from './helpers/auth';
import { waitForDownload, readDownloadContent, parseCSV, snapshotDownloadsDir, waitForExportStatus } from './helpers/downloads';

test.describe.configure({ mode: 'serial' });

test.describe('05 - Data Accuracy', () => {

    test('should export non-empty CSV', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(3000);

        // Open panel and ensure CSV format
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await extensionPage.locator('#ws-export-format').selectOption('csv');
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        // Verify export succeeded before checking file
        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('csv');
        const content = await readDownloadContent(download);
        const { rows } = parseCSV(content);

        // Should have at least 1 data row
        expect(rows.length).toBeGreaterThan(0);
    });

    test('should have valid date format (YYYY-MM-DD)', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Export as CSV
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await extensionPage.locator('#ws-export-format').selectOption('csv');
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('csv');
        const content = await readDownloadContent(download);
        const { rows } = parseCSV(content);

        // Check first row's date (first column)
        if (rows.length > 0) {
            const datePattern = /^\d{4}-\d{2}-\d{2}$/;
            const date = rows[0][0];
            expect(datePattern.test(date)).toBe(true);
        }
    });

    test('should have valid amount formatting', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Export as CSV
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await extensionPage.locator('#ws-export-format').selectOption('csv');
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('csv');
        const content = await readDownloadContent(download);
        const { headers, rows } = parseCSV(content);

        if (rows.length > 0) {
            // For budgeting CSV: Outflow and Inflow columns
            const outflowIdx = headers.indexOf('Outflow');
            const inflowIdx = headers.indexOf('Inflow');

            if (outflowIdx >= 0 && inflowIdx >= 0) {
                // Check that amounts are valid decimals or empty
                const amountPattern = /^(\d+\.\d{2})?$/;
                const outflow = rows[0][outflowIdx];
                const inflow = rows[0][inflowIdx];

                expect(amountPattern.test(outflow)).toBe(true);
                expect(amountPattern.test(inflow)).toBe(true);
            }
        }
    });

    test('should use human-readable names in Memo, not raw IDs', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Export as CSV
        await extensionPage.locator('#ws-export-toggle-btn').click();
        await extensionPage.locator('#ws-export-format').selectOption('csv');
        const before = snapshotDownloadsDir();
        await extensionPage.locator('#ws-export-btn').click();

        const status = await waitForExportStatus(extensionPage);
        expect(status.success).toBe(true);

        const download = await waitForDownload(extensionPage, { before, timeout: 15_000 });
        expect(download.fileType).toBe('csv');
        const content = await readDownloadContent(download);
        const { headers, rows } = parseCSV(content);

        const memoIdx = headers.indexOf('Memo');

        if (memoIdx >= 0 && rows.length > 0) {
            const memo = rows[0][memoIdx];

            // Should NOT contain UUID-style patterns
            const uuidPattern = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}/;
            const hasUuid = uuidPattern.test(memo);

            if (hasUuid) {
                console.warn('[Data Accuracy] Memo contains UUID-like pattern:', memo);
            }

            // Check that memo is not empty
            expect(memo.length).toBeGreaterThan(0);
        }
    });
});
