# Scaffold CASL auth=none Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `create-icore` generates a project with `auth=none`, the generated `PageLayout.tsx` must not import `Can`, `AbilityAction`, or `AbilitySubject` — those are removed by the scaffold but the template file was never updated.

**Architecture:** Add per-UI auth=none variant strings for `PageLayout.tsx` to `scaffold-auth-none.ts`, wire them into `UI_VARIANTS`, and delete `AccessDeniedPage.tsx` (which only PageLayout imports). Add matching unit tests.

**Tech Stack:** Node.js, TypeScript, Vitest, `node:fs/promises`

## Global Constraints

- All new const strings in `scaffold-auth-none.ts` must be plain template literals (no imports, no computed values)
- Every change to production code must have a corresponding unit test added/updated in `scaffold.unit.test.ts`
- Run `yarn nx test create-icore` after each task — 0 failures required
- Run `npx prettier --write <touched files>` before staging

---

## File Map

| Action | Path                                                         |
| ------ | ------------------------------------------------------------ |
| Modify | `tools/create-icore/src/lib/scaffold-auth-none.ts`           |
| Modify | `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` |

---

### Task 1: Add PageLayout auth=none variants + AccessDeniedPage removal

**Files:**

- Modify: `tools/create-icore/src/lib/scaffold-auth-none.ts`

**Context:**

`scaffold-auth-none.ts` has `AUTH_ONLY_PATHS` (dirs/files deleted when auth=none) and `UI_VARIANTS` (per-UI static string replacements). Currently:

- `libs/shared/src/abilities` and `libs/template-shared/src/lib/abilities` are deleted ✓
- `libs/shared/src/index.ts` and `libs/template-shared/src/index.ts` are overwritten without abilities exports ✓
- **Bug:** `apps/client/src/components/PageLayout.tsx` is NOT replaced — still imports `Can`, `AbilityAction`, `AbilitySubject` which no longer exist

**Interfaces:**

- Produces: `applyAuthNoneVariants(targetDir, ui)` now also writes `apps/client/src/components/PageLayout.tsx` without CASL imports (all 3 UIs)
- Produces: `removeAuthOnlyPaths(targetDir)` now also removes `apps/client/src/components/AccessDeniedPage.tsx`

- [ ] **Step 1: Add shadcn PageLayout variant const**

In `scaffold-auth-none.ts`, after the `TEMPLATE_SHARED_INDEX_TS` const (around line 196), add:

```typescript
const SHADCN_PAGE_LAYOUT_TSX = `\
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraft, useLoading } from '@icore/template-shared';

interface PageLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageLayout({ title, description, actions, children }: PageLayoutProps) {
  const { t } = useTranslation();
  const isLoading = useLoading();

  useDraft(false);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </div>

      {isLoading && (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {children}
    </div>
  );
}
`;
```

- [ ] **Step 2: Add antd PageLayout variant const**

Immediately after `SHADCN_PAGE_LAYOUT_TSX`, add:

```typescript
const ANTD_PAGE_LAYOUT_TSX = `\
import type { ReactNode } from 'react';
import { Descriptions, Spin } from 'antd';
import { useDraft, useLoading } from '@icore/template-shared';

export interface PageLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
}

export function PageLayout({ title, description, extra, children }: PageLayoutProps) {
  useDraft(false);
  const loading = useLoading();

  return (
    <div style={{ padding: 24 }}>
      <Descriptions title={title} extra={extra} style={{ marginBottom: 16 }}>
        {description ? <Descriptions.Item>{description}</Descriptions.Item> : null}
      </Descriptions>
      <Spin spinning={loading}>
        <div>{children}</div>
      </Spin>
    </div>
  );
}
`;
```

- [ ] **Step 3: Add mui PageLayout variant const**

Immediately after `ANTD_PAGE_LAYOUT_TSX`, add:

```typescript
const MUI_PAGE_LAYOUT_TSX = `\
import type { ReactNode } from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { useDraft, useLoading } from '@icore/template-shared';

export interface PageLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
}

