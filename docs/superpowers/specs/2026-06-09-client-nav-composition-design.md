# Client — Config-Driven Nav Composition — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design) — pending implementation plan
**Owner:** create-icore (`tools/create-icore`)
**Builds on:** blueprint generator migration (providers + features F1 done).

## Problem

`removeNotesClientTail` (`tools/create-icore/src/lib/scaffold-strip.ts`) regex-edits
each of the three UI sidebars + the shared i18n keys to drop the notes nav entry
when `example=none`. This is the original **"bug class D"** (the `StickyNote` /
`FileTextOutlined` / `NoteOutlinedIcon` regex) — drift-prone across three
structurally different `LayoutSider.tsx` (shadcn `NAV_ITEMS` array, antd `Menu`
items, mui `ListItemButton`s) plus an i18n-block regex. There is also a latent
inconsistency: shadcn labels notes via `nav.notes`, antd/mui via `notes.title`.

## Decision

Make the client nav **config-driven + additive**. A single shared, UI-agnostic
`nav.config.ts` lists nav items (`route` / `labelKey` / `iconName` / `exact`); each
`LayoutSider` is refactored to read it and render per-UI via a local icon-map. The
generator writes `nav.config.ts` from a base (dashboard + profile) plus the
`clientNav` contribution of chosen features (notes). No regex on sidebars. The
notes i18n keys are **kept always** (unused translation strings are harmless — no
orphan), so the i18n strip is deleted outright with no additive machinery.
`removeNotesClientTail` is deleted.

## §1 `nav.config.ts` + manifest `clientNav`

Shared, committed `libs/template-shared/src/lib/nav.config.ts`:

```ts
export interface NavItem {
  to: string;
  labelKey: string;
  iconName: 'dashboard' | 'notes' | 'profile';
  exact?: boolean;
}

export const NAV_CONFIG: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', iconName: 'dashboard', exact: true },
  { to: '/notes', labelKey: 'nav.notes', iconName: 'notes' },
  { to: '/profile', labelKey: 'nav.profile', iconName: 'profile' },
];
```

(iCore's committed version includes notes — the demo. The generator overwrites it.)

Redefine `Unit.clientNav` (currently `{ route; navEntry }`) to:

```ts
  /** Contribution to the generated client nav.config.ts (one entry). */
  clientNav?: { route: string; labelKey: string; iconName: string; exact?: boolean };
```

Populate `MANIFEST.feature.notes.clientNav = { route: '/notes', labelKey: 'nav.notes', iconName: 'notes' }`.

## §2 Config-driven `LayoutSider` (×3) + per-UI icon map

Each sidebar becomes static + data-driven. It imports `NAV_CONFIG` and a local
icon map (`Record<NavItem['iconName'], <UI icon>>`), then renders its own structure:

- **shadcn:** `NAV_CONFIG.map` → `<Link>` with `ICONS[iconName]` (lucide component).
- **antd:** `NAV_CONFIG.map` → `MenuProps['items']` with `ICONS[iconName]` (antd JSX); `selectedKey` derived from `pathname` against the config routes.
- **mui:** `NAV_CONFIG.map` → `<ListItemButton>` list with `ICONS[iconName]` (mui component).

The nav **structure** stays per-UI (different component trees); only the nav
**data** is unified. All three use `labelKey` (`nav.dashboard`/`nav.notes`/
`nav.profile`) — fixing the `nav.notes` vs `notes.title` inconsistency.

## §3 i18n — stop stripping

The notes page i18n block (`notes: {...}`) and `nav.notes` stay in
`libs/template-shared/src/lib/i18n/keys.ts` **unconditionally**. When notes is off,
they're unused translation strings — harmless (no orphan import, negligible bundle
cost). The i18n-block regex in `removeNotesClientTail` is deleted; no additive
i18n machinery is needed. Pruning the nav **entry** (so no dead `/notes` link → 404) is handled by §1's generated `nav.config.ts`, not by touching i18n.

## §4 What changes in the generator

- New `writeNavConfig(targetDir, opts)`: writes `nav.config.ts` = base
  (`dashboard`, `profile`) + chosen features' `clientNav` (notes when
  `example=notes`). Same additive shape as `writeFeaturesWiring`.
- `scaffold.ts`: call `writeNavConfig` (always); **delete** the
  `removeNotesClientTail` call.
- `scaffold-strip.ts`: **delete** `removeNotesClientTail`.
- notes route/queries/components removal stays via `MANIFEST.feature.notes.libDirs`
  (`cleanupUnusedFeatures`, safe file `rm` — not regex).

After this, `scaffold-strip.ts` retains only `removeUploadStack`,
`removeFirebaseAdminLib`, helpers (`stripDeps`/`stripTsconfigPath`). All
provider/feature/nav source-surgery is gone.

## §5 Testing

- **Unit:** `writeNavConfig` — assert generated `nav.config.ts` contains the notes
  entry when `example=notes` and omits it when `none` (base = dashboard+profile).
- **Component sanity:** each refactored `LayoutSider` renders the config (covered by
  build + existing client tests; the icon map must include every `iconName`).
- **Integration / audit:** headless-generate `example=notes` and `example=none` →
  `nav.config.ts` has/omits notes; no `/notes` link when off; `AUDIT OK`; sidebars
  never regex-edited.
- **CI smoke matrix:** existing combos exercise example on/off across all 3 UIs.

## Out of scope

- Pure-additive copy of notes route/queries/components (kept as safe `libDirs`
  `rm`).
- Transport axis (§8) and `blueprint.json` (§10).
