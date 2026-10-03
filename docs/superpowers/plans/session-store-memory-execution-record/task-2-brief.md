### Task 2: Gateway provider — `SESSION_STORE` switch + production guard

**Files:**

- Modify: `apps/api/src/app/session/session-store.provider.ts`
- Create: `apps/api/src/app/session/__tests__/session-store.provider.unit.test.ts`
- Modify: `apps/api/.env.example` (comment + `SESSION_STORE` doc lines)

**Interfaces:**

- Consumes: `InMemorySessionStore` (Task 1).
- Produces: env contract `SESSION_STORE=redis|memory` (default `redis`), `SESSION_STORE_ALLOW_MEMORY=true` (production acknowledgment).

- [ ] **Step 1: Write the failing tests**:

```ts
import { Logger, type FactoryProvider } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InMemorySessionStore, type SessionStore } from '@icore/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionStoreProvider } from '../session-store.provider';

const factory = (sessionStoreProvider as FactoryProvider<SessionStore>).useFactory;
const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

describe('sessionStoreProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults to redis: without SESSION_REDIS_URL it refuses to boot and points at SESSION_STORE=memory', () => {
    expect(() => factory(cfg({}))).toThrow(/SESSION_REDIS_URL is required.*SESSION_STORE=memory/s);
  });

  it('rejects an unknown SESSION_STORE value and names the accepted ones', () => {
    expect(() => factory(cfg({ SESSION_STORE: 'dynamodb' }))).toThrow(/redis.*memory/s);
  });

  it('memory (development): returns an InMemorySessionStore and warns loudly', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const store = factory(cfg({ SESSION_STORE: 'memory' }));
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(
      /restart logs everyone out.*ONE gateway instance/s,
    );
    (store as InMemorySessionStore).close();
  });

  it('memory in production without SESSION_STORE_ALLOW_MEMORY=true refuses to boot', () => {
    expect(() => factory(cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production' }))).toThrow(
      /SESSION_STORE_ALLOW_MEMORY=true/,
    );
  });

  it.each(['1', 'yes', 'TRUE', ''])(
    'only the exact string "true" acknowledges memory in production (got %j)',
    (ack) => {
      expect(() =>
        factory(
          cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production', SESSION_STORE_ALLOW_MEMORY: ack }),
        ),
      ).toThrow(/SESSION_STORE_ALLOW_MEMORY=true/);
    },
  );

  it('memory in production WITH the acknowledgment boots (and still warns)', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const store = factory(
      cfg({ SESSION_STORE: 'memory', NODE_ENV: 'production', SESSION_STORE_ALLOW_MEMORY: 'true' }),
    );
    expect(store).toBeInstanceOf(InMemorySessionStore);
    expect(warn).toHaveBeenCalled();
    (store as InMemorySessionStore).close();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `yarn nx test api -- session-store.provider`. Expected: FAIL (memory branch and new messages don't exist).

- [ ] **Step 3: Implement.** Rewrite the factory body of `session-store.provider.ts`:

```ts
import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { InMemorySessionStore, RedisSessionStore, type SessionStore } from '@icore/shared';

export const SESSION_STORE = Symbol('SESSION_STORE');

export const sessionStoreProvider: Provider = {
  provide: SESSION_STORE,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): SessionStore => {
    const logger = new Logger('SessionStore');
    const kind = (cfg.get<string>('SESSION_STORE') ?? 'redis').toLowerCase();

    if (kind === 'memory') {
      // Explicit opt-in for small, single-instance projects. Never silent: a
      // restart logs every user out and a second instance would not see these
      // sessions, so production needs a second, deliberate acknowledgment.
      if (cfg.get<string>('NODE_ENV') === 'production' && cfg.get<string>('SESSION_STORE_ALLOW_MEMORY') !== 'true') {
        throw new Error(
          'SESSION_STORE=memory in production needs SESSION_STORE_ALLOW_MEMORY=true — sessions live in this process only (a restart logs everyone out; run exactly ONE gateway instance). Set SESSION_STORE=redis for anything else.',
        );
      }
      logger.warn(
        'SESSION_STORE=memory: sessions live in this process — a restart logs everyone out and only ONE gateway instance may run. Use SESSION_STORE=redis for anything else.',
      );
      return new InMemorySessionStore();
    }
    if (kind !== 'redis') {
      throw new Error(`Unknown SESSION_STORE "${kind}" — expected "redis" (default) or "memory".`);
    }

    const url = cfg.get<string>('SESSION_REDIS_URL');
    if (!url) {
      throw new Error(
        'SESSION_REDIS_URL is required when SESSION_STORE=redis (the default). To run without Redis, set SESSION_STORE=memory (single instance; a restart logs everyone out) — see docs/runbooks/bff-session-auth-migration.md.',
      );
    }
    // (keep the existing request-path IORedis comment block + client options + RedisSessionStore return unchanged)
```

Keep the existing `const redis = new IORedis(url, {...}); redis.on('error', …); return new RedisSessionStore(redis);` lines and their explanatory comment exactly as they are.

In `apps/api/.env.example` replace the comment block above `SESSION_REDIS_URL` with:

```
# Session store for the BFF auth model: the gateway's OWN session storage for
# opaque session cookies (distinct from AUTH_REDIS_URL, which is an optional
# gateway<->auth-MS message transport).
#   SESSION_STORE=redis   (default) needs SESSION_REDIS_URL below — use this for anything that
#                          runs more than one gateway instance or must survive restarts.
#   SESSION_STORE=memory  no Redis service: sessions live in this process, a restart logs
#                          everyone out, only ONE gateway instance may run. In production it
#                          additionally needs SESSION_STORE_ALLOW_MEMORY=true.
SESSION_REDIS_URL=redis://localhost:6379
```

- [ ] **Step 4: Run to verify it passes** — `yarn nx test api` (all green incl. the new file); `yarn nx run-many -t lint build -p api`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/session apps/api/.env.example
git add apps/api/src/app/session apps/api/.env.example
git commit -m "feat(api): SESSION_STORE=redis|memory switch with a production acknowledgment guard"
```

---

