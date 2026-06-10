# Audit ← blueprint.json + CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Make `auditProject` derive the forbidden raw-SDK set from the generated project's `blueprint.json` (scanning all package.jsons, not just root), and run the audit inside `smoke-scaffold.mjs` right after scaffold — so it gates **every PR** (pipeline.yml Layer A) + nightly (matrix Layer B). This is the durable orphan-regression net (design §7).

**Architecture:** `auditProject(dir)` reads `<dir>/blueprint.json`, computes the chosen provider set (`{authProvider, dbProvider, upload}`), derives forbidden raw SDKs (a provider's SDK is forbidden iff that provider is unchosen), and flags any package.json (root + `apps/**`) that still declares one — in addition to the existing import-of-absent-`@icore`-lib check. `smoke-scaffold.mjs` calls `auditProject` after `scaffold()` and fails the smoke on violations.

**Tech Stack:** TS, the create-icore generator, GitHub Actions (no yaml change — the gate rides the existing smoke-scaffold call). Tests: `yarn nx test create-icore`.

> The CLI `audit.mjs` and the existing `opts.forbiddenDeps` param stay (backward-compatible). The new behavior: when `blueprint.json` exists, forbidden deps are auto-derived and merged with any explicit ones.

---

## File Structure

- Modify: `tools/create-icore/src/manifest/audit.ts` — blueprint-derived forbidden-dep scan across all package.jsons
- Modify: `tools/create-icore/src/manifest/__tests__/audit.unit.test.ts` — tests for the derivation + multi-pkg scan
- Modify: `tools/create-icore/scripts/smoke-scaffold.mjs` — run audit after scaffold; fail on violations
- Create: `.changeset/audit-blueprint-gate.md`

---

### Task 1: `auditProject` derives forbidden deps from `blueprint.json`

**Files:** Modify `tools/create-icore/src/manifest/audit.ts` + its test.

- [ ] **Step 1: Add failing tests** to `audit.unit.test.ts` (keep existing). The `scaffold(files)` helper already writes arbitrary files; reuse it.

```ts
describe('auditProject blueprint-derived forbidden deps', () => {
  it('flags a forbidden raw SDK in any package.json when its provider is unchosen', async () => {
    const dir = await scaffold({
      'blueprint.json': JSON.stringify({
        schemaVersion: 1,
        projectName: 'x',
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        example: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'npm',
      }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: {} }),
      // supabase chosen → @supabase/supabase-js OK; cloudinary NOT chosen → forbidden
      'apps/microservices/upload/package.json': JSON.stringify({
        dependencies: { '@supabase/supabase-js': '^2', cloudinary: '^2' },
      }),
    });
    const v = await auditProject(dir);
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'forbidden-dep',
        detail: expect.stringContaining('cloudinary'),
      }),
    );
    // supabase SDK is chosen → NOT flagged
    expect(v.some((x) => x.detail.includes('@supabase/supabase-js'))).toBe(false);
  });

  it('flags firebase-admin when no axis uses firebase', async () => {
    const dir = await scaffold({
      'blueprint.json': JSON.stringify({
        schemaVersion: 1,
        projectName: 'x',
        authProvider: 'supabase',
        dbProvider: 'mongodb',
        upload: 'none',
        payment: 'none',
        jobs: 'none',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'npm',
      }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/microservices/auth/package.json': JSON.stringify({
        dependencies: { '@icore/firebase-admin': '*' },
      }),
    });
    const v = await auditProject(dir);
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'forbidden-dep',
        detail: expect.stringContaining('@icore/firebase-admin'),
      }),
    );
  });

  it('passes when every present dep matches the chosen providers', async () => {
    const dir = await scaffold({
      'blueprint.json': JSON.stringify({
        schemaVersion: 1,
        projectName: 'x',
        authProvider: 'mongodb',
        dbProvider: 'mongodb',
        upload: 'cloudinary',
        payment: 'none',
        jobs: 'none',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'npm',
      }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: { mongoose: '^9', cloudinary: '^2' } }),
    });
    expect(await auditProject(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail** — `yarn nx test create-icore -- audit.unit`.

- [ ] **Step 3: Implement** — edit `audit.ts`. Add the provider→SDK map + blueprint reader + multi-package.json scan; merge with the existing explicit `forbiddenDeps`.

Replace the `rootDeps` helper + the `auditProject` forbidden-dep section. Add near the top:

```ts
interface Blueprint {
  authProvider?: string;
  dbProvider?: string;
  upload?: string;
}

/** A provider's raw marker dep(s) that must be ABSENT when the provider is unchosen. */
const PROVIDER_SDKS: Record<string, string[]> = {
  supabase: ['@supabase/supabase-js'],
  cloudinary: ['cloudinary'],
  mongodb: ['mongoose'],
  firebase: ['firebase-admin', '@icore/firebase-admin'],
};

async function readBlueprint(dir: string): Promise<Blueprint | null> {
  try {
    return JSON.parse(await readFile(join(dir, 'blueprint.json'), 'utf8')) as Blueprint;
  } catch {
    return null;
  }
}

/** Forbidden raw SDKs derived from the blueprint: a provider's SDK is forbidden
 *  iff that provider appears in none of auth/db/upload. */
function forbiddenFromBlueprint(bp: Blueprint): string[] {
  const chosen = new Set([bp.authProvider, bp.dbProvider, bp.upload].filter(Boolean));
  const forbidden: string[] = [];
  for (const [provider, sdks] of Object.entries(PROVIDER_SDKS)) {
    if (!chosen.has(provider)) forbidden.push(...sdks);
  }
  return forbidden;
}

/** Every package.json under the project (root + apps/**), skipping node_modules. */
async function allPackageJsons(dir: string): Promise<string[]> {
  const out: string[] = [];
  const root = join(dir, 'package.json');
  out.push(root);
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) await walk(join(d, e.name));
      } else if (e.name === 'package.json') {
        out.push(join(d, e.name));
      }
    }
  }
  await walk(join(dir, 'apps'));
  return out;
}

