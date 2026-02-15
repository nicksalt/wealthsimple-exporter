import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';

/**
 * Global setup for Playwright tests.
 * Runs once before all tests to:
 *  1. Validate that required environment variables are set
 *  2. Build the extension into dist/
 */
export default async function globalSetup() {
    dotenv.config();

    // --- Validate environment ---
    const required = ['WS_USERNAME', 'WS_PASSWORD'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
        throw new Error(
            `Missing required env vars: ${missing.join(', ')}. ` +
            'Please set them in .env before running E2E tests.'
        );
    }

    // --- Build extension ---
    const distDir = path.resolve(__dirname, '../../dist');
    const manifestPath = path.join(distDir, 'manifest.json');

    // Rebuild if dist/ is missing or manifest is stale
    const needsBuild = !fs.existsSync(manifestPath);

    if (needsBuild) {
        console.log('[Global Setup] Building extension…');
        execSync('npm run build', {
            cwd: path.resolve(__dirname, '../..'),
            stdio: 'inherit',
        });
    } else {
        console.log('[Global Setup] dist/ exists – skipping build');
    }

    console.log('[Global Setup] Ready');
}
