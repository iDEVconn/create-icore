## Task 4: shadcn template ships no `components.json` and 2 dead radix deps

`apps/templates/client-shadcn` only ships 4 primitives (`button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`) and has **no `components.json`**, so `npx shadcn add <component>` doesn't work post-scaffold — a crawler-nx user had to hand-write Table/Dialog/Select/Tabs/DropdownMenu/Badge from scratch. Worse: `package.json` already declares `@radix-ui/react-dialog` and `@radix-ui/react-dropdown-menu` as dependencies, but no `dialog.tsx`/`dropdown-menu.tsx` component file exists anywhere in the template (confirmed via `grep -rl "@radix-ui/react-dialog"` returning nothing) — dead deps left over from unfinished work. Also missing `tw-animate-css`, which crawler-nx added manually because Tailwind v4 has no built-in animation utilities for shadcn's Dialog/Select transitions.

**Files:**
- Create: `apps/templates/client-shadcn/components.json`
- Create: `apps/templates/client-shadcn/src/components/ui/dialog.tsx`
- Create: `apps/templates/client-shadcn/src/components/ui/dropdown-menu.tsx`
- Modify: `apps/templates/client-shadcn/package.json` — add `tw-animate-css`
- Modify: `apps/templates/client-shadcn/src/globals.css` — import `tw-animate-css`

**Interfaces:**
- `dialog.tsx` exports: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose` — the standard shadcn Dialog primitive set, consumed the same way any shadcn-generated Dialog is (`import { Dialog, DialogContent, ... } from '@/components/ui/dialog'`).
- `dropdown-menu.tsx` exports: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel` — standard shadcn set.
- Both use the existing `cn` helper from `@/lib/utils` (already present, `src/lib/utils.ts:4`).

- [ ] **Step 1: Add `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

This alone makes `npx shadcn add table`, `select`, `tabs`, `badge`, etc. work out of the box post-scaffold — the plan does NOT hand-ship every primitive, since that duplicates shadcn's own registry. Only `dialog` and `dropdown-menu` are added by hand below, because their deps are already declared and dead.

- [ ] **Step 2: Add `tw-animate-css` dependency** — in `apps/templates/client-shadcn/package.json`, add to `dependencies`:
```json
    "tw-animate-css": "^1.4.0",
```
(alphabetical position: after `tailwindcss`)

- [ ] **Step 3: Import it in `src/globals.css`** — add as the first import line, before the Google Fonts import:
```css
@import 'tw-animate-css';
```

- [ ] **Step 4: Create `src/components/ui/dialog.tsx`**

```tsx
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
```

- [ ] **Step 5: Create `src/components/ui/dropdown-menu.tsx`**

```tsx
'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('bg-border -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn('px-2 py-1.5 text-sm font-medium data-[inset]:pl-8', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
```

(`CheckIcon`, `ChevronRightIcon`, `CircleIcon` are imported for parity with the full shadcn dropdown-menu primitive set if submenu/checkbox/radio items are added later via `npx shadcn add dropdown-menu --overwrite`; unused-import lint will flag them if truly unused — if lint fails on this, drop the unused icon imports.)

- [ ] **Step 6: Verify the template builds standalone** — since `client-shadcn` is a template (not a live Nx project itself), verify by temporarily scaffolding a throwaway project with `--ui=shadcn` and building its client:

```bash
node tools/create-icore/dist/index.js /tmp/icore-shadcn-check --ui=shadcn --auth=none --db=none --upload=none --example=none --package-manager=yarn --no-install --no-git
cd /tmp/icore-shadcn-check && yarn install && yarn nx build client
```
Expected: build succeeds, no missing-module errors for `@/components/ui/dialog` or `@/components/ui/dropdown-menu` if you reference them in a smoke check, and `components.json` is present at the project root.

- [ ] **Step 7: Lint + prettier**
```bash
npx prettier --write apps/templates/client-shadcn/components.json apps/templates/client-shadcn/package.json apps/templates/client-shadcn/src/globals.css apps/templates/client-shadcn/src/components/ui/dialog.tsx apps/templates/client-shadcn/src/components/ui/dropdown-menu.tsx
yarn nx lint client-shadcn
```
Expected: 0 errors. (If `client-shadcn` has no `lint` target since it's a template dir excluded from the Nx project graph, skip — confirm via `yarn nx show projects | grep shadcn`.)

- [ ] **Step 8: Commit**
```bash
git add apps/templates/client-shadcn/
git commit -m "fix(scaffold): ship components.json + wire up dead dialog/dropdown-menu deps in shadcn template"
```

---

## Final Steps (after all 4 tasks)

- [ ] Add the changeset:
```bash
cat > .changeset/scaffold-generator-gaps.md << 'EOF'
---
"@idevconn/create-icore": patch
---

Bump nx to 23.0.1, fix webpack-cli 7 --node-env removal in auth/notes/upload, generate POSTGRES_URL/JWT_SECRET for postgres auth/db provider, ship components.json and wire up dialog/dropdown-menu in the shadcn client template.
EOF
git add .changeset/scaffold-generator-gaps.md
git commit -m "chore: add changeset for scaffold generator gaps"
```
- [ ] `yarn nx run-many -t lint test build` one final time across the whole workspace — all green.
- [ ] Push `feature/leftovers`, open PR with `--base dev` (per AGENTS.md — check `gh pr list --state all --limit 10` first).
