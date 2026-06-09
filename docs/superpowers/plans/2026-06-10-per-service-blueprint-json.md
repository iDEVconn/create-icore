# Per-Service `blueprint.json` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** In addition to the root `blueprint.json` (project summary), write a per-service `blueprint.json` into each PRESENT microservice/app recording the selection relevant to it (component-level provenance).

**Architecture:** A pure `writeServiceBlueprints(targetDir, opts)` writes a small `blueprint.json` into each service dir that exists for the chosen options. Guarded per service (skip removed ones). Deterministic, additive — runs alongside the root `writeBlueprintJson`. Lives in the same `manifest/blueprint.ts`.

**Tech Stack:** TS, the create-icore generator. Tests: `yarn nx test create-icore`.

> Builds on the just-added root `writeBlueprintJson` (same branch `feature/blueprint-json`, HEAD `cd4f2ca`). The root file stays; this adds the per-service files.

---

## Per-service mapping (what each records)

| Service dir (present when)                          | `blueprint.json` fields (besides `schemaVersion:1`, `service`) |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `apps/microservices/auth` (always)                  | `authProvider`, `transport`                                    |
| `apps/microservices/upload` (`upload !== 'none'`)   | `storageProvider: upload`, `transport`                         |
| `apps/microservices/notes` (`example !== 'none'`)   | `dbProvider`, `transport`                                      |
| `apps/microservices/payment` (`payment !== 'none'`) | `paymentProvider: payment`, `transport`                        |
| `apps/microservices/jobs` (`jobs !== 'none'`)       | `jobsProvider: jobs` (no transport — jobs uses Redis directly) |
| `apps/api` (always)                                 | `features: <chosen of notes/payment/jobs>`, `transport`        |
| `apps/client` (always)                              | `ui`                                                           |

