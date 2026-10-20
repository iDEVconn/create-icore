import type { ExecutionContext } from '@nestjs/common';
import { seconds, type ThrottlerOptions } from '@nestjs/throttler';

// @nestjs/throttler applies EVERY named throttler to EVERY route: `@Throttle({ name: … })` only
// overrides the numbers for that name, the module-level limit is the default for all other routes.
// With two named throttlers at 10/minute that meant every gateway route (profile, notes, storage…)
// was limited to 10 requests a minute per client, and a route that declared only ai-burst was also
// charged against auth-burst.
//
// `@Throttle` stores the limit as route/class metadata under this key plus the throttler name
// (pinned by a test, so a library upgrade cannot silently turn the scoping off).
const THROTTLER_LIMIT_METADATA = 'THROTTLER:LIMIT';

/** `skipIf` for a named throttler: apply it only to routes/controllers that declare `@Throttle({ [name]: … })`. */
export function skipUnlessDeclared(name: string): (context: ExecutionContext) => boolean {
  const key = `${THROTTLER_LIMIT_METADATA}${name}`;
  return (context) =>
    Reflect.getMetadata(key, context.getHandler()) === undefined &&
    Reflect.getMetadata(key, context.getClass()) === undefined;
}

// The named throttlers of the gateway. Their module-level limits are only the defaults for the
// routes that declare `@Throttle({ '<name>': … })`; every other route is not rate limited by them.
export const throttlerOptions: ThrottlerOptions[] = [
  { name: 'auth-burst', ttl: seconds(60), limit: 10, skipIf: skipUnlessDeclared('auth-burst') },
  { name: 'ai-burst', ttl: seconds(60), limit: 10, skipIf: skipUnlessDeclared('ai-burst') },
];
