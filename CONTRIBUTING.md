# Contributing to Wealthsimple Exporter

Thanks for contributing.

## Before You Start

- This extension is local-first: transaction data processing/export must stay in-browser.
- Do not add telemetry, analytics, or third-party tracking.
- Do not add non-Wealthsimple API network calls without maintainer approval.
- Never collect credentials, passwords, MFA codes, or other secrets.

## Development Setup

1. Install dependencies: `npm install`
2. Run tests: `npm test -- --run`
3. Build extension: `npm run build`
4. Optional local package check: `npm run zip`

## Testing & E2E

Reliability across different account types is critical. We use **Playwright** for end-to-end (E2E) testing.

- **New Features**: Ideally, any new account support or core logic change should include a corresponding E2E test in `tests/e2e/`.
- **Unit/Integration**: Run `npm test` for general logic checks.

### E2E Setup (Playwright)

To run the E2E suite, you need to configure your environment:

1. Create a `.env` file in the root directory.
2. Provide valid Wealthsimple credentials for a test account.
3. Run tests: `npx playwright test`

> **CRITICAL:** **Never commit your `.env` file or any credentials to the repository.** Ensure `.env` is listed in your `.gitignore`. We use localized testing to avoid sensitive data leaks.

## Branches and Pull Requests

- Keep changes focused and small.
- Add or update tests with behavior changes.
- Include clear rationale in the PR description.
- For export/format changes, include sample input and resulting output.

## Required Checks Before Opening a PR

- `npm test -- --run`
- `npx playwright test` (if applicable)
- `npm run build`

## Data Hygiene

- **NO SECRETS**: Never commit `.env` files or any file containing passwords, session tokens, or account IDs.
- **Redaction**: Any test fixtures or sample payloads added to the repo **must** be redacted. Remove real names, account numbers, and specific balances.
- If unsure whether data is sensitive, treat it as sensitive and redact it.

## Reporting Gaps in Account Coverage

Current validation confidence:

- High confidence: Cash and Credit Card flows
- Partial confidence: TFSA and RRSP (self-directed)
- Needs broader community validation: other account types

If you find unsupported behavior, open an issue and include:

- account type
- transaction type/subtype
- expected output
- redacted payload sample (no account numbers, names, or personal identifiers)

## Coding Style

- TypeScript with strict types preferred.
- Avoid `any` unless justified.
- Keep logic composable and testable.
- Add brief comments only for non-obvious logic.

## Commit Messages

Use concise, action-oriented commits with one coherent change per commit.
