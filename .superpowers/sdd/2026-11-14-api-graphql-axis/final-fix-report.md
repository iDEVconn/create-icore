# Final review fix wave (R19)

Status: DONE. Every item except one minor is fixed and tested; the skipped one is explained below. Branch `feature/api-graphql`, not pushed.

| Commit | Item |
|---|---|
| `74e42fd` fix(create-icore): pre-approve @apollo/protobufjs builds for pnpm | I1 |
| `43dcc3f` fix(api): validate note inputs in the shared notes service | I2 + paging clamp + mixed-document pin |
| `e679315` fix(create-icore): remove-notes drops the client GraphQL notes tests | I3 |
| `902dc01` fix(api): hide GraphQL schema hints from client errors in production | I4 |
| `e9b5e8f` fix(api): report fragment chains past the stack as a validation error | CostWalker minor |
| `e70ee8f` docs: GraphQL GET, per-field throttling and production hardening notes | docs minors + stale comment |

Verification:
- `yarn nx run-many -t lint test build`: 127/127 succeeded (after snapshot-templates).
- create-icore tsc 10 lib / 15 spec (unchanged).
- `tsc --noEmit` on `apps/api` app + spec: clean.
- `apps/api/schema.gql` and the shadcn codegen output: unchanged (drift commands exit 0), so no regeneration was needed.
- Tracked template drift restored; `.superpowers` not committed.

## I1 pnpm: `@apollo/protobufjs`
- Added to `allowBuilds` in `scaffold-pkg.ts`. The package has a `postinstall` script (checked in node_modules).
- Test in `scaffold-pnpm-workspace.unit.test.ts`: RED (1 failed) → GREEN.

## I2 notes input validation (`NotesGatewayService`, shared by REST and GraphQL)
- **update:** forwards only string `title`/`body`; a patch with no string field throws `BadRequestException` (400). Validation runs before the ability check, so invalid input on another user's note answers 400, not 403; no existence is revealed.
- **create:** requires string `title` and `body` (400 otherwise).
- **Paging:** a negative `limit` is clamped to 1 (`Math.max(1, Math.min(100, …))`).
- **Unit tests** in `notes-gateway.service.unit.test.ts` cover null, missing and number on create; empty, all-null and non-string patches on update; string-only forwarding; the negative limit. RED: 8 failed → GREEN.
- **Integration test:** `updateNote(id, input: { title: null })` returns HTTP 400 BAD_USER_INPUT, `notes.update` is not called, and the list still returns the original title. RED → GREEN.
- **REST:** the controller uses the same service. All 236 api tests pass, the existing controller tests unchanged. REST behaviour changes only for invalid input: 400 instead of persisting nulls or non-strings.
- **Mixed-document pin** (`{ health { status } ping }` without a session → 401, `data` null, resolver not run): added, and it passes without any code change, as the review expected. The original single-field test stays.

## I3 remove-notes
- The script also removes `apps/client/src/queries/__tests__/notes.unit.test.ts` (the swapped GraphQL hook test) and `apps/client/src/graphql/__tests__/operation.unit.test.ts` (it parses `notes.graphql`).
- New tests: real scaffolds for rest+shadcn, graphql+shadcn, graphql+antd and both+mui, then `removeNotesFiles`; assert no dangling relative import under `apps/client/src`. `routeTree.gen.ts` is skipped because the router plugin regenerates it.
- RED on the two graphql projects, showing exactly the three dangling imports → GREEN (9/9).

## I4 `hideSchemaDetailsFromClientErrors`
- Verified: `@nestjs/apollo` spreads its options into `new ApolloServer({... ...options})` (`apollo-base.driver.js`), and `@apollo/server` 5 supports the option.
- Set to `production` in `graphqlOptions`.
- Tests:
  - production: `{ pong }` gives 400 with no "did you mean" and no mention of `ping`. RED → GREEN.
  - development control: the same query suggests `"ping"`, so the production test cannot pass vacuously.

## Minors
- **CostWalker overflow:** a stack overflow during the cost walk is caught and reported as a GraphQL validation error, "Query is too deeply nested to validate." (HTTP 400).
  - Unit test: a 2500-fragment single-spread chain (about 90 kB, under Express's 100 kB body limit). RED with the old walker (RangeError thrown) → GREEN.
  - Limit of the fix: graphql's own `specifiedRules` also overflow at about 20 000 fragments. That cannot reach the server (body limit), and it is outside our rule.
- **Docs** (`docs/runbooks/graphql-api.md`, AGENTS.md API-style bullet):
  - "every operation is POST" is reworded. The client sends POST, CSRF is required on every POST, a GET query runs only with Apollo's preflight header and a session (CsrfGuard skips safe methods), and mutations over GET get 405.
  - New line: the per-resolver throttler guard counts each root field separately.
  - Hidden schema suggestions and the deep-chain 400 are mentioned.
- **Stale comment** in `note.model.ts:4-5` ("runs under tsx") replaced.
- **Negative paging clamp:** done (see I2).
- **Unmapped errors → HTTP 500: skipped.** The status comes from Apollo, not from `formatError`. Changing it needs a `willSendResponse` plugin that rewrites the HTTP status, which also changes partial-data responses (one failing field next to successful ones). That is not a simple, contained change for this wave; candidate follow-up.

## Not in this wave (owner report)
These are the review's non-blocking follow-ups:
- CI gaps: graphql ui=none and auth=none combos, a nightly real round trip, generated-project drift check.
- The Task 2 `@Optional` shim.
- Storage prefix traversal (pre-existing).
- The missing `PATCH /profile` endpoint.
- The auth.callback orphan.
- The api-client's 404 `/auth/refresh` attempt.