Only present services get a file (the optional ones' dirs are removed when off).

---

## File Structure

- Modify: `tools/create-icore/src/manifest/blueprint.ts` — add `writeServiceBlueprints`
- Modify: `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts` — add `writeServiceBlueprints` tests
- Modify: `tools/create-icore/src/lib/scaffold.ts` — call `writeServiceBlueprints`
- Create: `.changeset/per-service-blueprint-json.md`

---

### Task 1: `writeServiceBlueprints`

**Files:** Modify `blueprint.ts` + its test.

- [ ] **Step 1: Add the failing test** to `blueprint.unit.test.ts` (keep the existing root tests):

```ts
import { mkdir } from 'node:fs/promises';
import { writeServiceBlueprints } from '../blueprint.js';
import { access } from 'node:fs/promises';

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeServiceBlueprints', () => {
  async function svcFixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'icore-svcbp-'));
    for (const p of [
      'apps/microservices/auth',
      'apps/microservices/upload',
      'apps/microservices/notes',
      'apps/microservices/payment',
      'apps/microservices/jobs',
      'apps/api',
      'apps/client',
    ]) {
      await mkdir(join(dir, p), { recursive: true });
    }
    return dir;
  }

  it('writes a blueprint.json per present service with its relevant selection', async () => {
    const dir = await svcFixture();
    // all features on
    await writeServiceBlueprints(dir, {
      ...opts,
      targetDir: dir,
      authProvider: 'supabase',
      dbProvider: 'mongodb',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'shadcn',
      transport: 'nats',
    });

    const read = async (p: string) =>
      JSON.parse(await readFile(join(dir, p, 'blueprint.json'), 'utf8'));

    expect(await read('apps/microservices/auth')).toEqual({
      schemaVersion: 1,
      service: 'auth',
      authProvider: 'supabase',
      transport: 'nats',
    });
    expect(await read('apps/microservices/upload')).toEqual({
      schemaVersion: 1,
      service: 'upload',
      storageProvider: 'cloudinary',
      transport: 'nats',
    });
    expect(await read('apps/microservices/notes')).toEqual({
      schemaVersion: 1,
      service: 'notes',
      dbProvider: 'mongodb',
      transport: 'nats',
    });
    expect(await read('apps/microservices/payment')).toEqual({
      schemaVersion: 1,
      service: 'payment',
      paymentProvider: 'paypal',
      transport: 'nats',
    });
    expect(await read('apps/microservices/jobs')).toEqual({
      schemaVersion: 1,
      service: 'jobs',
      jobsProvider: 'bullmq',
    });
    expect(await read('apps/api')).toEqual({
      schemaVersion: 1,
      service: 'api',
      features: ['notes', 'payment', 'jobs'],
      transport: 'nats',
    });
    expect(await read('apps/client')).toEqual({
      schemaVersion: 1,
      service: 'client',
      ui: 'shadcn',
    });
  });

  it('skips optional services that are off (no file written there)', async () => {
    const dir = await svcFixture();
    await writeServiceBlueprints(dir, {
      ...opts,
      targetDir: dir,
      upload: 'none',
      payment: 'none',
      jobs: 'none',
      example: 'none',
    });
    // optional ones: no blueprint.json (their dirs would be removed in real scaffolds)
    expect(await exists(join(dir, 'apps/microservices/upload/blueprint.json'))).toBe(false);
    expect(await exists(join(dir, 'apps/microservices/notes/blueprint.json'))).toBe(false);
    expect(await exists(join(dir, 'apps/microservices/payment/blueprint.json'))).toBe(false);
    expect(await exists(join(dir, 'apps/microservices/jobs/blueprint.json'))).toBe(false);
    // always-present
    expect(await exists(join(dir, 'apps/microservices/auth/blueprint.json'))).toBe(true);
    expect(await exists(join(dir, 'apps/api/blueprint.json'))).toBe(true);
    expect(await exists(join(dir, 'apps/client/blueprint.json'))).toBe(true);
    // api features empty when all off
    const api = JSON.parse(await readFile(join(dir, 'apps/api/blueprint.json'), 'utf8'));
    expect(api.features).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail** — `yarn nx test create-icore -- blueprint.unit`.

- [ ] **Step 3: Implement** — append to `tools/create-icore/src/manifest/blueprint.ts`:

```ts
async function writeJson(targetDir: string, rel: string, data: unknown): Promise<void> {
  await writeFile(join(targetDir, rel, 'blueprint.json'), JSON.stringify(data, null, 2) + '\n');
}

/**
 * Per-service provenance: a small blueprint.json inside each PRESENT service dir
 * recording the selection relevant to it. Optional services that are off have no
 * dir (removed by scaffold), so they get no file.
 */
export async function writeServiceBlueprints(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const t = opts.transport;

  await writeJson(targetDir, 'apps/microservices/auth', {
    schemaVersion: 1,
    service: 'auth',
    authProvider: opts.authProvider,
    transport: t,
  });

  if (opts.upload !== 'none') {
    await writeJson(targetDir, 'apps/microservices/upload', {
      schemaVersion: 1,
      service: 'upload',
      storageProvider: opts.upload,
      transport: t,
    });
  }

  if (opts.example !== 'none') {
    await writeJson(targetDir, 'apps/microservices/notes', {
      schemaVersion: 1,
      service: 'notes',
      dbProvider: opts.dbProvider,
      transport: t,
    });
  }

  if (opts.payment !== 'none') {
    await writeJson(targetDir, 'apps/microservices/payment', {
      schemaVersion: 1,
      service: 'payment',
      paymentProvider: opts.payment,
      transport: t,
    });
  }

  if (opts.jobs !== 'none') {
    await writeJson(targetDir, 'apps/microservices/jobs', {
      schemaVersion: 1,
      service: 'jobs',
      jobsProvider: opts.jobs,
    });
  }

  const features: string[] = [];
  if (opts.example !== 'none') features.push('notes');
  if (opts.payment !== 'none') features.push('payment');
  if (opts.jobs !== 'none') features.push('jobs');
  await writeJson(targetDir, 'apps/api', {
    schemaVersion: 1,
    service: 'api',
    features,
    transport: t,
  });

  await writeJson(targetDir, 'apps/client', {
    schemaVersion: 1,
    service: 'client',
    ui: opts.ui,
  });
}
```

- [ ] **Step 4: Run → pass** — `yarn nx test create-icore -- blueprint.unit` (4 tests total).

- [ ] **Step 5: Commit** — `git add tools/create-icore/src/manifest/blueprint.ts tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts && git commit -m "feat(create-icore): per-service blueprint.json"`.

---

### Task 2: Wire + e2e + changeset

**Files:** Modify `scaffold.ts`; create `.changeset/per-service-blueprint-json.md`.

- [ ] **Step 1: Wire it** — in `scaffold.ts`, right after the existing `await writeBlueprintJson(opts.targetDir, opts);` line, add:

```ts
await writeServiceBlueprints(opts.targetDir, opts);
```

Extend the existing import: `import { writeBlueprintJson, writeServiceBlueprints } from '../manifest/blueprint.js';`. **Ordering matters:** this must run AFTER the feature/upload removals (`removeUploadStack`, `cleanupUnusedFeatures`) so absent services' dirs are already gone — confirm `writeBlueprintJson` (and thus this call) sits after those in `scaffold()`; it does (it's near the end, after firebase-admin handling).

- [ ] **Step 2: Suite + build** — `yarn nx test create-icore 2>&1 | tail -8` → green. `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|blueprint" || echo "ok (ignore uuid DTS)"`.

- [ ] **Step 3: E2E** — rebuild + generate two combos (all-on, all-off) and inspect per-service files:

```bash
yarn nx build create-icore --skip-nx-cache 2>&1 | tail -2
T=/tmp/icore-svcbp && rm -rf "$T" && mkdir -p "$T"
cat > "$T/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
const [name, up, pay, jb, ex] = process.argv.slice(2);
await scaffold({ projectName:name, targetDir:`${process.env.T}/${name}`,
  authProvider:'supabase', dbProvider:'mongodb', upload:up, payment:pay, jobs:jb, example:ex,
  ui:'antd', transport:'rmq', initGit:false, packageManager:'npm', install:false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('gen', name);
EOF
T=$T node "$T/gen.mjs" full cloudinary paypal bullmq notes
T=$T node "$T/gen.mjs" minimal none none none none
echo "=== FULL per-service blueprints ==="
for s in auth upload notes payment jobs; do echo "-- $s --"; cat "$T/full/apps/microservices/$s/blueprint.json" 2>/dev/null || echo MISSING; done
cat "$T/full/apps/api/blueprint.json"; cat "$T/full/apps/client/blueprint.json"
echo "=== MINIMAL (optional services absent) ==="
for s in upload notes payment jobs; do echo "-- $s --"; ls "$T/minimal/apps/microservices/$s" 2>/dev/null && echo "PRESENT(unexpected)" || echo "absent ✓"; done
cat "$T/minimal/apps/api/blueprint.json"
node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/full" && echo "AUDIT OK full"
node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/minimal" && echo "AUDIT OK minimal"
```

Assert: FULL — each MS has its blueprint.json with correct fields (auth.authProvider=supabase, upload.storageProvider=cloudinary, notes.dbProvider=mongodb, payment.paymentProvider=paypal, jobs.jobsProvider=bullmq, api.features=['notes','payment','jobs'], client.ui=antd, transport=rmq where applicable). MINIMAL — upload/notes/payment/jobs dirs absent (no file); api.features=[]; auth/api/client present. Both `AUDIT OK`. If a per-service file lands in a removed-service dir (recreating it), STOP + fix (the guard/order is wrong).

- [ ] **Step 4: Changeset** — `.changeset/per-service-blueprint-json.md`:

```md
---
'@idevconn/create-icore': minor
---

Each generated microservice/app (auth, upload, notes, payment, jobs, api, client) now also gets its own `blueprint.json` recording the selection relevant to it (component-level provenance), alongside the root project blueprint.json. Optional services that are off get no file.
```

- [ ] **Step 5: Prettier + commit** — `npx prettier --write tools/create-icore/src/manifest tools/create-icore/src/lib/scaffold.ts && git add .changeset/per-service-blueprint-json.md tools/create-icore && git commit -m "chore(create-icore): wire per-service blueprints + changeset"`.

---

## Self-Review

**Spec coverage:** Extends §10 provenance to per-service granularity (the user's "blueprint.json для каждой ветки/MS"). Root blueprint.json (prior task) unchanged.

**Placeholder scan:** Full code; per-service field mapping is in a table + the impl; e2e asserts present/absent + content. No TBD.

**Type consistency:** `writeServiceBlueprints(targetDir, opts: CreateIcoreOptions)` matches the call site. Field keys (`authProvider`/`storageProvider`/`dbProvider`/`paymentProvider`/`jobsProvider`/`features`/`ui`) are consistent between the test and the impl. `writeJson` helper shared.

**Ordering:** must run after `removeUploadStack`/`cleanupUnusedFeatures` so absent services have no dir — placed right after `writeBlueprintJson` (near the end of `scaffold()`), which is already past those removals.

**Scope:** Per-service write only. Audit-consumes-blueprint deferred.
