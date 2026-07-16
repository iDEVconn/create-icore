# Task 1 fix report: writeClientEnv duplicate VITE_AUTH_HAS_* keys

## Finding

`apps/templates/client-shadcn/.env.example` already ships `VITE_AUTH_HAS_OAUTH=false` /
`VITE_AUTH_HAS_MAGIC_LINK=false` (with an explanatory comment) as placeholders. The old
`writeClientEnv()` in `tools/create-icore/src/lib/scaffold-env.ts` read that file and then
**appended** a second, freshly-computed `VITE_AUTH_HAS_OAUTH=${supported}` /
`VITE_AUTH_HAS_MAGIC_LINK=${supported}` block (plus a duplicate explanatory comment) onto the
end. For any `--auth=supabase` or `--auth=firebase` scaffold this produced a generated
`apps/client/.env` with each key defined twice with opposite values (`false` from the template,
then `true` appended). It happened to work because dotenv/Vite's env loading is last-wins, but
it's a contradictory, confusing generated file for a scaffolding tool to ship.

## Change 1 — `tools/create-icore/src/lib/scaffold-env.ts`

`writeClientEnv()` now follows the same in-place regex-replace convention already used by
`writeAuthEnv`, `writeUploadEnv`, `writeGatewayEnv`, and `writePaymentEnv` in this file, instead
of concatenating a new block:

```ts
export async function writeClientEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/client/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    const supported = OAUTH_MAGIC_LINK_PROVIDERS.has(opts.authProvider);
    const next = env
      .replace(/^VITE_AUTH_HAS_OAUTH=.*$/m, `VITE_AUTH_HAS_OAUTH=${supported}`)
      .replace(/^VITE_AUTH_HAS_MAGIC_LINK=.*$/m, `VITE_AUTH_HAS_MAGIC_LINK=${supported}`);
    await writeFile(join(targetDir, 'apps/client/.env'), next);
  } catch {
    // .env.example may not exist in older snapshots
  }
}
```

This replaces the existing placeholder line in place — the explanatory comment above the two
vars in `.env.example` (lines 8-9: "Set by the generator based on --auth=<provider>. Gates OAuth
buttons + the magic-link toggle in LoginForm...") is preserved untouched since the code no longer
writes its own duplicate comment.

## Change 2 — `apps/templates/client-shadcn/.env.example`

**No change needed.** The file already has the placeholder lines (`VITE_AUTH_HAS_OAUTH=false`,
`VITE_AUTH_HAS_MAGIC_LINK=false`) with the explanatory comment directly above them, in exactly
the shape the regex-replace convention expects. The bug was entirely in the generator's
replace-vs-append behavior, not in the template.

## Change 3 — `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts`

Two problems with the old tests:

1. The `fixture()` helper wrote a `.env.example` containing only `VITE_API_URL=/api\n` — it did
   **not** include the `VITE_AUTH_HAS_OAUTH`/`VITE_AUTH_HAS_MAGIC_LINK` placeholder lines that
   the real template ships. This didn't match the real template shape and would have hidden the
   fact that the old code was appending rather than replacing (there was nothing to duplicate
   against).
2. All 4 assertions used `expect(env).toContain('VITE_AUTH_HAS_OAUTH=true')` /
   `...=false`, which passes even when both a `false` line and a `true` line are both present
   in the file (i.e. it does not detect duplication) — this is exactly the gap the reviewer
   flagged.

Fixes:

- `fixture()` now writes a `.env.example` that mirrors the real template: `VITE_API_URL=/api`,
  a blank line, the two-line explanatory comment, then `VITE_AUTH_HAS_OAUTH=false` /
  `VITE_AUTH_HAS_MAGIC_LINK=false`.
- Added a `countAssignments(text, key)` helper that counts `^KEY=` line matches via a
  multiline regex, and every test now asserts `countAssignments(env, 'VITE_AUTH_HAS_OAUTH')`
  and `...MAGIC_LINK` are each exactly `1`, in addition to asserting the final value via
  `toMatch(/^VITE_AUTH_HAS_OAUTH=<value>$/m)`.

I proved (outside the test file, via a throwaway `node -e` script simulating the old
append-based `writeClientEnv` against the new fixture shape) that `countAssignments` returns
`2` for the old buggy behavior — i.e. the strengthened assertion is structurally capable of
catching the exact bug the reviewer flagged, even though the fix itself is already correct so
the test file's own run only exercises the passing path.

## Verification

```
$ npx nx test create-icore -- scaffold-env.unit.test.ts
 Test Files  16 passed (16)
      Tests  175 passed (175)
```

(Nx runs the whole project's test target regardless of the file filter arg in this setup; all
16 files / 175 tests pass, including the 4 strengthened `writeClientEnv` tests.)

```
$ npx nx test create-icore
 Test Files  16 passed (16)
      Tests  175 passed (175)
```

No regressions.

```
$ npx prettier --write tools/create-icore/src/lib/scaffold-env.ts tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
Prettier: All files formatted correctly

$ npx nx lint create-icore
✔ All files pass linting
```

## Changeset

This branch (`bug/shadcn-oauth-gating-and-dead-tokens`) already carries
`.changeset/pr4-shadcn-ui-gaps.md` for the OAuth/magic-link gating work this fix builds on.
Appended a sentence describing the dedup fix to that same changeset rather than adding a new
file, since it's the same PR batch.

## Out of scope — pre-existing drift noticed but not touched

Before making any edits, the worktree already had uncommitted changes (unrelated to this task)
under `tools/create-icore/templates/apps/microservices/auth/.env.example`,
`tools/create-icore/templates/libs/auth-strategies/postgres/package.json`,
`tools/create-icore/templates/libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`,
and `.../testing/mock-postgres-auth.ts` — these are `templates/` build-artifact mirrors that are
stale relative to their `apps/microservices/auth/.env.example` / `libs/auth-strategies/postgres/*`
source (which already picked up the HMAC transport-signing work from commits `468de22` /
`7a8e203` merged earlier on this branch). Confirmed via file mtimes that this drift predates my
edits in this session. Left untouched and NOT committed — out of scope for this finding, and
committing it here would conflate an unrelated build-artifact sync into this bug-fix commit.
