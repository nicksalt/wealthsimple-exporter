# Wealthsimple Exporter

Browser extension for exporting Wealthsimple transactions to CSV (OFX/QFX pending). Designed for users of Actual Budget, YNAB, and Quicken who need better export options than the native monthly statements.

## Privacy & Security

The extension uses a local-first architecture:

- **Auth**: Uses `chrome.cookies` to access your active Wealthsimple session. It never sees or stores your password or MFA codes.
- **Data**: All fetching and CSV generation happens locally. No data is sent to external servers.
- **Audit**: The core logic is in `src/background/transactionService.ts` and uses native `fetch`.
- **Telemetry**: No analytics or tracking included.

## Features

- **UI Injection**: Adds an 'Export transactions' button to the Wealthsimple sidebar.
- **YNAB Ready**: CSV output is formatted to match YNAB's default import requirements.
- **Incremental Sync**: Uses `lastTransactionId` to prevent duplicate imports.
- **Account Support**: Trade, Crypto, Managed, and Cash.

## Installation

1. `git clone https://github.com/nicksalt/wealthsimple-exporter.git`
2. `npm install`
3. `npm run build`
4. Load the `dist` folder via `chrome://extensions/` (Developer Mode).

## Roadmap

- [x] CSV Export
- [ ] OFX/QFX Support
- [ ] Bulk account export
- [ ] Actual Budget API integration

## Contributing

Contributions are welcome. If you find a transaction type that isn't formatted correctly, please open an issue with the (redacted) JSON structure. Feature requests and bug reports are also encouraged.

---
*Disclaimer: Not affiliated with or endorsed by Wealthsimple Technologies Inc.*
