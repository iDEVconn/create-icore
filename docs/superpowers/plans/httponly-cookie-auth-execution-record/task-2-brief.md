### Task 2: `iCore` — cookie + CSRF helpers

**Repo:** `/home/vladimir-tkach/Projects/22`

**Files:**

- Create: `libs/shared/src/http/auth-cookies.ts`
- Test: `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts`
- Modify: `libs/shared/src/index.ts` (export the new module, matching how every other `libs/shared` submodule is re-exported — find the existing export list and add `export * from './http/auth-cookies';` alongside it)

**Interfaces:**

- Produces: `setAuthCookies(res: Response, opts: { refreshToken: string; csrfToken: string; isProd: boolean }): void`
- Produces: `clearAuthCookies(res: Response, opts: { isProd: boolean }): void`
- Produces: `readRefreshToken(req: Request): string | undefined`
- Produces: `verifyCsrf(req: Request): boolean` — compares the `X-CSRF-Token` header to the `icore_csrf` cookie.
- Produces: `generateCsrfToken(): string` — a random string for the double-submit cookie.

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  verifyCsrf,
  generateCsrfToken,
} from '../auth-cookies';

function makeRes(): Response {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;
}

describe('setAuthCookies', () => {
  it('sets icore_rt as httpOnly and icore_csrf as readable, both scoped to /api/auth', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: false });

    expect(res.cookie).toHaveBeenCalledWith(
      'icore_rt',
      'rt-1',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'icore_csrf',
      'csrf-1',
      expect.objectContaining({ httpOnly: false, path: '/api/auth' }),
    );
  });

  it('uses Secure + SameSite=None in production', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: true });

    const rtCall = (res.cookie as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'icore_rt',
    );
    expect(rtCall![2]).toMatchObject({ secure: true, sameSite: 'none' });
  });

  it('uses no Secure + SameSite=Lax outside production', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: false });

    const rtCall = (res.cookie as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'icore_rt',
    );
    expect(rtCall![2]).toMatchObject({ secure: false, sameSite: 'lax' });
  });
});

describe('clearAuthCookies', () => {
  it('clears both cookies at the same path they were set on', () => {
    const res = makeRes();
    clearAuthCookies(res, { isProd: false });

    expect(res.clearCookie).toHaveBeenCalledWith(
      'icore_rt',
      expect.objectContaining({ path: '/api/auth' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'icore_csrf',
      expect.objectContaining({ path: '/api/auth' }),
    );
  });
});

describe('readRefreshToken', () => {
  it('reads icore_rt from req.cookies', () => {
    const req = { cookies: { icore_rt: 'rt-1' } } as unknown as Request;
    expect(readRefreshToken(req)).toBe('rt-1');
  });

  it('returns undefined when no cookie is present', () => {
    const req = { cookies: {} } as unknown as Request;
    expect(readRefreshToken(req)).toBeUndefined();
  });
});

describe('verifyCsrf', () => {
  it('returns true when the header matches the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(true);
  });

  it('returns false when the header does not match the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });

  it('returns false when either is missing', () => {
    const req = { cookies: {}, headers: {} } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });
});

describe('generateCsrfToken', () => {
  it('returns a non-empty random string, different each call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test shared -t "auth-cookies|setAuthCookies|clearAuthCookies|readRefreshToken|verifyCsrf|generateCsrfToken"`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement the module**

Create `libs/shared/src/http/auth-cookies.ts`:

```ts
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

const REFRESH_COOKIE = 'icore_rt';
const CSRF_COOKIE = 'icore_csrf';
const COOKIE_PATH = '/api/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieOptions(isProd: boolean, httpOnly: boolean) {
  return {
    httpOnly,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function setAuthCookies(
  res: Response,
  opts: { refreshToken: string; csrfToken: string; isProd: boolean },
): void {
  res.cookie(REFRESH_COOKIE, opts.refreshToken, cookieOptions(opts.isProd, true));
  res.cookie(CSRF_COOKIE, opts.csrfToken, cookieOptions(opts.isProd, false));
}

export function clearAuthCookies(res: Response, opts: { isProd: boolean }): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(opts.isProd, true));
  res.clearCookie(CSRF_COOKIE, cookieOptions(opts.isProd, false));
}

export function readRefreshToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}

export function verifyCsrf(req: Request): boolean {
  const cookieValue = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const headerValue = req.headers['x-csrf-token'];
  if (!cookieValue || !headerValue || typeof headerValue !== 'string') return false;
  return cookieValue === headerValue;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}
```

- [ ] **Step 4: Export from `libs/shared`**

In `libs/shared/src/index.ts`, find the existing `export * from './strategies/auth';` line (or the nearest similar submodule export) and add directly after it:

```ts
export * from './http/auth-cookies';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn nx test shared -t "auth-cookies|setAuthCookies|clearAuthCookies|readRefreshToken|verifyCsrf|generateCsrfToken"`
Expected: PASS — all tests.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write libs/shared/src/http/auth-cookies.ts libs/shared/src/http/__tests__/auth-cookies.unit.test.ts libs/shared/src/index.ts
yarn nx lint shared
yarn nx build shared
```

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/http/auth-cookies.ts libs/shared/src/http/__tests__/auth-cookies.unit.test.ts libs/shared/src/index.ts
git commit -m "feat(shared): add httpOnly refresh-cookie + CSRF helpers"
```

---
