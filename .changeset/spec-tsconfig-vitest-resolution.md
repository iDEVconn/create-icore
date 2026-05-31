---
'@idevconn/create-icore': patch
---

Fix `TS2792: Cannot find module 'vitest'` (and `TS5070`) when typechecking the generated gateway/microservice **test** configs.

The app `tsconfig.json` (the base that `tsconfig.spec.json` extends) set no `module`/`moduleResolution`, so the spec config fell back to classic resolution — which can't read vitest's `exports`-only type declarations, and is missing `experimentalDecorators` for the NestJS source the specs pull in. `tsc -p tsconfig.spec.json` (and the IDE) failed across `apps/api`, `apps/microservices/auth`, `apps/microservices/upload`; `nx test` masked it because vitest runs via esbuild, not `tsc`.

Each app `tsconfig.json` now carries the same NestJS compiler options as its build config (`module`/`moduleResolution: node16`, `experimentalDecorators`, `emitDecoratorMetadata`, `target: es2021`), so the spec config inherits a working setup and resolves vitest.

The scaffold smoke (Layer A) now also typechecks each app's `tsconfig.spec.json`, so this class of regression is caught before publish.
