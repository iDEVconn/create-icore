# SDD ledger — plan: docs/superpowers/plans/2026-10-03-session-store-memory.md
Spec: docs/superpowers/specs/2026-10-03-session-store-memory-design.md (read).
Pre-flight: T1→T2 InMemorySessionStore (+close/size) consumed by sessionStoreProvider — match. T3→T4 CreateIcoreOptions.session consumed by writeGatewayEnv/rewriteComposeSession — match. T4→T5 smoke-scaffold.mjs session arg — match. No conflicts.
Task 1: Ruling: the plan's sweep test used sweepIntervalMs=1000 with fake timers over 31 days (~2.7M ticks, 5 s timeout) — use a 1-day interval; also added a test that deleteAllForUser omits an expired record — cost if wrong: test-only.
Task 1: complete (commits 9a996fa..1284262, tests: yarn nx run-many -t lint test build -p shared →   Recoverable time:  <1ms)
Task 2: complete (commits 1284262..3bae608, tests: yarn nx run-many -t lint test build -p api →   Recoverable time:  <1ms)

## Final whole-branch review (independent)
- Critical: `--session=memory` + nats/mqtt/rmq/kafka + no bullmq produced an invalid compose (bare `depends_on:`) — fixed, regression test per broker.
- Important: `InMemorySessionStore.withRefreshLock` lost single-flight after a waiter timeout — fixed, regression test (red without the fix).
- Minors fixed: config example in create-icore README, smoke log line shows `session=`, comment on the missing holder TTL. Recorded as rulings in the spec: `.env.docker.example` unchanged; nightly combo is a no-crash check, not a no-Redis-contact proof.
- Not from this branch (left alone): triple blank lines after compose service removal; `payment` compose service survives `--payment=none`; `local-docker.md` broker-transport depends_on wording.
