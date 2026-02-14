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

## Branches and Pull Requests

- Keep changes focused and small.
- Add or update tests with behavior changes.
- Include clear rationale in the PR description.
- For export/format changes, include sample input and resulting output.

## Required Checks Before Opening a PR

- `npm test -- --run`
- `npm run build`

## Data Hygiene

- Any test fixtures or sample payloads must be redacted before commit.
- Never commit `.env` files or any file containing secrets/passwords/tokens.
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
