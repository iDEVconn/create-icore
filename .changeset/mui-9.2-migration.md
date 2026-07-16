---
"@idevconn/create-icore": patch
---

Bump the mui client template's `@mui/material`/`@mui/icons-material` from v6.5.0 to v9.2.0 (MUI skipped v8 entirely — the published sequence jumps straight from 7.3.11 to 9.0.0). The template has no `Grid`/`slotProps`/`componentsProps` usage, so the only required change was renaming 3 icon imports whose un-suffixed "Outline" aliases were removed as duplicates of the "Outlined" versions: `CheckCircleOutline`→`CheckCircleOutlined`, `PersonOutline`→`PersonOutlined`, `MailOutline`→`MailOutlined`. React 19/TypeScript 5.9/Emotion 11.14 already exceed v9's peer-dependency floor.
