# Workspace Deps Split — Fix Orphan App Package.json

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move app-specific runtime deps from root `package.json` into per-workspace `package.json` files so `yarn install` only installs what the chosen configuration requires.

**Architecture:** Six apps (`jobs` MS, `notes` MS, `payment` MS, `client-antd`, `client-mui`, `client-shadcn`) have no `package.json` — their deps leak into root. `scaffold.ts` already calls `stripDeps(targetDir, 'apps/microservices/notes/package.json')` etc, but those files don't exist (silent no-op). Fix: add `package.json` to each orphan, remove their deps from root. When CLI removes an app dir (notes/payment/jobs not chosen), yarn drops those workspace packages and their deps.

**Tech Stack:** Yarn 4 node-modules linker, Nx 22.7, NestJS 11, React 19 / Vite

---

## File Map

| Action | File                                              | Purpose                                                                                          |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Create | `apps/microservices/jobs/package.json`            | declare bullmq + ioredis ownership                                                               |
| Create | `apps/microservices/notes/package.json`           | declare notes MS deps (scaffold already references this)                                         |
| Create | `apps/microservices/payment/package.json`         | declare @idevconn/payment ownership                                                              |
| Create | `apps/templates/client-antd/package.json`         | declare antd + @ant-design/icons                                                                 |
| Create | `apps/templates/client-mui/package.json`          | declare @mui/_ + @emotion/_                                                                      |
| Create | `apps/templates/client-shadcn/package.json`       | declare radix-ui, lucide, tailwind, sonner, CVA, clsx, tailwind-merge                            |
| Modify | `package.json` (root)                             | remove deps now owned by workspaces above + remove unused (react-router-dom, less, ioredis-mock) |
| Modify | `tools/create-icore/_template-shell/package.json` | same cleanup as root (this becomes consumer's root)                                              |
| Modify | `apps/api/src/main.ts`                            | GATEWAY_SERVICES baseline = auth + upload only (notes/payment are optional)                      |

---

## Task 1: Add jobs MS package.json

**Files:**

- Create: `apps/microservices/jobs/package.json`

jobs MS imports `bullmq` and `ioredis` directly (see `redis-connection.ts` and workers). These are currently in root. After this task, removing the jobs workspace dir removes these deps.

- [ ] **Step 1: Create the file**

```json
{
  "name": "jobs",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "@icore/shared": "*",
    "@nestjs/common": "^11.1.24",
    "@nestjs/config": "^4.0.4",
    "@nestjs/core": "^11.1.24",
    "bullmq": "^5.77.6",
    "ioredis": "^5.11.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "tslib": "^2.3.0"
  }
}
```

- [ ] **Step 2: Verify file created**

Run: `cat apps/microservices/jobs/package.json`
Expected: JSON prints without error.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/jobs/package.json
git commit -m "chore(deps): add package.json to jobs MS"
```

---

## Task 2: Add notes MS package.json

**Files:**

- Create: `apps/microservices/notes/package.json`

`scaffold.ts` lines 552–555 already call `stripDeps(targetDir, 'apps/microservices/notes/package.json', ['@icore/db-firestore', '@icore/firebase-admin'])` — silent no-op because file doesn't exist. This task fixes that.

- [ ] **Step 1: Create the file**

```json
{
  "name": "notes",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "@icore/db-firestore": "*",
    "@icore/db-supabase": "*",
    "@icore/firebase-admin": "*",
    "@icore/shared": "*",
    "@nestjs/common": "^11.1.24",
    "@nestjs/config": "^4.0.4",
    "@nestjs/core": "^11.1.24",
    "@nestjs/microservices": "^11.1.24",
    "@supabase/supabase-js": "^2.106.2",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "tslib": "^2.3.0"
  }
}
```

- [ ] **Step 2: Verify file created**

Run: `cat apps/microservices/notes/package.json`
Expected: JSON prints without error.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/package.json
git commit -m "chore(deps): add package.json to notes MS (fixes scaffold stripDeps no-op)"
```

