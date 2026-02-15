import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export default defineConfig({
    testDir: './tests/e2e',

    // Long timeouts for real network calls + auth
    timeout: 60_000, // 60s per test
    expect: {
        timeout: 10_000, // 10s for assertions
    },

    // No parallel execution - tests must run serially to maintain login state
    fullyParallel: false,
    workers: 1,


    // Retry once on CI (useful for network flakiness)
    retries: process.env.CI ? 2 : 0,

    // Reporter
    reporter: [
        ['html', { outputFolder: 'test-results/html' }],
        ['list'],
    ],

    // Output artifacts
    use: {
        // Base URL for Wealthsimple
        baseURL: 'https://my.wealthsimple.com',

        // Capture screenshots and traces on failure
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
    },

    // Single project: Chromium with extension support
    projects: [
        {
            name: 'chromium-extension',
            use: {
                ...devices['Desktop Chrome'],
                // Extension loading requires headed mode
                headless: false,
            },
        },
    ],

    // Global setup/teardown hooks
    globalSetup: './tests/e2e/global-setup.ts',
});
