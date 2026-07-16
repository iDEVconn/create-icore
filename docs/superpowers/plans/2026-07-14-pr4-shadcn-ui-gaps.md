# PR4: shadcn client — OAuth/magic-link gating + dead CSS tokens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two UI-layer gaps found in the `ui=shadcn` + `authProvider=postgres` blueprint: (1) `LoginForm` renders the Google/GitHub OAuth buttons and the "sign in with a magic link" toggle unconditionally, but `PostgresAuthStrategy` (and `MongoDbAuthStrategy`) throw `not_implemented` for both `startOAuth` and `sendMagicLink` — clicking either guarantees a request failure; (2) `dropdown-menu.tsx` and `dialog.tsx` reference the Tailwind utilities `bg-popover` and `bg-accent`, but `globals.css`'s `@theme` block never defines `--color-popover` / `--color-accent` — the utilities compile to nothing, so dropdowns and dialog close-buttons render with a transparent background the first time anyone actually uses them.

**Architecture:** Gap 1: the generator already knows which provider was chosen at scaffold time; write two boolean `VITE_*` flags into the generated client's `.env` and gate the JSX on them (build-time flag, no runtime API round-trip — consistent with how every other provider-driven choice in this codebase is baked in). Gap 2: add the missing CSS custom properties to both the light and dark blocks in `globals.css`, following the same naming/value pattern already used for every other token there.

