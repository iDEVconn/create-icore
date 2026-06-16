---
'@idevconn/create-icore': minor
---

feat(scaffold): replace removeAuthStack regex with blueprint-driven auth=none

New `scaffold-auth-none.ts` handles auth=none via additive overlay rather than regex
source-surgery: auth-only paths are deleted, auth-none file variants (14 files across
3 UI templates) are written directly — no string replacement, no pattern matching.
Gateway .env AUTH\_\* filtering moved to writeGatewayEnv. removeAuthStack deleted.
