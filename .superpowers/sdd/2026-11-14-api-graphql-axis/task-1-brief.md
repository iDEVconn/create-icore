### Task 1: Context-neutral request access (all modes)

**Files:**

- Create: `apps/api/src/app/http/execution-context.ts`, `apps/api/src/app/http/current-user.decorator.ts`, `apps/api/src/app/http/context-aware-throttler.guard.ts`
- Modify: `apps/api/src/app/auth/auth.guard.ts`, `apps/api/src/app/http/csrf.guard.ts`, `apps/api/src/app/abilities/ability.guard.ts`, `apps/api/src/app/auth/auth.module.ts` (APP_GUARD `ThrottlerGuard` -> `ContextAwareThrottlerGuard`)
- Test: `apps/api/src/app/http/__tests__/execution-context.unit.test.ts`, extend `csrf.guard.unit.test.ts`, `ability.guard.unit.test.ts`, add an `AuthGuard` graphql-context case

**Interfaces:**

- Produces: `requestOf<R extends object = Request>(ctx: ExecutionContext): R` (http: `switchToHttp().getRequest()`; any other type: `ctx.getArgByIndex(2).req`, i.e. the GraphQL context, without importing `@nestjs/graphql`); `responseOf<R extends object = Response>(ctx): R`; `CurrentUser: () => ParameterDecorator` resolving `VerifiedToken | undefined` from `requestOf(ctx).user`; `class ContextAwareThrottlerGuard extends ThrottlerGuard` overriding `protected getRequestResponse(ctx: ExecutionContext): { req: Record<string, any>; res: Record<string, any> }`.

- [ ] **Step 1: Write failing tests.** `execution-context.unit.test.ts`: (a) `requestOf` on an http context stub (`getType: () => 'http'`, `switchToHttp: () => ({ getRequest: () => req })`) returns `req`; (b) on `{ getType: () => 'graphql', getArgByIndex: (i) => i === 2 ? { req, res } : undefined }` returns `req`, `responseOf` returns `res`. In `csrf.guard.unit.test.ts` add: graphql-type context with `req.method === 'POST'` and no token -> throws `ForbiddenException('csrf_mismatch')`; with a valid token (reuse the existing helper) -> `true`. In `ability.guard.unit.test.ts`: graphql-type context, user without the rule -> `ForbiddenException`. In an `AuthGuard` test: graphql-type context without a session cookie -> `UnauthorizedException('missing_session')`. `context-aware-throttler.guard.unit.test.ts`: `getRequestResponse` returns `{ req, res }` for an http stub and for a graphql stub (`getArgByIndex(2)`).
- [ ] **Step 2: Run** `yarn nx test api -- execution-context csrf.guard ability.guard auth.guard` -> FAIL (module missing / `switchToHttp` is not a function on the graphql stub).
- [ ] **Step 3: Implement** the three files and switch the three guards to `requestOf`. `ContextAwareThrottlerGuard.getRequestResponse` returns `{ req: requestOf(ctx), res: responseOf(ctx) }`.
- [ ] **Step 4: Run** the same command plus `yarn nx test api` -> PASS (all existing api tests unchanged).
- [ ] **Step 5: Commit** `refactor(api): make guards independent of the execution-context type`.

