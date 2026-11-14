import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Field, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AuthClientService } from '@icore/auth-client';
import { InMemorySessionStore } from '@icore/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthGuard } from '../../auth/auth.guard';
import { ContextAwareThrottlerGuard } from '../../http/context-aware-throttler.guard';
import { CsrfGuard } from '../../http/csrf.guard';
import { throttlerOptions } from '../../http/throttler.config';
import { SESSION_STORE } from '../../session/session-store.provider';
import { ApiGraphqlModule } from '../graphql.module';

// A real Nest app with the gateway's real guards (session, CSRF, throttle) in front of
// /api/graphql. Only the session store (in memory) and the auth microservice client (never
// called: sessions are fresh, so no refresh) are stand-ins.

let calls = 0;

@ObjectType()
class TreeNode {
  @Field(() => String)
  id!: string;

  @Field(() => TreeNode)
  child!: TreeNode;
}

function tree(): TreeNode {
  const node = { id: 'n' } as TreeNode;
  node.child = node; // infinitely deep, so only the depth limit stops a query
  return node;
}

@Resolver()
class ThrowawayResolver {
  @Query(() => String)
  ping(): string {
    calls++;
    return 'pong';
  }

  @Query(() => TreeNode)
  tree(): TreeNode {
    calls++;
    return tree();
  }

  @Query(() => String)
  boom(): string {
    throw new Error('boom');
  }

  @Query(() => String)
  forbidden(): string {
    throw new ForbiddenException('nope');
  }

  @Query(() => String)
  missing(): string {
    throw new NotFoundException('note_not_found');
  }

  @Mutation(() => String)
  touch(): string {
    calls++;
    return 'touched';
  }
}

@Controller('rest')
class RestController {
  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('rest_nope');
  }
}

const CSRF = 'a'.repeat(64);

interface Booted {
  app: INestApplication;
  base: string;
  sessionId: string;
}

// NODE_ENV is pinned while the app is built and started: `nx test` loads the root .env, and any
// value but `test`/`production` would make ApiGraphqlModule write this throwaway schema to disk.
async function boot(nodeEnv: 'test' | 'production'): Promise<Booted> {
  const previous = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = nodeEnv;
  try {
    return await bootApp();
  } finally {
    process.env['NODE_ENV'] = previous;
  }
}

