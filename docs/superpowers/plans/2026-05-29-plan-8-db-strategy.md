# Plan 8: `DBStrategy` Library — Independent DB Provider Choice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the CLI's `--db` flag from a v0.1 cosmetic record to a real runtime dimension. Add a `DBStrategy` contract in `@icore/shared` plus two concrete provider libs (`@icore/db-supabase` adapting `@supabase/supabase-js`'s Postgres surface, and `@icore/db-firestore` adapting `firebase-admin/firestore`). After this plan, an icore consumer can run `--auth=firebase --db=supabase` and the resulting app uses Firebase Auth for identity AND Supabase Postgres for application data, fully decoupled.

**Architecture:** `DBStrategy` is a generic per-collection CRUD contract (`get` / `set` / `delete` / `list`) so it stays small and works for both relational (Postgres tables) and schemaless (Firestore documents). The lib ships an in-memory `FakeDBStrategy` for tests + a `runDBContract` harness that every concrete implementation runs against. Consumers add their own microservice for application-data CRUD that injects `DBStrategy` from the factory just like `apps/microservices/upload` does with `StorageStrategy`.

**No new microservice in this plan.** Plan 8 ships the libs only. The icore template doesn't have application-data needs (it ships infrastructure, not business logic). Consumers wire their own data MS following the same pattern as `apps/microservices/upload`.

**Tech Stack:** `@supabase/supabase-js` (already installed), `firebase-admin/firestore` (already installed in Plan 3), Vitest 4. No new runtime deps.

**Source spec:** `docs/superpowers/specs/2026-05-28-icore-design.md` § Reuse of existing iDEVconn packages + Plan 6.1 README note about Plan 8.

**Branch:** `dev`. Plan 6.2 HEAD: `0d82550`.

**Generators only:** `nx g @nx/js:lib` for both new libs.

---

## File Map

