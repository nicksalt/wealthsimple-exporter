# Repository Guidelines

- Project: `wealthsimple-exporter`
- Scope: open-source browser extension for local transaction export (Chrome + Edge)

## Project Structure & Module Organization

- Manifest and build entry:
  - `manifest.json`
  - `vite.config.ts`
- Background/service worker:
  - `src/background/index.ts`
  - `src/background/transactionService.ts`
- UI surfaces:
  - `src/content/index.ts`
  - `src/popup/index.ts`
  - `src/popup/index.html`
- Shared logic:
  - `src/utils/types.ts`
  - `src/utils/queries.ts`
  - `src/utils/exporters/*`
- Tests:
  - `tests/unit/*.test.ts`
  - `tests/integration/*.test.ts`

## Build, Test, and Development Commands

- Runtime: Node LTS (current repo uses npm + TypeScript + Vite)
- Install deps: `npm install`
- Dev mode: `npm run dev`
- Production build: `npm run build`
- Tests: `npm test -- --run`
- Create zip artifact: `npm run zip`

If a command fails because dependencies are missing, run `npm install` and retry the exact command once.

## Local Extension Load

1. Run `npm run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer Mode.
4. Load unpacked extension from `dist/`.

## Security & Privacy Guardrails (Hard Requirements)

- Keep all transaction parsing/export local in-browser.
- Do not add external telemetry, analytics, or tracking without explicit maintainer approval.
- Do not add non-Wealthsimple API network calls unless approved and documented.
- Never collect passwords, MFA codes, or raw credentials.
- Keep permissions in `manifest.json` minimal and justified.
- Do not weaken CSP for convenience; any CSP change must include rationale.

## Data & API Behavior

- GraphQL pagination changes must preserve full-page traversal (`hasNextPage`, `endCursor`).
- Amount-sign logic changes must account for account context (especially credit card flows).
- Export format changes must preserve existing import compatibility expectations (YNAB/budget tooling).
- If behavior intentionally changes, tests and docs must be updated in the same PR.

## Testing Guidelines

When editing `transactionService` or exporter logic, validate at minimum:

- Amount normalization edge cases
- Description generation for transfer/credit-card activity variants
- CSV escaping and formatting for commas/quotes/newlines
- Pagination and de-duplication flows

Run:

- `npm run build`
- `npm test -- --run`

## Code Style & Change Conventions

- Language: TypeScript (strict types preferred; avoid `any` unless justified).
- Keep changes focused; avoid unrelated refactors.
- Keep functions composable and testable.
- Add brief comments only where logic is genuinely non-obvious.
- Prefer existing project patterns over introducing new abstractions.

## Commit & PR Guidelines

- Use concise, action-oriented commit messages.
- Keep commits scoped to a coherent change.
- In PR descriptions include:
  - what changed
  - why it changed
  - test/build evidence
  - security/privacy impact
  - known limitations or follow-ups

## Store Release Readiness (Chrome Web Store + Edge Add-ons)

Before submission:

- `manifest.json` permissions reviewed and minimal.
- No remote code loading.
- CSP and host permissions reviewed.
- Listing text matches real behavior (privacy/local-only claims must be accurate).
- Icons/screenshots/promo assets are complete and up to date.
- Built artifact comes from clean local build.
- Smoke-tested in both Chrome and Edge.

## Agent-Specific Operating Rules

- Start by reading `README.md`, `manifest.json`, and this file.
- Verify assumptions in code before answering; do not guess.
- Prefer root-cause fixes to symptomatic patches.
- Call out risk tradeoffs clearly when making security- or format-related changes.
- If introducing dependencies, justify necessity and security impact.
- Do not edit `node_modules`.

## Out of Scope By Default

- Automated account actions (trades/transfers/payments)
- Cloud sync or server-side storage of personal finance data
- Features requiring user credential entry

Require explicit maintainer approval plus a security review plan before touching any out-of-scope area.
