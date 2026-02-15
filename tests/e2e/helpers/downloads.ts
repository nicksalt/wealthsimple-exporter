import { Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { DOWNLOADS_DIR } from '../fixtures';

/** User's system Downloads folder as fallback */
const USER_DOWNLOADS_DIR = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    'Downloads',
);

/** All directories to check for downloaded files */
const SEARCH_DIRS = [DOWNLOADS_DIR, USER_DOWNLOADS_DIR];

/**
 * Represents a downloaded file detected via filesystem polling.
 */
export interface DownloadedFile {
    /** The filename (may be a UUID if CDP allowAndName was used) */
    filename: string;
    /** Full path to the file */
    filePath: string;
    /** The detected file type based on content analysis */
    fileType: 'csv' | 'ofx' | 'qfx' | 'unknown';
}

/**
 * Snapshot the current set of wealthsimple files across ALL search directories.
 * Call this BEFORE triggering the export action.
 */
export function snapshotDownloadsDir(): Map<string, Set<string>> {
    const snapshot = new Map<string, Set<string>>();
    for (const dir of SEARCH_DIRS) {
        if (fsSync.existsSync(dir)) {
            snapshot.set(dir, new Set(fsSync.readdirSync(dir)));
        } else {
            snapshot.set(dir, new Set());
        }
    }
    return snapshot;
}

/**
 * Wait for the export status element to show a result (success or error).
 * Returns the status text. Throws if timeout.
 */
export async function waitForExportStatus(
    page: Page,
    timeout = 30_000,
): Promise<{ success: boolean; text: string }> {
    const statusEl = page.locator('#ws-export-status');
    const exportBtn = page.locator('#ws-export-btn');

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        // Check if status element has text
        const text = await statusEl.textContent().catch(() => '');
        if (text && text.trim().length > 0) {
            const trimmed = text.trim();
            const success = trimmed.includes('Export complete') || trimmed.includes('✓');
            console.log(`[Downloads] Export status: "${trimmed}" (success=${success})`);
            return { success, text: trimmed };
        }

        // Also check if export button reverted (indicates response received)
        const btnText = await exportBtn.textContent().catch(() => '');
        if (btnText && btnText !== 'Exporting...' && btnText !== 'Export') {
            // Button text changed to something other than expected
            console.log(`[Downloads] Export button text: "${btnText}"`);
        }

        await page.waitForTimeout(500);
    }

    // If we get here, status never appeared - capture debug info
    const btnText = await exportBtn.textContent().catch(() => 'unknown');
    const statusText = await statusEl.textContent().catch(() => 'empty');
    throw new Error(
        `Export status never appeared after ${timeout}ms. ` +
        `Button: "${btnText}", Status: "${statusText}"`,
    );
}

/**
 * Detect file type from content.
 */
