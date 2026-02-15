/**
 * Shared Playwright fixtures for E2E tests.
 *
 * Provides a single persistent browser context (with the extension loaded)
 * and a shared page that is reused across every test file.
 * Authentication is handled automatically on first access.
 */

import { test as base, chromium, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { loginToWealthsimple, isAuthenticated } from './helpers/auth';

dotenv.config();

/** Directory where Chrome will save extension-initiated downloads */
export const DOWNLOADS_DIR = path.resolve(__dirname, '../../test-results/downloads');

/* ---------- worker-scoped fixtures (created once per worker) ---------- */

type WorkerFixtures = {
    extensionContext: BrowserContext;
    extensionPage: Page;
    accountUrl: string;
};

export const test = base.extend<{}, WorkerFixtures>({

    /* --- Browser context with the extension side-loaded --- */
    extensionContext: [async ({}, use) => {
        const extensionPath = path.resolve(__dirname, '../../dist');
        const userDataDir = path.resolve(__dirname, '../../.playwright-profile');

        // Ensure downloads dir exists and is empty
        if (fs.existsSync(DOWNLOADS_DIR)) {
            for (const f of fs.readdirSync(DOWNLOADS_DIR)) {
                fs.unlinkSync(path.join(DOWNLOADS_DIR, f));
            }
        } else {
            fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
        }

        // Write Chrome preferences to direct extension downloads to our test dir
        const defaultDir = path.join(userDataDir, 'Default');
        fs.mkdirSync(defaultDir, { recursive: true });
        const prefsPath = path.join(defaultDir, 'Preferences');
        let prefs: Record<string, unknown> = {};
        if (fs.existsSync(prefsPath)) {
            try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8')); } catch { /* ignore */ }
        }
        // Set download dir and disable prompt
        (prefs as any).download = {
            default_directory: DOWNLOADS_DIR,
            prompt_for_download: false,
        };
        (prefs as any).savefile = { default_directory: DOWNLOADS_DIR };
        fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));

        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
                '--no-sandbox',
            ],
            acceptDownloads: true,
            viewport: { width: 1280, height: 720 },
        });

        // Use CDP to redirect ALL browser-level downloads (chrome.downloads API)
        try {
            const firstPage = context.pages()[0] || await context.newPage();
            const cdp = await context.newCDPSession(firstPage);
            await cdp.send('Browser.setDownloadBehavior', {
                behavior: 'allowAndName',
                downloadPath: DOWNLOADS_DIR,
                eventsEnabled: true,
            });
            console.log('[Fixtures] CDP Browser.setDownloadBehavior set to', DOWNLOADS_DIR);
        } catch (e) {
            console.warn('[Fixtures] CDP setDownloadBehavior failed (may be deprecated):', e);
        }

        await use(context);
        await context.close();
    }, { scope: 'worker' }],

    /* --- Single page shared across all tests --- */
    extensionPage: [async ({ extensionContext }, use) => {
        const pages = extensionContext.pages();
        const page = pages.length > 0 ? pages[0] : await extensionContext.newPage();

        // Ensure we are authenticated before any test runs
        console.log('[Fixtures] Checking authentication…');
        await page.goto('https://my.wealthsimple.com/app/home', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });
        await page.waitForTimeout(2000);

        if (!(await isAuthenticated(page))) {
            console.log('[Fixtures] Not authenticated – logging in…');
            await loginToWealthsimple(page);
        } else {
            console.log('[Fixtures] Already authenticated');
        }

        await use(page);
    }, { scope: 'worker' }],

    /* --- Auto-discovered account URL (falls back to env var) --- */
    accountUrl: [async ({ extensionPage }, use) => {
        let url = process.env.WS_TEST_ACCOUNT_URL;

        if (!url || url.includes('your-account-id') || url === '/app/home') {
            console.log('[Fixtures] Auto-discovering account URL…');

            // Make sure we're on a page that lists accounts
            if (!extensionPage.url().includes('/app/')) {
                await extensionPage.goto('https://my.wealthsimple.com/app/home', {
                    waitUntil: 'domcontentloaded',
                });
            }
            await extensionPage.waitForTimeout(3000);

            // Try to find any account-details link on the page
            const accountLink = extensionPage.locator('a[href*="/app/account-details/"]').first();
            try {
                await accountLink.waitFor({ state: 'visible', timeout: 10_000 });
                const href = await accountLink.getAttribute('href');
                if (href) {
                    url = href;
                    console.log('[Fixtures] Discovered account URL:', url);
                }
            } catch {
                console.warn('[Fixtures] Could not discover account – using /app/home');
                url = '/app/home';
            }
        }

        // Normalise to absolute URL
        if (url && !url.startsWith('http')) {
            url = `https://my.wealthsimple.com${url}`;
        }

        await use(url ?? 'https://my.wealthsimple.com/app/home');
    }, { scope: 'worker' }],
});

export { expect } from '@playwright/test';
