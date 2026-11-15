import { Query, Resolver } from '@nestjs/graphql';
import { Public } from '../http/public.decorator';
import { SkipCsrf } from '../http/skip-csrf.decorator';
import { Health } from './health.model';

/**
 * Always-present liveness query: a GraphQL schema needs at least one root field even in an
 * `auth=none` project, which has no session-bound resolvers. Read-only, so it needs neither a
 * session nor a CSRF token. Must not import from `../auth` (removed in `auth=none` projects).
 */
@Resolver()
export class HealthResolver {
  @Public()
  @SkipCsrf()
  @Query(() => Health)
  health(): Health {
    return { status: 'ok' };
  }
}
