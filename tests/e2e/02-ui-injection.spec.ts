import { test, expect } from './fixtures';
import { navigateToAccount } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

test.describe('02 - UI Injection', () => {

    test('should show export button on account page', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);

        // Wait for content script to inject UI
        await extensionPage.waitForTimeout(3000);

        const exportButton = extensionPage.locator('#ws-exporter-button');
        await expect(exportButton).toBeVisible({ timeout: 10000 });
    });

    test('should inject button within 5 seconds', async ({ extensionPage }) => {
        // Navigate to a fresh account page
        await extensionPage.reload({ waitUntil: 'domcontentloaded' });

        const startTime = Date.now();
        const exportButton = extensionPage.locator('#ws-exporter-button');
        await expect(exportButton).toBeVisible({ timeout: 5000 });
        const endTime = Date.now();

        const injectionTime = endTime - startTime;
        console.log(`[UI Injection] Button appeared in ${injectionTime}ms`);
        expect(injectionTime).toBeLessThan(5000);
    });

    test('should open export panel on button click', async ({ extensionPage }) => {
        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await expect(exportButton).toBeVisible({ timeout: 5000 });

        // Ensure panel starts closed
        const exportPanel = extensionPage.locator('#ws-export-panel');
        if (await exportPanel.isVisible().catch(() => false)) {
            // Panel already open (toggle to close first)
            await exportButton.click();
            await expect(exportPanel).toBeHidden({ timeout: 2000 });
        }

        await exportButton.click();
        await expect(exportPanel).toBeVisible({ timeout: 5000 });
    });

    test('should have correct panel elements', async ({ extensionPage }) => {
        // Panel should already be open from previous test
        const panel = extensionPage.locator('#ws-export-panel');
        await expect(panel).toBeVisible();

        // Check for date inputs
        const startDate = extensionPage.locator('#ws-start-date');
        const endDate = extensionPage.locator('#ws-end-date');
        await expect(startDate).toBeVisible();
        await expect(endDate).toBeVisible();

        // Check for range buttons
        const range7d = extensionPage.locator('[data-days="7"]');
        const range30d = extensionPage.locator('[data-days="30"]');
        const range90d = extensionPage.locator('[data-days="90"]');
        const range1y = extensionPage.locator('[data-days="365"]');
        await expect(range7d).toBeVisible();
        await expect(range30d).toBeVisible();
        await expect(range90d).toBeVisible();
        await expect(range1y).toBeVisible();

        // Check for export button
        const exportBtn = extensionPage.locator('#ws-export-btn');
        await expect(exportBtn).toBeVisible();
    });

    test('should close panel via close button', async ({ extensionPage }) => {
        const closeBtn = extensionPage.locator('#ws-close-panel');
        await closeBtn.click();

        const panel = extensionPage.locator('#ws-export-panel');
        await expect(panel).toBeHidden();
    });

    test('should open and close panel via overlay', async ({ extensionPage }) => {
        // Open panel
        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await exportButton.click();

        const panel = extensionPage.locator('#ws-export-panel');
        await expect(panel).toBeVisible();

        // Click overlay to close
        const overlay = extensionPage.locator('#ws-panel-overlay');
        await overlay.click({ position: { x: 10, y: 10 } }); // Click near edge

        await expect(panel).toBeHidden();
    });

    test('should not have duplicate buttons after re-navigation', async ({ extensionPage, accountUrl }) => {
        // Navigate away
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(1000);

        // Navigate back to account
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(3000);

        // Check for only one button
        const exportButtons = extensionPage.locator('#ws-exporter-button');
        const count = await exportButtons.count();
        expect(count).toBe(1);
    });
});
