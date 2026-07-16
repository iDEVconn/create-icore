### Task 1: Gate OAuth buttons + magic-link toggle on provider capability

**Files:**
- Modify: `tools/create-icore/src/lib/scaffold-env.ts:296-304` (`writeClientEnv`)
- Modify: `tools/create-icore/src/lib/scaffold.ts:192` (call site)
- Create: `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts`
- Modify: `apps/templates/client-shadcn/src/components/auth/LoginForm.tsx`
- Create: `apps/templates/client-shadcn/src/components/auth/__tests__/LoginForm.spec.tsx`
- Modify: `apps/templates/client-shadcn/.env.example`

**Interfaces:**
- Produces: `writeClientEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void>` — signature change, `opts` now required (was previously called with only `targetDir`).

**Root cause:** Confirmed by grep across every `*-auth.strategy.ts`: only `supabase` and `firebase` implement `startOAuth`/`sendMagicLink`; `postgres` and `mongodb` both `throw new Error('not_implemented')` for both. `LoginForm.tsx` has no knowledge of which provider was chosen — it always renders the Google/GitHub button grid (`LoginForm.tsx:100-138`) and the magic-link toggle (`LoginForm.tsx:151-157`). For the postgres/mongodb blueprints, both are guaranteed-failure UI affordances shown to every user on the login screen. `RegisterForm.tsx` was checked and has no OAuth/magic-link references, so no change needed there.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeClientEnv } from '../scaffold-env.js';
import type { CreateIcoreOptions } from '../options.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-clientenv-'));
  await mkdir(join(dir, 'apps/client'), { recursive: true });
  await writeFile(join(dir, 'apps/client/.env.example'), 'VITE_API_URL=/api\n');
  return dir;
}

const baseOpts = { authProvider: 'postgres' } as CreateIcoreOptions;

describe('writeClientEnv', () => {
  it('sets VITE_AUTH_HAS_OAUTH / VITE_AUTH_HAS_MAGIC_LINK to false for postgres (not implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'postgres' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=false');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=false');
  });

  it('sets both flags to false for mongodb (not implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'mongodb' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=false');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=false');
  });

  it('sets both flags to true for supabase (implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'supabase' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=true');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=true');
  });

  it('sets both flags to true for firebase (implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'firebase' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=true');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test create-icore -- scaffold-env.unit.test.ts`
Expected: FAIL — `writeClientEnv` currently takes one argument and never writes either `VITE_AUTH_*` var. (TypeScript will also flag the 2-arg call as an arity mismatch until Step 3 lands.)

- [ ] **Step 3: Implement the capability flags**

```typescript
// tools/create-icore/src/lib/scaffold-env.ts
// Add near the top, alongside the other provider-keyed tables:
const OAUTH_MAGIC_LINK_PROVIDERS: ReadonlySet<CreateIcoreOptions['authProvider']> = new Set([
  'supabase',
  'firebase',
]);

// Replace writeClientEnv:
export async function writeClientEnv(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const envExample = join(targetDir, 'apps/client/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    const supported = OAUTH_MAGIC_LINK_PROVIDERS.has(opts.authProvider);
    const next =
      env +
      `\n# Written by the generator from --auth=${opts.authProvider}. Gates the OAuth buttons\n` +
      `# and the magic-link toggle in LoginForm — postgres/mongodb don't implement either.\n` +
      `VITE_AUTH_HAS_OAUTH=${supported}\n` +
      `VITE_AUTH_HAS_MAGIC_LINK=${supported}\n`;
    await writeFile(join(targetDir, 'apps/client/.env'), next);
  } catch {
    // .env.example may not exist in older snapshots
  }
}
```

```typescript
// tools/create-icore/src/lib/scaffold.ts:192
// Replace:
await writeClientEnv(opts.targetDir, opts);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test create-icore -- scaffold-env.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full create-icore suite to confirm no regression from the signature change**

Run: `npx nx test create-icore`
Expected: PASS — `writeClientEnv` has exactly one caller (`scaffold.ts:192`), already updated in Step 3.

- [ ] **Step 6: Write the failing component test**

```tsx
// apps/templates/client-shadcn/src/components/auth/__tests__/LoginForm.spec.tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const noop = () => undefined;
const baseProps = {
  api: async () => ({}) as never,
  onSuccess: noop,
  onError: noop,
  onSwitchToRegister: noop,
  onSwitchToMagicLink: noop,
};

describe('LoginForm — provider capability gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('hides the OAuth buttons and magic-link toggle when the provider supports neither (postgres/mongodb default)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'false');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm {...baseProps} />);

    expect(screen.queryByText('Google')).not.toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
    expect(screen.queryByText('auth.withMagicLink')).not.toBeInTheDocument();
  });

  it('shows the OAuth buttons and magic-link toggle when the provider supports both (supabase/firebase)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm {...baseProps} />);

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('auth.withMagicLink')).toBeInTheDocument();
  });
});
```

