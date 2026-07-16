# PR8: Minor polish — narrow error swallowing + HMAC replay protection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two Minor findings from prior final whole-branch reviews (PR5, PR3) that were explicitly judged non-blocking at the time but worth doing: (1) `mergeJsonDeps`/`stripJsonKeys`/`stripTsconfigKeys` in the generator's `wire-provider.ts` swallow ALL errors (including malformed JSON or a real write failure), not just "file legitimately absent" — a real error here would silently reproduce the exact missing-dep bug PR5 fixed, with zero signal; (2) the HMAC transport guard (PR3) has no replay protection — a captured valid signed request could be replayed indefinitely.

**Architecture:** (1) Narrow each function's `catch` to only swallow `ENOENT` (file doesn't exist — the documented, legitimate "partial fixture" case); re-throw everything else. (2) Add a signed timestamp (`_ts`) to every HMAC-signed payload; the guard verifies the signature over the payload *including* `_ts`, then separately checks the timestamp is within a clock-skew tolerance window — a replayed request older than the window is rejected even with a perfectly valid signature.

**Tech Stack:** Node.js `fs/promises` error codes, `node:crypto`, NestJS guards, Vitest.

## Global Constraints

- Nx monorepo — run tests via `nx test <project>`.
- TDD: failing test first.
- `npx prettier --write <touched files>` before every commit.
- `nx lint <project>` 0 errors, `nx build <project>` green before commit.
- Every PR needs a `.changeset/<slug>.md`, `patch` bump.
- Branch: `bug/error-handling-and-replay-protection-polish` cut from `dev`. PR base `dev`.
- Touched projects: `create-icore` (generator), `shared` (lib — hmac.ts unaffected, no changes needed there), `auth` (MS — `hmac.guard.ts`), `auth-client` (lib — `auth-client.service.ts`).
- Files are repo-root source. `tools/create-icore/templates/` is a gitignored build artifact; discard stray drift with `git checkout -- tools/create-icore/templates/` before committing if `nx build create-icore`/smoke-scaffold leaves any (known noise from PR1/PR4/PR5).
- Archive `.superpowers/sdd/*.md` into `docs/superpowers/plans/pr8-execution-record/` and commit it BEFORE opening the PR.
- **This PR changes the wire format of every HMAC-signed TCP payload** (adds `_ts`). Since the gateway and auth MS are always scaffolded and deployed together from the same generator run, this is safe for future scaffolds — but call this out explicitly in the changeset since it's a breaking change to the (currently undocumented/unversioned) signed-payload shape, in case anyone built external tooling against it.

---

### Task 1: Narrow `wire-provider.ts`'s error swallowing to ENOENT only

**Files:**
- Modify: `tools/create-icore/src/manifest/wire-provider.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts`

