# httpOnly Refresh-Cookie Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the refresh token out of `localStorage` (XSS-exfiltratable today via `useAuthStore`'s persisted Zustand state) into an `httpOnly` cookie the browser alone controls; keep the access token as a `Bearer`-header value, now held only in memory. Make the existing `POST /auth/logout` cookie-driven (it already exists and already calls `AuthStrategy.revoke`; see Task 3 — an earlier version of this plan wrongly assumed logout/revocation didn't exist yet in this repo). Fix a cross-tab refresh-token-rotation race along the way, per explicit decision.

**Architecture:** Hybrid token placement (see spec). One route (`POST /auth/refresh`) becomes cookie-driven and CSRF-protected via double-submit cookie; every other route is untouched — still `Authorization: Bearer` as today. Two repositories are touched: `@idevconn/api-client` (published npm package, separate repo — already shipped the two config options this plan needs, see Task 1) and this `iCore` monorepo (the actual feature).

**Tech Stack:** NestJS gateway (`apps/api`) + auth microservice (`apps/microservices/auth`), `@supabase/supabase-js` auth, Vite/React 19 client, Vitest, Web Locks API, `cookie-parser` (already installed and wired).

**Spec:** `docs/superpowers/specs/2026-09-18-httponly-cookie-auth-design.md`

## Global Constraints