export function PageLayout({ title, description, extra, children }: PageLayoutProps) {
  useDraft(false);
  const loading = useLoading();

  return (
    <Box sx={{ p: 3 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        spacing={2}
        mb={3}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {extra ? (
          <Stack direction="row" spacing={1}>
            {extra}
          </Stack>
        ) : null}
      </Stack>
      {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}
      <Box>{children}</Box>
    </Box>
  );
}
`;
```

- [ ] **Step 4: Wire PageLayout variants into UI_VARIANTS**

In `UI_VARIANTS`, add `PageLayout.tsx` to each UI entry:

```typescript
const UI_VARIANTS: Record<string, Record<string, string>> = {
  shadcn: {
    'apps/client/src/main.tsx': SHADCN_MAIN_TSX,
    'apps/client/src/routes/_dashboard.tsx': SHADCN_DASHBOARD_TSX,
    'apps/client/src/routes/index.tsx': SHADCN_INDEX_TSX,
    'apps/client/src/components/layout/LayoutHeader.tsx': SHADCN_LAYOUT_HEADER_TSX,
    'apps/client/src/components/PageLayout.tsx': SHADCN_PAGE_LAYOUT_TSX,
  },
  antd: {
    'apps/client/src/main.tsx': ANTD_MAIN_TSX,
    'apps/client/src/routes/_dashboard.tsx': ANTD_DASHBOARD_TSX,
    'apps/client/src/routes/index.tsx': ANTD_INDEX_TSX,
    'apps/client/src/components/layout/LayoutHeader.tsx': ANTD_LAYOUT_HEADER_TSX,
    'apps/client/src/components/PageLayout.tsx': ANTD_PAGE_LAYOUT_TSX,
  },
  mui: {
    'apps/client/src/main.tsx': MUI_MAIN_TSX,
    'apps/client/src/routes/_dashboard.tsx': MUI_DASHBOARD_TSX,
    'apps/client/src/routes/index.tsx': MUI_INDEX_TSX,
    'apps/client/src/components/layout/LayoutHeader.tsx': MUI_LAYOUT_HEADER_TSX,
    'apps/client/src/components/PageLayout.tsx': MUI_PAGE_LAYOUT_TSX,
  },
};
```

- [ ] **Step 5: Add AccessDeniedPage.tsx to AUTH_ONLY_PATHS**

In `AUTH_ONLY_PATHS`, add the entry:

```typescript
const AUTH_ONLY_PATHS = [
  'apps/microservices/auth',
  'libs/auth-strategies',
  'libs/auth-client',
  'Dockerfile.ms-auth',
  'apps/api/src/app/auth',
  'apps/api/src/app/profile',
  'apps/api/src/app/abilities',
  'libs/shared/src/abilities',
  'apps/client/src/components/auth',
  'apps/client/src/components/AccessDeniedPage.tsx', // ← add this
  'apps/client/src/routes/login.tsx',
  'apps/client/src/routes/auth.callback.tsx',
  'apps/client/src/routes/auth.oauth.callback.tsx',
  'apps/client/src/routes/_dashboard/profile.tsx',
  'libs/template-shared/src/lib/abilities',
];
```

- [ ] **Step 6: Prettier + verify compile**

```bash
cd /home/vladimir-tkach/Projects/22
npx prettier --write tools/create-icore/src/lib/scaffold-auth-none.ts
yarn nx build create-icore 2>&1 | tail -5
```

Expected: `Successfully ran target build`

---

### Task 2: Update unit tests

**Files:**

- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`

**Context:**

The `describe('removeAuthOnlyPaths + applyAuthNoneVariants...')` block has a `beforeEach` that creates dummy files in a temp dir. The tests then call the scaffold functions and assert on the output. We need to:

1. Add `PageLayout.tsx` (with CASL imports) and `AccessDeniedPage.tsx` to `beforeEach` setup
2. Add test verifying `removeAuthOnlyPaths` deletes `AccessDeniedPage.tsx`
3. Add test verifying `applyAuthNoneVariants` writes `PageLayout.tsx` without CASL (shadcn variant)

**Interfaces:**

- Consumes: `removeAuthOnlyPaths`, `applyAuthNoneVariants` from `scaffold-auth-none.ts`

- [ ] **Step 1: Add PageLayout.tsx and AccessDeniedPage.tsx to beforeEach**

In the `beforeEach` of the `describe('removeAuthOnlyPaths + applyAuthNoneVariants...')` block (around line 262), after the line that creates `apps/client/src/components/auth/LoginForm.tsx`, add:

```typescript
// PageLayout.tsx (with CASL — will be replaced by applyAuthNoneVariants)
await writeFile(
  join(authDir, 'apps/client/src/components/PageLayout.tsx'),
  [
    "import { Can, useDraft, useLoading } from '@icore/template-shared';",
    "import type { AbilityAction, AbilitySubject } from '@icore/shared';",
    "import { AccessDeniedPage } from './AccessDeniedPage';",
    'export function PageLayout() { return null; }',
  ].join('\n'),
);
// AccessDeniedPage.tsx — orphaned when auth=none (PageLayout no longer imports it)
await writeFile(
  join(authDir, 'apps/client/src/components/AccessDeniedPage.tsx'),
  'export function AccessDeniedPage() { return null; }',
);
```

- [ ] **Step 2: Write failing tests**

After the existing test `'removeAuthOnlyPaths: removes libs/shared/src/abilities and template-shared abilities dir'` (around line 547), add two new tests:

```typescript
it('removeAuthOnlyPaths: removes AccessDeniedPage.tsx', async () => {
  await removeAuthOnlyPaths(authDir);
  await expect(
    access(join(authDir, 'apps/client/src/components/AccessDeniedPage.tsx')),
  ).rejects.toThrow();
});

it('applyAuthNoneVariants: writes PageLayout.tsx without CASL imports (shadcn)', async () => {
  await applyAuthNoneVariants(authDir, 'shadcn');
  const src = await readFile(join(authDir, 'apps/client/src/components/PageLayout.tsx'), 'utf8');
  expect(src).not.toContain('@icore/shared');
  expect(src).not.toContain('AbilityAction');
  expect(src).not.toContain('AbilitySubject');
  expect(src).not.toContain('Can');
  expect(src).not.toContain('AccessDeniedPage');
  expect(src).toContain('useDraft');
  expect(src).toContain('useLoading');
  expect(src).toContain('PageLayout');
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/vladimir-tkach/Projects/22
yarn nx test create-icore --testNamePattern="removeAuthOnlyPaths: removes AccessDeniedPage|applyAuthNoneVariants: writes PageLayout" 2>&1 | tail -20
```

Expected: both tests FAIL (AccessDeniedPage not removed yet, PageLayout still has CASL)

- [ ] **Step 4: Run full test suite (after Task 1 is done)**

```bash
cd /home/vladimir-tkach/Projects/22
yarn nx test create-icore 2>&1 | tail -20
```

Expected: all tests pass, 0 failures

- [ ] **Step 5: Prettier + commit**

```bash
cd /home/vladimir-tkach/Projects/22
npx prettier --write tools/create-icore/src/lib/scaffold-auth-none.ts tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
git add tools/create-icore/src/lib/scaffold-auth-none.ts tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
```

---

## Self-Review

**Spec coverage:**

- ✓ Bug: PageLayout.tsx with CASL generated for auth=none → fixed by UI_VARIANTS entry
- ✓ All 3 UIs covered (shadcn, antd, mui)
- ✓ AccessDeniedPage.tsx orphaned → fixed by AUTH_ONLY_PATHS entry
- ✓ Tests: removeAuthOnlyPaths removes AccessDeniedPage
- ✓ Tests: applyAuthNoneVariants writes CASL-free PageLayout (shadcn)

**Not in scope (cosmetic, no runtime error):**

- `@casl/ability` still appears in generated landing page dep display for auth=none projects
- `@casl/ability` / `@casl/react` remain as dev deps in generated package.json when auth=none

**Placeholder scan:** No TBDs or TODOs.

**Type consistency:** No new types introduced. All function signatures match existing `removeAuthOnlyPaths(targetDir: string)` and `applyAuthNoneVariants(targetDir: string, ui: string)`.
