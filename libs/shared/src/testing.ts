// Test-only surface of @icore/shared.
//
// The strategy CONTRACT HARNESS lives here, NOT in the production `index.ts`:
// it uses Vitest globals (describe/it/expect) and must never compile into the
// shipped library. Import it from test files via '@icore/shared/testing'.
//
// The harness implementation sits under `strategies/__tests__/` so the prod
// build (tsconfig.lib.json excludes `__tests__`) skips it entirely.
export {
  runAuthContract,
  type AuthContractHelpers,
} from './strategies/__tests__/auth.contract.unit.test';
export { runStorageContract } from './strategies/__tests__/storage.contract.unit.test';
export { runDBContract } from './strategies/__tests__/db.contract.unit.test';