- Cross-origin-capable by requirement: cookies use `SameSite=None; Secure` in production, `SameSite=Lax` (no `Secure`) in local dev — branch on `NODE_ENV`, mirroring the exact pattern already used for the `oauth_state` cookie in `apps/api/src/app/auth/auth.controller.ts` (find the `res.cookie('oauth_state', ...)` call inside `oauthStart` — currently around line 141; confirm the exact line before citing it, since it will have shifted once earlier tasks in this plan land).
- Cookie names: `icore_rt` (httpOnly, the refresh token) and `icore_csrf` (NOT httpOnly, a random double-submit value). Both scoped `path: '/api/auth'` — never sent on ordinary API calls.
- `X-CSRF-Token` header is required and verified ONLY on `POST /auth/refresh`. No other route becomes cookie-authenticated or CSRF-checked.
- **No new revocation method is needed.** `AuthStrategy.revoke(refreshToken: string): Promise<void>` already exists end-to-end in this repo — `FakeAuthStrategy.revoke`, `SupabaseAuthStrategy.revoke` (exchanges the refresh token for its session, then calls `client.auth.admin.signOut(accessToken, 'local')`), the `auth.revoke` message pattern in `apps/microservices/auth/src/app/auth.controller.ts`, and `AuthClientService.revoke` in `libs/auth-client/src/lib/auth-client.service.ts` — plus a full contract-test suite in `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts`. `POST /auth/logout` also already exists (`apps/api/src/app/auth/auth.controller.ts`), it just currently reads `refreshToken` from the request body; Task 6 below only needs to switch it to read the cookie instead. See Task 3 for the full verification.
- Every response body that used to include `refreshToken` (`register`, `login`, `verifyMagicLink`, and the OAuth callback's redirect fragment) drops it — the cookie carries it now, never the JSON/fragment.
- `@idevconn/api-client` lives in a separate repo at `/home/vladimir-tkach/Projects/api-client` (not a path inside `iCore`) — Task 1 works there; every other task works in `/home/vladimir-tkach/Projects/22`. Do not confuse the two working directories. **Task 1 is already shipped** — verified: the installed `@idevconn/api-client@0.3.3` (both in the separate `api-client` repo and in this repo's `node_modules`) already has the `credentials`/`getRefreshHeaders` config fields wired exactly as Task 1 specifies. Skip Task 1's implementation steps; only its version-currency note matters (see Task 1).
- Post-coding routine before every commit in `iCore`: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>`. In `api-client`: `npm run typecheck && npm run test && npm run lint`.
- Any UI change requires a live Playwright verification pass before being reported done (`AGENTS.md`'s non-negotiable rule) — Task 13.
- **Changeset required:** AGENTS.md mandates a `.changeset/<slug>.md` on every PR targeting `dev`, no exceptions — even though this feature never touches `tools/create-icore/_template-shell` directly (see Task 14). Target package is `@idevconn/create-icore` (confirmed via `tools/create-icore/package.json`'s `name` field), bump type `minor`.
- **Resolved by user decision (2026-09-19): bump `_template-shell`'s pin, same PR.** `tools/create-icore/_template-shell/package.json` still pinned `@idevconn/api-client` at `^0.3.0`/`^0.3.2` — older than the `^0.3.3` this repo's own root `package.json` and `libs/template-shared/package.json` already use. `templates/**` is a generated build artifact (never hand-edit — it regenerates from `_template-shell` on build); `_template-shell` is real source, handled in Task 8b below.

---

### Task 1: `@idevconn/api-client` — add `credentials` and `getRefreshHeaders` config

**STATUS: ALREADY SHIPPED — verify, do not redo.** Confirmed in this session: `/home/vladimir-tkach/Projects/api-client/src/types.ts` and `src/create-api-client.ts` already have `credentials`/`getRefreshHeaders` exactly as described below, the package is published as `0.3.3`, and `0.3.3` is already installed in this repo's `node_modules/@idevconn/api-client`. Run `cat /home/vladimir-tkach/Projects/api-client/package.json | grep version` and `grep -n "credentials\|getRefreshHeaders" /home/vladimir-tkach/Projects/api-client/src/types.ts` to reconfirm before skipping — if a newer session finds this has drifted (reverted, or a breaking change landed since), fall back to the steps below. Otherwise skip straight to Task 2.

**Repo:** `/home/vladimir-tkach/Projects/api-client` (separate git repo — work here, not in `iCore`)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/create-api-client.ts`
- Test: `src/__tests__/create-api-client.test.ts`

**Interfaces:**
- Produces: `ApiClientConfig.credentials?: RequestCredentials` — passed to every `fetch()` call this library makes.
- Produces: `ApiClientConfig.getRefreshHeaders?: () => Record<string, string>` — called fresh on each refresh attempt, merged into the refresh request's headers.

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/create-api-client.test.ts`, add these two tests directly after the existing `'honors custom refresh field names'` test:

```ts
  it('passes credentials through to both the main request and the refresh request', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2' }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const api = createApiClient(makeConfig({ credentials: 'include' }));
    await api('/protected');

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.credentials).toBe('include');
    }
  });

  it('merges getRefreshHeaders into the refresh request only, not the main request', async () => {
    const getRefreshHeaders = vi.fn(() => ({ 'X-CSRF-Token': 'csrf-abc' }));
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2' }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const api = createApiClient(makeConfig({ getRefreshHeaders }));
    await api('/protected');

    const mainCallHeaders = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(mainCallHeaders.get('X-CSRF-Token')).toBeNull();
    const refreshCallHeaders = new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers);
    expect(refreshCallHeaders.get('X-CSRF-Token')).toBe('csrf-abc');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- -t "credentials|getRefreshHeaders"`
Expected: FAIL — `credentials` and `getRefreshHeaders` aren't recognized config fields yet, so `init.credentials` is `undefined` and the CSRF header is never set.

- [ ] **Step 3: Add the two config fields to the type**

In `src/types.ts`, find the `refreshTokenField?: string;` line (the last field before the closing `}`) and add directly after it:

```ts
  /**
   * Passed through to every `fetch()` call this client makes (both the main
   * request and the internal refresh request). Needed to send cookies on
   * cross-origin requests (`'include'`). Default: browser default
   * (`'same-origin'`).
   */
  credentials?: RequestCredentials;

  /**
   * Extra headers merged into the refresh request only — e.g. a CSRF
   * double-submit token read from a cookie. Called fresh on every refresh
   * attempt, never cached.
   */
  getRefreshHeaders?: () => Record<string, string>;
```

- [ ] **Step 4: Wire `credentials` into both fetch call sites**

In `src/create-api-client.ts`, find the `fetch(`${cfg.baseUrl}${cfg.refreshPath}`` call inside `doRefresh()` and change:

```ts
      const res = await fetch(`${cfg.baseUrl}${cfg.refreshPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [cfg.refreshRequestField]: refreshToken }),
      });
```

to:

```ts
      const res = await fetch(`${cfg.baseUrl}${cfg.refreshPath}`, {
        method: "POST",
        credentials: cfg.credentials,
        headers: {
          "Content-Type": "application/json",
          ...cfg.getRefreshHeaders?.(),
        },
        body: JSON.stringify({ [cfg.refreshRequestField]: refreshToken }),
      });
```

Then find the two `fetch(`${cfg.baseUrl}${path}`` calls inside the returned `api` function (the initial request and the post-refresh retry) and add `credentials: cfg.credentials,` to both `{ ...options, headers }` object literals, making each:

```ts
      res = await fetch(`${cfg.baseUrl}${path}`, { ...options, headers, credentials: cfg.credentials });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test`
Expected: PASS — all tests, including the 2 new ones.

- [ ] **Step 6: Typecheck, lint, build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all green.

- [ ] **Step 7: Version bump and publish**

```bash
npx changeset add
```

Pick `patch` (additive, backward-compatible config fields — no breaking change), write a summary like "Add `credentials` and `getRefreshHeaders` config options for cookie-based refresh flows." Then:

```bash
npx changeset version
npm run build
npm publish
```

Note the resulting version number (e.g. `0.3.3`) — Task 8 in `iCore` needs it.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/create-api-client.ts src/__tests__/create-api-client.test.ts package.json CHANGELOG.md .changeset
git commit -m "feat: add credentials and getRefreshHeaders config options"
```

---

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

    expect(res.clearCookie).toHaveBeenCalledWith('icore_rt', expect.objectContaining({ path: '/api/auth' }));
    expect(res.clearCookie).toHaveBeenCalledWith('icore_csrf', expect.objectContaining({ path: '/api/auth' }));
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

### Task 3: `iCore` — verify session-revocation already works end-to-end (no new code)

**STATUS: NOT NEEDED — this task is fully satisfied by existing code.** The original version of this plan (written against a different, downstream project) assumed this repo had no way to revoke a session and proposed adding a new `revokeSession(accessToken)` method across 5 layers. That assumption is **false for iCore itself** — verified by reading the actual source in this session:

- `AuthStrategy.revoke(refreshToken: string): Promise<void>` already exists on the interface (`libs/shared/src/strategies/auth.ts`), documented as: "Invalidates a refresh token (logout) — a further `refresh()` call with it must fail. Idempotent."
- `FakeAuthStrategy.revoke` (`libs/shared/src/strategies/fakes/fake-auth.ts`) deletes the refresh token from its internal map.
- `SupabaseAuthStrategy.revoke` (`libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`) exchanges the refresh token for its current session (rotating it, since it was going to die anyway), then calls `client.auth.admin.signOut(session.access_token, 'local')` — ending only that one session, exactly the semantics the original plan wanted from a new `revokeSession(accessToken)` method. Swallows errors for idempotency.
- The microservice already exposes it via `@MessagePattern('auth.revoke')` in `apps/microservices/auth/src/app/auth.controller.ts`.
- The gateway client already exposes it via `AuthClientService.revoke(refreshToken)` in `libs/auth-client/src/lib/auth-client.service.ts`.
- A full contract-test suite already exercises `revoke()` semantics for every strategy: `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts` (`'revoke invalidates the refresh token — a further refresh() call fails'`, plus an opt-out flag for strategies that don't support it).
- `POST /auth/logout` already exists in `apps/api/src/app/auth/auth.controller.ts` and already calls `this.authClient.revoke(body.refreshToken)`.

**The only real gap:** today `logout` reads `refreshToken` from the request body, but after this plan's cookie migration the refresh token no longer travels in any request body — it lives in the `icore_rt` cookie. Task 6 below is the actual remaining work: switch `logout` to read the cookie instead of the body, and clear both cookies afterward. No interface changes, no new strategy methods, no new microservice handler.

Before starting Task 6, re-run this verification against the live tree (`grep -n "revoke" libs/shared/src/strategies/auth.ts libs/auth-client/src/lib/auth-client.service.ts apps/api/src/app/auth/auth.controller.ts`) in case this has changed since this plan was written.

---

### Task 4: `iCore` — cookie-issuing on login/register/magic-link-verify + CORS

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `setAuthCookies`, `generateCsrfToken` (Task 2).
- `register`/`login`/`verifyMagicLink` response bodies change from `{accessToken, refreshToken, user}` to `{accessToken, user}`.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`, find `describe('AuthController (gateway) — magic-link', ...)` and replace the whole block with (the existing 3 tests plus 3 new cookie-asserting ones):

```ts
describe('AuthController (gateway) — magic-link', () => {
  it('requestMagicLink builds callback URL from CLIENT_ORIGIN', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'https://my.app' }));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith('a@x.com', 'https://my.app/auth/callback');
  });

  it('requestMagicLink falls back to http://localhost:4200 when CLIENT_ORIGIN unset', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith(
      'a@x.com',
      'http://localhost:4200/auth/callback',
    );
  });

  it('verifyMagicLink forwards the token, sets auth cookies, and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.verifyMagicLink(
      { token: 'tok' },
      res as unknown as import('express').Response,
    );
    expect(client.verifyMagicLink).toHaveBeenCalledWith('tok');
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('login sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.login(
      { email: 'a@x.com', password: 'pw' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('register sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.register(
      { email: 'a@x.com', password: 'password123' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
  });
});
```

Note: `login`'s existing mock in `makeAuthClient()` resolves `{accessToken:'at', refreshToken:'rt', expiresIn:3600, user:{id:'u1',email:'a@x.com'}}` — reuse it, but confirm `client.login`/`client.signup`/`client.verifyMagicLink` in `makeAuthClient()` all return this exact shape before writing these assertions (read the file's current `makeAuthClient()` first — if any of the three use a different mock, align the test's expected `session` shape with whatever `AuthSession`-shaped mock that mock actually returns).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — magic-link"`
Expected: FAIL — `verifyMagicLink`/`login`/`register` don't yet accept a `res` param, don't set cookies, and still return `refreshToken` in the body.

- [ ] **Step 3: Add `isProd` resolution and rewire `register`**

In `apps/api/src/app/auth/auth.controller.ts`, add this import at the top (alongside the existing `@icore/shared` import — merge into the existing `import type {...} from '@icore/shared'` line's non-type siblings, or add a second import line):

```ts
import { setAuthCookies, generateCsrfToken } from '@icore/shared';
```

Add this private helper right after the `assertProvider` function (top-level, before the `@ApiTags` class decorator):

Actually — add it as a private method on the class instead, since it needs `this.cfg`. Find the closing `}` of the `uid` private method (the last method in the class) and add directly before the class's final closing `}`:

```ts
  private isProd(): boolean {
    return this.cfg.get<string>('NODE_ENV') === 'production';
  }
```

Then find `async register(@Body() body: { email: string; password: string }) {` and replace its signature and body:

```ts
  async register(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.authClient.signup(body.email, body.password);
      const csrfToken = generateCsrfToken();
      setAuthCookies(res, {
        refreshToken: session.refreshToken,
        csrfToken,
        isProd: this.isProd(),
      });
      return { accessToken: session.accessToken, user: session.user };
    } catch (err) {
      const msg =
        (err as { message?: string; code?: string })?.message ??
        (err as { code?: string })?.code ??
        '';
      if (msg === 'email_confirmation_required') {
        throw new BadRequestException('email_confirmation_required');
      }
      throw err;
    }
  }
```

- [ ] **Step 4: Rewire `login`**

Find:

```ts
  login(@Body() body: { email: string; password: string }) {
    return this.authClient.login(body.email, body.password);
  }
```

Replace with:

```ts
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.login(body.email, body.password);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

- [ ] **Step 5: Rewire `verifyMagicLink`**

Find:

```ts
  verifyMagicLink(@Body() body: { token: string }) {
    return this.authClient.verifyMagicLink(body.token);
  }
```

Replace with:

```ts
  async verifyMagicLink(
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authClient.verifyMagicLink(body.token);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

- [ ] **Step 6: Enable CORS in `main.ts`**

In `apps/api/src/main.ts`, find `app.use(cookieParser());` and add directly after it:

```ts
  app.enableCors({
    origin: process.env['CLIENT_ORIGIN'] ?? 'http://localhost:4200',
    credentials: true,
  });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — magic-link"`
Expected: PASS — all 6 tests.

- [ ] **Step 8: Run the full `api` suite to check for regressions**

Run: `yarn nx test api`
Expected: PASS — other tests that call `login`/`register`/`verifyMagicLink` without a `res` argument will now fail to compile/run; fix each by adding `makeRes()` as the second argument, matching Step 1's pattern. Search the whole test file for other call sites of these three methods first (`grep -n "controller.login(\|controller.register(\|controller.verifyMagicLink(" apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`) and update every one found.

- [ ] **Step 9: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts apps/api/src/main.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts apps/api/src/main.ts
git commit -m "feat(auth): issue httpOnly refresh cookie on login/register/magic-link-verify; enable CORS"
```

---

### Task 5: `iCore` — cookie-driven, CSRF-protected `/auth/refresh`

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `readRefreshToken`, `verifyCsrf`, `setAuthCookies`, `generateCsrfToken` (Task 2).
- `POST /auth/refresh` no longer takes `refreshToken` in the body.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`, directly after the (now-updated) `describe('AuthController (gateway) — magic-link', ...)` block:

```ts
describe('AuthController (gateway) — refresh', () => {
  it('rejects when the CSRF header does not match the CSRF cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(ForbiddenException);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('rejects when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: {},
      headers: {},
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('on success, calls refresh with the cookie token and re-issues both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    const result = await controller.refresh(req, res as unknown as import('express').Response);
    expect(client.refresh).toHaveBeenCalledWith('rt-1');
    expect(result).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — refresh"`
Expected: FAIL — `refresh` still reads `body.refreshToken`, doesn't check CSRF, doesn't set cookies.

- [ ] **Step 3: Rewire `refresh`**

Find:

```ts
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a fresh access token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authClient.refresh(body.refreshToken);
  }
```

Replace with:

```ts
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange the httpOnly refresh cookie for a fresh access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) throw new UnauthorizedException('invalid_refresh_token');
    const session = await this.authClient.refresh(refreshToken);
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    return { accessToken: session.accessToken, user: session.user };
  }
```

Add `readRefreshToken` and `verifyCsrf` to the `@icore/shared` import added in Task 4 (extend that same import line to `{ setAuthCookies, generateCsrfToken, readRefreshToken, verifyCsrf }`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — refresh"`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS. Any other test calling `controller.refresh(...)` with the old `{refreshToken}` body signature needs updating to the new `(req, res)` signature — search and fix as in Task 4 Step 8.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): make /auth/refresh cookie-driven and CSRF-protected"
```

---

### Task 6: `iCore` — make the existing `POST /auth/logout` cookie-driven

**`POST /auth/logout` already exists** in `apps/api/src/app/auth/auth.controller.ts` (currently, per Task 3's verification):

```ts
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token, ending that session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  logout(@Body() body: { refreshToken: string }) {
    return this.authClient.revoke(body.refreshToken);
  }
```

This task is much smaller than the original (pre-adaptation) version assumed: no new route, no `revokeSession`, no Bearer-token parsing. Just switch the refresh token source from the request body to the `icore_rt` cookie, and clear both cookies afterward — mirroring `refresh`'s cookie-driven shape from Task 5.

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- Consumes: `AuthClientService.revoke` (already exists), `readRefreshToken`, `clearAuthCookies` (Task 2).
- `POST /auth/logout` no longer takes `refreshToken` in the body; stays `@Public()` (it never required the standard auth guard — it authenticates via the cookie's presence, same as `refresh`).

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block directly after the `describe('AuthController (gateway) — refresh', ...)` block:

```ts
describe('AuthController (gateway) — logout', () => {
  it('revokes the session using the refresh cookie and clears both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await controller.logout(req, res as unknown as import('express').Response);
    expect(client.revoke).toHaveBeenCalledWith('rt-1');
    expect(res.cookieCleared).toBe(true);
  });

  it('is idempotent when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = { cookies: {} } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.logout(req, res as unknown as import('express').Response),
    ).resolves.toEqual({ ok: true });
    expect(client.revoke).not.toHaveBeenCalled();
  });
});
```

Add `revoke: vi.fn().mockResolvedValue(undefined),` to the `makeAuthClient()` factory's returned object (not already present — the existing file's `makeAuthClient()` has `signup`/`login`/`refresh`/`sendMagicLink`/`verifyMagicLink`/`startOAuth`/`completeOAuth` but no `revoke` yet).

Check `makeRes()`'s existing `cookieCleared` getter — it's a single shared boolean flag today (flips true on ANY `clearCookie()` call, doesn't distinguish which cookie), which is good enough for these two assertions since `clearAuthCookies` calls `clearCookie` for both `icore_rt` and `icore_csrf`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test api -t "AuthController .gateway. — logout"`
Expected: FAIL — `logout` still reads `body.refreshToken` and never calls `clearCookie`.

- [ ] **Step 3: Rewire `logout`**

Find the existing `logout` method (shown above) and replace it:

```ts
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh cookie, ending that session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readRefreshToken(req);
    if (refreshToken) {
      await this.authClient.revoke(refreshToken);
    }
    clearAuthCookies(res, { isProd: this.isProd() });
    return { ok: true };
  }
```

Add `readRefreshToken` and `clearAuthCookies` to the `@icore/shared` import (extend the same import line Task 4/5 already added `setAuthCookies`/`generateCsrfToken`/`verifyCsrf` to). Drop the now-unused `@ApiBody` decorator and its schema.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test api -t "AuthController .gateway. — logout"`
Expected: PASS.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS. Any other test calling `controller.logout({ refreshToken: ... })` with the old body-shaped argument needs updating to the new `(req, res)` signature.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): make POST /auth/logout read the refresh cookie instead of the request body"
```

---

### Task 7: `iCore` — cookie-issuing on the OAuth callback

**Files:**
- Modify: `apps/api/src/app/auth/auth.controller.ts`
- Test: `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**
- The OAuth callback's redirect fragment drops `refreshToken`.

- [ ] **Step 1: Write the failing test**

Find the existing test `'oauthCallback exchanges + redirects to the client with a fragment'` in `describe('AuthController (gateway) — OAuth', ...)` and replace it:

```ts
  it('oauthCallback exchanges, sets auth cookies, and redirects with accessToken only in the fragment', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'http://client' }));
    const res = makeRes();
    const req = { cookies: { oauth_state: 'abc' } } as unknown as import('express').Request;
    await controller.oauthCallback(
      'google',
      'code-xyz',
      'abc',
      req,
      res as unknown as import('express').Response,
    );
    expect(client.completeOAuth).toHaveBeenCalledWith('google', 'code-xyz', 'abc');
    expect(res.cookieCleared).toBe(true);
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.redirectedTo).toContain('http://client/auth/oauth/callback#');
    expect(res.redirectedTo).toContain('accessToken=at');
    expect(res.redirectedTo).not.toContain('refreshToken=');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test api -t "oauthCallback exchanges"`
Expected: FAIL — the fragment still includes `refreshToken=rt` and no `icore_rt` cookie is set.

- [ ] **Step 3: Rewire `oauthCallback`**

Find:

```ts
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const fragment = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
```

Replace with:

```ts
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, { refreshToken: session.refreshToken, csrfToken, isProd: this.isProd() });
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const fragment = new URLSearchParams({
      accessToken: session.accessToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test api -t "oauthCallback exchanges"`
Expected: PASS.

- [ ] **Step 5: Run the full `api` suite for regressions**

Run: `yarn nx test api`
Expected: PASS.

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
yarn nx lint api
yarn nx build api
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git commit -m "feat(auth): issue httpOnly refresh cookie on OAuth callback; drop refreshToken from redirect fragment"
```

---

### Task 8: `iCore` — access-token + CSRF + shared silent-refresh modules

All three modules live in `libs/template-shared`, not `apps/templates/client-shadcn` — `create-api.ts` (Task 9) lives in `template-shared` and needs these, and Nx's dependency graph does not allow a `libs/*` package to import from `apps/templates/client-shadcn`. `useAuthStore` already sets this precedent (a client-auth primitive living in `template-shared`, consumed by `apps/templates/client-shadcn`) — these three follow it.

**Files:**
- Create: `libs/template-shared/src/lib/api/access-token.ts`
- Create: `libs/template-shared/src/lib/api/csrf.ts`
- Create: `libs/template-shared/src/lib/api/silent-refresh.ts`
- Test: `libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts`
- Test: `libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts`
- Test: `libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts`
- Modify: `libs/template-shared/src/index.ts` (public exports for all three — every later task that imports `setAccessToken`/`performSilentRefresh`/etc. from `@icore/template-shared` depends on this)

**Interfaces:**
- Produces: `getAccessToken(): string | null`, `setAccessToken(token: string | null): void`
- Produces: `readCsrfCookie(): string | null`
- Produces: `performSilentRefresh(baseUrl: string): Promise<{ accessToken: string; user: { id: string; email: string } } | null>` — calls `setAccessToken` on success itself.

- [ ] **Step 1: Write the failing access-token test**

Create `libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { getAccessToken, setAccessToken } from '../access-token.js';

describe('access-token', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it('starts as null', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('returns whatever was last set', () => {
    setAccessToken('token-1');
    expect(getAccessToken()).toBe('token-1');
    setAccessToken('token-2');
    expect(getAccessToken()).toBe('token-2');
  });

  it('can be cleared back to null', () => {
    setAccessToken('token-1');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn nx test template-shared -t "access-token"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `access-token.ts`**

Create `libs/template-shared/src/lib/api/access-token.ts`:

```ts
let currentToken: string | null = null;

export function getAccessToken(): string | null {
  return currentToken;
}

export function setAccessToken(token: string | null): void {
  currentToken = token;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `yarn nx test template-shared -t "access-token"`
Expected: PASS.

- [ ] **Step 5: Write the failing CSRF test**

Create `libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readCsrfCookie } from '../csrf.js';

describe('readCsrfCookie', () => {
  afterEach(() => {
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  it('returns null when the cookie is not present', () => {
    expect(readCsrfCookie()).toBeNull();
  });

  it('reads the value when present among other cookies', () => {
    document.cookie = 'other=1';
    document.cookie = 'icore_csrf=abc123';
    expect(readCsrfCookie()).toBe('abc123');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `yarn nx test template-shared -t "readCsrfCookie"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement `csrf.ts`**

Create `libs/template-shared/src/lib/api/csrf.ts`. This is the ONE place this regex lives — `silent-refresh.ts` (Step 11 below) and `create-api.ts` (Task 9) both import it rather than each re-implementing their own copy:

```ts
export function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)icore_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `yarn nx test template-shared -t "readCsrfCookie"`
Expected: PASS.

- [ ] **Step 9: Write the failing `performSilentRefresh` tests**

Create `libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performSilentRefresh } from '../silent-refresh.js';

const BASE = 'http://test/api';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('performSilentRefresh', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'icore_csrf=csrf-abc';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  it('sends credentials and the CSRF header, returns the session on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'fresh', user: { id: 'u1', email: 'u@x.com' } }),
    );

    const result = await performSilentRefresh(BASE);

    expect(result).toEqual({ accessToken: 'fresh', user: { id: 'u1', email: 'u@x.com' } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/auth/refresh`);
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-abc');
  });

  it('returns null on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    expect(await performSilentRefresh(BASE)).toBeNull();
  });

  it('returns null on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await performSilentRefresh(BASE)).toBeNull();
  });

  it('serializes two concurrent calls through navigator.locks when available', async () => {
    const lockRequest = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { locks: { request: lockRequest } });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'a', user: { id: 'u1', email: 'e' } }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'b', user: { id: 'u1', email: 'e' } }));

    await Promise.all([performSilentRefresh(BASE), performSilentRefresh(BASE)]);

    expect(lockRequest).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `yarn nx test template-shared -t "performSilentRefresh"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 11: Implement `silent-refresh.ts`**

Create `libs/template-shared/src/lib/api/silent-refresh.ts`:

```ts
import { readCsrfCookie } from './csrf.js';
import { setAccessToken } from './access-token.js';

interface SilentRefreshResult {
  accessToken: string;
  user: { id: string; email: string };
}

async function doRefresh(baseUrl: string): Promise<SilentRefreshResult | null> {
  const csrf = readCsrfCookie();
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SilentRefreshResult>;
    if (typeof data.accessToken !== 'string' || !data.user) return null;
    return { accessToken: data.accessToken, user: data.user };
  } catch {
    return null;
  }
}

/**
 * Serializes the actual refresh network call across browser tabs via the
 * Web Locks API. The refresh token itself is never held in JS — only in the
 * httpOnly cookie the browser manages — so a tab that waited for the lock
 * sends whatever cookie value is current by the time it runs, not a stale
 * one it cached itself. Falls back to an unguarded call where Web Locks
 * isn't available (pre-15.4 Safari): the rare cross-tab race in that one
 * case is an accepted edge case, not worth a polyfill.
 */
export async function performSilentRefresh(baseUrl: string): Promise<SilentRefreshResult | null> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  const result = locks
    ? await locks.request('icore-auth-refresh', () => doRefresh(baseUrl))
    : await doRefresh(baseUrl);
  if (result) setAccessToken(result.accessToken);
  return result;
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `yarn nx test template-shared -t "performSilentRefresh"`
Expected: PASS — all 4 tests.

- [ ] **Step 13: Export all three from the package's public entry point**

In `libs/template-shared/src/index.ts`, find the existing export line for `stores/auth.store` (or the nearest analogous one) and add directly after it:

```ts
export * from './lib/api/access-token';
export * from './lib/api/csrf';
export * from './lib/api/silent-refresh';
```

- [ ] **Step 14: Confirm `@idevconn/api-client` is current (no bump expected)**

Verified in this session: root `package.json` and `libs/template-shared/package.json` both already pin `"@idevconn/api-client": "^0.3.3"`, which already satisfies Task 1's `credentials`/`getRefreshHeaders` fields (Task 1 is already shipped — see its status note). Run `grep '"@idevconn/api-client"' package.json libs/template-shared/package.json` to reconfirm; only bump + `yarn install` if this has drifted below `^0.3.3` since this plan was adapted.

- [ ] **Step 15: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/api/access-token.ts libs/template-shared/src/lib/api/csrf.ts libs/template-shared/src/lib/api/silent-refresh.ts libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts libs/template-shared/src/index.ts
yarn nx lint template-shared
yarn nx build template-shared
```

- [ ] **Step 16: Commit**

```bash
git add libs/template-shared/src/lib/api/access-token.ts libs/template-shared/src/lib/api/csrf.ts libs/template-shared/src/lib/api/silent-refresh.ts libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts libs/template-shared/src/index.ts
git commit -m "feat(template-shared): add in-memory access-token store, CSRF cookie reader, shared silent-refresh helper"
```

---

### Task 8b: `iCore` — bump `@idevconn/api-client` pin in `_template-shell`

Per user decision (2026-09-19): fold the scaffold-generator's stale pin bump into this PR rather than a separate follow-up.

**Files:**
- Modify: `tools/create-icore/_template-shell/package.json`

**Do NOT touch:** `tools/create-icore/templates/**` — generated build artifact, regenerates from `_template-shell` on the next `nx build create-icore` (or equivalent generator build step); hand-editing it directly is discarded on the next build and drifts from source.

- [ ] **Step 1: Confirm current pin and target version**

```bash
grep '"@idevconn/api-client"' tools/create-icore/_template-shell/package.json package.json
```

Expected: `_template-shell` shows an older range (`^0.3.0` or `^0.3.2` per this plan's Global Constraints note); root shows `^0.3.3`. If `_template-shell` is already `^0.3.3` or newer, this task is a no-op — ledger it as such and skip to Task 9.

- [ ] **Step 2: Bump the pin**

Edit `tools/create-icore/_template-shell/package.json`'s `@idevconn/api-client` entry to match root's `^0.3.3` (or whatever newer version root currently pins, if it has moved since this plan was written — root is the source of truth, not the literal string `^0.3.3`).

- [ ] **Step 3: Rebuild the generated `templates/` artifact**

Run whatever this repo's existing generator-build step is (check `tools/create-icore/package.json`'s `scripts` for a `build`/`generate-templates` task, or `yarn nx build create-icore` if that's how it's wired) so `templates/**`'s copy of `package.json` picks up the bumped pin automatically. Do not hand-edit `templates/**` directly.

- [ ] **Step 4: Verify no other drift**

```bash
grep -rn '"@idevconn/api-client"' tools/create-icore/templates/**/package.json
```

Confirm every generated template now shows the bumped version, not a stale one.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write tools/create-icore/_template-shell/package.json
yarn nx lint create-icore
yarn nx build create-icore
```

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/_template-shell/package.json tools/create-icore/templates
git commit -m "chore(create-icore): bump scaffolded @idevconn/api-client pin to match root"
```

---

### Task 9: `iCore` — rewire `create-api.ts`

**No `fetch-with-refresh.ts` exists in this repo, and this task drops it.** The original (pre-adaptation) version of this plan assumed a second, independent token consumer at `fetch-with-refresh.ts` used by an AI-chat SSE component — verified via `grep`/`glob` in this session: neither `fetch-with-refresh.ts` nor any AI-chat SSE component (`AiAssistant.tsx` or similar) exists anywhere in this repo. iCore's AI feature (`ai-orchestrator` microservice, `/api/ai/*` gateway routes, `apps/templates/client-shadcn/src/components/ai-usage/*`) is a plain JSON REST dashboard with no chart library and no streaming fetch wrapper — it goes through the same `createIcoreApi` client as everything else. If a future feature adds a raw/SSE fetch path that needs its own refresh handling, revisit this task then; there is nothing to rewire today.

**Files:**
- Modify: `libs/template-shared/src/lib/api/create-api.ts`

**Interfaces:**
- Consumes: `getAccessToken`/`setAccessToken` (Task 8, `libs/template-shared/src/lib/api/access-token.ts`).
- Consumes: `readCsrfCookie` (Task 8, `libs/template-shared/src/lib/api/csrf.ts`).

- [ ] **Step 1: Rewire `create-api.ts`**

The current contents (confirmed in this session):

```ts
import { createApiClient } from '@idevconn/api-client';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    // Gateway's AuthSession contract is camelCase end-to-end (accessToken /
    // refreshToken on both the /auth/refresh request body and response) —
    // override the client lib's snake_case defaults or the automatic refresh
    // silently no-ops and the user is force-logged-out at JWT_EXPIRES_IN.
    refreshRequestField: 'refreshToken',
    accessTokenField: 'accessToken',
    refreshTokenField: 'refreshToken',
    onTokenRefreshed: ({ accessToken, refreshToken }) => {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setAuth({ accessToken, refreshToken, user });
    },
    onUnauthorized: () => {
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
```

Replace with:

```ts
import { createApiClient } from '@idevconn/api-client';
import { getAccessToken, setAccessToken } from './access-token.js';
import { readCsrfCookie } from './csrf.js';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    credentials: 'include',
    getAccessToken: () => getAccessToken(),
    getRefreshToken: () => 'cookie', // real token lives only in the httpOnly cookie; this is just a truthy guard
    getRefreshHeaders: () => {
      const csrf = readCsrfCookie();
      return csrf ? { 'X-CSRF-Token': csrf } : {};
    },
    // Response body is now {accessToken, user} only — no refreshToken field
    // (Task 4/5/7 drop it everywhere) — refreshRequestField/refreshTokenField
    // no longer apply.
    accessTokenField: 'accessToken',
    onTokenRefreshed: ({ accessToken }) => setAccessToken(accessToken),
    onUnauthorized: () => {
      setAccessToken(null);
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
```

Note: this does NOT route through `performSilentRefresh`/Web Locks — the underlying `@idevconn/api-client` library still owns its own refresh call internally (Task 1 only added `credentials`/`getRefreshHeaders` passthrough, not a pluggable refresh implementation). This is a known residual gap versus the spec's "fixed via Web Locks" intent — the library's own internal refresh call is unguarded by the Web Locks section `silent-refresh.ts` wraps `AuthBootstrap`'s boot-time call in (Task 11). In practice the two paths hitting `/auth/refresh` at nearly the same moment is rare (boot-time vs. a live 401), and the failure mode is just an extra login prompt for one tab — but flag this explicitly in review rather than assume it's fully closed, since the spec's stated intent was "fixed via Web Locks", full stop.

- [ ] **Step 2: Run the full `template-shared` and `client-shadcn` suites for regressions**

Run: `yarn nx test template-shared` then `yarn nx test client-shadcn`
Expected: PASS. Any test that stubbed `useAuthStore`'s `accessToken`/`refreshToken` fields directly (rather than `access-token.ts`) will fail — fix each to use `setAccessToken`/`getAccessToken` instead, per this task's new contract.

- [ ] **Step 3: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/api/create-api.ts
yarn nx lint template-shared && yarn nx lint client-shadcn
yarn nx build template-shared && yarn nx build client-shadcn
```

- [ ] **Step 4: Commit**

```bash
git add libs/template-shared/src/lib/api/create-api.ts
git commit -m "feat(client): rewire create-api.ts onto the in-memory access token + CSRF-header refresh"
```

---

### Task 10: `iCore` — trim `useAuthStore`, rewire callback routes

**Files:**
- Modify: `libs/template-shared/src/lib/stores/auth.store.ts`
- Modify: `apps/templates/client-shadcn/src/routes/auth.callback.tsx`
- Modify: `apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx`
- Modify: `apps/templates/client-shadcn/src/routes/login.tsx`
- Test: `apps/templates/client-shadcn/src/routes/__tests__/auth.callback.unit.test.tsx`
- Test: `apps/templates/client-shadcn/src/routes/__tests__/login.unit.test.tsx`

**Interfaces:**
- `useAuthStore.setAuth` signature changes from `{accessToken, refreshToken, user}` to `{user}`.
- Consumes: `setAccessToken` (Task 8/9, from `libs/template-shared/src/lib/api/access-token.ts`).

- [ ] **Step 1: Rewrite `auth.store.ts`**

Replace the entire contents of `libs/template-shared/src/lib/stores/auth.store.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

export interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'icore-auth' },
  ),
);

export function useIsAdmin(): boolean {
  return useAuthStore((s) => s.user?.role === 'admin') ?? false;
}
```

Note: `setAuth` is renamed to `setUser` and no longer takes token fields — every call site across the codebase must be updated in this same task (grep for `useAuthStore.*setAuth\|\.setAuth(` across `apps/templates/client-shadcn/src` before finishing this task and fix every hit, not just the 3 files listed above if more exist).

- [ ] **Step 2: Rewire `auth.callback.tsx`**

Read the current file (it has the `resolveHashSession`/`resolveToken` logic from an earlier, already-merged fix). Replace the `useEffect` body's two `setAuth(hashSession)` / `setAuth(session)` calls: each now becomes `setAccessToken(session.accessToken); setUser(session.user);` (import `setAccessToken` from `libs/template-shared`'s `access-token.ts` re-export, and destructure `setUser` from `useAuthStore` instead of `setAuth`). The existing best-effort `/auth/me` role-backfill block's `setAuth({...hashSession, user: {...}})` call becomes `setUser({ ...hashSession.user, role: me.role })`.

- [ ] **Step 3: Update `auth.callback.unit.test.tsx`**

No changes needed if the existing tests only exercise the pure `resolveHashSession` function (they do, per the file's current content) — confirm this remains true after Step 2's edit; the pure function itself is untouched by this task.

- [ ] **Step 4: Rewire `auth.oauth.callback.tsx`**

Confirmed current content: `const refreshToken = params.get('refreshToken');`, then `if (!accessToken || !refreshToken || !userId || !email) { ... }` (rejects the callback if any is missing), then `setAuth({ accessToken, refreshToken, user: { id: userId, email } })`. Since Task 7 drops `refreshToken` from the redirect fragment entirely, `params.get('refreshToken')` will always resolve `null` — remove the variable, drop it from the `if` guard, and replace the `setAuth(...)` call with `setAccessToken(accessToken); setUser({ id: userId, email });`. Its best-effort role-backfill `setAuth({...})` call (if present further down the file) becomes `setUser({ id: userId, email, role: me.role })`.

- [ ] **Step 5: Rewire `login.tsx`**

In `handlePasswordSubmit` and `handleRegisterSubmit`, both currently do:

```ts
      const session = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', { ... });
      setAuth(session);
```

Change the inline response type to drop `refreshToken` (`{accessToken: string; user: {...}}`), and replace `setAuth(session)` with `setAccessToken(session.accessToken); setUser(session.user);` in both handlers. Import `setAccessToken` and `useAuthStore`'s `setUser` selector at the top (the file already imports `useAuthStore` — just also destructure `setUser` instead of `setAuth`).

- [ ] **Step 6: Update `login.unit.test.tsx`**

Confirm the existing tests only exercise the pure `isSafeReturnTo` function (they do) — no changes needed, same reasoning as Step 3.

- [ ] **Step 7: Run the full `client` and `template-shared` suites**

Run: `yarn nx test client-shadcn` then `yarn nx test template-shared`
Expected: PASS. Fix any remaining `setAuth`/`accessToken`/`refreshToken` store references this task's grep in Step 1 turned up but weren't explicitly listed here.

- [ ] **Step 8: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/stores/auth.store.ts apps/templates/client-shadcn/src/routes/auth.callback.tsx apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx apps/templates/client-shadcn/src/routes/login.tsx
yarn nx lint client-shadcn && yarn nx lint template-shared
yarn nx build client-shadcn && yarn nx build template-shared
```

- [ ] **Step 9: Commit**

```bash
git add libs/template-shared/src/lib/stores/auth.store.ts apps/templates/client-shadcn/src/routes/auth.callback.tsx apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx apps/templates/client-shadcn/src/routes/login.tsx
git commit -m "feat(client): trim useAuthStore to user-only, rewire callback routes onto in-memory access token"
```

---

### Task 11: `iCore` — `AuthBootstrap` silent-refresh-on-boot

**Files:**
- Create: `apps/templates/client-shadcn/src/app/auth-bootstrap.tsx`
- Test: `apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx`
- Modify: `apps/templates/client-shadcn/src/main.tsx`

**Interfaces:**
- Consumes: `performSilentRefresh` (Task 8), `useAuthStore.setUser` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as silentRefresh from '@icore/template-shared';
import { useAuthStore } from '@icore/template-shared';
import { AuthBootstrap } from '../auth-bootstrap';

vi.mock('@icore/template-shared', async () => {
  const actual = await vi.importActual<typeof import('@icore/template-shared')>(
    '@icore/template-shared',
  );
  return { ...actual, performSilentRefresh: vi.fn() };
});

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('shows a loading state, then renders children once the refresh resolves', async () => {
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce({
      accessToken: 'at',
      user: { id: 'u1', email: 'u@x.com' },
    });

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'u@x.com' });
  });

  it('renders children even when the refresh fails (unauthenticated state, not an error)', async () => {
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce(null);

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument());
    expect(useAuthStore.getState().user).toBeNull();
  });
});
```

**No `.unit.test.tsx` files exist anywhere in this repo yet** (verified via `find . -iname "*.unit.test.tsx"`) — `client-shadcn` has `@testing-library/react`/`@testing-library/dom` as devDependencies and an inferred Vitest target (`apps/templates/client-shadcn/vite.config.mts`'s `test: commonTestConfig(...)` block), but no existing component-render test to mirror. This test is the first of its kind in the project. `AuthBootstrap` has no routing/query dependency, so a bare `render()`/`screen`/`waitFor` from `@testing-library/react` (as shown below) should work without a wrapper — confirm by running it rather than assuming a convention that doesn't exist yet.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test client-shadcn -t "AuthBootstrap"`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `AuthBootstrap`**

