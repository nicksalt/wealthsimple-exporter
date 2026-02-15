import { BrowserContext, Page } from '@playwright/test';

export interface ExtensionContext {
    context: BrowserContext;
    page: Page;
}

/**
 * Close the browser context (used for cleanup if needed)
 */
export async function closeBrowser(context: BrowserContext | undefined): Promise<void> {
    if (context) {
        await context.close();
    }
}

/**
 * Check if the extension is loaded by verifying the content script
 * injected our custom element on an account-details page.
 */
export async function verifyExtensionLoaded(page: Page): Promise<boolean> {
    try {
        await page.goto('https://my.wealthsimple.com/app/home', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        return true;
    } catch (error) {
        console.error('[Extension] Failed to verify extension:', error);
        return false;
    }
}
