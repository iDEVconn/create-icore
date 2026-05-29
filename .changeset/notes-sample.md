---
'@idevconn/create-icore': minor
---

Notes sample feature demonstrating the full icore stack end-to-end: a notes microservice (single `DBStrategy`-backed collection), gateway CRUD with CASL ownership rules, and a `/_dashboard/notes` route in all three client templates with TanStack Query mutations + per-template UI (shadcn: custom Table/Dialog; antd: Table/Modal/Popconfirm; MUI: Table/Dialog/TablePagination). New `Note` type + ownership-scoped CASL rules in `@icore/shared`. Consumers boot the scaffold and immediately have a working CRUD demo to verify their auth/db wiring.