Create `apps/templates/client-shadcn/src/app/auth-bootstrap.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { performSilentRefresh, useAuthStore } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    void performSilentRefresh(import.meta.env.VITE_API_URL ?? '/api').then((result) => {
      if (cancelled) return;
      if (result) setUser(result.user);
      setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (!booted) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </main>
    );
  }

  return <>{children}</>;
}
```

`performSilentRefresh` is already re-exported from `@icore/template-shared`'s public index via Task 8 Step 13.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test client-shadcn -t "AuthBootstrap"`
Expected: PASS — both tests.

- [ ] **Step 5: Wire into `main.tsx`**

In `apps/templates/client-shadcn/src/main.tsx`, find:

```tsx
createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider>
          <RouterProvider router={router} />
          <Toaster richColors />
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

Replace with:

```tsx
import { AuthBootstrap } from './app/auth-bootstrap';

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider>
          <AuthBootstrap>
            <RouterProvider router={router} />
            <Toaster richColors />
          </AuthBootstrap>
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
```

(Add the `import` line near the file's other local imports, not inline where shown above — shown adjacent here only for clarity about which import it is.)

- [ ] **Step 6: Format, lint, build**

```bash
npx prettier --write apps/templates/client-shadcn/src/app/auth-bootstrap.tsx apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx apps/templates/client-shadcn/src/main.tsx
yarn nx lint client-shadcn
yarn nx build client-shadcn
```

- [ ] **Step 7: Commit**

```bash
git add apps/templates/client-shadcn/src/app/auth-bootstrap.tsx apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx apps/templates/client-shadcn/src/main.tsx
git commit -m "feat(client): add AuthBootstrap silent-refresh-on-boot wrapper"
```

---

### Task 12: `iCore` — wire logout to the new endpoint

**Files:**
- Modify: `apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx`
- Test: `apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx` (new — no `.unit.test.tsx` files exist anywhere in this repo yet, per Task 11's same finding; there is no existing convention to mirror, use `@testing-library/react`'s standard `render`/`screen`/`fireEvent` directly).

**Interfaces:**
- Consumes: `api` (existing `POST` call, exported from `apps/templates/client-shadcn/src/main.tsx` — there is no separate `apps/templates/client-shadcn/src/lib/api.ts` file; other consumers import it via `import { api } from '../../main'`, per `queries/notes.ts`), `setAccessToken` (Task 8/9).

- [ ] **Step 1: Write the failing test**

Create `apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx` with a test asserting: clicking the logout menu item calls `POST /auth/logout` (mock the `../../../main` module's `api` export, since that's where `LayoutHeader.tsx` will import it from), then clears `useAuthStore`'s `user` and the in-memory access token, then navigates to `/login`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn nx test client-shadcn -t "LayoutHeader"` (or `-t "logout"`, whichever matches the new test's description)
Expected: FAIL.

- [ ] **Step 3: Rewire `handleLogout`**

In `apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx`, find:

```ts
  function handleLogout() {
    logout();
    void navigate({ to: '/login' });
  }
```

Replace with:

```ts
  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort: clear local state and navigate regardless — an already-
      // expired/invalid session shouldn't block the user from reaching /login.
    }
    setAccessToken(null);
    logout();
    void navigate({ to: '/login' });
  }
```

Update the `onClick={handleLogout}` call site (currently `onClick={handleLogout}` on a plain function — confirm it still works being `async` now; React's `onClick` accepts a function returning `void | Promise<void>` fine, but if this codebase's lint rules flag unawaited promises in JSX handlers, wrap the call site as `onClick={() => void handleLogout()}` instead, matching the pattern already used for `onClick={() => void navigate(...)}` elsewhere in this same file).

Add `import { api } from '../../main';` (matching this repo's existing `queries/notes.ts` convention for importing the shared client instance) and `import { setAccessToken } from '@icore/template-shared';` (`setAccessToken` is already re-exported per Task 8 Step 13) at the top of the file if not already present.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn nx test client-shadcn -t "LayoutHeader"` (or the matching filter from Step 2)
Expected: PASS.

- [ ] **Step 5: Format, lint, build**

```bash
npx prettier --write apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx
yarn nx lint client-shadcn
yarn nx build client-shadcn
```

- [ ] **Step 6: Commit**

```bash
git add apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx
git commit -m "feat(client): call POST /auth/logout before clearing local session state"
```

---

### Task 13: Full regression pass + live Playwright verification

**Files:** none (verification only)

- [ ] **Step 1: Run every affected project's full test suite**

```bash
yarn nx test shared
yarn nx test auth-client
yarn nx test api
yarn nx test client-shadcn
yarn nx test template-shared
```

(Confirm exact project names for `libs/auth-strategies/supabase` and any others touched via `yarn nx show projects` if any of the above don't match — run those too.)

Expected: all PASS, zero regressions.

- [ ] **Step 2: Full lint + build**

```bash
yarn nx lint shared && yarn nx lint auth-client && yarn nx lint api && yarn nx lint client-shadcn && yarn nx lint template-shared
yarn nx build shared && yarn nx build auth-client && yarn nx build api && yarn nx build client-shadcn && yarn nx build template-shared
```

Expected: all green.

- [ ] **Step 3: Live Playwright verification (mandatory per `AGENTS.md` — this is a UI/auth-behavior change)**

With `yarn dev` running against real `.env` files (copy them into whatever worktree this plan executes in — a fresh git worktree does not inherit gitignored `.env` files, so each MS's `.env` needs copying in manually before `yarn dev` can authenticate against Supabase):

1. Log in via the password form. Confirm `localStorage.getItem('icore-auth')` contains only `{state: {user: {...}}, version: 0}` — no `accessToken`/`refreshToken` fields anywhere in it.
2. Confirm `document.cookie` contains `icore_csrf` but does NOT expose `icore_rt` (httpOnly cookies are invisible to `document.cookie` by design — absence here is the expected, correct result, not a bug).
3. Reload the page. Confirm the dashboard renders after a brief loading state (the silent refresh), without being redirected to `/login`.
4. Make an ordinary authenticated API call (e.g. navigate to any data-backed page) and confirm it still succeeds — the `Authorization: Bearer` header path is unchanged.
5. Log out. Confirm `icore_csrf` is cleared from `document.cookie`, and reloading the page now redirects to `/login` (the refresh cookie no longer works).
6. Open two tabs, log in in one; confirm the second tab, once reloaded, also lands authenticated (cookies are shared across tabs on the same origin).

- [ ] **Step 4: No commit for this task**

Verification only — nothing to commit.

---

### Task 14: Branch, changeset, PR against `dev`

**Files:**
- Create: `.changeset/httponly-cookie-auth.md`

Per `AGENTS.md`'s non-negotiable rules: work must happen on a `feature/<name>` branch cut from `dev` (never directly on `dev`, never on `main`); every PR needs a changeset; PRs target `--base dev` only, never `main`.

- [ ] **Step 1: Confirm the branch**

If Tasks 2–13 weren't already done on a dedicated branch, this step is too late — the branch must exist *before* the first commit in Task 2. Run `git branch --show-current`; if it's `dev` or `main`, stop and figure out how to move the already-made commits onto a fresh `feature/httponly-cookie-auth` branch cut from `dev` before continuing (do not commit further work directly on `dev`/`main`).

- [ ] **Step 2: Add the changeset**

Create `.changeset/httponly-cookie-auth.md`:

```md
---
"@idevconn/create-icore": minor
---

Move the refresh token out of localStorage into an httpOnly cookie (XSS hardening); access token now lives in memory only. Adds CSRF double-submit protection on `/auth/refresh`, fixes a cross-tab refresh-rotation race via the Web Locks API, and switches `POST /auth/logout` to read the refresh cookie instead of the request body.
```

Confirm `@idevconn/create-icore` is still the correct target package (`grep '"name"' tools/create-icore/package.json`) before committing — this is a `minor` bump, not `patch`, since it's a new capability (httpOnly cookie auth), not a fix.

- [ ] **Step 3: Check PR status before pushing (per `AGENTS.md`'s mandatory pre-push check)**

```bash
gh pr list --state all --limit 10
```

Confirm there is no existing open/merged PR for this branch before proceeding.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feature/httponly-cookie-auth
gh pr create --base dev --title "feat(auth): httpOnly refresh cookie, CSRF protection, cross-tab fix" --body "..."
```

Report the CI result and PR link, then stop — per `AGENTS.md`, do not merge autonomously; the human reviews and merges by hand.