function detectFileType(filePath: string): 'csv' | 'ofx' | 'qfx' | 'unknown' {
    try {
        const content = fsSync.readFileSync(filePath, 'utf-8').substring(0, 1000);
        if (content.startsWith('Date,') || content.startsWith('"Date"')) return 'csv';
        if (content.includes('OFXHEADER') || content.includes('<OFX>')) {
            // QFX files include INTU.BID tag (Intuit Bank ID)
            if (content.includes('INTU.BID')) return 'qfx';
            return 'ofx';
        }
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Wait for a NEW file to appear in the downloads directory that wasn't
 * in the pre-action snapshot. Polls every 500 ms up to `timeoutMs`.
 *
 * CDP `allowAndName` creates unique GUID-named files in DOWNLOADS_DIR.
 * We detect any new file and read content to determine the file type.
 */
export async function waitForDownload(
    _page: Page,
    opts?: { before?: Map<string, Set<string>>; timeout?: number },
): Promise<DownloadedFile> {
    const before = opts?.before ?? snapshotDownloadsDir();
    const timeout = opts?.timeout ?? 30_000;

    console.log('[Downloads] Searching for new files in:', SEARCH_DIRS.join(', '));

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        // Check DOWNLOADS_DIR for ANY new file (UUID-named from CDP)
        if (fsSync.existsSync(DOWNLOADS_DIR)) {
            const current = fsSync.readdirSync(DOWNLOADS_DIR);
            const previousFiles = before.get(DOWNLOADS_DIR) ?? new Set();
            for (const file of current) {
                if (!previousFiles.has(file) && !file.endsWith('.crdownload') && !file.endsWith('.tmp')) {
                    const fp = path.join(DOWNLOADS_DIR, file);
                    try {
                        const s1 = fsSync.statSync(fp).size;
                        await new Promise(r => setTimeout(r, 500));
                        const s2 = fsSync.statSync(fp).size;
                        if (s1 === s2 && s1 > 0) {
                            const fileType = detectFileType(fp);
                            console.log(`[Downloads] Found new file: ${fp} (${s2} bytes, type=${fileType})`);
                            return { filename: file, filePath: fp, fileType };
                        }
                    } catch { /* file may have been removed between reads */ }
                }
            }
        }

        // Fallback: check USER_DOWNLOADS_DIR for wealthsimple-named files
        if (fsSync.existsSync(USER_DOWNLOADS_DIR)) {
            const current = fsSync.readdirSync(USER_DOWNLOADS_DIR);
            const previousFiles = before.get(USER_DOWNLOADS_DIR) ?? new Set();
            for (const file of current) {
                if (!previousFiles.has(file) && /wealthsimple.*\.(csv|ofx|qfx)$/i.test(file)) {
                    const fp = path.join(USER_DOWNLOADS_DIR, file);
                    try {
                        const s1 = fsSync.statSync(fp).size;
                        await new Promise(r => setTimeout(r, 500));
                        const s2 = fsSync.statSync(fp).size;
                        if (s1 === s2 && s1 > 0) {
                            const fileType = detectFileType(fp);
                            console.log(`[Downloads] Found new file in user Downloads: ${fp}`);
                            return { filename: file, filePath: fp, fileType };
                        }
                    } catch { /* file may have been removed */ }
                }
            }
        }

        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(
        `Download timed out after ${timeout}ms. No new file in: ${SEARCH_DIRS.join(', ')}`,
    );
}

/**
 * Read downloaded file content
 */
export async function readDownloadContent(download: DownloadedFile): Promise<string> {
    const content = await fs.readFile(download.filePath, 'utf-8');
    return content;
}

/**
 * Parse CSV content into header and rows
 */
export interface CSVData {
    headers: string[];
    rows: string[][];
}

export function parseCSV(content: string): CSVData {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
        // Simple CSV parsing - doesn't handle quoted commas perfectly
        // but good enough for our test validation
        return line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
    });

    return { headers, rows };
}

/**
 * Validate CSV headers match expected format
 */
export function validateCSVHeaders(content: string, expectedHeaders: string[]): boolean {
    const { headers } = parseCSV(content);

    if (headers.length !== expectedHeaders.length) {
        console.error('[CSV] Header count mismatch:', headers.length, 'vs', expectedHeaders.length);
        return false;
    }

    for (let i = 0; i < headers.length; i++) {
        if (headers[i] !== expectedHeaders[i]) {
            console.error(`[CSV] Header mismatch at index ${i}: "${headers[i]}" vs "${expectedHeaders[i]}"`);
            return false;
        }
    }

    return true;
}

/**
 * Validate OFX/QFX structure using string matching.
 * OFX is SGML-based (not valid XML), so we use tag presence checks
 * instead of XML parsing.
 */
export function validateOFXStructure(
    content: string,
    accountType: 'banking' | 'investment'
): boolean {
    // Must contain an OFX root tag
    if (!content.includes('<OFX>')) {
        console.error('[OFX] Missing <OFX> tag');
        return false;
    }

    // Must contain sign-on response
    if (!content.includes('SIGNONMSGSRSV1')) {
        console.error('[OFX] Missing SIGNONMSGSRSV1');
        return false;
    }

    if (accountType === 'banking') {
        if (!content.includes('BANKMSGSRSV1')) {
            console.error('[OFX] Missing BANKMSGSRSV1 for banking account');
            return false;
        }
        if (!content.includes('STMTTRNRS')) {
            console.error('[OFX] Missing STMTTRNRS');
            return false;
        }
        console.log('[OFX] Valid banking OFX structure');
        return true;
    } else {
        if (!content.includes('INVSTMTMSGSRSV1')) {
            console.error('[OFX] Missing INVSTMTMSGSRSV1 for investment account');
            return false;
        }
        if (!content.includes('INVSTMTTRNRS')) {
            console.error('[OFX] Missing INVSTMTTRNRS');
            return false;
        }
        console.log('[OFX] Valid investment OFX structure');
        return true;
    }
}

/**
 * Validate filename matches expected pattern
 */
export function validateFilename(
    filename: string,
    expectedPattern: RegExp
): boolean {
    const matches = expectedPattern.test(filename);
    if (!matches) {
        console.error(`[Filename] Does not match pattern ${expectedPattern}: ${filename}`);
    }
    return matches;
}