| Path | Purpose |
|------|---------|
| `libs/shared/src/strategies/db.ts` | `DBStrategy`, `WhereClause`, `QueryOptions`, `DocumentId` types |
| `libs/shared/src/strategies/contract/db-contract.ts` | `runDBContract(name, factory)` |
| `libs/shared/src/strategies/fakes/fake-db.ts` | `FakeDBStrategy` in-memory impl |
| `libs/shared/src/strategies/__tests__/fake-db.contract.unit.test.ts` | validate fake against contract |
| `libs/db-strategies/supabase/` | `SupabaseDBStrategy` (generated via `@nx/js:lib`) |
| `libs/db-strategies/firestore/` | `FirestoreDBStrategy` (generated via `@nx/js:lib`) |
| `tools/create-icore/src/lib/prompts.ts` | tighten `--db` prompt label (drop "mirrors auth in v0.1.0") |
| `tools/create-icore/src/lib/scaffold.ts` | write `DB_PROVIDER` to the generated `.env` (currently records but doesn't emit) |
| `docs/architecture.md` | flip Plan 8 to ✅ + document the new lib + 3-layer env note |
| `tools/create-icore/README.md` + workspace `README.md` | brag-command examples that mix providers (Firebase auth + Supabase DB, etc.) |

---

## Task 1: `DBStrategy` interface + types

Create `libs/shared/src/strategies/db.ts`:

```ts
export type DocumentId = string;

export interface DBDocument<T> {
  id: DocumentId;
  data: T;
}

export interface WhereClause {
  field: string;
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';
  value: unknown;
}

export interface QueryOptions {
  where?: WhereClause[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

export interface DBStrategy {
  /** Read a single document by id. Returns null when not found. */
  get<T>(collection: string, id: DocumentId): Promise<DBDocument<T> | null>;

  /** Upsert a document under the given id. Replaces the document body entirely. */
  set<T>(collection: string, id: DocumentId, data: T): Promise<void>;

  /** Patch a document (shallow merge). Throws if the document does not exist. */
  update<T>(collection: string, id: DocumentId, patch: Partial<T>): Promise<void>;

  /** Delete a document. Throws if the document does not exist. */
  delete(collection: string, id: DocumentId): Promise<void>;

  /** Query a collection. Empty options = list everything (capped by impl). */
  list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]>;
}
```

Update `libs/shared/src/strategies/index.ts` to export from `./db`.

**Commit:** `feat(shared): add DBStrategy interface + WhereClause/QueryOptions types`

---

## Task 2: Contract harness + FakeDBStrategy (TDD)

### Step 1: Write the contract harness

`libs/shared/src/strategies/contract/db-contract.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import type { DBStrategy } from '../db';

interface User { name: string; age: number }

export function runDBContract(name: string, factory: () => DBStrategy): void {
  describe(`DBStrategy contract: ${name}`, () => {
    let db: DBStrategy;
    beforeEach(() => { db = factory(); });

    it('get returns null for missing documents', async () => {
      expect(await db.get('users', 'nope')).toBeNull();
    });

    it('set + get round-trips a document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      const doc = await db.get<User>('users', 'u1');
      expect(doc).toEqual({ id: 'u1', data: { name: 'Alice', age: 30 } });
    });

    it('set replaces the existing document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u1', { name: 'Alice', age: 31 });
      const doc = await db.get<User>('users', 'u1');
      expect(doc?.data.age).toBe(31);
    });

    it('update merges fields onto the existing document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.update<User>('users', 'u1', { age: 31 });
      const doc = await db.get<User>('users', 'u1');
      expect(doc?.data).toEqual({ name: 'Alice', age: 31 });
    });

    it('update throws when document missing', async () => {
      await expect(db.update('users', 'nope', { age: 0 })).rejects.toThrow();
    });

    it('delete removes the document', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.delete('users', 'u1');
      expect(await db.get('users', 'u1')).toBeNull();
    });

    it('delete throws when document missing', async () => {
      await expect(db.delete('users', 'nope')).rejects.toThrow();
    });

    it('list returns all documents in a collection', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u2', { name: 'Bob', age: 25 });
      const docs = await db.list<User>('users');
      expect(docs).toHaveLength(2);
    });

    it('list filters with where clauses', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u2', { name: 'Bob', age: 25 });
      const docs = await db.list<User>('users', { where: [{ field: 'age', op: '>', value: 27 }] });
      expect(docs).toHaveLength(1);
      expect(docs[0].data.name).toBe('Alice');
    });

    it('list applies limit', async () => {
      for (let i = 0; i < 5; i++) await db.set<User>('users', `u${i}`, { name: `U${i}`, age: i });
      const docs = await db.list<User>('users', { limit: 3 });
      expect(docs).toHaveLength(3);
    });

    it('list orders by field', async () => {
      await db.set<User>('users', 'u1', { name: 'Alice', age: 30 });
      await db.set<User>('users', 'u2', { name: 'Bob', age: 25 });
      const docs = await db.list<User>('users', { orderBy: { field: 'age', direction: 'asc' } });
      expect(docs.map((d) => d.data.name)).toEqual(['Bob', 'Alice']);
    });

    it('isolates collections', async () => {
      await db.set('users', 'u1', { name: 'Alice' });
      expect(await db.list('orders')).toEqual([]);
    });
  });
}
```

### Step 2: FakeDBStrategy

`libs/shared/src/strategies/fakes/fake-db.ts`:

```ts
import type { DBDocument, DBStrategy, QueryOptions, WhereClause } from '../db';

function matchClause<T>(doc: T, clause: WhereClause): boolean {
  const fieldValue = (doc as Record<string, unknown>)[clause.field];
  switch (clause.op) {
    case '==': return fieldValue === clause.value;
    case '!=': return fieldValue !== clause.value;
    case '<':  return (fieldValue as number) < (clause.value as number);
    case '<=': return (fieldValue as number) <= (clause.value as number);
    case '>':  return (fieldValue as number) > (clause.value as number);
    case '>=': return (fieldValue as number) >= (clause.value as number);
    case 'in': return Array.isArray(clause.value) && (clause.value as unknown[]).includes(fieldValue);
  }
}

export class FakeDBStrategy implements DBStrategy {
  private readonly store = new Map<string, Map<string, unknown>>();

  private getCollection(name: string): Map<string, unknown> {
    let col = this.store.get(name);
    if (!col) {
      col = new Map();
      this.store.set(name, col);
    }
    return col;
  }

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    const col = this.store.get(collection);
    const data = col?.get(id);
    return data == null ? null : { id, data: data as T };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    this.getCollection(collection).set(id, structuredClone(data));
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const col = this.store.get(collection);
    const existing = col?.get(id);
    if (existing == null) throw new Error(`not_found: ${collection}/${id}`);
    col!.set(id, { ...(existing as object), ...patch });
  }

  async delete(collection: string, id: string): Promise<void> {
    const col = this.store.get(collection);
    if (!col || !col.has(id)) throw new Error(`not_found: ${collection}/${id}`);
    col.delete(id);
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    const col = this.store.get(collection);
    if (!col) return [];
    let entries = [...col.entries()].map(([id, data]) => ({ id, data: data as T }));
    if (opts?.where) {
      for (const clause of opts.where) {
        entries = entries.filter((e) => matchClause(e.data, clause));
      }
    }
    if (opts?.orderBy) {
      const { field, direction = 'asc' } = opts.orderBy;
      entries.sort((a, b) => {
        const av = (a.data as Record<string, unknown>)[field];
        const bv = (b.data as Record<string, unknown>)[field];
        const cmp = (av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0;
        return direction === 'asc' ? cmp : -cmp;
      });
    }
    if (opts?.limit != null) entries = entries.slice(0, opts.limit);
    return entries;
  }
}
```

### Step 3: Spec invocation

`libs/shared/src/strategies/__tests__/fake-db.contract.unit.test.ts`:

```ts
import { FakeDBStrategy } from '../fakes/fake-db';
import { runDBContract } from '../contract/db-contract';

runDBContract('FakeDBStrategy', () => new FakeDBStrategy());
```

### Step 4: Verify + barrel

Update `libs/shared/src/strategies/index.ts` + `libs/shared/src/strategies/fakes/index.ts` to re-export the new symbols.

```bash
yarn nx test shared    # expect +11 tests
yarn nx build shared
yarn nx lint shared
```

**Commit:** `feat(shared): runDBContract harness + FakeDBStrategy (11 contract cases)`

---

## Task 3: `libs/db-strategies/supabase`

### Step 1: Generate

```bash
yarn nx g @nx/js:lib --name=db-supabase --directory=libs/db-strategies/supabase --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/db-supabase --no-interactive
```

Cleanup placeholders, set tsconfig `module: node16, moduleResolution: node16`, `passWithNoTests: true`.

### Step 2: Mock + strategy

The Supabase JS client exposes Postgres rows via `client.from(table).select() / .insert() / .update() / .upsert() / .delete()`. The strategy maps `DBStrategy` ops onto those, treating each `collection` as a Postgres table that has at least an `id text primary key` column + a `data jsonb` column where the document body lives. This keeps the schema dead-simple and lets consumers add typed columns later if they want.

Mock: `libs/db-strategies/supabase/src/lib/testing/mock-supabase-postgres.ts`. Same shape as `mock-supabase-storage.ts` (Plan 4 T1) — a function returning a `SupabaseClient` whose `.from(table)` returns an object with the postgres methods the strategy actually calls.

Strategy: `libs/db-strategies/supabase/src/lib/supabase-db.strategy.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DBDocument, DBStrategy, QueryOptions } from '@icore/shared';

export interface SupabaseDBStrategyOptions {
  client: SupabaseClient;
}

export class SupabaseDBStrategy implements DBStrategy {
  constructor(private readonly opts: SupabaseDBStrategyOptions) {}

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    const { data, error } = await this.opts.client
      .from(collection)
      .select('id, data')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data == null ? null : { id: data.id, data: data.data as T };
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    const { error } = await this.opts.client.from(collection).upsert({ id, data });
    if (error) throw new Error(error.message);
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const existing = await this.get<T>(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    const merged = { ...existing.data, ...patch };
    const { error } = await this.opts.client.from(collection).update({ data: merged }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async delete(collection: string, id: string): Promise<void> {
    const existing = await this.get(collection, id);
    if (!existing) throw new Error(`not_found: ${collection}/${id}`);
    const { error } = await this.opts.client.from(collection).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    let q = this.opts.client.from(collection).select('id, data');
    if (opts?.where) {
      for (const c of opts.where) {
        // Postgres filters apply against the JSONB body (`data->>field`).
        const path = `data->>${c.field}`;
        switch (c.op) {
          case '==': q = q.eq(path, String(c.value)); break;
          case '!=': q = q.neq(path, String(c.value)); break;
          case '<':  q = q.lt(path, c.value as number); break;
          case '<=': q = q.lte(path, c.value as number); break;
          case '>':  q = q.gt(path, c.value as number); break;
          case '>=': q = q.gte(path, c.value as number); break;
          case 'in': q = q.in(path, c.value as unknown[]); break;
        }
      }
    }
    if (opts?.orderBy) {
      q = q.order(`data->>${opts.orderBy.field}`, { ascending: opts.orderBy.direction !== 'desc' });
    }
    if (opts?.limit != null) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ id: row.id as string, data: row.data as T }));
  }
}
```

The mock has to model `client.from(table)` returning a chainable builder with `.select()` / `.insert()` / `.upsert()` / `.update()` / `.delete()` / `.eq()` / `.maybeSingle()` etc. Reuse the pattern from `mock-supabase-storage.ts` but for a Postgres-style row collection.

Contract test: `src/lib/__tests__/supabase-db.contract.unit.test.ts` — `runDBContract('SupabaseDBStrategy', () => new SupabaseDBStrategy({ client: createMockSupabaseDB() }))`.

### Step 3: Schema note in README

The strategy assumes each `collection` is a Postgres table with shape `(id text primary key, data jsonb)`. Future Plan 8.1 could ship a migration generator that creates these tables; for now `docs/db-strategy-supabase.md` explains the convention.

### Step 4: Verify + commit

```bash
yarn nx test db-supabase   # 11 contract cases pass
yarn nx build db-supabase
yarn nx lint db-supabase
```

**Commit:** `feat(db-supabase): implement SupabaseDBStrategy over Postgres (id text + data jsonb)`

---

## Task 4: `libs/db-strategies/firestore`

### Step 1: Generate

```bash
yarn nx g @nx/js:lib --name=db-firestore --directory=libs/db-strategies/firestore --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/db-firestore --no-interactive
```

Cleanup. Same tsconfig pattern.

### Step 2: Mock + strategy

Strategy uses `firebase-admin/firestore`'s narrowed surface (mirrors Plan 3's `FirebaseAdminAuthLike` approach):

