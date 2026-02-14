# Testing Strategy

We are using **Vitest** for testing.

## Priorities
1. **Unit Tests (`tests/unit`)**:
   - `CSVExporter`: Ensure correct headers and escaping.
   - `OFXExporter`: Validate against the OFX schema.
   - `DateUtils`: Ensure timezone-safe date formatting.

2. **Integration Tests (`tests/integration`)**:
   - Mock GraphQL responses and ensure the `TransactionService` parses them correctly.

## Commands
- `npm test`: Run all tests.
- `npm run test:ui`: Open the Vitest UI for debugging.
