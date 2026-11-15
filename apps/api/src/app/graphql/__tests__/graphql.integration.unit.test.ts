import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  Module,
  NotFoundException,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Field, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import {
  ThrottlerException,
  ThrottlerModule,
  seconds,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AuthClientService } from '@icore/auth-client';
import { NOTES_CLIENT, NotesClientService } from '@icore/notes-client';
import {
  InMemorySessionStore,
  type ListNotesOptions,
  type Note,
  type StorageRef,
} from '@icore/shared';
import { UPLOAD_CLIENT, UploadClientService } from '@icore/upload-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../../auth/auth.guard';
import { ContextAwareThrottlerGuard } from '../../http/context-aware-throttler.guard';
import { CsrfGuard } from '../../http/csrf.guard';
import { throttlerOptions } from '../../http/throttler.config';
import { NotesModule } from '../../notes/notes.module';
import { SESSION_STORE } from '../../session/session-store.provider';
import { ApiSurfacesModule } from '../api-surfaces.module';
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

  @Query(() => String)
  badInput(): string {
    throw new BadRequestException('bad_title');
  }

  @Query(() => String)
  conflict(): string {
    throw new ConflictException('already_exists');
  }

  @Query(() => String)
  throttled(): string {
    throw new ThrottlerException();
  }

  @Query(() => String)
  unavailable(): string {
    throw new ServiceUnavailableException('session_store_unavailable');
  }

  @Query(() => String)
  internal(): string {
    throw new InternalServerErrorException('db password is hunter2');
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

  @Get('crash')
  crash(): never {
    throw new Error('rest_crash');
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
async function boot(
  nodeEnv: 'test' | 'production',
  throttlers: ThrottlerOptions[] = throttlerOptions,
): Promise<Booted> {
  const previous = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = nodeEnv;
  try {
    return await bootApp(throttlers);
  } finally {
    process.env['NODE_ENV'] = previous;
  }
}

async function bootApp(throttlers: ThrottlerOptions[]): Promise<Booted> {
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
    imports: [ApiGraphqlModule, ThrottlerModule.forRoot(throttlers)],
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
  opts: { session?: boolean; csrf?: boolean; sid?: string } = {},
): Promise<GqlResult> {
  const { session = true, csrf = true, sid = b.sessionId } = opts;
  const cookies = [`icore_csrf=${CSRF}`];
  if (session) cookies.push(`icore_sid=${sid}`);
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

  it('answers the public health query with no session and no CSRF header', async () => {
    const r = await send(b, { query: '{ health { status } }' }, { session: false, csrf: false });
    expect(r.status).toBe(200);
    expect(r.body.errors).toBeUndefined();
    expect(r.body.data.health.status).toBe('ok');
  });

  it('keeps guarded queries guarded next to health (401 without a session)', async () => {
    const r = await send(b, { query: '{ ping }' }, { session: false, csrf: false });
    expect(r.status).toBe(401);
    expect(r.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('answers a document mixing health and a guarded field with 401 and no partial data', async () => {
    const r = await send(
      b,
      { query: '{ health { status } ping }' },
      { session: false, csrf: false },
    );
    expect(r.status).toBe(401);
    expect(r.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(r.body.data ?? null).toBeNull();
    expect(calls).toBe(0);
  });

  it('maps a ForbiddenException thrown by a resolver to HTTP 403 FORBIDDEN', async () => {
    const r = await send(b, { query: '{ forbidden }' });
    expect(r.status).toBe(403);
    expect(r.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(r.body.errors[0].message).toBe('nope');
  });

  it('answers an unexpected resolver error (plain Error) with HTTP 500 INTERNAL_SERVER_ERROR', async () => {
    const r = await send(b, { query: '{ boom }' });
    expect(r.status).toBe(500);
    expect(r.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
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

  it('suggests field names outside production (control for the production case)', async () => {
    const r = await send(b, { query: '{ pong }' });
    expect(r.status).toBe(400);
    expect(r.body.errors[0].message).toMatch(/did you mean "ping"/i);
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

  it.each([
    ['badInput', 400, 'BAD_USER_INPUT', 'bad_title'],
    ['conflict', 409, 'CONFLICT', 'already_exists'],
    ['throttled', 429, 'TOO_MANY_REQUESTS', 'ThrottlerException: Too Many Requests'],
    ['unavailable', 503, 'SERVICE_UNAVAILABLE', 'session_store_unavailable'],
    ['internal', 500, 'INTERNAL_SERVER_ERROR', 'db password is hunter2'],
  ])('maps %s to HTTP %i %s', async (field, status, code, message) => {
    const r = await send(b, { query: `{ ${field} }` });
    expect(r.status).toBe(status);
    expect(r.body.errors[0].extensions.code).toBe(code);
    expect(r.body.errors[0].message).toBe(message);
  });

  it('leaves REST error responses untouched', async () => {
    const res = await fetch(`${b.base}/api/rest/forbidden`, {
      headers: { cookie: `icore_sid=${b.sessionId}` },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ statusCode: 403, message: 'rest_nope' });
  });

  it('keeps answering an unexpected REST error with the default 500 body', async () => {
    const res = await fetch(`${b.base}/api/rest/crash`, {
      headers: { cookie: `icore_sid=${b.sessionId}` },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ statusCode: 500, message: 'Internal server error' });
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
    expect(r.status).toBe(500);
    expect(r.body.errors[0].extensions.stacktrace).toBeUndefined();
    expect(r.body.errors[0].extensions.code).toBe('INTERNAL_SERVER_ERROR');
    expect(r.body.errors[0].message).not.toContain('boom');
  });

  it.each([
    ['unavailable', 503, 'SERVICE_UNAVAILABLE'],
    ['internal', 500, 'INTERNAL_SERVER_ERROR'],
  ])(
    'masks the message of a %s (HTTP %i) but keeps status and code',
    async (field, status, code) => {
      const r = await send(b, { query: `{ ${field} }` });
      expect(r.status).toBe(status);
      expect(r.body.errors[0].extensions.code).toBe(code);
      expect(r.body.errors[0].message).toBe('Internal server error');
    },
  );

  it('keeps the message of a 4xx error', async () => {
    const r = await send(b, { query: '{ conflict }' });
    expect(r.status).toBe(409);
    expect(r.body.errors[0].message).toBe('already_exists');
  });

  it('still maps auth failures to HTTP 401', async () => {
    const r = await send(b, { query: '{ ping }' }, { session: false });
    expect(r.status).toBe(401);
    expect(r.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('does not leak schema details through "Did you mean" suggestions', async () => {
    const r = await send(b, { query: '{ pong }' });
    expect(r.status).toBe(400);
    expect(r.body.errors[0].message).not.toMatch(/did you mean/i);
    expect(JSON.stringify(r.body)).not.toContain('ping');
  });

  it('does not serve the GraphiQL landing page', async () => {
    const res = await fetch(`${b.base}/api/graphql`, { headers: { accept: 'text/html' } });
    expect(await res.text()).not.toMatch(/graphiql/i);
  });
});

describe('request-level throttle floor on /api/graphql', () => {
  let b: Booted;
  const limit = 3;

  beforeAll(async () => {
    b = await boot('test', [
      { name: 'default', ttl: seconds(60), limit },
      ...throttlerOptions.filter((t) => t.name !== 'default'),
    ]);
  });

  afterAll(async () => {
    await b.app.close();
  });

  beforeEach(() => {
    calls = 0;
  });

  it('counts every request, including ones rejected before any resolver runs', async () => {
    // Unauthenticated, unparseable and batched requests never reach a guarded resolver, so the
    // per-resolver guard alone would not count them.
    const first = await send(b, { query: '{ ping }' }, { session: false });
    expect(first.status).toBe(401);
    expect((await send(b, { query: '{ ping ' })).status).toBe(400);
    expect((await send(b, [{ query: '{ ping }' }])).status).toBe(400);

    const limited = await send(b, { query: '{ ping }' }, { session: false });
    expect(limited.status).toBe(429);
    expect(limited.body.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');

    const authed = await send(b, { query: '{ ping }' });
    expect(authed.status).toBe(429);
    expect(authed.body.errors[0].extensions.code).toBe('TOO_MANY_REQUESTS');
    expect(calls).toBe(0);
  });

  it('does not throttle other routes through the GraphQL counter', async () => {
    const res = await fetch(`${b.base}/api/rest/forbidden`, {
      headers: { cookie: `icore_sid=${b.sessionId}` },
    });
    expect(res.status).toBe(403);
  });
});

// ─── API surfaces: notes ability matrix, profile and storage ─────────────────────────────────
// The real ApiSurfacesModule (ApiGraphqlModule + notes/profile/storage GraphQL modules, real
// NotesGatewayService and AbilityGuard) plus the REST NotesModule (as in api=both), with only the
// microservice clients replaced by in-memory fakes. GraphQL must answer exactly like REST.

const noteOf = (id: string, ownerId: string): Note => ({
  id,
  ownerId,
  title: `title ${id}`,
  body: `body ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function fakeNotesClient() {
  const notes = new Map<string, Note>([
    ['n-a', noteOf('n-a', 'ua')],
    ['n-b', noteOf('n-b', 'ub')],
  ]);
  return {
    notes,
    list: vi.fn(async (o: ListNotesOptions) => {
      const all = [...notes.values()].filter((n) => o.ownerId === null || n.ownerId === o.ownerId);
      return { items: all.slice(o.offset, o.offset + o.limit), total: all.length };
    }),
    get: vi.fn(async (id: string) => notes.get(id) ?? null),
    create: vi.fn(async (i: { ownerId: string; title: string; body: string }) => {
      const n = { ...noteOf('n-new', i.ownerId), title: i.title, body: i.body };
      notes.set(n.id, n);
      return n;
    }),
    update: vi.fn(async (id: string, patch: Partial<Note>) => {
      const n = { ...(notes.get(id) as Note), ...patch };
      notes.set(id, n);
      return n;
    }),
    delete: vi.fn(async (id: string) => {
      notes.delete(id);
    }),
  };
}

function fakeUploadClient() {
  return {
    list: vi.fn(async (uid: string) => [{ bucket: 'uploads', path: `${uid}/a.png` }]),
    signedUrl: vi.fn(async (_uid: string, ref: StorageRef) => `https://signed/${ref.path}`),
    remove: vi.fn(async () => undefined),
  };
}

interface Surfaces {
  app: INestApplication;
  base: string;
  sid: { ua: string; ub: string; admin: string };
  notes: ReturnType<typeof fakeNotesClient>;
  upload: ReturnType<typeof fakeUploadClient>;
}

async function bootSurfaces(): Promise<Surfaces> {
  const store = new InMemorySessionStore();
  const sessionFor = async (uid: string, role: string) =>
    (
      await store.create({
        uid,
        email: `${uid}@example.com`,
        role,
        providerAccessToken: 'at',
        providerRefreshToken: 'rt',
        providerAccessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
      })
    ).sessionId;
  const sid = {
    ua: await sessionFor('ua', 'user'),
    ub: await sessionFor('ub', 'user'),
    admin: await sessionFor('root', 'admin'),
  };

  // The gateway's guard order: AuthGuard (in AuthModule) runs before AbilityGuard.
  @Module({
    providers: [
      { provide: SESSION_STORE, useValue: store },
      { provide: AuthClientService, useValue: {} },
      { provide: APP_GUARD, useClass: ContextAwareThrottlerGuard },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: CsrfGuard },
    ],
  })
  class TestAuthModule {}

  const notes = fakeNotesClient();
  const upload = fakeUploadClient();
  const previous = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'test';
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot(throttlerOptions),
        TestAuthModule,
        ApiSurfacesModule,
        NotesModule,
      ],
    })
      // The transport ClientProxies are never used (the services are faked) and would otherwise
      // demand NOTES_* / UPLOAD_* transport env.
      .overrideProvider(NOTES_CLIENT)
      .useValue({})
      .overrideProvider(UPLOAD_CLIENT)
      .useValue({})
      .overrideProvider(NotesClientService)
      .useValue(notes)
      .overrideProvider(UploadClientService)
      .useValue(upload)
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
    return { app, base: await app.getUrl(), sid, notes, upload };
  } finally {
    process.env['NODE_ENV'] = previous;
  }
}

describe('API surfaces over /api/graphql', () => {
  let s: Surfaces;
  let b: Booted;

  beforeAll(async () => {
    s = await bootSurfaces();
    b = { app: s.app, base: s.base, sessionId: s.sid.ua };
  });

  afterAll(async () => {
    await s.app.close();
  });

  const LIST = '{ notes { total items { id ownerId title body createdAt updatedAt } } }';

  async function restList(sid: string): Promise<unknown> {
    const res = await fetch(`${s.base}/api/notes`, { headers: { cookie: `icore_sid=${sid}` } });
    expect(res.status).toBe(200);
    return res.json();
  }

  it('lists only the caller’s notes for a user, the same as REST', async () => {
    const r = await send(b, { query: LIST }, { sid: s.sid.ua });
    expect(r.status).toBe(200);
    expect(r.body.data.notes).toEqual({ total: 1, items: [noteOf('n-a', 'ua')] });
    expect(r.body.data.notes).toEqual(await restList(s.sid.ua));
  });

  it('lists every note for an admin, the same as REST', async () => {
    const r = await send(b, { query: LIST }, { sid: s.sid.admin });
    expect(r.status).toBe(200);
    expect(r.body.data.notes.total).toBe(2);
    expect(r.body.data.notes.items.map((n: Note) => n.id)).toEqual(['n-a', 'n-b']);
    expect(r.body.data.notes).toEqual(await restList(s.sid.admin));
  });

  it("hides another user's note: note(id) answers HTTP 403 FORBIDDEN", async () => {
    const r = await send(b, { query: '{ note(id: "n-a") { id } }' }, { sid: s.sid.ub });
    expect(r.status).toBe(403);
    expect(r.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(r.body.data).toBeNull();
  });

  it("refuses updateNote on another user's note with HTTP 403 FORBIDDEN, nothing written", async () => {
    s.notes.update.mockClear();
    const r = await send(
      b,
      { query: 'mutation { updateNote(id: "n-a", input: { title: "x" }) { id title } }' },
      { sid: s.sid.ub },
    );
    expect(r.status).toBe(403);
    expect(r.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(r.body.errors[0].message).toBe('Forbidden'); // the ability check, not CSRF
    expect(s.notes.update).not.toHaveBeenCalled();
    expect(s.notes.notes.get('n-a')?.title).toBe('title n-a');
  });

  it('rejects updateNote with a null title (HTTP 400), nothing written, list still fine', async () => {
    s.notes.update.mockClear();
    const r = await send(
      b,
      { query: 'mutation { updateNote(id: "n-a", input: { title: null }) { id title } }' },
      { sid: s.sid.ua },
    );
    expect(r.status).toBe(400);
    expect(r.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(s.notes.update).not.toHaveBeenCalled();
    const list = await send(b, { query: LIST }, { sid: s.sid.ua });
    expect(list.status).toBe(200);
    expect(list.body.data.notes.items[0].title).toBe('title n-a');
  });

  it("lets an admin update any user's note", async () => {
    const r = await send(
      b,
      { query: 'mutation { updateNote(id: "n-b", input: { body: "by admin" }) { id body } }' },
      { sid: s.sid.admin },
    );
    expect(r.status).toBe(200);
    expect(r.body.data.updateNote).toEqual({ id: 'n-b', body: 'by admin' });
  });

  it('answers deleteNote on a missing id with HTTP 404 NOT_FOUND', async () => {
    const r = await send(b, { query: 'mutation { deleteNote(id: "nope") }' }, { sid: s.sid.ua });
    expect(r.status).toBe(404);
    expect(r.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('creates a note owned by the session user, whatever the input says', async () => {
    const r = await send(
      b,
      { query: 'mutation { createNote(input: { title: "t", body: "b" }) { ownerId title } }' },
      { sid: s.sid.ub },
    );
    expect(r.status).toBe(200);
    expect(r.body.data.createNote).toEqual({ ownerId: 'ub', title: 't' });
  });

  it('me returns the session user', async () => {
    const r = await send(b, { query: '{ me { uid email role } }' }, { sid: s.sid.ua });
    expect(r.status).toBe(200);
    expect(r.body.data.me).toEqual({ uid: 'ua', email: 'ua@example.com', role: 'user' });
  });

  it('me without a session is HTTP 401 UNAUTHENTICATED', async () => {
    const r = await send(b, { query: '{ me { uid } }' }, { session: false });
    expect(r.status).toBe(401);
    expect(r.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it("refuses signedUrl for another user's path with HTTP 403 FORBIDDEN", async () => {
    s.upload.signedUrl.mockClear();
    const r = await send(
      b,
      { query: '{ signedUrl(bucket: "uploads", path: "ub/a.png") }' },
      { sid: s.sid.ua },
    );
    expect(r.status).toBe(403);
    expect(r.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(r.body.errors[0].message).toBe('foreign_storage_ref');
    expect(s.upload.signedUrl).not.toHaveBeenCalled();
  });

  it("signs the caller's own path and lists the caller's files", async () => {
    const r = await send(
      b,
      { query: '{ signedUrl(bucket: "uploads", path: "ua/a.png") files { bucket path } }' },
      { sid: s.sid.ua },
    );
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      signedUrl: 'https://signed/ua/a.png',
      files: [{ bucket: 'uploads', path: 'ua/a.png' }],
    });
    expect(s.upload.list).toHaveBeenCalledWith('ua', undefined);
  });

  it("refuses removeFile for another user's path with HTTP 403 FORBIDDEN", async () => {
    const r = await send(
      b,
      { query: 'mutation { removeFile(bucket: "uploads", path: "ub/a.png") }' },
      { sid: s.sid.ua },
    );
    expect(r.status).toBe(403);
    expect(r.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(s.upload.remove).not.toHaveBeenCalled();
  });
});