```ts
export interface FirestoreLike {
  collection(name: string): FirestoreCollectionLike;
}

export interface FirestoreCollectionLike {
  doc(id: string): FirestoreDocumentLike;
  where(field: string, op: FirestoreOp, value: unknown): FirestoreCollectionLike;
  orderBy(field: string, direction?: 'asc' | 'desc'): FirestoreCollectionLike;
  limit(n: number): FirestoreCollectionLike;
  get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }>;
}

export interface FirestoreDocumentLike {
  get(): Promise<{ exists: boolean; data(): unknown }>;
  set(data: unknown): Promise<unknown>;
  update(patch: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
}

export type FirestoreOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';

export interface FirestoreDBStrategyOptions { db: FirestoreLike }

export class FirestoreDBStrategy implements DBStrategy {
  constructor(private readonly opts: FirestoreDBStrategyOptions) {}

  async get<T>(collection: string, id: string): Promise<DBDocument<T> | null> {
    const snap = await this.opts.db.collection(collection).doc(id).get();
    return snap.exists ? { id, data: snap.data() as T } : null;
  }

  async set<T>(collection: string, id: string, data: T): Promise<void> {
    await this.opts.db.collection(collection).doc(id).set(data as unknown as Record<string, unknown>);
  }

  async update<T>(collection: string, id: string, patch: Partial<T>): Promise<void> {
    const existing = await this.opts.db.collection(collection).doc(id).get();
    if (!existing.exists) throw new Error(`not_found: ${collection}/${id}`);
    await this.opts.db.collection(collection).doc(id).update(patch as Record<string, unknown>);
  }

  async delete(collection: string, id: string): Promise<void> {
    const existing = await this.opts.db.collection(collection).doc(id).get();
    if (!existing.exists) throw new Error(`not_found: ${collection}/${id}`);
    await this.opts.db.collection(collection).doc(id).delete();
  }

  async list<T>(collection: string, opts?: QueryOptions): Promise<DBDocument<T>[]> {
    let q: FirestoreCollectionLike = this.opts.db.collection(collection);
    if (opts?.where) {
      for (const c of opts.where) {
        q = q.where(c.field, c.op as FirestoreOp, c.value);
      }
    }
    if (opts?.orderBy) {
      q = q.orderBy(opts.orderBy.field, opts.orderBy.direction);
    }
    if (opts?.limit != null) q = q.limit(opts.limit);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as T }));
  }
}
```

