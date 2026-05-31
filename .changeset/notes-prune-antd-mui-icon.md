---
'@idevconn/create-icore': patch
---

Fix dangling client-nav icon after `--example=none`. `removeNotesStack` stripped the notes nav from `LayoutSider` using hardcoded `to="/_dashboard/notes"` matches, so once the link targets moved to the pathless `/notes` the prune missed the nav block while still removing the icon import — leaving a dangling `FileTextOutlined` (antd), `StickyNote` (shadcn) or `NoteOutlinedIcon` (mui). The matches are now path-agnostic (`/_dashboard/notes` or `/notes`) and the antd entry is matched by a regex rather than a brittle exact string, so the icon import and the nav block are removed together across all three UI variants.
