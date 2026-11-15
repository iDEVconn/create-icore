import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GraphQLError } from 'graphql';

/**
 * GraphQL `extensions.code` for the HTTP status of an exception thrown by a guard or a resolver.
 * Clients decide on retries from the code: a 429 or 5xx must not look like a user-input error.
 */
export function graphqlCodeFor(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
  }
  return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_USER_INPUT';
}

/**
 * Turns an `HttpException` raised inside a GraphQL operation (by `AuthGuard`, `CsrfGuard`,
 * `AbilityGuard`, the throttler or a resolver) into a `GraphQLError` carrying
 * `extensions.http.status`. Apollo Server uses that as the HTTP status of the response, so a
 * missing session answers HTTP 401 (the client's refresh-on-401 keeps working) instead of 200
 * with `errors[]`. `ApiGraphqlModule` turns off `@nestjs/apollo`'s plugin that would reset it to
 * 200, and masks the message of 5xx errors in production (`formatGraphqlError`).
 *
 * Registered globally, so REST exceptions also land here: they are passed to Nest's default
 * handling unchanged.
 */
@Catch(HttpException)
export class GraphqlErrorFilter extends BaseExceptionFilter {
  override catch(exception: HttpException, host: ArgumentsHost): void {
    if (host.getType<string>() !== 'graphql') {
      super.catch(exception, host);
      return;
    }
    const status = exception.getStatus();
    throw new GraphQLError(exception.message, {
      extensions: { code: graphqlCodeFor(status), http: { status } },
    });
  }
}