Mock: `src/lib/testing/mock-firestore.ts` — in-memory `FirestoreLike` that satisfies the contract.

Contract test: `runDBContract('FirestoreDBStrategy', () => new FirestoreDBStrategy({ db: createMockFirestore() }))`.

### Step 3: Verify + commit

```bash
yarn nx test db-firestore
yarn nx build db-firestore
yarn nx lint db-firestore
```

**Commit:** `feat(db-firestore): implement FirestoreDBStrategy over firebase-admin/firestore`

---

## Task 5: CLI — write `DB_PROVIDER` to env + tighten prompts

### Step 1: Update prompts.ts

`tools/create-icore/src/lib/prompts.ts` — drop the "(mirrors auth in v0.1.0)" caveat from the `--db` prompt label + the `p.log.info` warning when `db !== auth`. Both providers are now independently swappable; the prompt is genuinely free.

### Step 2: Write DB_PROVIDER to env files

`tools/create-icore/src/lib/scaffold.ts` — add `DB_PROVIDER=${opts.dbProvider}` to whatever `.env` file makes sense. Two options:

**(A)** Add to `apps/microservices/auth/.env` (auth MS owns the DB choice for now since identity-related queries — admin checks, role lookups — currently live there).

**(B)** Add to a NEW workspace-root `.env` plus a `.env.example` — both microservices and the gateway can read it via `ConfigModule.forRoot({ envFilePath: [...] })`.

