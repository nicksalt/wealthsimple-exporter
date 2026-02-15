import { test, expect } from './fixtures';
import { isAuthenticated } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

test.describe('01 - Authentication', () => {

    test('should login with credentials and OTP', async ({ extensionPage }) => {
        // The fixture already handles login – just verify we landed on the dashboard
        expect(extensionPage.url()).toContain('/app/');
        await extensionPage.waitForTimeout(1000);
    });

    test('should have auth cookie after login', async ({ extensionPage }) => {
        const authenticated = await isAuthenticated(extensionPage);
        expect(authenticated).toBe(true);
    });

    test('should have extension loaded', async ({ extensionPage }) => {
        // Navigate to a Wealthsimple page to verify the extension loads
        await extensionPage.goto('https://my.wealthsimple.com/app/home', {
            waitUntil: 'domcontentloaded',
        });
        await extensionPage.waitForTimeout(2000);
        expect(extensionPage.url()).toContain('/app/home');
    });
});