**Root cause:** `mergeJsonDeps`, `stripJsonKeys`, and `stripTsconfigKeys` each wrap their entire body in a bare `try { ... } catch { /* pkg may be absent in partial fixtures */ }`. The comment is only true for `ENOENT` (file doesn't exist). A malformed JSON file, a permissions error, or a disk-full write failure would be silently swallowed identically — the generator would report success while actually failing to write the deps it was supposed to write, reproducing the exact class of bug PR5 fixed, with no error surfaced anywhere.

- [ ] **Step 1: Write the failing tests**

```typescript
// tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
// Add near the top, alongside existing imports:
import { writeFile as writeFileNode } from 'node:fs/promises';

// Add a new describe block, after the existing ones:
describe('mergeJsonDeps — error narrowing', () => {
  it('silently no-ops when the target file does not exist (ENOENT) — legitimate partial-fixture case', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-mergejsondeps-'));
    const missingPath = join(dir, 'does/not/exist/package.json');
    await expect(mergeJsonDeps(missingPath, { foo: '^1.0.0' })).resolves.toBeUndefined();
  });

  it('propagates a real error instead of swallowing it (malformed JSON)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-mergejsondeps-'));
    const badPath = join(dir, 'package.json');
    await writeFileNode(badPath, '{ not valid json');
    await expect(mergeJsonDeps(badPath, { foo: '^1.0.0' })).rejects.toThrow();
  });
});

describe('stripJsonKeys — error narrowing', () => {
  it('silently no-ops when the target file does not exist (ENOENT)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-stripjsonkeys-'));
    const missingPath = join(dir, 'does/not/exist/package.json');
    await expect(stripJsonKeys(missingPath, () => true)).resolves.toBeUndefined();
  });

  it('propagates a real error instead of swallowing it (malformed JSON)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-stripjsonkeys-'));
    const badPath = join(dir, 'package.json');
    await writeFileNode(badPath, '{ not valid json');
    await expect(stripJsonKeys(badPath, () => true)).rejects.toThrow();
  });
});

describe('stripTsconfigKeys — error narrowing', () => {
  it('silently no-ops when tsconfig.base.json does not exist (ENOENT)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-striptsconfig-'));
    await expect(stripTsconfigKeys(dir, ['@icore/x'])).resolves.toBeUndefined();
  });

  it('propagates a real error instead of swallowing it (malformed JSON)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-striptsconfig-'));
    await writeFileNode(join(dir, 'tsconfig.base.json'), '{ not valid json');
    await expect(stripTsconfigKeys(dir, ['@icore/x'])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test create-icore -- wire-provider.unit.test.ts -t "error narrowing"`
Expected: FAIL — the 3 "propagates a real error" cases currently resolve instead of rejecting (the blanket `catch {}` swallows the `JSON.parse` failure).

- [ ] **Step 3: Narrow all three catches to ENOENT-only**

```typescript
// tools/create-icore/src/manifest/wire-provider.ts
function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Merges `deps` into a package.json's `dependencies`, creating the field if absent. */
export async function mergeJsonDeps(path: string, deps: Record<string, string>): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return; // pkg may be absent in partial fixtures
    throw err;
  }
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
  pkg.dependencies = { ...(pkg.dependencies ?? {}), ...deps };
  await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
}

export async function stripJsonKeys(path: string, drop: (k: string) => boolean): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return; // pkg may be absent in partial fixtures
    throw err;
  }
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const k of Object.keys(deps)) if (drop(k)) delete deps[k];
  }
  await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
}

export async function stripTsconfigKeys(targetDir: string, aliases: string[]): Promise<void> {
  const path = join(targetDir, 'tsconfig.base.json');
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return; // tsconfig may be absent in partial fixtures
    throw err;
  }
  const parsed = JSON.parse(raw) as {
    compilerOptions?: { paths?: Record<string, unknown> };
  };
  const paths = parsed.compilerOptions?.paths;
  if (paths) for (const a of aliases) delete paths[a];
  await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
}
```

Note: `cleanupUnusedAxis` (below these three functions in the same file) is unchanged — it just calls `stripJsonKeys`/`stripTsconfigKeys`, and its own existing tests already only ever run against fixtures where these files exist and are valid, so this narrowing doesn't change its observable behavior in any existing passing test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test create-icore -- wire-provider.unit.test.ts`
Expected: PASS — all cases including the pre-existing `writeProvider`/`cleanupUnusedAxis` tests (they exercise the ENOENT-safe path implicitly by never hitting a missing/malformed file).

- [ ] **Step 5: Run the full create-icore suite to confirm no regression**

Run: `npx nx test create-icore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
npx nx lint create-icore
git add tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
git commit -m "fix(scaffold): narrow wire-provider.ts's error swallowing to ENOENT only

mergeJsonDeps/stripJsonKeys/stripTsconfigKeys caught every error, not just
'file doesn't exist' — a malformed JSON or write failure would silently
reproduce the exact missing-dep bug PR5 fixed, with zero signal. Now only
ENOENT is treated as the documented 'partial fixture' no-op; everything
else propagates."
```

---

### Task 2: HMAC replay protection — signed timestamp + clock-skew window

**Files:**
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`
- Modify: `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`
- Modify: `apps/microservices/auth/src/app/security/hmac.guard.ts`
- Modify: `apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts`

**Root cause:** the HMAC guard (PR3) verifies the signature but has no concept of freshness — a process that captures one valid signed request (e.g. `auth.setRole` granting admin) can replay it at any point in the future and it will still verify successfully, since nothing about the payload changes over time.

- [ ] **Step 1: Write the failing guard tests**

```typescript
// apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
// Replace the whole file's content with this (adds _ts to every payload the
// existing tests construct, plus 3 new freshness-specific cases):
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { signHmac } from '@icore/shared';
import { HmacAuthGuard } from '../hmac.guard';

function makeContext(data: Record<string, unknown>): ExecutionContext {
  return {
    switchToRpc: () => ({ getData: () => data }),
  } as unknown as ExecutionContext;
}

describe('HmacAuthGuard', () => {
  const ORIGINAL_ENV = { ...process.env };
  const guard = new HmacAuthGuard();

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  it('allows any request through (with a warning) when AUTH_TCP_SECRET is not configured outside production', () => {
    delete process.env['AUTH_TCP_SECRET'];
    delete process.env['NODE_ENV'];
    const ctx = makeContext({ uid: 'u1' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws when AUTH_TCP_SECRET is not configured in production', () => {
    delete process.env['AUTH_TCP_SECRET'];
    process.env['NODE_ENV'] = 'production';
    const ctx = makeContext({ uid: 'u1' });
    expect(() => guard.canActivate(ctx)).toThrow();
  });

  it('throws RpcException when the secret is configured but the payload has no _sig', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const ctx = makeContext({ uid: 'u1', _ts: Date.now() });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the payload has no _ts', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const data = { uid: 'u1' };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when _sig does not match the payload', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const ctx = makeContext({ uid: 'u1', _ts: Date.now(), _sig: 'wrong-signature' });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the timestamp is older than the clock-skew tolerance (replay)', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const staleTs = Date.now() - 60_000; // 60s old — outside the 30s tolerance
    const data = { uid: 'u1', _ts: staleTs };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('throws RpcException when the timestamp is in the future beyond tolerance (clock skew abuse)', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const futureTs = Date.now() + 60_000;
    const data = { uid: 'u1', _ts: futureTs };
    const sig = signHmac(data, 'test-secret');
    const ctx = makeContext({ ...data, _sig: sig });
    expect(() => guard.canActivate(ctx)).toThrow(RpcException);
  });

  it('allows the request through and strips _sig + _ts when the signature is valid and fresh', () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const data: Record<string, unknown> = { uid: 'u1', role: 'admin', _ts: Date.now() };
    data['_sig'] = signHmac(data, 'test-secret');
    const ctx = makeContext(data);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(data).toEqual({ uid: 'u1', role: 'admin' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test auth -- hmac.guard.unit.test.ts`
Expected: FAIL — the guard doesn't require or check `_ts` yet, so the "no `_ts`", "stale timestamp", and "future timestamp" cases don't throw; the "allows and strips" case's final assertion fails since `_ts` isn't stripped.

- [ ] **Step 3: Implement timestamp verification in the guard**

```typescript
// apps/microservices/auth/src/app/security/hmac.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { formatEnvBanner, verifyHmac } from '@icore/shared';

let warnedMissingSecret = false;

// How much clock drift between gateway and auth MS (plus network latency) to
// tolerate before treating a signed request as expired/replayed. 30s is
// generous for same-datacenter traffic and small enough that a captured
// request has a narrow window to be replayed in.
const MAX_CLOCK_SKEW_MS = 30_000;

/**
 * Verifies the HMAC signature the gateway attaches to every TCP payload (see
 * AuthClientService.send), plus a signed timestamp (`_ts`) to reject replayed
 * requests outside a clock-skew tolerance window. In production
 * (NODE_ENV=production), an unset/empty AUTH_TCP_SECRET causes per-request
 * rejection at runtime via canActivate, resulting in 100% traffic failure
 * (not a boot crash). Outside production, it logs one warning and lets
 * requests through unsigned.
 */
@Injectable()
export class HmacAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env['AUTH_TCP_SECRET'];
    if (!secret) {
      const banner = formatEnvBanner({
        service: 'auth HMAC guard',
        provider: 'AUTH_TCP_SECRET',
        missing: ['AUTH_TCP_SECRET'],
        envPath: 'apps/microservices/auth/.env',
        headline: '⚠  auth HMAC guard — request signatures are NOT being verified',
      });
      if (process.env['NODE_ENV'] === 'production') throw new Error(banner);
      if (!warnedMissingSecret) {
        warnedMissingSecret = true;
        console.warn(banner);
      }
      return true;
    }

    const data = context.switchToRpc().getData() as Record<string, unknown>;
    const sig = data['_sig'];
    if (typeof sig !== 'string') throw new RpcException('missing_signature');
    const ts = data['_ts'];
    if (typeof ts !== 'number') throw new RpcException('missing_timestamp');

    const signedPayload = { ...data };
    delete signedPayload['_sig'];
    if (!verifyHmac(signedPayload, sig, secret)) throw new RpcException('invalid_signature');

    if (Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) {
      throw new RpcException('signature_expired');
    }

    delete data['_sig'];
    delete data['_ts'];
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test auth -- hmac.guard.unit.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Write the failing client-side test for the signed timestamp**

```typescript
// libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
// Replace the existing 'signs the payload with an HMAC when AUTH_TCP_SECRET is configured' test with:
  it('signs the payload with an HMAC and a timestamp when AUTH_TCP_SECRET is configured', async () => {
    process.env['AUTH_TCP_SECRET'] = 'test-secret';
    const send = vi.fn(() => of({ ok: true as const }));
    const client = { send } as unknown as ClientProxy;
    const service = new AuthClientService(client);

    const before = Date.now();
    await service.setRole('u1', 'admin');
    const after = Date.now();

    expect(send).toHaveBeenCalledWith(
      'auth.setRole',
      expect.objectContaining({
        uid: 'u1',
        role: 'admin',
        _ts: expect.any(Number),
        _sig: expect.any(String),
      }),
    );
    const sentPayload = send.mock.calls[0]?.[1] as {
      uid: string;
      role: string;
      _ts: number;
      _sig: string;
    };
    expect(sentPayload._ts).toBeGreaterThanOrEqual(before);
    expect(sentPayload._ts).toBeLessThanOrEqual(after);
    expect(
      verifyHmac({ uid: 'u1', role: 'admin', _ts: sentPayload._ts }, sentPayload._sig, 'test-secret'),
    ).toBe(true);
  });
```

(Keep the existing `'does not sign requests when AUTH_TCP_SECRET is not configured'` test unchanged — it asserts the exact unsigned payload shape, which doesn't gain a `_ts` either when the secret is absent.)

- [ ] **Step 6: Run test to verify it fails**

Run: `npx nx test auth-client -- auth-client.service.unit.test.ts`
Expected: FAIL — `send()` doesn't add `_ts` yet, so `sentPayload._ts` is `undefined` and the `verifyHmac` re-check (which now expects `_ts` to be part of the signed payload) doesn't match what was actually signed.

- [ ] **Step 7: Add the signed timestamp to the client's `send()`**

```typescript
// libs/auth-client/src/lib/auth-client.service.ts
  /**
   * Signs the payload (plus a timestamp, for replay protection) with an HMAC
   * keyed by AUTH_TCP_SECRET before sending it over TCP, so the microservice
   * can reject requests from a process that reached the port but doesn't know
   * the shared secret, and reject replays of a previously-captured request
   * outside the guard's clock-skew tolerance window. No-op — identical to a
   * plain client.send — when the secret isn't configured, so this is opt-in
   * and doesn't break existing setups.
   */
  private send<T>(pattern: string, payload: object): Observable<T> {
    const secret = process.env['AUTH_TCP_SECRET'];
    if (!secret) return this.client.send<T>(pattern, payload);
    const timestamped = { ...payload, _ts: Date.now() };
    const body = { ...timestamped, _sig: signHmac(timestamped, secret) };
    return this.client.send<T>(pattern, body);
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx nx test auth-client -- auth-client.service.unit.test.ts`
Expected: PASS.

- [ ] **Step 9: Run the full affected suites**

Run: `npx nx run-many -t test -p auth auth-client`
Expected: all green — including the pre-existing RPC-error-mapping tests in `auth-client.service.unit.test.ts` (unaffected — they mock rejected observables, never reach the signing branch) and the full `auth.controller.unit.test.ts`/other MS tests (unaffected — they call the controller directly, bypassing the guard entirely, same as before).

- [ ] **Step 10: Commit**

```bash
npx prettier --write libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts apps/microservices/auth/src/app/security/hmac.guard.ts apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
npx nx lint auth
npx nx lint auth-client
git add libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts apps/microservices/auth/src/app/security/hmac.guard.ts apps/microservices/auth/src/app/security/__tests__/hmac.guard.unit.test.ts
git commit -m "feat(auth): add HMAC replay protection — signed timestamp + 30s clock-skew window"
```

---

### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr8-error-handling-and-replay-protection-polish.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Two polish fixes flagged Minor in prior reviews: (1) wire-provider.ts's mergeJsonDeps/stripJsonKeys/stripTsconfigKeys now only swallow ENOENT (file legitimately absent in partial fixtures) instead of every error, so a malformed JSON or write failure surfaces instead of silently reproducing a missing-dep bug; (2) the auth MS's opt-in HMAC transport guard now includes a signed timestamp with a 30s clock-skew tolerance, so a captured valid signed request can no longer be replayed indefinitely — only within that window. Changes the wire format of signed TCP payloads (adds _ts alongside _sig); safe since gateway and auth MS are always scaffolded and deployed together.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p create-icore shared auth auth-client`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr8-error-handling-and-replay-protection-polish.md
git commit -m "chore: add changeset for PR8 error-handling and replay-protection polish"
```

## Self-Review

- **Spec coverage:** both Minor findings the user flagged (`mergeJsonDeps` broad error-swallowing, no HMAC replay protection) are closed.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `isEnoent(err: unknown): boolean` is a plain new helper, no signature changes to any existing exported function. `HmacAuthGuard.canActivate` keeps its existing `(context: ExecutionContext): boolean` signature. `AuthClientService.send<T>` keeps its existing `(pattern: string, payload: object): Observable<T>` signature.
- **Consistency across the 3 wire-provider.ts functions:** all three get the identical ENOENT-narrowing treatment, not just `mergeJsonDeps` (the one originally flagged) — avoids leaving `stripJsonKeys`/`stripTsconfigKeys` inconsistent with their sibling.
