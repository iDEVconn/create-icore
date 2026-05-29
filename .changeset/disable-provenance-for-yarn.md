---
'@idevconn/create-icore': patch
---

Disable npm provenance attestation in release workflow. Provenance triggers npm's quarantine flag on the `latest` tag, which yarn 4 strictly enforces — making `yarn create @idevconn/icore` fail for 30-60 min after every publish until npm's transparency log replicates. Without provenance there is no quarantine, so all package managers (npm / yarn / pnpm / bunx) work immediately after release. Re-enable when npm + yarn align on quarantine UX.