**Tech Stack:** Vite (`import.meta.env`), Tailwind CSS 4 `@theme`, React 19, Vitest + `@testing-library/react` + `jsdom` (both projects have a working component-test harness — confirmed via `apps/templates/client-shadcn/src/app/app.spec.tsx`, an existing passing RTL test; `@testing-library/react`/`jsdom` are root-hoisted devDependencies, not listed in `client-shadcn`'s own `package.json`, which is why an earlier draft of this plan incorrectly claimed no test infra existed here).

## Global Constraints

- Nx monorepo — run tests via `nx test <project>`.
- TDD in both tasks — `tools/create-icore` (Vitest) and `apps/templates/client-shadcn` (Vitest + `@testing-library/react`, `environment: 'jsdom'` per `commonTestConfig` in `libs/vite-plugins/src/index.mjs:98`) both have real test harnesses. Task 2 (CSS custom-property values) still gets a build+manual check only, since JSDOM doesn't run the real Tailwind build pipeline and can't observe computed CSS custom-property values meaningfully.
- `npx prettier --write <touched files>` before every commit.
- `nx lint <project>` 0 errors, `nx build <project>` green before commit.
- Every PR needs a `.changeset/<slug>.md`, `patch` bump.
- Branch: `bug/shadcn-oauth-gating-and-dead-tokens` cut from `dev`. PR base `dev`.
- Touched projects: `create-icore` (generator, its own real source under `tools/create-icore/src`), `client-shadcn` (repo-root `apps/templates/client-shadcn` — the source of truth; `tools/create-icore/templates/` is a gitignored build artifact regenerated from it by `snapshot-templates.mjs`, never edit it directly).

---

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

### Task 2: Define the missing `popover`/`accent` CSS tokens

**Files:**
- Modify: `apps/templates/client-shadcn/src/globals.css`

**Root cause:** `dropdown-menu.tsx:29` uses `bg-popover text-popover-foreground`; `dropdown-menu.tsx:53` and `dialog.tsx:58` use `bg-accent` (`focus:bg-accent`, `data-[state=open]:bg-accent`). Tailwind v4 generates a `bg-*` utility from a `--color-*` custom property in the `@theme` block. `globals.css`'s `@theme` block (light) defines `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `border`, `input`, `ring`, `destructive` — but never `popover` or `accent`. The dark-mode override block (`html.dark`) mirrors the same omission. Both utilities currently compile to a no-op class (no matching CSS variable), so any dropdown menu or the dialog's close button renders with a transparent background instead of the intended surface color — invisible until the first time someone actually opens one.

- [ ] **Step 1: Add the tokens to the light block**

```css
/* apps/templates/client-shadcn/src/globals.css */
@theme {
  --font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;

  /* Light mode defaults */
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-card: #f8fafc;
  --color-card-foreground: #0f172a;
  --color-popover: #ffffff;
  --color-popover-foreground: #0f172a;
  --color-primary: #16a34a;
  --color-primary-foreground: #ffffff;
  --color-secondary: #f1f5f9;
  --color-secondary-foreground: #0f172a;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #475569;
  --color-accent: #f1f5f9;
  --color-accent-foreground: #0f172a;
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;
  --color-ring: #16a34a;
  --color-destructive: #ef4444;
  --radius-default: 0.5rem;
}
```

- [ ] **Step 2: Add the tokens to the dark override block**

```css
  /* OLED Dark mode */
  html.dark {
    --color-background: #020617;
    --color-foreground: #f8fafc;
    --color-card: #0f172a;
    --color-card-foreground: #f8fafc;
    --color-popover: #0f172a;
    --color-popover-foreground: #f8fafc;
    --color-primary: #22c55e;
    --color-primary-foreground: #020617;
    --color-secondary: #1e293b;
    --color-secondary-foreground: #f8fafc;
    --color-muted: #1e293b;
    --color-muted-foreground: #94a3b8;
    --color-accent: #1e293b;
    --color-accent-foreground: #f8fafc;
    --color-border: #1e293b;
    --color-input: #1e293b;
    --color-ring: #22c55e;
    --color-destructive: #ef4444;
  }
```

`--color-popover`/`--color-accent` are set equal to `--color-card`/`--color-secondary` respectively in both modes — a neutral, low-contrast surface consistent with how shadcn's default `new-york`/`neutral` themes relate those tokens, and consistent with this file's existing pattern of flat hex values (no `oklch()`/`color-mix()` elsewhere in the file).

- [ ] **Step 3: Verify by build + manual check**

Run: `npx nx build client-shadcn`
Expected: green — Tailwind v4 resolves `bg-popover`/`bg-accent`/`text-popover-foreground`/`text-accent-foreground` to real declarations now; no build-time indication either way since Tailwind silently no-ops unmatched utilities, so this alone doesn't prove the fix — proceed to the manual check.

Manual check (documented, not automated — same test-infra gap as Task 1):
1. Run the client dev server, open any dropdown menu (e.g. the notes example's row action menu, if `--example=notes`) or a dialog.
2. Confirm the dropdown/dialog-close-button background now renders the intended surface color (light: near-white/`#f8fafc`-ish; dark: `#1e293b`-ish) instead of transparent.
3. Toggle the theme switcher and repeat — confirm both light and dark values apply.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/templates/client-shadcn/src/globals.css
npx nx lint client-shadcn
git add apps/templates/client-shadcn/src/globals.css
git commit -m "fix(client): define missing --color-popover/--color-accent tokens used by dropdown-menu and dialog"
```

---

### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr4-shadcn-ui-gaps.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix two shadcn client UI gaps: LoginForm now gates the OAuth buttons and magic-link toggle behind VITE_AUTH_HAS_OAUTH/VITE_AUTH_HAS_MAGIC_LINK (written by the generator based on --auth=<provider>) instead of always rendering them, since postgres and mongodb don't implement either and clicking guaranteed a request failure; globals.css now defines the --color-popover and --color-accent tokens that dropdown-menu.tsx and dialog.tsx already reference, which previously compiled to a no-op (transparent background) since the tokens didn't exist.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p create-icore client-shadcn`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr4-shadcn-ui-gaps.md
git commit -m "chore: add changeset for PR4 shadcn UI gap fixes"
```

## Self-Review

- **Spec coverage:** Gap #7 (OAuth/magic-link UI shown unconditionally) → Task 1. Gap #8 (dead shadcn tokens) → Task 2. Both closed for the shadcn template.
- **Placeholder scan:** none. Task 1 has a real automated RTL test (client-shadcn does have a working test harness — corrected from an earlier draft's mistaken claim otherwise). Task 2's "manual check" steps are explicit, numbered, and give a concrete pass/fail criterion since JSDOM can't observe real computed CSS custom-property values.
- **Type consistency:** `writeClientEnv`'s new `opts: CreateIcoreOptions` parameter matches every other `write*Env` function in `scaffold-env.ts` (`writeAuthEnv`, `writeUploadEnv`, etc. already take `opts`).
- **Scope note:** `client-mui` and `client-antd` have the *identical* gap — both `LoginForm.tsx` files render unconditional Google/GitHub buttons and a magic-link switch (confirmed via grep: `client-mui/.../LoginForm.tsx` and `client-antd/.../LoginForm.tsx` both reference `GoogleIcon`/`GithubOutlined`/`onSwitchMagicLink`). This PR deliberately fixes only `client-shadcn`, matching the original audit's blueprint scope (`ui=shadcn`). Fixing `client-mui`/`client-antd` the same way is a natural, low-risk follow-up — not silently dropped, just out of this PR's stated scope.
