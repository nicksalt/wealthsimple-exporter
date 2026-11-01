# Wealthsimple Exporter (Unofficial)

> **Disclaimer:** This project is an unofficial browser extension. It is not affiliated with, maintained, authorized, or endorsed by Wealthsimple Technologies Inc. or any of its affiliates. Use at your own risk.

A privacy-focused browser extension for exporting Wealthsimple transactions to CSV, OFX, and QFX. Designed for users of Actual Budget, YNAB, and Quicken who need more granular export options than native monthly statements.

Inspired in part by [ws-api-python](https://github.com/gboudreau/ws-api-python), an unofficial Python API for Wealthsimple.

---

## ✨ Features

- **Direct UI Integration**: Adds an "Export Transactions" button directly to the Wealthsimple sidebar.
- **Multiple Formats**: Export as **CSV**, **CSV (signed amounts)**, **OFX**, or **QFX**.
- **YNAB Optimized**: The default CSV uses YNAB's `Outflow`/`Inflow` columns.
- **Signed CSV**: For tools that want one `Amount` column (negative = outflow), such as Pocketsmith or MS Money.
- **Credit Card OFX**: Credit card accounts export as proper OFX credit card statements.
- **Incremental Syncing**: Tracks `lastTransactionId` to help prevent duplicate imports into your budget.
- **Privacy First**: Local processing with zero telemetry or external data leakage.

## 📊 Account Coverage

| Account Type | Validation Status |
| :--- | :--- |
| **Cash** | High Confidence ✅ |
| **Credit Card** | High Confidence ✅ |
| **TFSA/RRSP (Self-directed)** | Partial Confidence ⚠️ |
| **Other Variants** | Community Validation Needed 🔍 |

*If you encounter an unsupported transaction or account variant, please open an issue with a redacted payload sample.*

## 📁 Choosing a Format

| Format | Best for | Notes |
| :--- | :--- | :--- |
| **CSV** | YNAB, Actual Budget | `Date, Payee, Memo, Outflow, Inflow`. Investment accounts use a trading layout with a signed `Amount`. |
| **CSV (signed amounts)** | Pocketsmith, MS Money, spreadsheets | `Date, Payee, Memo, Amount`, with negative amounts for outflows. |
| **OFX** | Pocketsmith, GnuCash, Actual Budget, most OFX importers | Credit card accounts use the OFX credit card statement format. |
| **QFX** | Quicken (see below) | OFX plus an Intuit `INTU.BID`. |

### Quicken and QFX

Quicken only accepts QFX files from institutions registered with Intuit, and Wealthsimple isn't registered. Quicken may therefore reject the file with "unable to verify the financial institution". The extension doesn't put another bank's ID in the file to get around this, because that misrepresents where the file came from. If Quicken rejects the QFX, export **CSV (signed amounts)** and use Quicken's CSV import instead, where your Quicken version supports it.

## 🔒 Privacy & Security

The extension uses a strictly local-first architecture:

- **Authentication**: Uses `chrome.cookies` to piggyback on your active Wealthsimple session. It **never** sees or stores your password or MFA codes.
- **Data Handling**: All fetching and file generation happens entirely within your browser. No data is sent to external servers.
- **Transparency**: Core logic is located in `src/background/transactionService.ts` for easy auditing.
- **Zero Telemetry**: No analytics, tracking, or "home-phoning" is included.

## 🚀 Getting Started

### Prerequisites
- Google Chrome or a Chromium-based browser (Brave, Edge, etc.)
- Node.js and npm

### Installation
1. **Clone the repo:**
   ```bash
   git clone https://github.com/nicksalt/wealthsimple-exporter.git
   ```
2. **Install dependencies:**
   ```bash
   cd wealthsimple-exporter && npm install
   ```
3. **Build the project:**
   ```bash
   npm run build
   ```
4. **Load in Browser:**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `dist` folder.

### Testing (Optional)
This project uses Playwright for E2E testing. To run tests:
- Set up a `.env` file with your test credentials (see `CONTRIBUTING.md`).
- **Never** commit this `.env` file.
- Run `npx playwright test`.

## 🤝 Contributing

Contributions are welcome! Please read `CONTRIBUTING.md` before opening a Pull Request. For behavior gaps or bugs, please include redacted payload samples in your issue reports.

---

*Wealthsimple Exporter is an independent open-source project.*
