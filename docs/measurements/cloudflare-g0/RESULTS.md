# Cloudflare Workers G0 results

Status: **run against a real Workers Paid account on 2026-10-20** (Task 5 of
`docs/superpowers/plans/2026-10-20-cloudflare-g0-measurement.md`). Verdict: **G0 FAIL on one threshold (Durable Object round trip)**; every Nest-viability threshold passes. See Decision.

Gate G0 of `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md`: can a Nest gateway
plus in-isolate microservice run on a deployed Worker within the platform limits and acceptable
latency?

## Thresholds (assistant's calls, adjustable by the requester)

| Check                                                                     | Threshold                              |
| ------------------------------------------------------------------------- | -------------------------------------- |
| Reported `Worker Startup Time`                                            | ≤ 400 ms (platform hard limit 1000 ms) |
| Slowest of ≥ 5 cold first requests (client wall time, fresh version each) | ≤ 2000 ms                              |
| Warm `GET /api/profile` CPU, p99 (from `wrangler tail`)                   | ≤ 30 ms                                |
| Warm Durable Object round trip, p95 (measured inside the Worker)          | ≤ 40 ms                                |
| Uncompressed bundle                                                       | ≤ 10 MiB                               |

## Setup

- Harness: `docs/measurements/cloudflare-g0/` (gateway slice with the real `AuthController`,
  `AuthGuard`, `CsrfGuard`, `ThrottlerGuard`, `SessionModule` (memory), `AbilitiesModule`,
  `ProfileModule`, the real auth microservice `AppModule` in the same isolate over an in-process
  transport). Substitutions: see `README.md`.
- Account plan: Workers Paid · Colo seen: TLV (client in Israel) · Date: 2026-10-20 · `wrangler` 4.151.2 · compatibility date 2026-10-01 + `nodejs_compat`

## Local functional run (workerd via `wrangler dev`, 2026-10-20) — not authoritative

All checks pass: `check-canary`, `check-slice`, `check-probes`. Bundle: 6341 KiB upload / 1193 KiB
gzip / 6.19 MiB uncompressed (`wrangler deploy --dry-run`). Warm local wall times for
`GET /api/profile` are about 4-10 ms and a Durable Object round trip about 3 ms inside the Worker, but
local numbers say nothing about cold starts, CPU limits or network.

## Live results

Command: `node scripts/measure.mjs --url <worker> --cold-runs 5 --warm-requests 200 --config wrangler.deploy.jsonc --creds <file>`
(single keep-alive connection, so every request reaches the same isolate; see "Method notes").

| Check                                          | Value    | Threshold | Result   |
| ---------------------------------------------- | -------- | --------- | -------- |
| Worker Startup Time (max of 5 deploys)         | 187.0 ms | ≤ 400 ms  | PASS     |
| Slowest cold first request (wall)              | 347.0 ms | ≤ 2000 ms | PASS     |
| Warm `GET /api/profile` CPU p99                | 1.0 ms   | ≤ 30 ms   | PASS     |
| Warm Durable Object round trip p95 (in Worker) | 88.0 ms  | ≤ 40 ms   | **FAIL** |
| Uncompressed bundle                            | 6.2 MiB  | ≤ 10 MiB  | PASS     |

Raw numbers:

