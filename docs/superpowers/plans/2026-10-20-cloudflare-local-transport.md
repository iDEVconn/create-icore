# `local` in-process transport (PR 2 of the Workers phase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the gateway and a microservice talk through the unchanged `ClientProxy.send/emit` + `@MessagePattern/@EventPattern` code inside one process, selected with `X_TRANSPORT=local`.

**Architecture:** A `LocalServer` (a Nest `CustomTransportStrategy`) registers itself on a module-level bus keyed by the transport prefix (`AUTH`, `UPLOAD`, …); a `LocalClientProxy` (a Nest `ClientProxy`) looks the server up on that bus and invokes the registered handler. `buildTransport(prefix)` and `buildTransportMS(prefix)` return the matching options when `${prefix}_TRANSPORT=local`. Nothing user-visible changes: `create-icore` keeps rejecting `local` until PR 6.

**Tech Stack:** TypeScript, NestJS 11 (`@nestjs/microservices` `Server` and `ClientProxy`), RxJS, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md` (section "`local` transport"). A throwaway prototype exists at `docs/measurements/cloudflare-g0/src/local-transport.ts` and ran on a real Worker in the G0 measurement.

## Global Constraints

- Branch `feature/local-transport` from `dev`; PR `--base dev`; never merge; `gh pr list --state all --limit 10` first; a `.changeset/*.md` (`'@idevconn/create-icore': patch`).
- Code lives in `libs/shared` (`@icore/shared`, project `shared`); tests are `*.unit.test.ts` in `__tests__/`, Vitest, behaviour not implementation.
- `libs/shared` is env-free except `transport.ts`, which already reads `${prefix}_TRANSPORT`; keep that file the only place that does.
- The error a client sees for a failing handler must have the same shape as over TCP: the object Nest's exception filter produces, `{ status: 'error', message }`, so `AuthClientService`'s `rpcMessage(err)` keeps working.
- `ClientsModule` instantiates a `customClass` with `new customClass(options)`, so `LocalClientProxy`'s constructor takes `{ prefix: string }`, not a string.
- No change to any other transport's behaviour; `tools/create-icore` is untouched in this PR.
- Before commit: `npx prettier --write <touched files>` (specific files only), `yarn nx lint shared`, `yarn nx test shared`, `yarn nx build shared`; discard `tools/create-icore/templates/` drift last; `yarn.lock` unchanged (no new dependencies).

## Review Focus

- A client created before the server registers must still reach it (lookup happens per call, not at construction) (Task 1).
- Closing a server must remove it from the bus; a call afterwards fails with a clear error, not a hang (Task 1).
- A handler that never answers must be abortable with RxJS `timeout`, and unsubscribing must not leak (Task 1).
- Two prefixes must not see each other's handlers (Task 1).
- A global `APP_GUARD` of the microservice (like `HmacAuthGuard`) must still run over the local transport (Task 2).
- `buildTransport`/`buildTransportMS` must reject nothing for `local` and require no env beyond `${prefix}_TRANSPORT` (Task 2).

---

### Task 1: `LocalServer` and `LocalClientProxy`

**Files:**

- Create: `libs/shared/src/local-transport.ts`
- Test: `libs/shared/src/__tests__/local-transport.unit.test.ts`
- Modify: `libs/shared/src/index.ts` (export both classes)

**Interfaces:**

- Produces:
  - `class LocalServer extends Server implements CustomTransportStrategy { constructor(prefix: string) }` — `listen(cb)` registers on the bus under `prefix`, `close()` removes it; `on()` returns `this`; `unwrap()` returns `this`.
  - `class LocalClientProxy extends ClientProxy { constructor(options: { prefix: string }) }` — `connect()`/`close()` no-ops; `send`/`emit` resolve the server by `options.prefix` on every call.

- [ ] **Step 1: Write failing tests** in `local-transport.unit.test.ts`, each against a real Nest microservice (`NestFactory.createMicroservice(Module, { strategy: new LocalServer('T1') })` hosting a controller with `@MessagePattern` / `@EventPattern`) and a `new LocalClientProxy({ prefix: 'T1' })`: `send returns the handler result`; `send passes the payload and a context object to the handler`; `a thrown RpcException reaches the client as { status: 'error', message }`; `a plain Error reaches the client as an error` (assert it rejects, with a defined message); `emit invokes the @EventPattern handler`; `a pattern nobody handles rejects with a message naming the pattern and the prefix`; `a client created before the server starts reaches it once it listens`; `after server.close() a call rejects instead of hanging`; `two prefixes are isolated (handler of T1 is not reachable from a client of T2)`; `a handler that never answers is aborted by rxjs timeout(50) with TimeoutError`; `a handler returning an Observable that emits twice yields its first value to firstValueFrom`.
- [ ] **Step 2: Run** `yarn nx test shared -- local-transport` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `local-transport.ts` per the Interfaces: a module-level `Map<string, LocalServer>` bus; `LocalClientProxy.publish(packet, callback)` finds the server, gets `server.getHandlerByPattern(pattern)` (pattern strings are used as-is; non-strings go through `JSON.stringify`, matching `Server.getRouteFromPattern`), invokes `handler(packet.data, new BaseRpcContext([packet.pattern]))`, converts the result with `server.transformToObservable`, and maps `next/error/complete` to `callback({ response })`, `callback({ err })`, `callback({ isDisposed: true })`; `dispatchEvent(packet)` awaits the handler for event patterns; missing server or handler calls `callback({ err: new Error(...) })`. Export from `src/index.ts`.
- [ ] **Step 4: Run** `yarn nx test shared -- local-transport` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): in-process local transport (LocalServer, LocalClientProxy)`.

### Task 2: `buildTransport` / `buildTransportMS` support `local`

**Files:**

- Modify: `libs/shared/src/transport.ts`
- Test: `libs/shared/src/__tests__/transport.unit.test.ts` (extend the existing file if present, otherwise create it)

**Interfaces:**

- Consumes: `LocalServer`, `LocalClientProxy` (Task 1).
- Produces: with `${prefix}_TRANSPORT=local`, `buildTransport(prefix)` returns `{ customClass: LocalClientProxy, options: { prefix } }` and `buildTransportMS(prefix)` returns `{ strategy: <LocalServer for prefix> }`. No other env var is required.

- [ ] **Step 1: Write failing tests**: `buildTransport returns the local client options when X_TRANSPORT=local`; `buildTransportMS returns a LocalServer strategy for the same prefix`; `local needs no host, port or url env`; `an unknown transport still throws "Unknown transport: …"`; and an end-to-end test: `ClientsModule.registerAsync([{ name: 'AUTH_CLIENT', useFactory: () => buildTransport('E2E') }])` in one Nest module plus `NestFactory.createMicroservice(MsModule, buildTransportMS('E2E'))` with `process.env.E2E_TRANSPORT='local'` — a `send` round trip returns the handler's value and an `APP_GUARD` of the microservice (a guard that throws `RpcException('denied')` unless the payload has `ok: true`) runs: `{ ok: false }` rejects with `denied`, `{ ok: true }` succeeds.
- [ ] **Step 2: Run** `yarn nx test shared -- transport` — Expected: FAIL (`Unknown transport: local`).
- [ ] **Step 3: Implement** in `transport.ts`: a `case 'local'` returning the client options; in `buildTransportMS`, return `{ strategy: new LocalServer(prefix) }` when the kind is `local`, otherwise the existing cast. Keep `assertTransportEnv` requiring nothing for `local` (`transportKeys` already returns `[]` for unknown kinds — add an explicit `case 'local'` with a comment).
- [ ] **Step 4: Run** `yarn nx test shared -- transport` — Expected: PASS; then `yarn nx test shared` — Expected: whole suite PASS.
- [ ] **Step 5: Commit** `feat(shared): X_TRANSPORT=local in buildTransport and buildTransportMS`.

### Task 3: Docs, changeset and gates

**Files:**

- Modify: `AGENTS.md` (the "Transport wiring" bullet under "Env layering": add `local` as an in-process transport that only works when the gateway and the microservice run in the same process, i.e. the Cloudflare Workers host of the Workers phase; `create-icore` does not offer it yet)
- Create: `.changeset/local-transport.md`

- [ ] **Step 1:** edit `AGENTS.md`, add the changeset (`'@idevconn/create-icore': patch`, one line).
- [ ] **Step 2: Gates**: `npx prettier --write` on touched files, `yarn nx run-many -t lint test build -p shared create-icore --skip-nx-cache` green, then `git checkout -- tools/create-icore/templates` and confirm `git status` shows only the intended files.
- [ ] **Step 3: Commit** `docs: document the local transport and add the changeset`; then `gh pr list --state all --limit 10`, push, `gh pr create --base dev`, wait for CI, report. Do not merge. State in the PR that the transport is not live-tested on Cloudflare (its prototype ran on a real Worker in the G0 measurement).
