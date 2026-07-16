### Task 2: Define the missing `popover`/`accent` CSS tokens

**Files:**
- Modify: `apps/templates/client-shadcn/src/globals.css`

**Root cause:** `dropdown-menu.tsx:29` uses `bg-popover text-popover-foreground`; `dropdown-menu.tsx:53` and `dialog.tsx:58` use `bg-accent` (`focus:bg-accent`, `data-[state=open]:bg-accent`). Tailwind v4 generates a `bg-*` utility from a `--color-*` custom property in the `@theme` block. `globals.css`'s `@theme` block (light) defines `background`, `foreground`, `card`, `primary`, `secondary`, `muted`, `border`, `input`, `ring`, `destructive` — but never `popover` or `accent`. The dark-mode override block (`html.dark`) mirrors the same omission. Both utilities currently compile to a no-op class (no matching CSS variable), so any dropdown menu or the dialog's close button renders with a transparent background instead of the intended surface color — invisible until the first time someone actually opens one.

- [ ] **Step 1: Add the tokens to the light block**

```css
/* apps/templates/client-shadcn/src/globals.css */
@theme {
  --font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;

  /* Light mode defaults */
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-card: #f8fafc;
  --color-card-foreground: #0f172a;
  --color-popover: #ffffff;
  --color-popover-foreground: #0f172a;
  --color-primary: #16a34a;
  --color-primary-foreground: #ffffff;
  --color-secondary: #f1f5f9;
  --color-secondary-foreground: #0f172a;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #475569;
  --color-accent: #f1f5f9;
  --color-accent-foreground: #0f172a;
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;
  --color-ring: #16a34a;
  --color-destructive: #ef4444;
  --radius-default: 0.5rem;
}
```

- [ ] **Step 2: Add the tokens to the dark override block**

```css
  /* OLED Dark mode */
  html.dark {
    --color-background: #020617;
    --color-foreground: #f8fafc;
    --color-card: #0f172a;
    --color-card-foreground: #f8fafc;
    --color-popover: #0f172a;
    --color-popover-foreground: #f8fafc;
    --color-primary: #22c55e;
    --color-primary-foreground: #020617;
    --color-secondary: #1e293b;
    --color-secondary-foreground: #f8fafc;
    --color-muted: #1e293b;
    --color-muted-foreground: #94a3b8;
    --color-accent: #1e293b;
    --color-accent-foreground: #f8fafc;
    --color-border: #1e293b;
    --color-input: #1e293b;
    --color-ring: #22c55e;
    --color-destructive: #ef4444;
  }
```

`--color-popover`/`--color-accent` are set equal to `--color-card`/`--color-secondary` respectively in both modes — a neutral, low-contrast surface consistent with how shadcn's default `new-york`/`neutral` themes relate those tokens, and consistent with this file's existing pattern of flat hex values (no `oklch()`/`color-mix()` elsewhere in the file).

- [ ] **Step 3: Verify by build + manual check**

Run: `npx nx build client-shadcn`
Expected: green — Tailwind v4 resolves `bg-popover`/`bg-accent`/`text-popover-foreground`/`text-accent-foreground` to real declarations now; no build-time indication either way since Tailwind silently no-ops unmatched utilities, so this alone doesn't prove the fix — proceed to the manual check.

Manual check (documented, not automated — same test-infra gap as Task 1):
1. Run the client dev server, open any dropdown menu (e.g. the notes example's row action menu, if `--example=notes`) or a dialog.
2. Confirm the dropdown/dialog-close-button background now renders the intended surface color (light: near-white/`#f8fafc`-ish; dark: `#1e293b`-ish) instead of transparent.
3. Toggle the theme switcher and repeat — confirm both light and dark values apply.

- [ ] **Step 4: Commit**

```bash
npx prettier --write apps/templates/client-shadcn/src/globals.css
npx nx lint client-shadcn
git add apps/templates/client-shadcn/src/globals.css
git commit -m "fix(client): define missing --color-popover/--color-accent tokens used by dropdown-menu and dialog"
```

---

