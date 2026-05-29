---
'@idevconn/create-icore': patch
---

Stabilise the npm publish flow:

- `bin` is back to the explicit object form `{ create-icore: ./dist/cli.js }` so npm doesn't auto-rename it to a scoped key and then reject the path.
- `release.yml` passes `--access public` to `npx changeset publish` and turns off provenance attestation for now (the GitHub repo is private; npm requires a public source repo for sigstore provenance verification and returns E422 otherwise). Flip `NPM_CONFIG_PROVENANCE` back to `'true'` once the repo is public.
