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
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'a', user: { id: 'u1', email: 'e' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'b', user: { id: 'u1', email: 'e' } }),
      );

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
