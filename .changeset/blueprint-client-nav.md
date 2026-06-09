---
'@idevconn/create-icore': minor
---

Client sidebar nav is now config-driven: each LayoutSider (shadcn/antd/mui) renders a shared nav.config.ts via a per-UI icon map, and the generator writes nav.config.ts from a base + chosen features' clientNav (notes). The regex removeNotesClientTail is deleted (the last sidebar source-surgery / StickyNote bug class); notes i18n keys are kept unconditionally (harmless unused strings). This also unifies the notes nav label on `nav.notes` across all three UIs.