async function bootApp(): Promise<Booted> {
  const store = new InMemorySessionStore();
  const session = await store.create({
    uid: 'u1',
    email: 'u1@example.com',
    role: 'user',
    providerAccessToken: 'at',
    providerRefreshToken: 'rt',
    providerAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [ApiGraphqlModule, ThrottlerModule.forRoot(throttlerOptions)],
    controllers: [RestController],
    providers: [
      ThrowawayResolver,
      { provide: SESSION_STORE, useValue: store },
      { provide: AuthClientService, useValue: {} },
      { provide: APP_GUARD, useClass: ContextAwareThrottlerGuard },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  return { app, base: await app.getUrl(), sessionId: session.sessionId };
}

interface GqlResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

async function send(
  b: Booted,
  body: unknown,
  opts: { session?: boolean; csrf?: boolean } = {},
): Promise<GqlResult> {
  const { session = true, csrf = true } = opts;
  const cookies = [`icore_csrf=${CSRF}`];
  if (session) cookies.push(`icore_sid=${b.sessionId}`);
  const res = await fetch(`${b.base}/api/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookies.join('; '),
      ...(csrf ? { 'x-csrf-token': CSRF } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep the raw text
  }
  return { status: res.status, body: parsed };
}

function nested(depth: number): string {
  // `{ tree { id } }` has depth 2; every extra level adds a `child`.
  let inner = 'id';
  for (let i = 2; i < depth; i++) inner = `child { ${inner} }`;
  return `{ tree { ${inner} } }`;
}

describe('ApiGraphqlModule over HTTP (non-production)', () => {
  let b: Booted;

  beforeAll(async () => {
    b = await boot('test');
  });

  afterAll(async () => {
    await b.app.close();
  });

  beforeEach(() => {
    calls = 0;
  });

  it('answers HTTP 401 UNAUTHENTICATED without a session cookie', async () => {
    const r = await send(b, { query: '{ ping }' }, { session: false });
    expect(r.status).toBe(401);
    expect(r.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(r.body.errors[0].extensions.http).toBeUndefined();
    expect(calls).toBe(0);
  });

  it('answers HTTP 403 FORBIDDEN without the CSRF header, even for a query', async () => {
    const r = await send(b, { query: '{ ping }' }, { csrf: false });
    expect(r.status).toBe(403);
    expect(r.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(r.body.errors[0].message).toBe('csrf_mismatch');
    expect(calls).toBe(0);
  });

  it('runs the operation with a session and the CSRF header', async () => {
    const r = await send(b, { query: '{ ping }' });
    expect(r.status).toBe(200);
    expect(r.body.data.ping).toBe('pong');
    expect(calls).toBe(1);
  });

  it('maps a ForbiddenException thrown by a resolver to HTTP 403 FORBIDDEN', async () => {
    const r = await send(b, { query: '{ forbidden }' });
    expect(r.status).toBe(403);
    expect(r.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(r.body.errors[0].message).toBe('nope');
  });

  it('maps a NotFoundException thrown by a resolver to HTTP 404 NOT_FOUND', async () => {
    const r = await send(b, { query: '{ missing }' });
    expect(r.status).toBe(404);
    expect(r.body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(r.body.errors[0].message).toBe('note_not_found');
  });

  it('never executes a mutation sent as GET, even with a session', async () => {
    const res = await fetch(
      `${b.base}/api/graphql?query=${encodeURIComponent('mutation{touch}')}`,
      {
        headers: {
          cookie: `icore_sid=${b.sessionId}; icore_csrf=${CSRF}`,
          'x-csrf-token': CSRF,
          'apollo-require-preflight': 'true',
        },
      },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(calls).toBe(0);
  });

  it('rejects a GET query without a preflight header (Apollo CSRF prevention)', async () => {
    const res = await fetch(`${b.base}/api/graphql?query=${encodeURIComponent('{ping}')}`, {
      headers: { cookie: `icore_sid=${b.sessionId}; icore_csrf=${CSRF}` },
    });
    expect(res.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('rejects a batched (array) request', async () => {
    const r = await send(b, [{ query: '{ ping }' }, { query: '{ ping }' }]);
    expect(r.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('accepts a query at the depth limit (8)', async () => {
    const r = await send(b, { query: nested(8) });
    expect(r.status).toBe(200);
    expect(r.body.errors).toBeUndefined();
  });

  it('rejects a query over the depth limit without calling the resolver', async () => {
    const r = await send(b, { query: nested(9) });
    expect(r.status).toBe(400);
    expect(r.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
    expect(r.body.errors[0].message).toMatch(/depth/i);
    expect(calls).toBe(0);
  });

  it('rejects more than 15 aliases without calling the resolver', async () => {
    const aliases = Array.from({ length: 16 }, (_, i) => `a${i}: ping`).join(' ');
    const r = await send(b, { query: `{ ${aliases} }` });
    expect(r.status).toBe(400);
    expect(r.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
    expect(r.body.errors[0].message).toMatch(/alias/i);
    expect(calls).toBe(0);
  });

  it('leaves REST error responses untouched', async () => {
    const res = await fetch(`${b.base}/api/rest/forbidden`, {
      headers: { cookie: `icore_sid=${b.sessionId}` },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ statusCode: 403, message: 'rest_nope' });
  });
});

describe('ApiGraphqlModule over HTTP (NODE_ENV=production)', () => {
  let b: Booted;

  beforeAll(async () => {
    b = await boot('production');
  });

  afterAll(async () => {
    await b.app.close();
  });

  it('rejects introspection', async () => {
    const r = await send(b, { query: '{ __schema { types { name } } }' });
    expect(r.status).toBe(400);
    expect(r.body.data).toBeUndefined();
    expect(r.body.errors.length).toBeGreaterThan(0);
  });

  it('masks unexpected errors: no stack trace, no internal message', async () => {
    const r = await send(b, { query: '{ boom }' });
    expect(r.body.errors[0].extensions.stacktrace).toBeUndefined();
    expect(r.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(r.body.errors[0].message).not.toContain('boom');
  });

  it('still maps auth failures to HTTP 401', async () => {
    const r = await send(b, { query: '{ ping }' }, { session: false });
    expect(r.status).toBe(401);
    expect(r.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('does not serve the GraphiQL landing page', async () => {
    const res = await fetch(`${b.base}/api/graphql`, { headers: { accept: 'text/html' } });
    expect(await res.text()).not.toMatch(/graphiql/i);
  });
});
