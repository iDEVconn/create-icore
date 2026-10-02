### Task 6: Runbook + CLI notice + generated README

**Files:**

- Create: `docs/runbooks/auth-email-setup.md`
- Create: `tools/create-icore/src/lib/auth-email-notice.ts`
- Create: `tools/create-icore/src/lib/__tests__/auth-email-notice.unit.test.ts`
- Modify: `tools/create-icore/src/cli.ts` (print notice after the "Next:" block)
- Modify: `tools/create-icore/src/lib/scaffold-pkg.ts` (README section)

**Interfaces:**

- Produces: `authEmailNotice(authProvider: CreateIcoreOptions['authProvider']): string[]` — `[]` for `none|postgres|mongodb`, lines for `supabase|firebase`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { authEmailNotice } from '../auth-email-notice.js';

describe('authEmailNotice', () => {
  it('tells Supabase users to set Site URL + Redirect URLs (emails default to localhost:3000)', () => {
    const text = authEmailNotice('supabase').join('\n');
    expect(text).toContain('Authentication → URL Configuration');
    expect(text).toContain('Site URL');
    expect(text).toContain('localhost:3000');
    expect(text).toContain('/auth/callback');
  });

  it('tells Firebase users to authorize their client domain', () => {
    expect(authEmailNotice('firebase').join('\n')).toContain('Authorized domains');
  });

  it.each(['none', 'postgres', 'mongodb'] as const)(
    'is empty for %s (no provider-sent emails)',
    (p) => {
      expect(authEmailNotice(p)).toEqual([]);
    },
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test create-icore --testFile=auth-email-notice` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `tools/create-icore/src/lib/auth-email-notice.ts`:

```ts
import type { CreateIcoreOptions } from './options.js';

/**
 * Provider-side setup the generated project cannot do for you. Without it,
 * confirmation / magic-link emails link to the provider's default URL
 * (Supabase: http://localhost:3000) instead of your client.
 */
export function authEmailNotice(authProvider: CreateIcoreOptions['authProvider']): string[] {
  if (authProvider === 'supabase') {
    return [
      'Supabase email links: open your project → Authentication → URL Configuration and set',
      '  • Site URL = your client URL (CLIENT_ORIGIN in apps/api/.env). The default is http://localhost:3000,',
      '    so confirmation emails would otherwise point there.',
      '  • Redirect URLs = <CLIENT_ORIGIN>/auth/callback',
      'Details: docs/runbooks/auth-email-setup.md',
    ];
  }
  if (authProvider === 'firebase') {
    return [
      'Firebase email links: Authentication → Settings → Authorized domains — add your client domain.',
      'Details: docs/runbooks/auth-email-setup.md',
    ];
  }
  return [];
}
```

In `cli.ts` import it and, right after the existing `p.log.info('Next:')` block's last line (find the last `p.log.info(...)` of that block), add:

```ts
const emailNotice = authEmailNotice(opts.authProvider);
if (emailNotice.length > 0) {
  p.log.warn('One-time provider setup:');
  for (const line of emailNotice) p.log.info(line);
}
```

In `scaffold-pkg.ts`, import `authEmailNotice` and insert into the README template after the "Quick start" code block (before `## Commands`):

```ts
${authEmailNotice(opts.authProvider).length > 0 ? `## Provider setup (email links)\n\n${authEmailNotice(opts.authProvider).join('\n')}\n\n` : ''}
```

(match the surrounding template-literal escaping — this block lives inside a backtick string, so no nested backticks are used.)

- [ ] **Step 4: Write `docs/runbooks/auth-email-setup.md`** with: why (default Site URL `http://localhost:3000`, signup returns 202 `confirmation_required` when "Confirm email" is on and the clients show the check-email screen), the Supabase steps (Site URL = `CLIENT_ORIGIN`; Redirect URLs `<origin>/auth/callback`; note that signup-confirmation and magic-link templates keep working with the default `{{ .ConfirmationURL }}` because `/auth/callback` also handles the hash-session shape), the Firebase step (Authorized domains), `CLIENT_ORIGIN` (gateway env, default `http://localhost:4200`, warns when unset), the 403 `email_not_confirmed` login behaviour, and a "Coming in the forgot-password PR" line (recovery template `{{ .TokenHash }}`, Firebase action URL). Keep it under ~60 lines.

- [ ] **Step 5: Verify + commit**

Run: `yarn nx test create-icore && yarn nx lint create-icore && yarn nx build create-icore`; then `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json`.

```bash
npx prettier --write tools/create-icore/src/cli.ts tools/create-icore/src/lib/scaffold-pkg.ts tools/create-icore/src/lib/auth-email-notice.ts tools/create-icore/src/lib/__tests__/auth-email-notice.unit.test.ts docs/runbooks/auth-email-setup.md
git add tools/create-icore/src docs/runbooks/auth-email-setup.md
git commit -m "docs(create-icore): one-time Supabase/Firebase email-link setup notice + runbook

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
