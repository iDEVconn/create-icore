# Task 2 Execution Report: `state.ts` — git-log-derived applied-check

## What Changed

Created two new files implementing the exact-match migration state tracking:

1. **`tools/create-icore/src/migrate/state.ts`** — The `isApplied(id: string, projectDir: string): Promise<boolean>` function that checks whether a migration entry has been applied by examining git commit subjects. Implements exact-match semantics via `git log --format=%s` and string equality in JavaScript, deliberately avoiding `git log --grep` (verified to be impossible to get exact-match semantics from due to how `--fixed-strings` and anchors interact).

2. **`tools/create-icore/src/migrate/__tests__/state.unit.test.ts`** — Complete TDD test suite with 4 test cases covering:
   - Returns false when no commits exist
   - Returns false when no matching commit exists
   - Returns true for an exact-match commit
   - Does not false-positive on substring matches (regression guard)

All tests use a real temporary git repository (not mocks) initialized, configured, and cleaned up per test via `mkdtemp` and `rm`.

## Test Output

```
✓ |create-icore| src/migrate/__tests__/state.unit.test.ts (4 tests) 169ms

Test Files  23 passed (23)
     Tests  225 passed (225)
```

All 4 `isApplied` tests passing. No pre-existing test failures. Overall suite: 225/225 passing.

## Deviations from Brief

None. Implementation follows the brief exactly:

- Test structure: word-for-word copy from brief
- Implementation: word-for-word copy from brief
- Commit message: follows brief's specification
- Test execution: verified against exact pattern `-t "isApplied"` as specified

## Self-Review Findings

- **git error handling:** Correctly detects "does not have any commits yet" error message and returns false (empty repo case).
- **exactness:** Uses exact string comparison (`line === marker`) after splitting on newlines, never substring matching.
- **no false positives:** Test case explicitly guards against `foo-bar` matching `foo-barbaz`, verified passing.
- **async/await:** Proper Promise-based implementation with `promisify(execFile)`.
- **marker format:** Correctly builds `migrate: ${id}` as the exact commit subject to match.

## Template Drift

Checked `tools/create-icore/templates/` — no drift detected. Working tree clean except for the two new files.

## Commit

```
8a48d8d feat(create-icore): add git-log-derived migrate applied-check (isApplied)
```

Commit SHA: `8a48d8d` on branch `feature/migrate-cli`
