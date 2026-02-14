# Wealthsimple Exporter

Browser extension for exporting Wealthsimple transactions to CSV, OFX, and QFX. Designed for users of Actual Budget, YNAB, Quicken who need better export options than the native monthly statements.

## Account Coverage

Validation confidence currently:

- High confidence: Cash and Credit Card
- Partial confidence: TFSA and RRSP (self-directed)
- Community validation needed: other account types

If you hit an unsupported transaction/account variant, open an issue with a redacted payload sample.

## Privacy & Security

The extension uses a local-first architecture:

- **Auth**: Uses `chrome.cookies` to access your active Wealthsimple session. It never sees or stores your password or MFA codes.
- **Data**: All fetching and CSV generation happens locally. No data is sent to external servers.
- **Audit**: The core logic is in `src/background/transactionService.ts` and uses native `fetch`.
- **Telemetry**: No analytics or tracking included.

## Features

- **UI Injection**: Adds an 'Export transactions' button to the Wealthsimple sidebar.
- **Flexible Export Formats**: Export as CSV, OFX, or QFX from the same flow.
- **YNAB Ready**: CSV output is formatted to match YNAB's default import requirements.
- **Incremental Sync**: Uses `lastTransactionId` to prevent duplicate imports.
- **Account Support**: Cash and Credit Card are primary tested flows, with ongoing expansion across other account types.

## Installation

1. `git clone https://github.com/nicksalt/wealthsimple-exporter.git`
2. `npm install`
3. `npm run build`
4. Load the `dist` folder via `chrome://extensions/` (Developer Mode).


## Contributing

Contributions are welcome.

- Read `CONTRIBUTING.md` before opening a PR.
- For behavior gaps, include redacted payload samples in issues.

---
*Disclaimer: Not affiliated with or endorsed by Wealthsimple Technologies Inc.*
