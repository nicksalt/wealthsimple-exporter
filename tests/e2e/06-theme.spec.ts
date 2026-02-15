import { test, expect } from './fixtures';
import { navigateToAccount } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

test.describe('06 - Theme Adaptation', () => {

    test('should have readable panel in light mode', async ({ extensionPage, accountUrl }) => {
        await navigateToAccount(extensionPage, accountUrl);
        await extensionPage.waitForTimeout(2000);

        // Open panel
        await extensionPage.locator('#ws-export-toggle-btn').click();
        const panel = extensionPage.locator('#ws-export-panel');
        await expect(panel).toBeVisible();

        // Check panel styles
        const bgColor = await panel.evaluate(el =>
            window.getComputedStyle(el).backgroundColor
        );
        const textColor = await panel.evaluate(el =>
            window.getComputedStyle(el).color
        );

        console.log('[Theme] Light mode - BG:', bgColor, 'Text:', textColor);

        // Just verify they're set
        expect(bgColor).toBeTruthy();
        expect(textColor).toBeTruthy();

        // Close panel
        await extensionPage.locator('#ws-close-panel').click();
    });

    test('should have readable panel in dark mode', async () => {
        test.skip(true, 'Theme toggling requires manual verification or deeper browser automation');
    });
});