Note: `t('auth.withMagicLink')` renders the raw i18next key (`auth.withMagicLink`) in this test since no i18next provider/translation bundle is initialized — that's expected and fine, the test only asserts presence/absence, not the translated string. `vi.resetModules()` is required both before AND after `import.meta.env` changes because `AUTH_HAS_OAUTH`/`AUTH_HAS_MAGIC_LINK` are evaluated once at module load (module-level `const`), so re-importing without resetting the module cache would reuse the first test's cached module and its stale constants.

- [ ] **Step 7: Run test to verify it fails**

Run: `npx nx test client-shadcn -- LoginForm.spec.tsx`
Expected: FAIL — `LoginForm.tsx` doesn't read `VITE_AUTH_HAS_OAUTH`/`VITE_AUTH_HAS_MAGIC_LINK` yet, so both tests see the OAuth buttons and magic-link toggle rendered unconditionally (the first test's "hides" assertions fail).

- [ ] **Step 8: Gate the JSX in `LoginForm.tsx`**

```tsx
// apps/templates/client-shadcn/src/components/auth/LoginForm.tsx
import { SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const AUTH_HAS_OAUTH = (import.meta.env.VITE_AUTH_HAS_OAUTH as string) === 'true';
const AUTH_HAS_MAGIC_LINK = (import.meta.env.VITE_AUTH_HAS_MAGIC_LINK as string) === 'true';

// ... LoginFormProps + function signature unchanged ...

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('auth.loginTitle')}</h1>
        <p className="text-sm text-[--color-muted-foreground]">{t('auth.loginSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ...email/password fields + submit button unchanged... */}
      </form>

      {AUTH_HAS_OAUTH && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[--color-border]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[--color-card] px-2 text-[--color-muted-foreground]">
                {t('auth.orContinueWith')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* ...Google + GitHub buttons unchanged... */}
          </div>
        </>
      )}

      <div className="text-center text-sm text-[--color-muted-foreground] space-y-1">
        <p>
          {t('auth.switchToRegister')}{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-[--color-primary] font-medium hover:underline cursor-pointer"
          >
            {t('auth.switchToRegisterLink')}
          </button>
        </p>
        {AUTH_HAS_MAGIC_LINK && (
          <button
            type="button"
            onClick={onSwitchToMagicLink}
            className="text-xs hover:underline cursor-pointer"
          >
            {t('auth.withMagicLink')}
          </button>
        )}
      </div>
    </div>
  );
}
```

(Only the two new constants and the two new conditional wraps are additions — the email/password form, the Google/GitHub button markup, and the register-switch link are unchanged from the current file.)

- [ ] **Step 9: Run test to verify it passes**

Run: `npx nx test client-shadcn -- LoginForm.spec.tsx`
Expected: PASS — both cases.

- [ ] **Step 10: Run the full client-shadcn suite to confirm no regression**

Run: `npx nx test client-shadcn`
Expected: PASS — includes the pre-existing `app.spec.tsx`.

- [ ] **Step 11: Document the new client env vars**

```bash
# apps/templates/client-shadcn/.env.example
# append:

# Set by the generator based on --auth=<provider>. Gates OAuth buttons + the
# magic-link toggle in LoginForm — postgres/mongodb don't implement either yet.
VITE_AUTH_HAS_OAUTH=false
VITE_AUTH_HAS_MAGIC_LINK=false
```

- [ ] **Step 12: Build verification**

Run: `npx nx build client-shadcn`
Expected: green.

- [ ] **Step 13: Commit**

```bash
npx prettier --write tools/create-icore/src/lib/scaffold-env.ts tools/create-icore/src/lib/scaffold.ts tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts apps/templates/client-shadcn/src/components/auth/LoginForm.tsx apps/templates/client-shadcn/src/components/auth/__tests__/LoginForm.spec.tsx apps/templates/client-shadcn/.env.example
npx nx lint create-icore
npx nx lint client-shadcn
git add tools/create-icore/src/lib/scaffold-env.ts tools/create-icore/src/lib/scaffold.ts tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts apps/templates/client-shadcn/src/components/auth/LoginForm.tsx apps/templates/client-shadcn/src/components/auth/__tests__/LoginForm.spec.tsx apps/templates/client-shadcn/.env.example
git commit -m "fix(client): gate OAuth buttons + magic-link toggle on provider capability"
```

---

