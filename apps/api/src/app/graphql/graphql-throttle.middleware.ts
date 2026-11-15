import { HttpStatus, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import {
  getOptionsToken,
  getStorageToken,
  normalizeIp,
  seconds,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';

const THROTTLER_NAME = 'graphql-request';
// Used only if the `default` throttler is missing or configured with resolver functions.
const FALLBACK = { ttl: seconds(60), limit: 120 };

/**
 * Request-level throttle floor for /graphql. The global throttler guard runs per resolver, so
 * on its own it misses requests that fail before execution (parse and validation errors,
 * rejected batches, Apollo CSRF-prevention rejections, an unauthenticated root field) and
 * counts a document with N root fields N times. This middleware counts every HTTP request
 * once, against the gateway's `default` throttler limits (per client IP, the same tracker as
 * ThrottlerGuard), and answers 429 before Apollo parses anything. The per-resolver guard
 * still applies on top of it.
 */
@Injectable()
export class GraphqlThrottleMiddleware implements NestMiddleware {
  private readonly ttl: number;
  private readonly limit: number;

  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) private readonly storage: ThrottlerStorage,
  ) {
    const throttlers = Array.isArray(options) ? options : options.throttlers;
    const floor = throttlers.find((t) => (t.name ?? 'default') === 'default');
    this.ttl = typeof floor?.ttl === 'number' ? floor.ttl : FALLBACK.ttl;
    this.limit = typeof floor?.limit === 'number' ? floor.limit : FALLBACK.limit;
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const key = `${THROTTLER_NAME}:${normalizeIp(req.ip ?? '')}`;
    const { isBlocked, timeToBlockExpire } = await this.storage.increment(
      key,
      this.ttl,
      this.limit,
      this.ttl,
      THROTTLER_NAME,
    );
    if (!isBlocked) {
      next();
      return;
    }
    res
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .set('Retry-After', String(timeToBlockExpire))
      .json({
        errors: [{ message: 'Too Many Requests', extensions: { code: 'TOO_MANY_REQUESTS' } }],
      });
  }
}
