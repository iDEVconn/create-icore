---
'@idevconn/create-icore': patch
---

Fix `notes-client` / `jobs-client` / `payment-client` / `firebase-admin` failing to build in a generated project under npm/pnpm.

These libs were generated with `module: commonjs` and no explicit `moduleResolution`, so TypeScript defaulted to classic `node10`, which cannot read a package's `exports` map. `@casl/ability@7` (and other modern packages) expose their type declarations only via `exports`, so compiling `@icore/shared`'s `ability.ts` through one of these libs failed with `TS7016: Could not find a declaration file for module '@casl/ability'`.

iCore's own `nx build` masked it (nx resolves `@icore/shared` to its built `.d.ts`), but a freshly scaffolded project — and a raw `tsc` — compiles the source and broke.

Aligned the four libs to `module: node16` + `moduleResolution: node16`, matching `shared` and the other client/strategy libs that were already correct. No runtime change; emit stays CommonJS.
