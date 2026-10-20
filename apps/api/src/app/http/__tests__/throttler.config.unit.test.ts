import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiController } from '../../ai/ai.controller';
import { AuthController } from '../../auth/auth.controller';
import { throttlerOptions } from '../throttler.config';

// Real Nest app, real ThrottlerGuard, the gateway's real throttler options: the question is which
// routes a named throttler actually counts.

@Controller('plain')
class PlainController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Controller('plain-default')
class PlainDefaultController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Controller('auth-like')
@Throttle({ 'auth-burst': { limit: 3, ttl: seconds(60) } })
class AuthLikeController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Controller('ai-like')
class AiLikeController {
  @Get()
  @Throttle({ 'ai-burst': { limit: 2, ttl: seconds(60) } })
  ping() {
    return { ok: true };
  }
}

@Controller('ai-high')
class AiHighController {
  @Get()
  @Throttle({ 'ai-burst': { limit: 20, ttl: seconds(60) } })
  ping() {
    return { ok: true };
  }
}

describe('gateway throttler options', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerOptions)],
      controllers: [
        PlainController,
        PlainDefaultController,
        AuthLikeController,
        AiLikeController,
        AiHighController,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const status = async (path: string) => (await fetch(`${base}${path}`)).status;

  it('does not rate-limit a route that declares no @Throttle', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) statuses.push(await status('/plain'));
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it('still rate limits a route that declares nothing, through a generous default (fail closed)', async () => {
    // Fresh route so no other test's requests count: 120 allowed per minute, the 121st is rejected.
    const statuses: number[] = [];
    for (let i = 0; i < 121; i++) statuses.push(await status('/plain-default'));
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });

  it('limits a route that declares @Throttle for auth-burst at its own limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push(await status('/auth-like'));
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it('does not charge auth-burst to a route that only declares ai-burst', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push(await status('/ai-high'));
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it('counts ai-burst only on routes that declare it, independently of auth-burst', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push(await status('/ai-like'));
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it('relies on the metadata key @nestjs/throttler writes for @Throttle (pinned so an upgrade cannot silently disable the scoping)', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITauth-burst', AuthLikeController)).toBe(3);
    expect(Reflect.getMetadata('THROTTLER:LIMITai-burst', AiLikeController.prototype.ping)).toBe(2);
  });

  it('keeps the real auth and ai routes inside the scoped limiters (they still declare their @Throttle)', () => {
    // If these decorators disappeared, skipUnlessDeclared would silently stop limiting login/AI.
    expect(Reflect.getMetadata('THROTTLER:LIMITauth-burst', AuthController)).toBe(10);
    expect(
      Reflect.getMetadata('THROTTLER:LIMITauth-burst', AuthController.prototype.forgotPassword),
    ).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:LIMITai-burst', AiController.prototype.generate)).toBe(
      10,
    );
    expect(Reflect.getMetadata('THROTTLER:LIMITai-burst', AiController.prototype.orchestrate)).toBe(
      10,
    );
    // The LLM-backed RAG route costs money like the other two and must not escape the AI limiter.
    expect(Reflect.getMetadata('THROTTLER:LIMITai-burst', AiController.prototype.ragQuery)).toBe(
      10,
    );
  });
});