---

## Task 3: Add payment MS package.json

**Files:**

- Create: `apps/microservices/payment/package.json`

`@idevconn/payment` lives in root but is only used by payment MS (and api/package.json for gateway). After this, scaffold's `removePaymentStack()` deletes the dir → yarn drops `@idevconn/payment` from this workspace.

- [ ] **Step 1: Create the file**

```json
{
  "name": "payment",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "@idevconn/payment": "^1.2.0",
    "@icore/shared": "*",
    "@nestjs/common": "^11.1.24",
    "@nestjs/config": "^4.0.4",
    "@nestjs/core": "^11.1.24",
    "@nestjs/microservices": "^11.1.24",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "tslib": "^2.3.0"
  }
}
```

- [ ] **Step 2: Verify file created**

Run: `cat apps/microservices/payment/package.json`
Expected: JSON prints without error.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/payment/package.json
git commit -m "chore(deps): add package.json to payment MS"
```

---

## Task 4: Add client-antd package.json

**Files:**

- Create: `apps/templates/client-antd/package.json`

`antd` and `@ant-design/icons` are antd-template-only. When CLI picks shadcn or mui, `apps/templates/client-antd` is removed → these packages disappear. `dayjs` stays in root (also used by shadcn template's date pickers).

- [ ] **Step 1: Create the file**

```json
{
  "name": "client-antd",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "@ant-design/icons": "^6",
    "antd": "^6"
  }
}
```

- [ ] **Step 2: Verify**

Run: `cat apps/templates/client-antd/package.json`
Expected: JSON prints without error.

- [ ] **Step 3: Commit**

```bash
git add apps/templates/client-antd/package.json
git commit -m "chore(deps): add package.json to client-antd template"
```

---

## Task 5: Add client-mui package.json

**Files:**

- Create: `apps/templates/client-mui/package.json`

MUI + Emotion are mui-only. ~4 MB of deps that no shadcn/antd user should install.

- [ ] **Step 1: Create the file**

```json
{
  "name": "client-mui",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/icons-material": "^6",
    "@mui/material": "^6"
  }
}
```

- [ ] **Step 2: Verify**

Run: `cat apps/templates/client-mui/package.json`
Expected: JSON prints without error.

- [ ] **Step 3: Commit**

```bash
git add apps/templates/client-mui/package.json
git commit -m "chore(deps): add package.json to client-mui template"
```

---

## Task 6: Add client-shadcn package.json

**Files:**

- Create: `apps/templates/client-shadcn/package.json`

Tailwind + Radix UI + shadcn utilities are shadcn-only. When CLI picks antd/mui, this template dir is removed.

- [ ] **Step 1: Create the file**

```json
{
  "name": "client-shadcn",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "@tailwindcss/vite": "^4.3.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.17.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.6.0",
    "tailwindcss": "^4"
  }
}
```

- [ ] **Step 2: Verify**

Run: `cat apps/templates/client-shadcn/package.json`
Expected: JSON prints without error.

- [ ] **Step 3: Commit**

```bash
git add apps/templates/client-shadcn/package.json
git commit -m "chore(deps): add package.json to client-shadcn template"
```

---

## Task 7: Clean root package.json

**Files:**

- Modify: `package.json`

Remove deps now owned by workspaces (Tasks 1–6) and unused deps. Exact list:

**Remove from `dependencies`:**

- `@ant-design/icons` → client-antd
- `@emotion/react` → client-mui
- `@emotion/styled` → client-mui
- `@idevconn/payment` → payment MS + payment-client (already has it)
- `@mui/icons-material` → client-mui
- `@mui/material` → client-mui
- `antd` → client-antd
- `bullmq` → jobs MS + jobs-client (already has it)
- `firebase-admin` → duplicate of `libs/firebase-admin/package.json`
- `ioredis` → jobs MS + jobs-client (already has it)
- `react-router-dom` → zero imports in codebase, unused
- `@radix-ui/react-dialog` → client-shadcn
- `@radix-ui/react-dropdown-menu` → client-shadcn
- `@radix-ui/react-label` → client-shadcn
- `@radix-ui/react-slot` → client-shadcn
- `@tailwindcss/vite` → client-shadcn
- `class-variance-authority` → client-shadcn
- `clsx` → client-shadcn
- `lucide-react` → client-shadcn
- `sonner` → client-shadcn
- `tailwind-merge` → client-shadcn
- `tailwindcss` → client-shadcn

**Remove from `devDependencies`:**

- `ioredis-mock` → zero imports in codebase, unused
- `less` → zero imports in codebase, unused

- [ ] **Step 1: Remove from dependencies**

Edit `package.json` — delete the listed keys from the `"dependencies"` block. Keep everything else (react, @nestjs/_, @tanstack/_, i18next, zustand, @casl/\*, @idevconn/api-client, @idevconn/use-draft, axios, cloudinary, @supabase/supabase-js, dayjs, amqplib, amqp-connection-manager, nats, kafkajs, mqtt, cookie-parser, reflect-metadata, rxjs, kleur, @clack/prompts, classnames).

- [ ] **Step 2: Remove from devDependencies**

Edit `package.json` — delete `ioredis-mock` and `less` from the `"devDependencies"` block.

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))" && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(deps): remove orphan app deps from root package.json"
```

