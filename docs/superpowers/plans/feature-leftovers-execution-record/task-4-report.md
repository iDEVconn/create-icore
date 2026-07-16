# Task 4: shadcn template ships no `components.json` and 2 dead radix deps — DONE

**Date:** 2026-07-05
**Branch:** feature/leftovers
**Commit:** 7e2e661

## Status: DONE

All 8 steps from the brief completed, with one deliberate deviation from the brief's literal instruction in Step 3 (see "Deviation from brief" below) after the smoke check revealed it silently breaks the production CSS bundle.

## What was implemented

1. **Created** `apps/templates/client-shadcn/components.json` — exactly as specified in the brief (style `new-york`, `slate` base color, `cssVariables: true`, standard `@/*` aliases, `iconLibrary: lucide`). Makes `npx shadcn add <primitive>` work post-scaffold for any primitive not hand-shipped.
2. **Added** `tw-animate-css: ^1.4.0` to `apps/templates/client-shadcn/package.json` dependencies (alphabetical position after `tailwindcss`).
3. **Imported `tw-animate-css` in `src/globals.css`** — placed as the **last** import (after the Google Fonts `@import url(...)` and `@import 'tailwindcss'`), **not** first as the brief literally said. See deviation note below.
4. **Created** `src/components/ui/dialog.tsx` and `src/components/ui/dropdown-menu.tsx` exactly per the brief's code, with one adjustment: dropped the unused `CheckIcon`, `ChevronRightIcon`, `CircleIcon` imports from `dropdown-menu.tsx` up front (the brief's own documented fallback, since these primitives aren't yet used and the base eslint config enforces `no-unused-vars`).
5. Ran the Step 6 smoke check (see below) — required building `create-icore` first, and correcting the brief's example command (it points at the wrong CLI entrypoint).
6. Ran prettier + lint per Step 7 — `client-shadcn` **does** have an inferred `lint` target (contradicts the brief's assumption that it might not); ran it, 0 errors.
7. Committed only `apps/templates/client-shadcn/` per Step 8.

## Deviation from brief: `tw-animate-css` import position

The brief said (Step 3): "add as the first import line, before the Google Fonts import". I implemented this literally first, then ran the Step 6 smoke check with the components actually imported/used, and found:

- Vite's CSS pipeline **inlines** local package imports (`tw-animate-css`, `tailwindcss`) but leaves the remote `@import url('https://fonts.googleapis.com/...)` as a literal `@import` for the browser to fetch at runtime.
- Because CSS spec requires `@import` statements to precede all non-import rules (except `@charset`/`@layer`), putting `tw-animate-css` first meant its inlined content became the first thing in the stylesheet, pushing the still-literal Google Fonts `@import` after non-import content.
- Lightning CSS (used by Vite's build optimizer) flagged this with a warning ("@import rules must precede all rules...") **and silently dropped the Google Fonts `@import` from the final production bundle** — verified by `grep`-ing the built CSS asset: with `tw-animate-css` first, `@import` was entirely absent from the output; with the font import first, it survived intact.
- Fix: reorder to `[font import, tailwindcss, tw-animate-css]`. Rebuilt and confirmed: no warning, font `@import` present in the bundled CSS, and `tw-animate-css` utility classes (`animate-in`, `fade-in-0`, `zoom-in-95`) are present in the output, confirming the animation package still loads correctly.

This is a real functional regression the brief's literal instruction would have shipped (custom font silently failing to load in every scaffolded project). Final `globals.css` order:
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
@import 'tailwindcss';
@import 'tw-animate-css';
```

## Smoke-check results (Step 6)

The brief's example command (`node tools/create-icore/dist/index.js ...`) is wrong — `dist/index.js` is the library export entrypoint (functions like `scaffold`, `validateOptions`), not the CLI. `package.json`'s `bin` field points to `dist/cli.js`. Using `index.js` silently no-ops (exit 0, no output, no directory created).

Also discovered (pre-existing, unrelated to this task): `parseFlags` in `tools/create-icore/src/lib/prompts.ts` mishandles boolean flags passed without `=` (`--no-git`, `--no-install`) — it always consumes the *next* argv token as a value even for flags that ignore it, so two bare boolean flags placed adjacently cause the second one to be silently swallowed and its prompt still fires interactively. Workaround: pass them as `--no-git=true --no-install=true`. Not fixed — out of scope for this task, flagging for awareness.

Commands actually run (after building the CLI):
```bash
yarn nx build create-icore
node tools/create-icore/dist/cli.js /tmp/icore-shadcn-check \
  --ui=shadcn --auth=none --db=none --upload=none --payment=none --jobs=none \
  --example=none --package-manager=yarn --no-install=true --no-git=true
cd /tmp/icore-shadcn-check && yarn install
yarn nx run client:vite:build   # target is vite:build, not build
```
Result:
- `components.json` present at `apps/client/components.json` in the scaffolded project.
- `dialog.tsx` and `dropdown-menu.tsx` present in `apps/client/src/components/ui/`.
- `tw-animate-css` and both radix deps present in the scaffolded `package.json`.
- Build succeeded, no warnings, no missing-module errors.
- Additionally added a temporary import/usage of `Dialog`/`DropdownMenu` in `apps/client/src/app/app.tsx` (throwaway, not committed) to confirm the components actually resolve and typecheck at the module-resolution level — `vite:build` succeeded with them wired in.
- `client:typecheck` failed, but on a pre-existing, unrelated issue (`/profile` route type mismatch in `apps/client/src/routes/_dashboard/dashboard.tsx`, generated by the router's typegen) — confirmed unrelated by inspection; not something introduced by this task's files.
- Cleaned up `/tmp/icore-shadcn-check` after the check.

## Lint / prettier results

```bash
npx prettier --write apps/templates/client-shadcn/components.json apps/templates/client-shadcn/package.json \
  apps/templates/client-shadcn/src/globals.css apps/templates/client-shadcn/src/components/ui/dialog.tsx \
  apps/templates/client-shadcn/src/components/ui/dropdown-menu.tsx
# → all formatted correctly (prettier reformatted dialog.tsx/dropdown-menu.tsx quote style + wrapping)

yarn nx lint client-shadcn
# → 0 errors, 1 pre-existing warning in src/main.tsx (no-non-null-assertion, unrelated to this task)
```

Note: the brief speculated `client-shadcn` might have no `lint` target since it's "a template dir excluded from the Nx project graph." That's incorrect — `yarn nx show projects` lists `client-shadcn` as a registered project with an inferred `lint` target (via `@nx/eslint/plugin`), so it ran normally.

## Files changed (committed in 7e2e661)

- `apps/templates/client-shadcn/components.json` (new)
- `apps/templates/client-shadcn/src/components/ui/dialog.tsx` (new)
- `apps/templates/client-shadcn/src/components/ui/dropdown-menu.tsx` (new, without the 3 unused icon imports)
- `apps/templates/client-shadcn/package.json` (added `tw-animate-css` dep)
- `apps/templates/client-shadcn/src/globals.css` (added `tw-animate-css` import, positioned last — deviation from brief, see above)

`tools/create-icore/templates/` was regenerated locally by `nx build create-icore` (it depends on `snapshot-templates`) to run the smoke check, but that directory is `.gitignore`d (confirmed via `git check-ignore`) — nothing there was staged or committed.

## Self-review findings

- Verified `dropdown-menu.tsx`'s exports match the brief's interface list exactly (`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel`).
- Verified `dialog.tsx`'s exports match the brief's interface list (plus `DialogOverlay`/`DialogPortal` which the brief's own code sample also exports, beyond the interface list — kept since the brief's code block is the literal source of truth and both are legitimately part of the standard shadcn Dialog set).
- Confirmed `cn` helper import path (`@/lib/utils`) matches the existing file at `src/lib/utils.ts:4`.
- No other files under `apps/templates/client-shadcn/` needed changes.

## Issues / concerns

1. **Deviation from brief** on `tw-animate-css` import position (documented above) — necessary to avoid a real production regression (Google Fonts silently dropped from the built CSS). Flagging in case the plan author wants to double check this reasoning.
2. **Brief's Step 6 example command is wrong** (points at `dist/index.js` instead of `dist/cli.js`). Not fixed since it's documentation in the plan file, not source, but worth correcting in the plan if it's reused for future tasks.
3. **Pre-existing CLI bug** in `parseFlags` (bare boolean flags without `=` swallow the next argv token) — out of scope, flagged for awareness only, not fixed.
4. **Pre-existing typecheck error** in scaffolded `client` project (`/profile` route type mismatch) — unrelated to this task's files, not fixed.
