# Cloudflare Workers G0 measurement harness

Throwaway harness for gate G0 of `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md`.
It is **not** a Yarn workspace member: install and run it with `npm` from this folder.

```
npm install
npm run build        # tsc (decorator metadata) → build/, writes tsconfig.bundle.json
npm run dev          # wrangler dev --local --port 8787
npm run check:canary # proves implicit constructor injection survives the build
```

Results of the live measurement are in `RESULTS.md`.