- Worker Startup Time per deploy: 113, 95, 187, 84, 96 ms (all deploys of this harness: 75-187 ms).
- Cold first request, client wall time (fresh version and fresh TLS connection per run): 347, 332, 320, 321, 340 ms; the warm request right after took 9-13 ms. CPU of the cold first request (from `wrangler tail`): 75, 67, 71, 74, 71 ms (this includes bootstrapping the gateway and the auth microservice).
- Warm `GET /api/profile` (real `ThrottlerGuard` + `AuthGuard` + `CsrfGuard`), 200 requests, all HTTP 200: client wall p50 7.9 ms, p95 19.7 ms, p99 42.6 ms. CPU: only 7 events were captured by `wrangler tail` (it samples under load), all 0-1 ms, so the CPU p99 is indicative, not statistical.
- Durable Object round trip, 200 requests, all HTTP 200: measured inside the Worker min 76, p50 81, p95 88, p99 270, max 483 ms; client wall p50 90.2 ms, p95 105.1 ms. A fresh object's first call takes 0.8-1.0 s.
- Durable Object location hints (`me`, `eeur`, `weur`, none) made no difference: 73-83 ms p50 for fresh objects.
- D1 binding from the same Worker: about 72 ms per statement (three sequential statements took 208-333 ms).
- Bundle: 6341 KiB upload / 1194 KiB gzip / 6.19 MiB uncompressed.

## Free-plan feasibility

**No.** A cold first request costs about 70 ms of CPU (67-75 ms over five runs), against the Free plan's
10 ms per invocation, because the first request bootstraps two Nest applications. A warm
`GET /api/profile` is about 1 ms and would fit. Bootstrapping in global scope (outside the
per-request budget but inside the 1 s startup limit) was not tested; the reported startup time
(75-187 ms) only covers the lazy-bootstrap design, so that variant remains unmeasured.

## Durable Object usage of one login → profile → logout flow

Not measured: the harness keeps sessions in memory, so the flow makes no Durable Object requests.
In the design every authenticated request is one Durable Object request (plus one for login and
logout), so the cost model in the spec's Sessions section applies unchanged.

## Method notes and platform findings

- On a deployed Worker `process.env.NODE_ENV` is forced to `production` (the `NODE_ENV` var shows up
  only on the binding), so the repo's own `buildStrategyWithFallback` refuses the fake auth strategy.
  The harness replaces it at bundle time (`define`); a real deployment needs real Supabase
  credentials and a real session store.
- Nest's default `abortOnError` makes a failed bootstrap call `process.exit(1)`; Workers reports
  "Canceling the request" and a memoized bootstrap promise then stays pending forever, hanging every
  later request. Use `abortOnError: false` and clear the memoized promise on failure.
- State in an isolate's memory (fake auth users, the memory session store, the throttler counters)
  is not shared between isolates, and separate client connections can reach different isolates
  (`register` answered `user_exists` while `login` answered `invalid_credentials`). The measurement
  therefore uses one keep-alive connection. This is the concrete reason the session store and the
  throttler storage need Durable Objects (PR 3).
- A fresh `workers.dev` subdomain needs several minutes before TLS works.
- `wrangler tail` output is pretty-printed JSON objects, not one object per line.
- In `apps/api` both named throttlers (`auth-burst`, `ai-burst`, 10 requests/minute) apply to every
  route (nothing uses `@SkipThrottle`), and `AuthController` carries a class-level
  `@Throttle` of 10/minute; on workerd the real `ThrottlerGuard` answered 429 on the 11th request of
  an unrelated route. Probably a bug of the application, unrelated to Workers.

## Decision

**G0 FAIL on the Durable Object round-trip threshold (p95 88 ms > 40 ms).** Not rounded: the
threshold failed.

What the failure means: every Nest-viability criterion passes (startup 75-187 ms, cold first
request 347 ms at most, warm CPU about 1 ms, bundle 6.2 MiB, real guards and a microservice in the
same isolate work, decorator metadata survives the build). The failing number is geography: from a
Worker in the TLV colo, Durable Objects and D1 are each about 70-80 ms away, and location hints did not
change that. The Hono-gateway contingency in the spec addresses Nest viability and would not fix this.
Choices for the requester (none implemented): (a) accept about 80 ms per authenticated request for
users in Israel; (b) a short per-isolate session read cache, which trades revocation immediacy
for latency; (c) signed stateless session cookies with a Durable Object check only for sensitive
operations; (d) test Smart Placement, which was not tried. Users in regions close to the Durable
Object region were not measured.
