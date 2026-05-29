---
'@idevconn/create-icore': patch
---

Re-enable sigstore provenance attestation on the npm publish workflow now that the GitHub repo is public. Published versions from this changeset onward carry a verifiable provenance bundle linked to the GitHub Actions run that produced them.
