### Task 3: Generator option — `session` (flag, config, wizard, validation)

**Files:**

- Modify: `tools/create-icore/src/lib/options.ts`, `config.ts`, `prompts.ts`
- Modify (tests): `tools/create-icore/src/lib/__tests__/prompts.unit.test.ts`, `config.unit.test.ts`, `validate-options.unit.test.ts` (+ any typed `CreateIcoreOptions` fixture that now needs `session`)

**Interfaces:**

- Produces: `type SessionStoreKind = 'redis' | 'memory'`; `CreateIcoreOptions.session: SessionStoreKind`; `parseFlags` reads `--session=<v>`; config key `session`; `validateOptions` normalises `auth=none` ⇒ `session: 'redis'` + warning when `memory` was requested.

- [ ] **Step 1: Write the failing tests.** `prompts.unit.test.ts` (add to `parseFlags`/`collectOptions` describes; the file already mocks `@clack/prompts`):

```ts
it('reads --session=memory', () => {
  expect(parseFlags(['my-app', '--session=memory']).session).toBe('memory');
});
```

and in the `collectOptions` describe (using the existing `baseArgv` pattern, auth NOT none so the question would be asked):

```ts
describe('collectOptions — session store', () => {
  const argv = (extra: string[]) => [
    'my-app',
    '--auth=supabase',
    '--db=supabase',
    '--upload=none',
    '--payment=none',
    '--jobs=none',
    '--ai=none',
    '--example=none',
    '--ui=shadcn',
    '--transport=tcp',
    '--package-manager=yarn',
    '--no-git',
    '--no-install',
    ...extra,
  ];

  it('takes --session without asking', async () => {
    const opts = await collectOptions({ argv: argv(['--session=memory']), cwd: '.' });
    expect(opts.session).toBe('memory');
  });

  it('does not ask for a session store when auth=none (there are no sessions) and uses redis', async () => {
    const opts = await collectOptions({
      argv: [
        'my-app',
        '--auth=none',
        '--upload=none',
        '--payment=none',
        '--jobs=none',
        '--ai=none',
        '--ui=shadcn',
        '--transport=tcp',
        '--package-manager=yarn',
        '--no-git',
        '--no-install',
      ],
      cwd: '.',
    });
    expect(opts.session).toBe('redis');
  });
});
```

`config.unit.test.ts`: `validateConfig({ session: 'memory' })` → `{ session: 'memory' }`; `validateConfig({ session: 'dynamo' })` throws `ConfigFileError` mentioning `redis, memory`. `validate-options.unit.test.ts`: add `session: 'redis'` to its typed `base`, then:

```ts
it('ignores --session=memory when auth=none (no sessions at all) and says so', () => {
  const { warnings, corrected } = validateOptions({
    ...base,
    authProvider: 'none' as const,
    example: 'none' as const,
    session: 'memory' as const,
  });
  expect(corrected.session).toBe('redis');
  expect(warnings.join(' ')).toMatch(/session.*auth=none|auth=none.*session/i);
});

it('keeps session=memory for an authenticated project', () => {
  expect(validateOptions({ ...base, session: 'memory' as const }).corrected.session).toBe('memory');
});
```

- [ ] **Step 2: Run to verify it fails** — `yarn nx test create-icore --testFile=prompts`, `--testFile=config`, `--testFile=validate-options`. Expected: FAIL.

- [ ] **Step 3: Implement.** `options.ts`: add `export type SessionStoreKind = 'redis' | 'memory';`, `session: SessionStoreKind;` in `CreateIcoreOptions` (after `transport`), and in `validateOptions` before `return`:

```ts
if (opts.authProvider === 'none' && opts.session !== 'redis') {
  warnings.push('--session has no effect with auth=none (there are no sessions) — ignored');
  corrected = { ...corrected, session: 'redis' };
}
```

`config.ts`: `const SESSION_STORES: readonly SessionStoreKind[] = ['redis', 'memory'];` (import the type) and `if ('session' in obj) result.session = assertEnum('session', obj['session'], SESSION_STORES);`. `prompts.ts`: import `SessionStoreKind`; in `parseFlags` add `case 'session': out.session = v as SessionStoreKind; break;`; in `collectOptions`, after the transport question:

```ts
const session: SessionStoreKind =
  flags.session ??
  (authProvider === 'none'
    ? 'redis'
    : ((await p.select({
        message: 'Where should login sessions be stored?',
        options: [
          {
            value: 'redis' as SessionStoreKind,
            label: 'Redis (recommended — survives restarts, several instances)',
          },
          {
            value: 'memory' as SessionStoreKind,
            label: 'In memory (no Redis service; a restart logs everyone out, one instance only)',
          },
        ],
        initialValue: 'redis' as SessionStoreKind,
      })) as SessionStoreKind));
if (p.isCancel(session)) throw new Error('cancelled');
```

and add `session,` to the returned object (next to `transport`). Then run the whole `create-icore` suite and fix every typed `CreateIcoreOptions` fixture the compiler/tests flag by adding `session: 'redis'` (`grep -rn "CreateIcoreOptions = {" tools/create-icore/src`).

- [ ] **Step 4: Run to verify it passes** — `yarn nx run-many -t lint test build -p create-icore`; then `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write tools/create-icore/src/lib
git add tools/create-icore/src/lib
git commit -m "feat(create-icore): --session=redis|memory option (flag, config file, wizard, validation)"
```

---