Pick **(B)** — workspace-root `.env` is more portable. Auth MS + future data MSes both read it.

Steps:
- After `writeAuthEnv` / `writeUploadEnv`, also write `${targetDir}/.env` containing `DB_PROVIDER=${opts.dbProvider}\n`.
- Add `.env.example` to the template snapshot copy list (if not already there) with `DB_PROVIDER=supabase` as a default + a comment line documenting the choices.

### Step 3: Unit test

Add a `writeRootEnv` unit test asserting `DB_PROVIDER=firebase` lands in the root `.env` when `opts.dbProvider === 'firebase'`.

### Step 4: Commit

```bash
git add tools/create-icore
git commit -m "feat(create-icore): write DB_PROVIDER to root .env + drop 'mirrors auth' caveat"
```

---

## Task 6: Docs + changeset + final verify

### Step 1: Update docs

- `docs/architecture.md` — flip Plan 8 row to ✅, append "Plan 8 deliverables" section. Update the 3-layer env table: provider selection layer now includes `DB_PROVIDER` as a SEPARATE row (was conflated with auth).
- `tools/create-icore/README.md` — drop the "mirrors auth in v0.1.0" footnote for `--db`. Add a brag command that mixes providers:
  ```bash
  # Firebase auth + Supabase Postgres for app data
  npm init @idevconn/icore my-saas -- --auth=firebase --db=supabase --upload=cloudinary --ui=shadcn
  ```
- Workspace `README.md` — same brag-mix example.

### Step 2: Changeset

`.changeset/db-strategy.md`:

```markdown
---
'@idevconn/create-icore': minor
---

DBStrategy lib promotes the `--db` flag from cosmetic record to real runtime dimension. Two concrete implementations ship: `@icore/db-supabase` (Postgres-table-backed JSONB documents) and `@icore/db-firestore` (Firebase Admin Firestore). The CLI now writes `DB_PROVIDER` to the generated root `.env` so consumers can wire their own data microservices over the chosen backend independently of `AUTH_PROVIDER`. Mix-and-match combos like `--auth=firebase --db=supabase` are now first-class.
```

### Step 3: Final verify

```bash
yarn nx run-many -t lint test build
yarn format:check
```

All green. New tests on top of 20 (Plan 6.2): 11 (shared FakeDB) + 11 (db-supabase) + 11 (db-firestore) + 1 (CLI env test) = ~54 new. Total: ~178 unit tests across the workspace.

### Step 4: Push

```bash
git push origin dev
```

---

## Self-Review Notes

**Spec coverage:**

- DBStrategy contract added → Tasks 1+2 ✅
- Two concrete providers shipped → Tasks 3+4 ✅
- CLI `--db` is real (no longer mirrors auth) → Task 5 ✅
- Same contract test harness across all impls → Task 2 ✅
- README + architecture doc reflect the mix-and-match story → Task 6 ✅

**Deliberately deferred:**

- A "data" microservice template that consumes `DBStrategy` — consumers wire their own per-feature.
- Supabase migration generator for the `(id text, data jsonb)` table convention — Plan 8.1 if needed.
- Transactions / batch writes — out of scope for v0.1 of DBStrategy.
- Firestore composite indexes — runtime concern, not contract.
- RLS / Firebase Security Rules helpers — consumer territory.

**Type consistency:**

- `DBStrategy` + `DBDocument<T>` + `WhereClause` + `QueryOptions` live in `@icore/shared`. Both concrete impls + the fake use the same types. The contract suite type-tests all three identically.
- CLI `DbProvider` union (`'supabase' | 'firebase'`) maps to env value `DB_PROVIDER=<value>`. Consumer apps' `ConfigModule.forRoot` reads it identically.

**Out of scope:**

- Schema-migration tooling (Drizzle / Knex / Prisma integration).
- ORM-style relations.
- Real-time subscriptions (Firestore onSnapshot / Supabase Realtime).
- Cross-collection joins.