---

## Task 8: Clean template-shell package.json

**Files:**

- Modify: `tools/create-icore/_template-shell/package.json`

This is the package.json that `create-icore` CLI copies to consumer projects. It has the same dep bloat as root. Apply the same removals as Task 7.

**Remove from `dependencies`:** antd, @ant-design/icons, @emotion/react, @emotion/styled, @idevconn/payment, @mui/icons-material, @mui/material, bullmq, firebase-admin, ioredis, react-router-dom, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-label, @radix-ui/react-slot, @tailwindcss/vite, class-variance-authority, clsx, lucide-react, sonner, tailwind-merge, tailwindcss, @bull-board/api, @bull-board/express

**Remove from `devDependencies`:** ioredis-mock, less

Note: `@bull-board/*` is in template-shell (unlike root where it wasn't). These belong to api/package.json which the CLI already manages via `stripDeps`.

- [ ] **Step 1: Remove from dependencies**

Edit `tools/create-icore/_template-shell/package.json` — delete all listed keys from `"dependencies"`.

- [ ] **Step 2: Remove from devDependencies**

Edit `tools/create-icore/_template-shell/package.json` — delete `ioredis-mock` and `less` from `"devDependencies"`.

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('tools/create-icore/_template-shell/package.json','utf8'))" && echo "OK"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add tools/create-icore/_template-shell/package.json
git commit -m "chore(deps): remove orphan app deps from template-shell package.json"
```

---

## Task 9: Fix GATEWAY_SERVICES in main.ts

**Files:**

- Modify: `apps/api/src/main.ts`

Current `GATEWAY_SERVICES` hardcodes notes and payment, but those MSes are optional and get removed by scaffold when `example=none` / `payment=none`. The banner then lists services that don't exist. Baseline = auth + upload only. Scaffold's `removeNotesStack` / `removePaymentStack` must also strip their entries from this array.

- [ ] **Step 1: Fix GATEWAY_SERVICES baseline**

In `apps/api/src/main.ts`, change:

```ts
const GATEWAY_SERVICES = [
  { name: 'auth', prefix: 'AUTH' },
  { name: 'upload', prefix: 'UPLOAD' },
  { name: 'notes', prefix: 'NOTES' },
  { name: 'payment', prefix: 'PAYMENT' },
];
```

to:

```ts
const GATEWAY_SERVICES = [
  { name: 'auth', prefix: 'AUTH' },
  { name: 'upload', prefix: 'UPLOAD' },
];
```

- [ ] **Step 2: Fix removeNotesStack in scaffold.ts**

In `tools/create-icore/src/lib/scaffold.ts`, inside `removeNotesStack()`, add after the `stripGatewayTransport(targetDir, 'NOTES')` call:

```ts
// Strip notes entry from GATEWAY_SERVICES in main.ts
const mainTsPath = join(targetDir, 'apps/api/src/main.ts');
try {
  const src = await readFile(mainTsPath, 'utf8');
  const next = src.replace(/\n\s*\{ name: 'notes', prefix: 'NOTES' \},/, '');
  await writeFile(mainTsPath, next);
} catch {
  // ignore — main.ts may not exist in test scaffolds
}
```

- [ ] **Step 3: Fix removePaymentStack in scaffold.ts**

In `tools/create-icore/src/lib/scaffold.ts`, inside `removePaymentStack()`, add after the `stripGatewayTransport(targetDir, 'PAYMENT')` call:

```ts
// Strip payment entry from GATEWAY_SERVICES in main.ts
const mainTsPath = join(targetDir, 'apps/api/src/main.ts');
try {
  const src = await readFile(mainTsPath, 'utf8');
  const next = src.replace(/\n\s*\{ name: 'payment', prefix: 'PAYMENT' \},/, '');
  await writeFile(mainTsPath, next);
} catch {
  // ignore — main.ts may not exist in test scaffolds
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts tools/create-icore/src/lib/scaffold.ts
git commit -m "fix(gateway): GATEWAY_SERVICES baseline auth+upload; scaffold strips notes/payment entries"
```

---

## Task 10: Verify build

**Files:** None modified — verification only.

- [ ] **Step 1: Run yarn install**

Run: `yarn install`
Expected: Completes without error. Check that `antd`, `@mui/material`, `bullmq` are still present in `node_modules` (they're still workspace deps via client-antd, client-mui, jobs MS).

- [ ] **Step 2: Lint api and shared**

Run: `yarn nx lint api && yarn nx lint shared`
Expected: 0 errors.

- [ ] **Step 3: Build api**

Run: `yarn nx build api`
Expected: green.

- [ ] **Step 4: Build client-shadcn template**

Run: `yarn nx build client-shadcn`
Expected: green.

- [ ] **Step 5: Build create-icore CLI**

Run: `yarn nx build create-icore`
Expected: green.

- [ ] **Step 6: Run create-icore unit tests**

Run: `yarn nx test create-icore`
Expected: all pass. The scaffold tests that call `stripDeps` on `apps/microservices/notes/package.json` should now hit real files.

- [ ] **Step 7: Commit if any prettier/lint auto-fixes needed**

If linter auto-fixed anything:

```bash
git add -p
git commit -m "chore: post-verify lint fixes"
```

---

## Self-Review

**Spec coverage:**

- ✅ bullmq/ioredis → jobs MS package.json (Task 1)
- ✅ firebase-admin duplicate removed from root (Task 7)
- ✅ bullmq/@bull-board root → @bull-board stays in api/package.json (already there), bullmq → jobs (Task 1+7)
- ✅ @idevconn/payment → payment MS package.json (Task 3) + root removal (Task 7)
- ✅ antd+@ant-design/icons → client-antd package.json (Task 4+7)
- ✅ @mui/_+@emotion/_ → client-mui package.json (Task 5+7)
- ✅ react-router-dom → deleted (Task 7) — zero imports confirmed
- ✅ less → deleted (Task 7) — zero imports confirmed
- ✅ ioredis-mock → deleted (Task 7) — zero imports confirmed
- ✅ GATEWAY_SERVICES → baseline fix (Task 9)
- ✅ scaffold.ts removeNotesStack/removePaymentStack → strip main.ts entries (Task 9)
- ✅ template-shell package.json → same cleanup (Task 8)
- ✅ scaffold.ts `stripDeps` calls on notes/payment/jobs package.json → now have real targets (Tasks 1–3)

**Placeholder scan:** No TBDs found.

**Type consistency:** No type definitions in this plan (JSON + config only).
