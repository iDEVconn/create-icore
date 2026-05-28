# Plan 3: Firebase Auth Strategy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `libs/auth-strategies/firebase` with a `FirebaseAuthStrategy` that passes `runAuthContract` (same 7 cases as Supabase). Wire `case 'firebase':` into the auth MS factory. After this plan, flipping `AUTH_PROVIDER=firebase` in `apps/microservices/auth/.env` swaps the entire auth backend without any other change.

**Architecture:** Firebase Admin SDK has no server-side `signInWithPassword` — that's client-only. So the strategy uses two transports:

- Firebase **Admin SDK** (`firebase-admin`) for `verifyToken` (verifies ID tokens) and `setRole` (writes custom claims).
- Firebase **Identity Toolkit REST API** (`https://identitytoolkit.googleapis.com/v1`) for `signUp`, `signIn`, and `refresh` — all three are server-callable with a Web API key.

This means the strategy needs a small `IdentityToolkitClient` abstraction so the REST calls are mockable. The mock pattern mirrors the Supabase mock from Plan 2: a tiny in-memory client that satisfies the interface and is fed into the strategy in tests.

**Tech Stack:** `firebase-admin` (^13), Firebase Identity Toolkit REST (no SDK pkg — plain `fetch` against the documented endpoints), Vitest 4.

**Source spec:** `docs/superpowers/specs/2026-05-28-icore-design.md`

**Branch:** `dev`. Plan 2 HEAD: `8ab9953`.

**Generators only** — `nx g @nx/js:lib` for the new lib. Hand-rolled `project.json` forbidden.

---

## File Map

| Path                                                                                  | Purpose                                                              |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `libs/auth-strategies/firebase/`                                                      | concrete `FirebaseAuthStrategy` (generated via `@nx/js:lib`)         |
| `libs/auth-strategies/firebase/src/lib/identity-toolkit.client.ts`                    | thin `IdentityToolkitClient` interface + `HttpIdentityToolkitClient` |
| `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts`                     | `FirebaseAuthStrategy implements AuthStrategy`                       |
| `libs/auth-strategies/firebase/src/lib/__tests__/support/mock-identity-toolkit.ts`    | in-memory `IdentityToolkitClient`                                    |
| `libs/auth-strategies/firebase/src/lib/__tests__/support/mock-admin-auth.ts`          | in-memory `verifyIdToken` + `setCustomUserClaims`                    |
| `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts` | invokes `runAuthContract`                                            |
| `apps/microservices/auth/src/app/app.module.ts`                                       | add `case 'firebase':` to the `AuthStrategy` factory                 |
| `apps/microservices/auth/package.json`                                                | declare `@icore/auth-firebase` + `firebase-admin`                    |
| `docs/architecture.md`                                                                | flip Plan 3 to ✅, note Firebase env keys + REST dependency          |

---

## Task 1: Generate `libs/auth-strategies/firebase`

- [ ] **Step 1: Generate**

```bash
cd /home/vladimir-tkach/Projects/icore
yarn nx g @nx/js:lib --name=auth-firebase --directory=libs/auth-strategies/firebase --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/auth-firebase --no-interactive
```

- [ ] **Step 2: Delete placeholders**

```bash
rm libs/auth-strategies/firebase/src/lib/auth-firebase.ts
rm libs/auth-strategies/firebase/src/lib/auth-firebase.spec.ts
```

Empty the barrel:

```ts
// libs/auth-strategies/firebase/src/index.ts
export {};
```

- [ ] **Step 3: Set tsconfig.json module=node16**

Same pattern as `libs/auth-strategies/supabase/tsconfig.json` (Plan 2 T3). Three-level extends path.

- [ ] **Step 4: Verify scaffold builds**

```bash
yarn nx lint auth-firebase
yarn nx test auth-firebase
yarn nx build auth-firebase
```

All green. Test target reports "no test files" — fine with `passWithNoTests: true` in `vitest.config.mts`.

- [ ] **Step 5: Commit**

```bash
git add libs/auth-strategies/firebase package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(auth-firebase): scaffold libs/auth-strategies/firebase via @nx/js:lib"
```

---

## Task 2: `IdentityToolkitClient` interface + HTTP impl

The strategy depends on a small interface so tests can swap in a mock. The HTTP impl is the production path.

- [ ] **Step 1: Define the interface + DTO types**

Create `libs/auth-strategies/firebase/src/lib/identity-toolkit.client.ts`:

```ts
export interface IdentityToolkitSignUpResponse {
  localId: string;        // firebase uid
  email: string;
  idToken: string;        // access token
  refreshToken: string;
  expiresIn: string;      // seconds, as string per Firebase response
}

export interface IdentityToolkitSignInResponse extends IdentityToolkitSignUpResponse {
  registered: boolean;
}

export interface IdentityToolkitRefreshResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
}

export interface IdentityToolkitClient {
  signUp(email: string, password: string): Promise<IdentityToolkitSignUpResponse>;
  signIn(email: string, password: string): Promise<IdentityToolkitSignInResponse>;
  refresh(refreshToken: string): Promise<IdentityToolkitRefreshResponse>;
}

interface IdentityToolkitError {
  error?: { message?: string; code?: number };
}

export class HttpIdentityToolkitClient implements IdentityToolkitClient {
  constructor(private readonly apiKey: string) {}

  async signUp(email: string, password: string): Promise<IdentityToolkitSignUpResponse> {
    return this.post('https://identitytoolkit.googleapis.com/v1/accounts:signUp', {
      email,
      password,
      returnSecureToken: true,
    });
  }

  async signIn(email: string, password: string): Promise<IdentityToolkitSignInResponse> {
    return this.post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', {
      email,
      password,
      returnSecureToken: true,
    });
  }

  async refresh(refreshToken: string): Promise<IdentityToolkitRefreshResponse> {
    // refresh endpoint uses form-encoded body and a different host
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as IdentityToolkitError;
      throw new Error(payload.error?.message ?? `firebase_refresh_failed_${res.status}`);
    }
    return res.json() as Promise<IdentityToolkitRefreshResponse>;
  }

  private async post<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${url}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as IdentityToolkitError;
      throw new Error(payload.error?.message ?? `firebase_request_failed_${res.status}`);
    }
    return res.json() as Promise<T>;
  }
}
```

- [ ] **Step 2: Wire into barrel**

```ts
// libs/auth-strategies/firebase/src/index.ts
export * from './lib/firebase-auth.strategy';
export * from './lib/identity-toolkit.client';
```

