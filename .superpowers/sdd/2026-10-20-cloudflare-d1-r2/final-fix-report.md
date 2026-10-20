# Final fix wave report

- F1: d1-client.ts adds MAX_RETRY_AFTER_MS=30_000; a numeric Retry-After above the cap on 429/503 falls through to the normal D1ApiError path (no sleep, no retry). Body released via `res.body?.cancel().catch(() => undefined)` before retry. RED: new test "fails fast ... exceeds the cap" failed (59 tests, 1 failed); GREEN: 59/59. Retry-After 30 still sleeps 30000.
- F2: runbook rate-limit line replaced (1,200 req/5 min, URL, fail-fast >30 s, viability sentence); AGENTS.md D1 Gotchas clause added. No other "none documented" wording remains.
- F3: runbook "Verification status" section added. r2-s3-client.ts passes requestChecksumCalculation/responseChecksumValidation 'WHEN_REQUIRED' (option names accepted by installed typings, no discrepancy). Test inspects `spy.mock.contexts[0].config.*()` of the client built by the factory. RED: failed (31 tests, 1 failed); GREEN: 31/31.
- F4: runbook step 3 reworded; AGENTS.md MinIO step 1 and MIME-allowlist sentence fixed.
- Lint initially flagged no-this-alias / no-empty-function; fixed. `nx run-many -t lint build test -p db-d1 storage-r2` green. Prettier run on touched files.
