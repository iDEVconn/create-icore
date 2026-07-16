### Task 1: Fix the missing `VITE_AUTH_HAS_*` placeholders in mui/antd `.env.example`

**Files:**
- Modify: `apps/templates/client-mui/.env.example`
- Modify: `apps/templates/client-antd/.env.example`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts`

**Root cause:** confirmed by reading both files directly — neither has a `VITE_AUTH_HAS_OAUTH=`/`VITE_AUTH_HAS_MAGIC_LINK=` line, unlike `client-shadcn/.env.example` (which got them in PR4). `writeClientEnv`'s regex-replace silently no-ops against content that doesn't match.

- [ ] **Step 1: Write the failing test — proves the REAL template files are missing the placeholder**

```typescript
// tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
// Add near the top, alongside existing imports:
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Mirrors the exact pattern already used in scaffold.unit.test.ts:976 for reading
// real repo files from a test (not a synthetic fixture).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

// Add a new describe block:
describe('writeClientEnv — real template .env.example files have the VITE_AUTH_HAS_* placeholder', () => {
  it.each(['client-shadcn', 'client-mui', 'client-antd'])(
    '%s/.env.example has both placeholder lines writeClientEnv depends on',
    async (uiTemplate) => {
      const envExample = await readFile(
        join(repoRoot, `apps/templates/${uiTemplate}/.env.example`),
        'utf8',
      );
      expect(envExample).toMatch(/^VITE_AUTH_HAS_OAUTH=.*$/m);
      expect(envExample).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=.*$/m);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test create-icore -- scaffold-env.unit.test.ts -t "VITE_AUTH_HAS"`
Expected: FAIL for `client-mui` and `client-antd` (neither line present); PASS for `client-shadcn` (already fixed in PR4).

- [ ] **Step 3: Add the placeholder lines to both templates**

```bash
# apps/templates/client-mui/.env.example
# append:

# Set by the generator based on --auth=<provider>. Gates OAuth buttons + the
# magic-link toggle in LoginForm — postgres/mongodb don't implement either yet.
VITE_AUTH_HAS_OAUTH=false
VITE_AUTH_HAS_MAGIC_LINK=false
```

```bash
# apps/templates/client-antd/.env.example
# append:

# Set by the generator based on --auth=<provider>. Gates OAuth buttons + the
# magic-link toggle in LoginForm — postgres/mongodb don't implement either yet.
VITE_AUTH_HAS_OAUTH=false
VITE_AUTH_HAS_MAGIC_LINK=false
```

(Byte-for-byte identical block to what `client-shadcn/.env.example` already has — same comment, same default values.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test create-icore -- scaffold-env.unit.test.ts -t "VITE_AUTH_HAS"`
Expected: PASS (all 3 templates).

- [ ] **Step 5: Run the full create-icore suite to confirm no regression**

Run: `npx nx test create-icore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/templates/client-mui/.env.example apps/templates/client-antd/.env.example tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
npx nx lint create-icore
git add apps/templates/client-mui/.env.example apps/templates/client-antd/.env.example tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
git commit -m "fix(scaffold): add missing VITE_AUTH_HAS_OAUTH/MAGIC_LINK placeholder to mui/antd .env.example

writeClientEnv's regex-replace silently no-ops when the placeholder line
isn't already present in the template's .env.example — client-mui and
client-antd never had it (only client-shadcn got it in PR4), so a
--ui=mui/--ui=antd scaffold generated apps/client/.env with neither var
written at all. Blocks the OAuth-gating fix this PR is about to add to
both templates' LoginForm.tsx — without this, the gate would read
undefined/false unconditionally, hiding OAuth even for supabase/firebase."
```

---

