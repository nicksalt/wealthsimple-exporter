import { test, expect } from './fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('03 - Cross-Account Navigation', () => {

    test('should show export button on Cash account', async ({ extensionPage }) => {
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(3000);

        const cashAccountLink = extensionPage.locator('a[href*="/app/account-details/"][href*="non-registered"], a[href*="/app/account-details/"][href*="spend"], a[href*="/app/account-details/"][href*="cash"]').first();

        if (!(await cashAccountLink.isVisible().catch(() => false))) {
            test.skip(true, 'No Cash account found');
            return;
        }

        await cashAccountLink.click();
        await extensionPage.waitForTimeout(3000);

        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await expect(exportButton).toBeVisible({ timeout: 10000 });
    });

    test('should show export button on TFSA', async ({ extensionPage }) => {
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(3000);

        const tfsaLink = extensionPage.locator('a[href*="/app/account-details/"][href*="tfsa"]').first();

        if (!(await tfsaLink.isVisible().catch(() => false))) {
            test.skip(true, 'No TFSA account found');
            return;
        }

        await tfsaLink.click();
        await extensionPage.waitForTimeout(3000);

        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await expect(exportButton).toBeVisible({ timeout: 10000 });
    });

    test('should show export button on RRSP', async ({ extensionPage }) => {
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(3000);

        const rrspLink = extensionPage.locator('a[href*="/app/account-details/"][href*="rrsp"]').first();

        if (!(await rrspLink.isVisible().catch(() => false))) {
            test.skip(true, 'No RRSP account found');
            return;
        }

        await rrspLink.click();
        await extensionPage.waitForTimeout(3000);

        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await expect(exportButton).toBeVisible({ timeout: 10000 });
    });

    test('should show export button on Credit Card', async ({ extensionPage }) => {
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(3000);

        const creditCardLink = extensionPage.locator('a[href*="/app/account-details/"][href*="credit-card"]').first();

        if (!(await creditCardLink.isVisible().catch(() => false))) {
            test.skip(true, 'No Credit Card account found');
            return;
        }

        await creditCardLink.click();
        await extensionPage.waitForTimeout(3000);

        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await expect(exportButton).toBeVisible({ timeout: 10000 });
    });

    test('should NOT show button on non-account pages', async ({ extensionPage }) => {
        await extensionPage.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await extensionPage.waitForTimeout(2000);

        const exportButton = extensionPage.locator('#ws-export-toggle-btn');
        await expect(exportButton).toBeHidden();
    });
});