async function depKeys(pkgPath: string): Promise<Set<string>> {
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}
```

Then rewrite the forbidden-dep section of `auditProject` (keep the import-of-absent-lib loop unchanged):

```ts
// Forbidden raw SDK deps: explicit (opts) ∪ derived from blueprint.json.
const bp = await readBlueprint(dir);
const forbidden = new Set<string>([
  ...(opts.forbiddenDeps ?? []),
  ...(bp ? forbiddenFromBlueprint(bp) : []),
]);
if (forbidden.size > 0) {
  for (const pkgPath of await allPackageJsons(dir)) {
    const deps = await depKeys(pkgPath);
    for (const f of forbidden) {
      if (deps.has(f)) {
        violations.push({
          kind: 'forbidden-dep',
          detail: `${pkgPath} keeps forbidden dep ${f}`,
        });
      }
    }
  }
}

return violations;
```

Add `readdir` to the existing `node:fs/promises` import (it's already imported for `walk`). Remove the now-unused `rootDeps` helper.

- [ ] **Step 4: Run → pass** — `yarn nx test create-icore -- audit.unit` (existing + 3 new).

- [ ] **Step 5: Commit** — `git add tools/create-icore/src/manifest/audit.ts tools/create-icore/src/manifest/__tests__/audit.unit.test.ts && git commit -m "feat(create-icore): auditProject derives forbidden deps from blueprint.json (all package.jsons)"`.

---

### Task 2: Run the audit inside `smoke-scaffold.mjs`

**Files:** Modify `tools/create-icore/scripts/smoke-scaffold.mjs`.

- [ ] **Step 1: Wire the audit after scaffold.** In `smoke-scaffold.mjs`'s `main()`, right after the existing `await scaffold(opts, templatesDir); console.log(`scaffolded → ${opts.targetDir}`);` lines, add an audit call that fails the smoke on violations. Import `auditProject` from the built dist (the script already `require`s `distEntry` for `scaffold` — reuse it):

```js
// Orphan-regression gate (design §7): no import of an absent @icore lib, no
// forbidden raw SDK dep for an unchosen provider (derived from blueprint.json).
const { auditProject } = require(distEntry);
const auditViolations = await auditProject(opts.targetDir);
if (auditViolations.length > 0) {
  for (const v of auditViolations) console.error(`AUDIT ${v.kind}: ${v.detail}`);
  console.error(
    `\n✗ smoke FAILED (${combo}) — audit found ${auditViolations.length} orphan(s). inspect: ${opts.targetDir}`,
  );
  process.exit(1);
}
console.log(`✓ audit clean (${combo})`);
```

> `distEntry` is the same module the script already loads for `scaffold` (grounding: `const { scaffold } = require(distEntry)`). Confirm `auditProject` is exported from the package entry — it is re-exported via `src/index.ts` (Phase 1 added `manifest/audit`). If `require(distEntry).auditProject` is undefined, add `export * from './manifest/audit.js';` to `tools/create-icore/src/index.ts` (verify first) and rebuild.

This call sits BEFORE the `--mode` branch, so it runs in BOTH Layer A (`link`, every PR) and Layer B (`install`, nightly) — the audit gates every PR.

- [ ] **Step 2: Verify the dist exports auditProject + the script runs.** Rebuild: `yarn nx build create-icore --skip-nx-cache 2>&1 | tail -2` (ignore uuid DTS). Then run a link-mode smoke locally to confirm the audit runs + passes on a good combo:

Run: `node tools/create-icore/scripts/snapshot-templates.mjs && node tools/create-icore/scripts/smoke-scaffold.mjs --auth=supabase --db=supabase --upload=supabase --payment=none --jobs=none --example=none --transport=tcp --ui=shadcn --pm=yarn --mode=link 2>&1 | grep -iE "audit|scaffolded|smoke OK|FAILED" | tail -8`
Expected: `scaffolded → …`, `✓ audit clean`, `✓ smoke OK — typecheck clean`.

> If `--mode=link` typecheck is too heavy/slow locally, at minimum confirm the audit line prints `✓ audit clean` before the typecheck step. The CI runs the full thing.

- [ ] **Step 3: Negative check (audit actually catches an orphan).** Temporarily corrupt a generated project to prove the gate bites, then discard:

```bash
T=/tmp/icore-audit-neg && rm -rf "$T" && mkdir -p "$T"
cat > "$T/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
await scaffold({ projectName:'neg', targetDir:`${process.env.T}/neg`, authProvider:'supabase',
  dbProvider:'supabase', upload:'supabase', payment:'none', jobs:'none', example:'none',
  ui:'shadcn', transport:'tcp', initGit:false, packageManager:'npm', install:false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('gen');
EOF
T=$T node "$T/gen.mjs"
node tools/create-icore/scripts/audit.mjs "$T/neg" && echo "CLEAN (expected)"
# inject a forbidden dep (cloudinary not chosen) into a package.json
node -e "const f='$T/neg/apps/microservices/upload/package.json'; const fs=require('fs'); if(fs.existsSync(f)){const p=JSON.parse(fs.readFileSync(f)); (p.dependencies??={}).cloudinary='^2'; fs.writeFileSync(f, JSON.stringify(p,null,2));}"
node tools/create-icore/scripts/audit.mjs "$T/neg" && echo "BAD: audit missed injected cloudinary" || echo "GOOD: audit caught injected forbidden dep (exit 1)"
```

Expected: first run `CLEAN (expected)` (or `AUDIT OK`), after injection `GOOD: audit caught injected forbidden dep`. (If upload MS absent in this combo, inject into `apps/api/package.json` instead.) This proves the blueprint-derived gate bites.

- [ ] **Step 4: Changeset** — `.changeset/audit-blueprint-gate.md`:

```md
---
'@idevconn/create-icore': minor
---

The scaffold smoke (`smoke-scaffold.mjs`, run on every PR via Layer A + nightly via the matrix) now runs `auditProject` right after generation: it reads the project's `blueprint.json`, derives the forbidden raw-SDK set (a provider's SDK is forbidden when that provider is unchosen), and fails the smoke if any package.json keeps one — plus the existing import-of-absent-@icore-lib check. A permanent orphan-regression gate.
```

- [ ] **Step 5: Prettier + commit** — `npx prettier --write tools/create-icore/src/manifest tools/create-icore/scripts/smoke-scaffold.mjs && git add .changeset/audit-blueprint-gate.md tools/create-icore && git commit -m "feat(create-icore): run blueprint audit gate in smoke-scaffold (every PR + nightly)"`.

---

## Self-Review

**Spec coverage:** Realises design §7's "audit gate wired into the smoke" + the §10 "blueprint.json as audit input". `auditProject` now self-derives the forbidden set from `blueprint.json` (no hardcoded per-combo list), scanning all package.jsons; `smoke-scaffold.mjs` runs it on every PR (Layer A) + nightly (Layer B).

**Placeholder scan:** Full code; the dist-export verify-step + the negative-check prove the wiring + that the gate bites. No TBD.

**Type consistency:** `auditProject(dir, opts?)` signature unchanged (forbiddenDeps still honored, now unioned with blueprint-derived). `Violation` shape unchanged. `PROVIDER_SDKS` keys are provider names matching blueprint field values (`supabase`/`firebase`/`mongodb`/`cloudinary`). `forbiddenFromBlueprint` reads `authProvider`/`dbProvider`/`upload` — the same fields `writeBlueprintJson` emits.

**Scope:** Audit derivation + smoke wiring only. No yaml change (rides the existing smoke-scaffold call in both pipeline.yml + the matrix). transport/env left as-is (safe, out of scope).