(`firebase-auth.strategy` doesn't exist yet — Task 3 creates it. The barrel will fail to compile until then.)

- [ ] **Step 3: Pre-commit hook will fail because of step 2 — that's expected. Stage but don't commit yet — Task 3 will land the strategy + commit both together.**

---

## Task 3: Implement `FirebaseAuthStrategy` (TDD)

- [ ] **Step 1: Install `firebase-admin`**

```bash
yarn add firebase-admin
```

Update `libs/auth-strategies/firebase/package.json` dependencies:

```json
"dependencies": {
  "@icore/shared": "*",
  "firebase-admin": "^13.0.0",
  "tslib": "^2.3.0"
},
"devDependencies": {
  "vitest": "^4.0.0"
}
```

- [ ] **Step 2: Write the mock IdentityToolkitClient**

Create `libs/auth-strategies/firebase/src/lib/__tests__/support/mock-identity-toolkit.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type {
  IdentityToolkitClient,
  IdentityToolkitRefreshResponse,
  IdentityToolkitSignInResponse,
  IdentityToolkitSignUpResponse,
} from '../../identity-toolkit.client';

interface FakeUser {
  localId: string;
  email: string;
  password: string;
}

export interface MockHandle {
  client: IdentityToolkitClient;
  users: Map<string, FakeUser>;
  tokensToUid: Map<string, string>;
  refreshToUid: Map<string, string>;
}

export function createMockIdentityToolkit(): MockHandle {
  const users = new Map<string, FakeUser>();
  const tokensToUid = new Map<string, string>();
  const refreshToUid = new Map<string, string>();

  function issue(user: FakeUser) {
    const idToken = `id_${user.localId}_${randomUUID()}`;
    const refreshToken = `rt_${user.localId}_${randomUUID()}`;
    tokensToUid.set(idToken, user.localId);
    refreshToUid.set(refreshToken, user.localId);
    return { idToken, refreshToken, expiresIn: '3600' };
  }

  const client: IdentityToolkitClient = {
    async signUp(email, password) {
      for (const u of users.values()) {
        if (u.email === email) throw new Error('EMAIL_EXISTS');
      }
      const user: FakeUser = { localId: `uid_${users.size + 1}`, email, password };
      users.set(user.localId, user);
      const session = issue(user);
      return { localId: user.localId, email, ...session } as IdentityToolkitSignUpResponse;
    },
    async signIn(email, password) {
      for (const u of users.values()) {
        if (u.email === email && u.password === password) {
          const session = issue(u);
          return {
            localId: u.localId,
            email,
            registered: true,
            ...session,
          } as IdentityToolkitSignInResponse;
        }
      }
      throw new Error('EMAIL_NOT_FOUND_OR_INVALID_PASSWORD');
    },
    async refresh(refreshToken) {
      const uid = refreshToUid.get(refreshToken);
      if (!uid) throw new Error('INVALID_REFRESH_TOKEN');
      refreshToUid.delete(refreshToken); // Firebase rotates
      const user = [...users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      const session = issue(user);
      return {
        id_token: session.idToken,
        refresh_token: session.refreshToken,
        expires_in: session.expiresIn,
        user_id: user.localId,
      } satisfies IdentityToolkitRefreshResponse;
    },
  };

  return { client, users, tokensToUid, refreshToUid };
}
```

- [ ] **Step 3: Write the mock admin-auth surface**

Create `libs/auth-strategies/firebase/src/lib/__tests__/support/mock-admin-auth.ts`:

```ts
import type { MockHandle } from './mock-identity-toolkit';

interface FakeAdminAuthOptions {
  identityToolkit: MockHandle;
}

export interface FakeAdminAuth {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
}

export function createMockAdminAuth(opts: FakeAdminAuthOptions): FakeAdminAuth {
  const roles = new Map<string, string>();

  return {
    async verifyIdToken(idToken) {
      const uid = opts.identityToolkit.tokensToUid.get(idToken);
      if (!uid) throw new Error('TOKEN_NOT_FOUND');
      const user = [...opts.identityToolkit.users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      return { uid: user.localId, email: user.email, role: roles.get(uid) };
    },
    async setCustomUserClaims(uid, claims) {
      const role = claims['role'];
      if (typeof role === 'string') roles.set(uid, role);
    },
  };
}
```

- [ ] **Step 4: Write the failing contract test (RED)**

Create `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts`:

```ts
import { runAuthContract } from '@icore/shared';
import { FirebaseAuthStrategy } from '../firebase-auth.strategy';
import { createMockIdentityToolkit } from './support/mock-identity-toolkit';
import { createMockAdminAuth } from './support/mock-admin-auth';

runAuthContract('FirebaseAuthStrategy', () => {
  const toolkit = createMockIdentityToolkit();
  const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
  return new FirebaseAuthStrategy({
    identityToolkit: toolkit.client,
    adminAuth,
  });
});
```

Run:

```bash
yarn nx test auth-firebase
```

Expected: FAIL — `../firebase-auth.strategy` module not found.

- [ ] **Step 5: Implement the strategy (GREEN)**

Create `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts`:

```ts
import type { AuthSession, AuthStrategy, VerifiedToken } from '@icore/shared';
import type { IdentityToolkitClient } from './identity-toolkit.client';

export interface FirebaseAdminAuthLike {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
}

export interface FirebaseAuthStrategyOptions {
  identityToolkit: IdentityToolkitClient;
  adminAuth: FirebaseAdminAuthLike;
}

export class FirebaseAuthStrategy implements AuthStrategy {
  private readonly identityToolkit: IdentityToolkitClient;
  private readonly adminAuth: FirebaseAdminAuthLike;

  constructor(opts: FirebaseAuthStrategyOptions) {
    this.identityToolkit = opts.identityToolkit;
    this.adminAuth = opts.adminAuth;
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const res = await this.identityToolkit.signUp(email, password);
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const res = await this.identityToolkit.signIn(email, password);
    return {
      accessToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresIn: Number(res.expiresIn),
      user: { id: res.localId, email: res.email },
    };
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const res = await this.identityToolkit.refresh(refreshToken);
    // Firebase doesn't return email on the refresh endpoint; we backfill via verifyIdToken
    const verified = await this.adminAuth.verifyIdToken(res.id_token);
    return {
      accessToken: res.id_token,
      refreshToken: res.refresh_token,
      expiresIn: Number(res.expires_in),
      user: { id: res.user_id, email: verified.email ?? '' },
    };
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const decoded = await this.adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role,
    };
  }

  async setRole(uid: string, role: string): Promise<void> {
    await this.adminAuth.setCustomUserClaims(uid, { role });
  }
}
```

- [ ] **Step 6: Run — expect pass**

```bash
yarn nx test auth-firebase
```

Expected: 7 contract tests pass (same as Supabase): signUp, signIn-after-signUp, verifyToken-resolves-uid, verifyToken-rejects-bogus, refresh-issues-new-session, used-refresh-rejected-after-rotation, setRole-visible-on-verify.

- [ ] **Step 7: Build + lint**

```bash
yarn nx lint auth-firebase
yarn nx build auth-firebase
```

Both green.

- [ ] **Step 8: Commit**

```bash
git add libs/auth-strategies/firebase package.json yarn.lock
git commit -m "feat(auth-firebase): implement FirebaseAuthStrategy, passes runAuthContract"
```

---

## Task 4: Wire firebase case into auth MS factory

- [ ] **Step 1: Add firebase-admin init helper**

The auth MS reads `FB_ADMIN_*` env vars to build a `firebase-admin` `App`. The strategy needs the `auth()` interface off that App. Production wiring lives in the MS module's factory.

Edit `apps/microservices/auth/src/app/app.module.ts`. Replace the `useFactory` body so it now handles both providers:

```ts
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { SupabaseAuthStrategy } from '@icore/auth-supabase';
import { FirebaseAuthStrategy, HttpIdentityToolkitClient } from '@icore/auth-firebase';
import type { AuthStrategy } from '@icore/shared';
import { AuthController } from './auth.controller';

function makeFirebaseStrategy(cfg: ConfigService): AuthStrategy {
  const projectId = cfg.getOrThrow<string>('FB_ADMIN_PROJECT_ID');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_EMAIL'),
        privateKey: cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }
  const identityToolkit = new HttpIdentityToolkitClient(cfg.getOrThrow<string>('FIREBASE_WEB_API_KEY'));
  return new FirebaseAuthStrategy({
    identityToolkit,
    adminAuth: admin.auth(),
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/auth/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: 'AuthStrategy',
      useFactory: (cfg: ConfigService): AuthStrategy => {
        const provider = cfg.getOrThrow<string>('AUTH_PROVIDER');
        switch (provider) {
          case 'supabase': {
            const client = createClient(
              cfg.getOrThrow<string>('SUPABASE_URL'),
              cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
              { auth: { autoRefreshToken: false, persistSession: false } },
            );
            return new SupabaseAuthStrategy({ client });
          }
          case 'firebase':
            return makeFirebaseStrategy(cfg);
          default:
            throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Update auth MS package.json**

Add `@icore/auth-firebase` and `firebase-admin` to `apps/microservices/auth/package.json` `dependencies`:

```json
"@icore/auth-firebase": "*",
"firebase-admin": "^13.0.0",
```

- [ ] **Step 3: Verify the MS still builds with both providers compiled in**

```bash
yarn nx test auth
yarn nx lint auth
yarn nx build auth
```

All green. The build pulls in both strategy libs (tree-shaking happens at runtime via the switch — the firebase branch is unused unless `AUTH_PROVIDER=firebase`).

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/auth package.json yarn.lock
git commit -m "feat(auth-ms): wire 'firebase' case into AuthStrategy factory"
```

---

## Task 5: Update `.env.example` + docs

`apps/microservices/auth/.env.example` already includes the `FB_ADMIN_*` stubs (added during Plan 2 cleanup). Add one missing key:

- [ ] **Step 1: Add `FIREBASE_WEB_API_KEY`**

Edit `apps/microservices/auth/.env.example` — add immediately under the `FB_ADMIN_*` block:

```
# Firebase Web API key (Project Settings → General → Your apps → SDK config → apiKey).
# Required for the Identity Toolkit REST calls (signUp / signIn / refresh).
FIREBASE_WEB_API_KEY=<your-web-api-key>
```

- [ ] **Step 2: Update `docs/architecture.md`**

Flip Plan 3 row to ✅. Append a short line to the Plan 2 deliverables section noting that the auth MS now supports both providers.

Add a one-line entry to the env catalogue table for `FIREBASE_WEB_API_KEY` under the auth MS row.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/auth/.env.example docs/architecture.md
git commit -m "docs: mark Plan 3 done, document Firebase Web API key requirement"
```

---

## Task 6: Final verify

- [ ] **Step 1: Full sweep**

```bash
yarn nx run-many -t lint test build
yarn format:check
```

All targets green, no format drift.

- [ ] **Step 2: Test count**

Plan 1: 23. Plan 2: 20. Plan 3 adds 7 (Firebase contract). Expected total: **50 tests**.

```bash
yarn nx run-many -t test 2>&1 | grep -E 'Tests +.*passed'
```

---

## Self-Review Notes

**Spec coverage:**

- Phase 4 of spec (Firebase auth strategy) → Tasks 1–3 ✅
- Same contract suite passes for Firebase as for Supabase → Task 3 ✅
- MS factory switch case `firebase` → Task 4 ✅
- Env keys (`FB_ADMIN_*` + `FIREBASE_WEB_API_KEY`) documented → Task 5 ✅
- Architecture doc updated → Task 5 ✅

**Type consistency:**

- `AuthStrategy`, `AuthSession`, `VerifiedToken` reused identically across `SupabaseAuthStrategy` and `FirebaseAuthStrategy`.
- `runAuthContract` runs the same 7 cases against both — no per-provider drift.
- `FirebaseAdminAuthLike` interface narrows `firebase-admin`'s `Auth` surface to only the two methods the strategy actually calls, mirroring how Plan 2's mock-supabase narrowed `SupabaseClient`.

**Deliberately deferred:**

- Firebase OAuth providers (Google, GitHub) — same out-of-scope reasoning as Supabase OAuth in Plan 2.
- E2E test against real Firebase project — optional CI job once a Firebase test project is provisioned.
- CI matrix `AUTH_PROVIDER=[supabase,firebase]` running both contract suites in parallel — wire up when the storage matrix lands in Plan 5.

**Out of scope (per spec Non-Goals):**

- Firebase Firestore / Cloud Functions integration.
- Phone / OTP / Magic link sign-in.
