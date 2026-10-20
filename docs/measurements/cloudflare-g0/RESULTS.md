# Cloudflare Workers G0 results

Status: **not yet run against a real account** (filled in by Task 5 of
`docs/superpowers/plans/2026-10-20-cloudflare-g0-measurement.md`).

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
- Account plan: _to fill_ · Colo(s) seen: _to fill_ · Date: _to fill_ · `wrangler` version: _to fill_

## Local functional run (workerd via `wrangler dev`, 2026-10-20) — not authoritative

All checks pass: `check-canary`, `check-slice`, `check-probes`. Bundle: 6341 KiB upload / 1193 KiB
gzip / 6.19 MiB uncompressed (`wrangler deploy --dry-run`). Warm local wall times for
`GET /api/profile` are about 4-10 ms and a Durable Object round trip about 3 ms inside the Worker, but
local numbers say nothing about cold starts, CPU limits or network.

## Live results

_to fill by `node scripts/measure.mjs …` (table below is its output)_

| Check | Value | Threshold | Result |
| ----- | ----- | --------- | ------ |

Raw numbers per cold run, the warm summaries and the Free-plan finding go here.

## Free-plan feasibility

_to fill: does a cold request and a warm `GET /api/profile` fit the Free plan's 10 ms CPU?_

## Durable Object usage of one login → profile → logout flow

_to fill_

## Decision

_to fill: `G0 PASS`, or `G0 FAIL (<threshold>)` with the spec's Hono-gateway contingency noted._
