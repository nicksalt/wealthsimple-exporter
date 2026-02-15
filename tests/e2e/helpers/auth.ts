import { Page } from '@playwright/test';
import { generateSync } from 'otplib';

/**
 * Check if the user is already authenticated by checking for the auth cookie
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
    try {
        const cookies = await page.context().cookies('https://my.wealthsimple.com');
        const authCookie = cookies.find(c => c.name === '_oauth2_access_v2');
        return !!authCookie && authCookie.value.length > 0;
    } catch (error) {
        console.error('[Auth] Failed to check auth status:', error);
        return false;
    }
}

/**
 * Login to Wealthsimple with credentials from environment variables.
 * Handles email, password, and TOTP (if required).
 */
export async function loginToWealthsimple(page: Page): Promise<void> {
    const username = process.env.WS_USERNAME;
    const password = process.env.WS_PASSWORD;
    const otpSecret = process.env.WS_OTP_SECRET?.trim();

    if (!username || !password) {
        throw new Error('WS_USERNAME and WS_PASSWORD must be set in .env');
    }

    console.log('[Auth] Navigating to login page…');
    await page.goto('https://my.wealthsimple.com/app/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
    });

    // If we're already on the dashboard the session is still valid
    await page.waitForTimeout(2000);
    if (page.url().includes('/app/home') || page.url().includes('/app/account')) {
        if (await isAuthenticated(page)) {
            console.log('[Auth] Already authenticated after navigation');
            return;
        }
    }

    console.log('[Auth] Filling in credentials…');

    // ---------- Email ----------
    const emailInput = page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    await emailInput.fill(username);

    // ---------- Check if password is already visible (single-page login) ----------
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const passwordAlreadyVisible = await passwordInput.isVisible().catch(() => false);

    if (passwordAlreadyVisible) {
        // Single-page login: both email and password are on the same page
        console.log('[Auth] Single-page login detected – filling password…');
        await passwordInput.fill(password);

        const loginButton = page.locator('button:has-text("Log in"), button[type="submit"]').first();
        await loginButton.click();
        console.log('[Auth] Submitted credentials');
    } else {
        // Two-step login: email first, then password on a separate step
        const continueButton = page.locator('button:has-text("Continue"), button:has-text("Log in"), button[type="submit"]').first();
        await continueButton.click();
        console.log('[Auth] Submitted email');

        await page.waitForTimeout(2000);
        await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
        await passwordInput.fill(password);

        const loginButton = page.locator('button:has-text("Log in"), button:has-text("Continue"), button[type="submit"]').first();
        await loginButton.click();
        console.log('[Auth] Submitted password');
    }

    // ---------- Wait for page to settle after login ----------
    console.log('[Auth] Waiting for login response…');
    await page.waitForTimeout(5000);
    console.log('[Auth] Current URL after submit:', page.url());

    // Check for error messages
    const errorText = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    if (errorText) {
        console.log('[Auth] Error detected on login page – taking debug screenshot');
        await page.screenshot({ path: 'test-results/debug-login-error.png' });
    }

    // ---------- OTP (if prompted) ----------
    const otpInput = page
        .locator('input[type="text"][inputmode="numeric"], input[name="otp"], input[placeholder*="code"], input[autocomplete="one-time-code"]')
        .first();
    const isOtpVisible = await otpInput.isVisible().catch(() => false);
    console.log('[Auth] OTP input visible:', isOtpVisible);

    if (isOtpVisible) {
        if (!otpSecret) {
            throw new Error('OTP is required but WS_OTP_SECRET is not set in .env');
        }

        console.log('[Auth] OTP required – generating TOTP code…');
        const otpCode = generateSync({ secret: otpSecret });
        console.log('[Auth] Generated OTP code (length:', otpCode.length, ')');

        // Use pressSequentially to trigger React change/input events
        // (.fill() may not trigger them, leaving the submit button disabled)
        await otpInput.click();
        await otpInput.pressSequentially(otpCode, { delay: 50 });

        // Wait for the submit button to become enabled
        const otpSubmit = page
            .locator('button[data-testid="otp-submit-button"], button:has-text("Verify"), button:has-text("Submit"), button[type="submit"]')
            .first();

        try {
            await otpSubmit.waitFor({ state: 'visible', timeout: 5_000 });
            // Wait for button to become enabled
            await page.waitForTimeout(1000);
            const isDisabled = await otpSubmit.isDisabled();
            console.log('[Auth] Submit button disabled:', isDisabled);
            if (!isDisabled) {
                await otpSubmit.click();
                console.log('[Auth] Submitted OTP via button');
            } else {
                // Try pressing Enter as fallback
                console.log('[Auth] Submit button still disabled – pressing Enter');
                await otpInput.press('Enter');
                console.log('[Auth] Submitted OTP via Enter key');
            }
        } catch {
            // Fallback: press Enter on the OTP input
            console.log('[Auth] Submit button not found – pressing Enter');
            await otpInput.press('Enter');
            console.log('[Auth] Submitted OTP via Enter key');
        }
        console.log('[Auth] Submitted OTP');
        await page.waitForTimeout(3000);
        console.log('[Auth] URL after OTP submit:', page.url());
    } else {
        console.log('[Auth] No OTP prompt detected');
    }

    // ---------- Wait for dashboard ----------
    console.log('[Auth] Waiting for dashboard…');
    // Wait for a URL that means "logged in" — exclude /app/login
    try {
        await page.waitForFunction(
            () => {
                const url = window.location.href;
                return url.includes('/app/') && !url.includes('/app/login');
            },
            { timeout: 30_000 },
        );
    } catch {
        console.log('[Auth] Dashboard wait timed out. Current URL:', page.url());
        await page.screenshot({ path: 'test-results/debug-dashboard-timeout.png' });
        throw new Error(`Login timed out waiting for dashboard. Current URL: ${page.url()}`);
    }
    await page.waitForTimeout(2000);
    console.log('[Auth] Reached dashboard. URL:', page.url());

    // Verify cookie is present
    if (!(await isAuthenticated(page))) {
        const cookies = await page.context().cookies('https://my.wealthsimple.com');
        console.log('[Auth] All cookies:', cookies.map(c => `${c.name} (${c.value.length} chars)`).join(', '));
        await page.screenshot({ path: 'test-results/debug-no-cookie.png' });
        throw new Error('Login appeared to succeed but auth cookie is missing');
    }

    console.log('[Auth] Login successful');
}

/**
 * Navigate to a specific account page.
 * If no url is supplied falls back to WS_TEST_ACCOUNT_URL or /app/home.
 */
export async function navigateToAccount(page: Page, accountUrl?: string): Promise<void> {
    const url = accountUrl || process.env.WS_TEST_ACCOUNT_URL || '/app/home';
    const fullUrl = url.startsWith('http') ? url : `https://my.wealthsimple.com${url}`;

    console.log(`[Auth] Navigating to: ${fullUrl}`);
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);
}
