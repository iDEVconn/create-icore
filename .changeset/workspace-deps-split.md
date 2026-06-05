---
"@idevconn/create-icore": patch
---

fix(deps): isolate optional app deps into workspace package.json files

Each optional app (jobs, notes, payment MSes; antd/mui/shadcn client templates) now
declares only its own runtime deps in a dedicated package.json. Removed 24 orphaned deps
from the root package.json that were always installed regardless of user choices.
Also adds missing workspace globs for apps/microservices/*, apps/templates/*,
libs/db-strategies/* and fixes GATEWAY_SERVICES baseline.
