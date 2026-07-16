---
"@idevconn/create-icore": patch
---

Three polish fixes for error handling and replay protection: (1) wire-provider.ts's mergeJsonDeps/stripJsonKeys/stripTsconfigKeys now only swallow ENOENT (file legitimately absent in partial fixtures) instead of every error, so a malformed JSON or write failure surfaces instead of silently reproducing a missing-dep bug; (2) scaffold-strip.ts and scaffold-auth-none.ts's stripTsconfigPath functions now clean up trailing commas left by regex-based path stripping, preventing invalid JSON in tsconfig.base.json when the next function tries to parse it; (3) the auth MS's opt-in HMAC transport guard now includes a signed timestamp with a 30s clock-skew tolerance, so a captured valid signed request can no longer be replayed indefinitely — only within that window. Changes the wire format of signed TCP payloads (adds _ts alongside _sig); safe since gateway and auth MS are always scaffolded and deployed together.
