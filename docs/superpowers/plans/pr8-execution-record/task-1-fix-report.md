# Task: fix duplicate `stripTsconfigPath` dangling-comma bug in `scaffold-auth-none.ts`

## Context

`tools/create-icore/src/lib/scaffold-strip.ts` had a trailing-comma bug in its
`stripTsconfigPath()`: the regex-based removal of a tsconfig `paths` entry
strips the removed entry's own trailing comma along with it, but if the
removed entry was the *last* one in the `paths` object, there's no trailing
comma on that line to strip — leaving the *preceding* surviving entry's comma
dangling before the closing `}`, which is invalid JSON. That bug was already
fixed in commit `73c6d2b` by appending `pretty.replace(/,(\s*[\]}])/g, '$1')`
after the regex removal.

`tools/create-icore/src/lib/scaffold-auth-none.ts` has its own, independently
defined `stripTsconfigPath` (a true code duplicate, not a shared function)
with the identical bug — and arguably higher exposure, since it's called in a
loop (`removeAuthTsconfigPaths`) over 4 aliases (`@icore/auth-client`,
`@icore/auth-supabase`, `@icore/auth-firebase`, `@icore/auth-mongodb`) when
`authProvider=none`, raising the odds that one of them lands last in the
file's `paths` object.

## Changes

**`tools/create-icore/src/lib/scaffold-auth-none.ts`**

1. Added a local `isEnoent()` helper (same shape as the one already private to
   `tools/create-icore/src/manifest/wire-provider.ts`):
   ```ts
   function isEnoent(err: unknown): boolean {
     return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
   }
   ```
   `wire-provider.ts`'s `isEnoent` is not exported (private to that module),
   and every other file in `manifest/` that needs this check
   (`mergeJsonDeps`/`stripJsonKeys`/`stripTsconfigKeys`, all in the same
   file) just reuses the local one rather than importing across files — there
   is no existing shared/exported version to reuse anywhere in the repo. Given
   that established convention (define it locally next to where it's used
   rather than centralize a one-line helper), a small local duplicate here is
   the cleanest option and keeps `lib/` and `manifest/` decoupled for this
   concern.

2. In `stripTsconfigPath(targetDir, alias)`:
   - Narrowed the `catch { /* ignore */ }` around the initial `readFile` to
     ENOENT-only — a genuine read failure (permissions, malformed path, etc.)
     now propagates instead of being silently swallowed, matching the
     `wire-provider.ts` fix from commit `73c6d2b`.
   - Added the same dangling-comma cleanup as `scaffold-strip.ts`:
     ```ts
     pretty = pretty.replace(/,(\s*[\]}])/g, '$1');
     ```
     applied right after the regex removes the alias's line, before the file
     is written back.
   - The JSON.parse+rewrite fallback branch (used for compact/test-scaffold
     tsconfig files) was previously inside the same swallow-everything `try`;
     it's now outside the narrowed `try/catch`, so a malformed-JSON error in
     that branch also propagates instead of being hidden.

## Test

**New file:** `tools/create-icore/src/lib/__tests__/scaffold-auth-none.unit.test.ts`

No existing test file covered `scaffold-auth-none.ts`, so this is a new file,
matching the fixture style (`mkdtemp` + `writeFile` + `readFile` round-trip)
used by the sibling `scaffold-env.unit.test.ts`.

The test builds a `tsconfig.base.json` fixture where `@icore/auth-mongodb` —
the last alias in `removeAuthTsconfigPaths`'s 4-alias loop — is also
positioned last in the `paths` object (after `@icore/shared`,
`@icore/auth-client`, `@icore/auth-supabase`, `@icore/auth-firebase`). It
calls `removeAuthTsconfigPaths(dir)` and asserts the resulting file:

- parses as JSON without throwing,
- contains no dangling comma (`/,(\s*[\]}])/`),
- ends up with exactly `{ '@icore/shared': [...] }` in `paths` (the 4 auth
  aliases all removed).

### TDD verification

1. **Red** — ran the test against the unfixed `stripTsconfigPath`:
   ```
   ✗ leaves valid, parseable JSON with no dangling comma when the
     last-removed alias was positioned last in paths
   AssertionError: expected [Function] to not throw an error but
   'SyntaxError: Expected double-quoted property name in JSON at position 97
   (line 5 column 5)' was thrown
   ```
   confirming the bug reproduces exactly as described.

2. **Green** — after applying the fix, same test:
   ```
   ✓ |create-icore| src/lib/__tests__/scaffold-auth-none.unit.test.ts (1 test) 6ms
   ```

3. **Full suite regression check** — `nx test create-icore` (NX_DAEMON=false):
   ```
   Test Files  17 passed (17)
        Tests  186 passed (186)
   ```
   No regressions; the new test file is included in that count.

## Lint / build

- `npx prettier --write tools/create-icore/src/lib/scaffold-auth-none.ts
  tools/create-icore/src/lib/__tests__/scaffold-auth-none.unit.test.ts` →
  both reported `(unchanged)`.
- `nx lint create-icore` (NX_DAEMON=false) → `All files pass linting`.
- `nx build create-icore` (NX_DAEMON=false) → CJS/ESM/DTS build succeeded.

## Commit

Committed on top of `73c6d2b` on branch
`bug/error-handling-and-replay-protection-polish` (separate commit, per
instructions — not amended into the existing commit).
