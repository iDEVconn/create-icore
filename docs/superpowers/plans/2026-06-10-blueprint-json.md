# Generated `blueprint.json` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Write a `blueprint.json` at the generated project root recording exactly what was scaffolded (the chosen unit per axis + features), per design spec §10.

**Architecture:** A pure `writeBlueprintJson(targetDir, opts)` serializes the non-transient `CreateIcoreOptions` fields (+ a `schemaVersion`) to `<targetDir>/blueprint.json`. Deterministic (no timestamp), so regeneration is a no-op. Wired once into `scaffold()`.

**Tech Stack:** TS, the create-icore generator. Tests: `yarn nx test create-icore`.

> **Scope:** WRITE the file only. Having `auditProject` consume it (forbidden-set derivation) is a deferred follow-up — not in this plan.

---

## File Structure

- Create: `tools/create-icore/src/manifest/blueprint.ts` — `writeBlueprintJson` + `BlueprintJson` type
- Create: `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts`
- Modify: `tools/create-icore/src/lib/scaffold.ts` — call `writeBlueprintJson`
- Create: `.changeset/blueprint-json.md`

---

### Task 1: `writeBlueprintJson`

**Files:** Create `tools/create-icore/src/manifest/blueprint.ts` + test.

- [ ] **Step 1: Failing test** — `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBlueprintJson } from '../blueprint.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const opts: CreateIcoreOptions = {
  projectName: 'my-app',
  targetDir: '',
  authProvider: 'firebase',
  dbProvider: 'mongodb',
  upload: 'cloudinary',
  payment: 'paypal',
  jobs: 'bullmq',
  example: 'notes',
  ui: 'antd',
  transport: 'nats',
  packageManager: 'pnpm',
  initGit: true,
  install: true,
};

describe('writeBlueprintJson', () => {
  it('writes blueprint.json with the chosen selection (no transient fields)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-bp-'));
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const bp = JSON.parse(await readFile(join(dir, 'blueprint.json'), 'utf8'));
    expect(bp).toEqual({
      schemaVersion: 1,
      projectName: 'my-app',
      authProvider: 'firebase',
      dbProvider: 'mongodb',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'pnpm',
    });
    // transient fields excluded
    expect(bp).not.toHaveProperty('targetDir');
    expect(bp).not.toHaveProperty('install');
    expect(bp).not.toHaveProperty('initGit');
  });

  it('is deterministic (no timestamp) — two writes byte-match', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-bp-'));
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const a = await readFile(join(dir, 'blueprint.json'), 'utf8');
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const b = await readFile(join(dir, 'blueprint.json'), 'utf8');
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail** — `yarn nx test create-icore -- blueprint.unit`.

- [ ] **Step 3: Implement** — `tools/create-icore/src/manifest/blueprint.ts`

```ts
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreateIcoreOptions } from '../lib/options.js';

export interface BlueprintJson {
  schemaVersion: 1;
  projectName: string;
  authProvider: string;
  dbProvider: string;
  upload: string;
  payment: string;
  jobs: string;
  example: string;
  ui: string;
  transport: string;
  packageManager: string;
}

/**
 * Record the scaffold selection at the project root. A provenance + audit-input
 * artifact ("what was this generated with?"). Transient fields (targetDir,
 * install, initGit) are excluded; no timestamp, so output is deterministic.
 */
export async function writeBlueprintJson(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const blueprint: BlueprintJson = {
    schemaVersion: 1,
    projectName: opts.projectName,
    authProvider: opts.authProvider,
    dbProvider: opts.dbProvider,
    upload: opts.upload,
    payment: opts.payment,
    jobs: opts.jobs,
    example: opts.example,
    ui: opts.ui,
    transport: opts.transport,
    packageManager: opts.packageManager,
  };
  await writeFile(join(targetDir, 'blueprint.json'), JSON.stringify(blueprint, null, 2) + '\n');
}
```

- [ ] **Step 4: Run → pass** — `yarn nx test create-icore -- blueprint.unit` (2 tests).

- [ ] **Step 5: Commit** — `git add tools/create-icore/src/manifest/blueprint.ts tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts && git commit -m "feat(create-icore): writeBlueprintJson (project provenance manifest)"`.

---

### Task 2: Wire into `scaffold()` + e2e + changeset

**Files:** Modify `tools/create-icore/src/lib/scaffold.ts`; create `.changeset/blueprint-json.md`.

- [ ] **Step 1: Wire it** — in `scaffold.ts`, add the import `import { writeBlueprintJson } from '../manifest/blueprint.js';` and call it once after the provider/feature/nav wiring + firebase-admin handling (just before the `yarn.lock`/packageManager anchoring block). Insert this line:

```ts
await writeBlueprintJson(opts.targetDir, opts);
```

(Place it right after the `if (!firebaseUsed) await removeFirebaseAdminLib(opts.targetDir);` line.)

- [ ] **Step 2: Run generator suite + build** — `yarn nx test create-icore 2>&1 | tail -8` → green. `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|blueprint" || echo "ok (ignore uuid DTS)"`.

- [ ] **Step 3: E2E** — rebuild + headless-generate one combo, assert blueprint.json content + that audit still passes:

```bash
yarn nx build create-icore --skip-nx-cache 2>&1 | tail -2
T=/tmp/icore-bp && rm -rf "$T" && mkdir -p "$T"
cat > "$T/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
await scaffold({ projectName:'bp-demo', targetDir:`${process.env.T}/bp-demo`,
  authProvider:'supabase', dbProvider:'supabase', upload:'cloudinary',
  payment:'paypal', jobs:'bullmq', example:'notes', ui:'mui', transport:'redis',
  initGit:false, packageManager:'npm', install:false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('gen ok');
EOF
T=$T node "$T/gen.mjs"
echo "=== blueprint.json ==="; cat "$T/bp-demo/blueprint.json"
node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/bp-demo" && echo "AUDIT OK"
```

Assert: `blueprint.json` exists with `schemaVersion:1` + the exact chosen values (auth=supabase, upload=cloudinary, ui=mui, transport=redis, payment=paypal, jobs=bullmq, example=notes, packageManager=npm); no `targetDir`/`install`/`initGit`; `AUDIT OK` (blueprint.json is data, not an `@icore` import, so it can't orphan).

- [ ] **Step 4: Changeset** — `.changeset/blueprint-json.md`:

```md
---
'@idevconn/create-icore': minor
---

Generated projects now include a `blueprint.json` at the root recording the scaffold selection (auth/db/upload/payment/jobs/example/ui/transport/packageManager + schemaVersion). Provenance + a future audit input; deterministic (no timestamp).
```

- [ ] **Step 5: Prettier + commit** — `npx prettier --write tools/create-icore/src/manifest tools/create-icore/src/lib/scaffold.ts && git add .changeset/blueprint-json.md tools/create-icore && git commit -m "chore(create-icore): wire writeBlueprintJson + changeset"`.

---

## Self-Review

**Spec coverage:** Implements design §10 (write `blueprint.json` recording the selection). The "audit reads it" half of §10 is explicitly deferred (scope note).

**Placeholder scan:** Full code; deterministic (no timestamp) is asserted by a test; the e2e asserts exact content. No TBD.

**Type consistency:** `writeBlueprintJson(targetDir, opts: CreateIcoreOptions)` + `BlueprintJson` used identically in test, impl, and the scaffold.ts call. Field set matches `CreateIcoreOptions` minus transient (`targetDir`/`install`/`initGit`).

**Scope:** Write-only. Audit-consumes-blueprint and transport-axis are separate.
