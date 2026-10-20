---
'@idevconn/create-icore': patch
---

Fix the repo lint that went red after the PnP dependency declarations: ignore peer-satisfying packages in `@nx/dependency-checks` and pin `@bull-board/ui` to the version of `@bull-board/api`, which removes the duplicate nested copy and the `as any` cast in `admin.module.ts`.
